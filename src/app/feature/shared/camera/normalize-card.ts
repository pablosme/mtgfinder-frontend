import type * as OpenCv from '@techstark/opencv-js';
import type { CardDetection } from '../interface/card-detection.interface';
import type { CardOcrImage } from '../interface/card-ocr-image.interface';
import type { CardPoint } from '../interface/card-point.interface';
import type { CardCaptureQuality } from '../interface/card-capture-quality.interface';
const NORMALIZED_CARD_WIDTH = 744;
const NORMALIZED_CARD_HEIGHT = 1040;
/*
 * Detection should be forgiving enough that the user does not need to hold the
 * card at one very specific angle. Perspective correction exists specifically
 * to straighten a tilted card afterwards.
 */
const MIN_PERSPECTIVE_RATIO = 0.32;
/*
 * A standard MTG/poker card is 63 x 88 mm.
 *
 * These limits are intentionally wider than the physical ratio because a card
 * viewed at an angle will not preserve its exact apparent aspect ratio before
 * rectification.
 */
const CARD_ASPECT_RATIO = 63 / 88;
const MIN_CARD_RATIO = 0.54;
const MAX_CARD_RATIO = 0.86;
/*
 * Do not force the user to fill a large portion of the camera preview. The
 * candidate scoring below still strongly favors the largest card-like outline,
 * which keeps internal title/art/rules rectangles from normally winning.
 */
const MIN_CARD_AREA_RATIO = 0.025;
const MIN_READY_SCORE = 0.48;
/*
 * A larger closing kernel helps reconnect card borders that are interrupted by
 * glare, shadows, rounded corners, sleeves, or a low-resolution preview frame.
 */
const EDGE_KERNEL_SIZE = 5;
/**
 * Detect the best card-shaped quadrilateral in a frame.
 *
 * Detection is deliberately permissive. The important requirement is finding
 * four plausible outer-card corners. Perspective and sharpness are scored, but
 * neither should force the user to find one exact camera angle before the card
 * can be normalized.
 */
export function evaluateCardFrame(cv: typeof OpenCv, image: HTMLCanvasElement): CardDetection {
    /*
     * Keep this inexpensive enough for continuous preview detection. If the
     * caller already passed a smaller preview (for example 640 px), this does
     * not downscale it again.
     */
    let frame = image;
    const analysisMaxDimension = 960;
    const scale = Math.min(1, analysisMaxDimension / Math.max(image.width, image.height));
    if (scale < 1) {
        frame = image.ownerDocument.createElement('canvas');
        frame.width = Math.round(image.width * scale);
        frame.height = Math.round(image.height * scale);
        const context = frame.getContext('2d');
        if (!context) {
            throw new Error('Unable to analyze the camera image.');
        }
        context.drawImage(image, 0, 0, frame.width, frame.height);
    }
    const resources: { delete(): void }[] = [];
    try {
        const source = cv.imread(frame);
        resources.push(source);
        const gray = new cv.Mat();
        resources.push(gray);
        cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
        const blurred = new cv.Mat();
        resources.push(blurred);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        const working = new cv.Mat();
        resources.push(working);
        const polygon = new cv.Mat();
        resources.push(polygon);
        const kernel = cv.Mat.ones(EDGE_KERNEL_SIZE, EDGE_KERNEL_SIZE, cv.CV_8U);
        resources.push(kernel);
        const frameArea = frame.width * frame.height;
        let best:
            | {
                  area: number;
                  corners: CardPoint[];
                  aspectRatio: number;
                  perspectiveRatio: number;
                  candidateScore: number;
              }
            | undefined;
        /*
         * Try several representations of the same frame.
         *
         * - strong edges: clean, well-lit borders
         * - soft edges: faint borders / sleeves / low contrast
         * - threshold: bright card against darker background
         * - inverse threshold: dark card against brighter background
         * - adaptive threshold: uneven light / shadows / glare
         */
        for (const method of [
            'edges',
            'soft-edges',
            'threshold',
            'inverse-threshold',
            'adaptive-threshold',
        ] as const) {
            if (method === 'edges' || method === 'soft-edges') {
                cv.Canny(
                    blurred,
                    working,
                    method === 'edges' ? 45 : 18,
                    method === 'edges' ? 135 : 55,
                );
                cv.morphologyEx(working, working, cv.MORPH_CLOSE, kernel);
            } else if (method === 'adaptive-threshold') {
                cv.adaptiveThreshold(
                    blurred,
                    working,
                    255,
                    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv.THRESH_BINARY,
                    31,
                    7,
                );
                cv.morphologyEx(working, working, cv.MORPH_CLOSE, kernel);
            } else {
                cv.threshold(
                    blurred,
                    working,
                    0,
                    255,
                    (method === 'threshold' ? cv.THRESH_BINARY : cv.THRESH_BINARY_INV) |
                        cv.THRESH_OTSU,
                );
                cv.morphologyEx(working, working, cv.MORPH_CLOSE, kernel);
            }
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            resources.push(contours, hierarchy);
            /*
             * RETR_LIST is intentional here.
             *
             * RETR_EXTERNAL is attractive when the outer border is perfect, but
             * on real cards a sleeve, shadow, glare or interrupted rounded corner
             * can make the actual card outline stop being an "external" contour.
             *
             * We inspect all contours and let the card-specific scoring choose
             * the best candidate instead.
             */
            cv.findContours(working, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
            for (let index = 0; index < contours.size(); index++) {
                const contour = contours.get(index);
                try {
                    const area = cv.contourArea(contour);
                    const areaRatio = area / frameArea;
                    if (areaRatio < MIN_CARD_AREA_RATIO || areaRatio > 0.96) {
                        continue;
                    }
                    /*
                     * Ignore contours clipped by the camera frame. Normalization
                     * needs all four physical card corners.
                     */
                    const bounds = cv.boundingRect(contour);
                    const edgeMargin = 1;
                    if (
                        bounds.x <= edgeMargin ||
                        bounds.y <= edgeMargin ||
                        bounds.x + bounds.width >= frame.width - edgeMargin ||
                        bounds.y + bounds.height >= frame.height - edgeMargin
                    ) {
                        continue;
                    }
                    const perimeter = cv.arcLength(contour, true);
                    /*
                     * Wider tolerance range than before. Rounded MTG corners,
                     * sleeves, glare and perspective can all cause the raw contour
                     * to contain more than four points at one epsilon value.
                     */
                    for (const tolerance of [0.012, 0.018, 0.025, 0.035, 0.05, 0.07, 0.09]) {
                        cv.approxPolyDP(contour, polygon, perimeter * tolerance, true);
                        if (polygon.rows !== 4 || !cv.isContourConvex(polygon)) {
                            continue;
                        }
                        const points = Array.from({ length: 4 }, (_, point) => ({
                            x: polygon.data32S[point * 2],
                            y: polygon.data32S[point * 2 + 1],
                        }));
                        const pointMargin = 1;
                        if (
                            points.some(
                                ({ x, y }) =>
                                    x < pointMargin ||
                                    y < pointMargin ||
                                    x > frame.width - pointMargin ||
                                    y > frame.height - pointMargin,
                            )
                        ) {
                            continue;
                        }
                        let corners = orderCorners(points);
                        let metrics = cardGeometry(corners);
                        /*
                         * normalizeCard() expects portrait ordering:
                         * top-left, top-right, bottom-right, bottom-left.
                         */
                        if (metrics.width > metrics.height) {
                            corners = [corners[1], corners[2], corners[3], corners[0]];
                            metrics = cardGeometry(corners);
                        }
                        /*
                         * Do not demand the exact physical aspect ratio before
                         * perspective correction. We only reject shapes that are
                         * clearly not card-like.
                         */
                        if (
                            metrics.aspectRatio < MIN_CARD_RATIO ||
                            metrics.aspectRatio > MAX_CARD_RATIO
                        ) {
                            continue;
                        }
                        const ratioDistance = Math.abs(metrics.aspectRatio - CARD_ASPECT_RATIO);
                        const aspectScore = Math.max(0, 1 - ratioDistance / 0.2);
                        /*
                         * The full card should normally be one of the largest
                         * card-shaped quadrilaterals in view. This is our main
                         * defense against an internal art/rules/title rectangle.
                         */
                        const areaScore = Math.min(1, areaRatio / 0.28);
                        /*
                         * Perspective contributes to ranking, but only lightly.
                         * A strongly tilted card should still be accepted because
                         * warpPerspective() will rectify it afterwards.
                         */
                        const perspectiveScore = Math.min(1, metrics.perspectiveRatio / 0.8);
                        const candidateScore =
                            areaScore * 0.6 + aspectScore * 0.3 + perspectiveScore * 0.1;
                        if (
                            !best ||
                            candidateScore > best.candidateScore ||
                            (Math.abs(candidateScore - best.candidateScore) < 0.025 &&
                                area > best.area)
                        ) {
                            best = {
                                area,
                                corners,
                                aspectRatio: metrics.aspectRatio,
                                perspectiveRatio: metrics.perspectiveRatio,
                                candidateScore,
                            };
                        }
                        /*
                         * Once this contour produced a valid four-corner shape,
                         * larger approximation tolerances are unnecessary.
                         */
                        break;
                    }
                } finally {
                    contour.delete();
                }
            }
        }
        if (!best) {
            return {
                detected: false,
                reason: 'outline',
                score: 0,
                sourceWidth: frame.width,
                sourceHeight: frame.height,
            };
        }
        const areaRatio = best.area / frameArea;
        /*
         * Only reject extreme perspective. The old 0.5 threshold made the user
         * hunt for a narrow range of angles even though perspective correction
         * can handle much more distortion.
         */
        const goodPerspective = best.perspectiveRatio >= MIN_PERSPECTIVE_RATIO;
        const areaScore = Math.min(1, areaRatio / 0.28);
        const perspectiveScore = Math.min(1, best.perspectiveRatio / 0.8);
        const ratioDistance = Math.abs(best.aspectRatio - CARD_ASPECT_RATIO);
        const aspectScore = Math.max(0, 1 - ratioDistance / 0.2);
        const score = areaScore * 0.55 + aspectScore * 0.3 + perspectiveScore * 0.15;
        const ready = goodPerspective && score >= MIN_READY_SCORE;

        return {
            detected: ready,
            reason: !goodPerspective ? 'perspective' : ready ? 'ready' : 'outline',
            score,
            corners: best.corners,
            areaRatio,
            perspectiveRatio: best.perspectiveRatio,
            aspectRatio: best.aspectRatio,
            sourceWidth: frame.width,
            sourceHeight: frame.height,
        };
    } finally {
        resources.reverse().forEach((resource) => resource.delete());
        if (frame !== image) {
            frame.width = 0;
        }
    }
}
/**
 * Detect and rectify one complete card into a fixed portrait canvas.
 *
 * The supplied detection is trusted more than before. Detection has already
 * ranked the candidate as the best card-like quadrilateral. Normalization only
 * rejects obviously invalid geometry rather than applying another strict set of
 * acquisition rules.
 */
export function normalizeCard(
    cv: typeof OpenCv,
    frame: HTMLCanvasElement,
    detection?: CardDetection,
): HTMLCanvasElement {
    const resources: { delete(): void }[] = [];
    try {
        const source = cv.imread(frame);
        resources.push(source);
        const resolved =
            detection?.corners?.length === 4 ? detection : evaluateCardFrame(cv, frame);
        if (!resolved.corners || resolved.corners.length !== 4) {
            throw new Error('No complete card found. Keep all four outer corners visible.');
        }
        const sourceWidth = resolved.sourceWidth || frame.width;
        const sourceHeight = resolved.sourceHeight || frame.height;
        const scaleX = frame.width / sourceWidth;
        const scaleY = frame.height / sourceHeight;
        let corners = orderCorners(
            resolved.corners.map(({ x, y }) => ({
                x: x * scaleX,
                y: y * scaleY,
            })),
        );
        let geometry = cardGeometry(corners);
        if (geometry.width > geometry.height) {
            corners = [corners[1], corners[2], corners[3], corners[0]];
            geometry = cardGeometry(corners);
        }
        const cardAreaRatio = polygonArea(corners) / (frame.width * frame.height);
        /*
         * Much looser normalization validation than before.
         *
         * The strict validation was effectively making the user pass the same
         * geometry test twice: once during detection and again immediately before
         * normalization. That made normal scanning unnecessarily fragile.
         */
        if (geometry.aspectRatio < 0.5 || geometry.aspectRatio > 0.9 || cardAreaRatio < 0.015) {
            throw new Error(
                'The complete card outline could not be normalized. Keep all four outer corners visible.',
            );
        }
        const from = cv.matFromArray(
            4,
            1,
            cv.CV_32FC2,
            corners.flatMap(({ x, y }) => [x, y]),
        );
        resources.push(from);
        const to = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0,
            0,
            NORMALIZED_CARD_WIDTH - 1,
            0,
            NORMALIZED_CARD_WIDTH - 1,
            NORMALIZED_CARD_HEIGHT - 1,
            0,
            NORMALIZED_CARD_HEIGHT - 1,
        ]);
        resources.push(to);
        const transform = cv.getPerspectiveTransform(from, to);
        resources.push(transform);
        const normalized = new cv.Mat();
        resources.push(normalized);
        cv.warpPerspective(
            source,
            normalized,
            transform,
            new cv.Size(NORMALIZED_CARD_WIDTH, NORMALIZED_CARD_HEIGHT),
            /*
             * Cubic interpolation preserves small printed details somewhat
             * better than linear interpolation during perspective rectification.
             */
            cv.INTER_CUBIC,
            cv.BORDER_REPLICATE,
        );
        const canvas = frame.ownerDocument.createElement('canvas');
        cv.imshow(canvas, normalized);
        return canvas;
    } finally {
        resources.reverse().forEach((resource) => resource.delete());
    }
}
/**
 * Prepare the entire normalized card for OCR without assuming where title,
 * rules text, collector number or any other field is located.
 */
export function prepareCardForOcr(cv: typeof OpenCv, card: HTMLCanvasElement): CardOcrImage[] {
    const resources: { delete(): void }[] = [];
    try {
        const source = cv.imread(card);
        resources.push(source);
        const gray = new cv.Mat();
        resources.push(gray);
        cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
        const enlarged = new cv.Mat();
        resources.push(enlarged);
        cv.resize(gray, enlarged, new cv.Size(0, 0), 2, 2, cv.INTER_CUBIC);
        const normalized = new cv.Mat();
        resources.push(normalized);
        cv.normalize(enlarged, normalized, 0, 255, cv.NORM_MINMAX);
        const illumination = new cv.Mat();
        resources.push(illumination);
        cv.GaussianBlur(normalized, illumination, new cv.Size(0, 0), 25);
        const corrected = new cv.Mat();
        resources.push(corrected);
        cv.divide(normalized, illumination, corrected, 230);
        const images: CardOcrImage[] = [];
        const pushVariant = (mat: OpenCv.Mat, variant: CardOcrImage['variant']): void => {
            const padded = new cv.Mat();
            resources.push(padded);
            cv.copyMakeBorder(mat, padded, 24, 24, 24, 24, cv.BORDER_CONSTANT, new cv.Scalar(255));
            const canvas = card.ownerDocument.createElement('canvas');
            cv.imshow(canvas, padded);
            images.push({
                image: canvas,
                variant,
            });
        };
        /*
         * Keep grayscale variants: thresholding is not always better for
         * stylized text, gradients, foil cards or text over artwork.
         */
        pushVariant(enlarged, 'gray');
        pushVariant(corrected, 'normalized');
        const otsu = new cv.Mat();
        resources.push(otsu);
        cv.threshold(corrected, otsu, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
        pushVariant(otsu, 'otsu');
        const adaptive = new cv.Mat();
        resources.push(adaptive);
        cv.adaptiveThreshold(
            corrected,
            adaptive,
            255,
            cv.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv.THRESH_BINARY,
            51,
            9,
        );
        pushVariant(adaptive, 'adaptive');
        const inverted = new cv.Mat();
        resources.push(inverted);
        cv.bitwise_not(corrected, inverted);
        const invertedOtsu = new cv.Mat();
        resources.push(invertedOtsu);
        cv.threshold(inverted, invertedOtsu, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
        pushVariant(invertedOtsu, 'inverted-otsu');
        const invertedAdaptive = new cv.Mat();
        resources.push(invertedAdaptive);
        cv.adaptiveThreshold(
            inverted,
            invertedAdaptive,
            255,
            cv.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv.THRESH_BINARY,
            51,
            9,
        );
        pushVariant(invertedAdaptive, 'inverted-adaptive');
        return images;
    } finally {
        resources.reverse().forEach((resource) => resource.delete());
    }
}
function orderCorners(points: CardPoint[]): CardPoint[] {
    const center = {
        x: points.reduce((sum, point) => sum + point.x, 0) / 4,
        y: points.reduce((sum, point) => sum + point.y, 0) / 4,
    };
    const ordered = [...points].sort(
        (a, b) =>
            Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x),
    );
    const first = ordered.reduce(
        (best, point, index) =>
            point.x + point.y < ordered[best].x + ordered[best].y ? index : best,
        0,
    );
    return [...ordered.slice(first), ...ordered.slice(0, first)];
}
function polygonArea(points: readonly CardPoint[]): number {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
}
function cardGeometry(corners: CardPoint[]): {
    width: number;
    height: number;
    aspectRatio: number;
    perspectiveRatio: number;
} {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners;
    const topWidth = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
    const rightHeight = Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y);
    const bottomWidth = Math.hypot(bottomLeft.x - bottomRight.x, bottomLeft.y - bottomRight.y);
    const leftHeight = Math.hypot(topLeft.x - bottomLeft.x, topLeft.y - bottomLeft.y);
    const width = (topWidth + bottomWidth) / 2;
    const height = (leftHeight + rightHeight) / 2;
    const aspectRatio = Math.min(width, height) / Math.max(width, height);
    const widthPerspective = Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth);
    const heightPerspective = Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight);
    return {
        width,
        height,
        aspectRatio,
        perspectiveRatio: Math.min(widthPerspective, heightPerspective),
    };
}
/**
 * Check capture detail inside the rectified card.
 *
 * This is intentionally tolerant. Its job is to rank frames and reject only
 * obviously unusable blur. OCR is the final authority on whether enough text is
 * actually readable.
 */
export function evaluateCardCaptureQuality(
    cv: typeof OpenCv,
    card: HTMLCanvasElement,
): CardCaptureQuality {
    const resources: { delete(): void }[] = [];
    try {
        const source = cv.imread(card);
        const gray = new cv.Mat();
        const laplacian = new cv.Mat();
        const mean = new cv.Mat();
        const stddev = new cv.Mat();
        resources.push(source, gray, laplacian, mean, stddev);
        cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
        cv.Laplacian(gray, laplacian, cv.CV_64F);
        const insetX = Math.round(card.width * 0.06);
        const insetY = Math.round(card.height * 0.05);
        const tileWidth = Math.floor((card.width - insetX * 2) / 3);
        const tileHeight = Math.floor((card.height - insetY * 2) / 4);
        const sharpnessValues: number[] = [];
        for (let row = 0; row < 4; row++) {
            for (let column = 0; column < 3; column++) {
                const rect = new cv.Rect(
                    insetX + column * tileWidth,
                    insetY + row * tileHeight,
                    tileWidth,
                    tileHeight,
                );
                const grayTile = gray.roi(rect);
                const edgeTile = laplacian.roi(rect);
                try {
                    cv.meanStdDev(grayTile, mean, stddev);
                    /*
                     * Ignore only nearly-flat regions. The previous threshold
                     * discarded too many legitimate card regions and could make
                     * a good image appear to have insufficient focus evidence.
                     */
                    if (stddev.doubleAt(0, 0) < 7) {
                        continue;
                    }
                    cv.meanStdDev(edgeTile, mean, stddev);
                    sharpnessValues.push(stddev.doubleAt(0, 0) ** 2);
                } finally {
                    edgeTile.delete();
                    grayTile.delete();
                }
            }
        }
        sharpnessValues.sort((a, b) => a - b);
        /*
         * Use the median instead of the lower third. Some perfectly focused MTG
         * cards contain naturally smooth artwork/background tiles, so a low
         * percentile made the scanner wait forever even when most of the card
         * was already sharp enough for OCR.
         */
        const sharpness = sharpnessValues.length
            ? sharpnessValues[Math.floor(sharpnessValues.length / 2)]
            : 0;
        /*
         * Be deliberately permissive here. We still rank candidate burst frames
         * by sharpness, but only reject clearly blurred captures.
         */
        const usable = sharpnessValues.length >= 2 && sharpness >= 8;
        return {
            usable,
            reason: usable ? 'ready' : 'focus',
            sharpness,
        };
    } finally {
        resources.reverse().forEach((resource) => resource.delete());
    }
}
