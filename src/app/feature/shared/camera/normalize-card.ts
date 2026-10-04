import type * as OpenCv from '@techstark/opencv-js';
import type { CardDetection } from '../interface/card-detection.interface';
import type { CardOcrImage } from '../interface/card-ocr-image.interface';
import type { CardPoint } from '../interface/card-point.interface';
import type { CardCaptureQuality } from '../interface/card-capture-quality.interface';

const NORMALIZED_CARD_WIDTH = 744;
const NORMALIZED_CARD_HEIGHT = 1040;

// Acquisition only needs enough detail and geometry to rectify the card.
// In particular, a portrait card occupies relatively little of a wide camera
// frame, and perspective correction is responsible for straightening tilt.
const MIN_PERSPECTIVE_RATIO = 0.5;
const MIN_CARD_RATIO = 0.42;
const MAX_CARD_RATIO = 0.92;

/**
 * Detect the best card-shaped quadrilateral in a frame and evaluate whether it
 * has suitable geometry for focus-aware capture. Text quality is evaluated
 * separately on the full-resolution, rectified card.
 *
 * This is intentionally the single source of truth for card detection. The
 * preview uses it to decide when to capture and normalizeCard() uses the same
 * geometry to rectify the card.
 */
export function evaluateCardFrame(cv: typeof OpenCv, image: HTMLCanvasElement): CardDetection {
    // Use the same detection scale for preview and full-resolution burst frames.
    // Returned coordinates include this scale for normalization to map back.
    let frame = image;
    const scale = Math.min(1, 640 / Math.max(image.width, image.height));
    if (scale < 1) {
        frame = image.ownerDocument.createElement('canvas');
        frame.width = Math.round(image.width * scale);
        frame.height = Math.round(image.height * scale);
        const context = frame.getContext('2d');
        if (!context) throw new Error('Unable to analyze the camera image.');
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

        const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        resources.push(kernel);

        const frameArea = frame.width * frame.height;

        let best:
            | {
                  area: number;
                  corners: CardPoint[];
                  aspectRatio: number;
                  perspectiveRatio: number;
              }
            | undefined;

        // Keep strong edges and try weaker edges separately so a faint border
        // can still close. Both threshold polarities support light/dark cards
        // without treating a surrounding background contour as their outline.
        for (const method of ['edges', 'soft-edges', 'threshold', 'inverse-threshold'] as const) {
            if (method === 'edges' || method === 'soft-edges') {
                cv.Canny(
                    blurred,
                    working,
                    method === 'edges' ? 40 : 20,
                    method === 'edges' ? 120 : 60,
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
            }

            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            resources.push(contours, hierarchy);

            cv.findContours(working, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

            for (let index = 0; index < contours.size(); index++) {
                const contour = contours.get(index);

                try {
                    const area = cv.contourArea(contour);

                    if (
                        area < frameArea * 0.02 ||
                        area > frameArea * 0.95 ||
                        (best && area <= best.area)
                    ) {
                        continue;
                    }

                    // Check the original contour, too: polygon approximation
                    // can hide a clipped edge by dropping its boundary points.
                    const bounds = cv.boundingRect(contour);
                    if (
                        bounds.x <= 1 ||
                        bounds.y <= 1 ||
                        bounds.x + bounds.width >= frame.width - 1 ||
                        bounds.y + bounds.height >= frame.height - 1
                    ) {
                        continue;
                    }

                    const perimeter = cv.arcLength(contour, true);

                    for (const tolerance of [0.02, 0.035, 0.05]) {
                        cv.approxPolyDP(contour, polygon, perimeter * tolerance, true);

                        if (polygon.rows !== 4 || !cv.isContourConvex(polygon)) continue;

                        const points = Array.from({ length: 4 }, (_, point) => ({
                            x: polygon.data32S[point * 2],
                            y: polygon.data32S[point * 2 + 1],
                        }));

                        // Require the whole card to be inside the image. This prevents
                        // auto-capture when one of the edges/corners is clipped.
                        const margin = 2;
                        if (
                            points.some(
                                ({ x, y }) =>
                                    x < margin ||
                                    y < margin ||
                                    x > frame.width - margin ||
                                    y > frame.height - margin,
                            )
                        ) {
                            continue;
                        }

                        let corners = orderCorners(points);
                        let metrics = cardGeometry(corners);

                        if (
                            metrics.aspectRatio < MIN_CARD_RATIO ||
                            metrics.aspectRatio > MAX_CARD_RATIO
                        ) {
                            continue;
                        }

                        // normalizeCard() expects portrait ordering:
                        // top-left, top-right, bottom-right, bottom-left.
                        if (metrics.width > metrics.height) {
                            corners = [corners[1], corners[2], corners[3], corners[0]];
                            metrics = cardGeometry(corners);
                        }

                        best = {
                            area,
                            corners,
                            aspectRatio: metrics.aspectRatio,
                            perspectiveRatio: metrics.perspectiveRatio,
                        };

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
        const goodPerspective = best.perspectiveRatio >= MIN_PERSPECTIVE_RATIO;

        // Frame coverage is useful for ranking, not a measure of legibility.
        // A complete card can have readable text while occupying little of a
        // wide, high-resolution camera frame. Let the capture/OCR evaluate it.
        const detected = goodPerspective;

        const areaScore = Math.min(1, areaRatio / 0.35);
        const perspectiveScore = Math.min(1, best.perspectiveRatio / 0.9);

        // Reward a card-like aspect ratio without requiring an exact MTG frame.
        // This still permits alternate/full-art/borderless layouts because only
        // the physical card outline matters here.
        const targetRatio = 63 / 88;
        const ratioDistance = Math.abs(best.aspectRatio - targetRatio);
        const aspectScore = Math.max(0, 1 - ratioDistance / 0.22);

        const score = areaScore * 0.4 + perspectiveScore * 0.4 + aspectScore * 0.2;

        return {
            detected,
            reason: !goodPerspective ? 'perspective' : 'ready',
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
        if (frame !== image) frame.width = 0;
    }
}

/**
 * Detect and rectify one complete card into a fixed portrait canvas.
 *
 * A CardDetection from the preview may be supplied. Its coordinates are
 * automatically scaled to the capture frame, so the exact same detection that
 * triggered auto-capture can be reused for perspective correction.
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
            throw new Error(
                'No complete card found. Move closer, keep all four corners visible, and use a plain contrasting background.',
            );
        }

        const sourceWidth = resolved.sourceWidth || frame.width;
        const sourceHeight = resolved.sourceHeight || frame.height;
        const scaleX = frame.width / sourceWidth;
        const scaleY = frame.height / sourceHeight;

        const corners = resolved.corners.map(({ x, y }) => ({
            x: x * scaleX,
            y: y * scaleY,
        }));

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
            cv.INTER_LINEAR,
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
            images.push({ image: canvas, variant });
        };

        // Keep grayscale variants: thresholding is not always better for
        // stylized text, gradients, foil cards or text over artwork.
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
 * Check real capture detail, excluding the border and background. Sampling
 * across the interior avoids depending on a particular card/text layout or
 * allowing one sharp artwork edge to outweigh otherwise blurred content.
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

        const insetX = Math.round(card.width * 0.08);
        const insetY = Math.round(card.height * 0.06);
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
                    // Blank/flat regions contain no focus evidence.
                    if (stddev.doubleAt(0, 0) < 12) continue;
                    cv.meanStdDev(edgeTile, mean, stddev);
                    sharpnessValues.push(stddev.doubleAt(0, 0) ** 2);
                } finally {
                    edgeTile.delete();
                    grayTile.delete();
                }
            }
        }

        sharpnessValues.sort((a, b) => a - b);
        const sharpness = sharpnessValues[Math.floor((sharpnessValues.length - 1) / 3)] ?? 0;
        // Primarily rank burst frames by detail. Reject only very weak focus
        // evidence; a strict absolute score cannot predict text readability
        // across cameras and card layouts. OCR determines whether text exists.
        const usable = sharpnessValues.length >= 2 && sharpness >= 20;
        return { usable, reason: usable ? 'ready' : 'focus', sharpness };
    } finally {
        resources.reverse().forEach((resource) => resource.delete());
    }
}
