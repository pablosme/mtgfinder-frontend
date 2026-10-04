import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    ElementRef,
    afterNextRender,
    computed,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom, timeout } from 'rxjs';
import { CARD_LANGUAGES } from './card-languages';
import { CardOcrResult, CardOcrService } from './card-ocr.service';
import { OpenCvService } from './opencv.service';
import type { CardScanResult } from '../interface/card-scan-result.interface';
import type { CardDetection } from '../interface/card-detection.interface';
import type { CardCapture } from '../interface/card-capture.interface';
import { CardSearchService } from '../card-search.service';
import { Router } from '@angular/router';
@Component({
    selector: 'app-camera',
    imports: [MatDialogModule],
    providers: [CardOcrService],
    templateUrl: './camera.html',
    styleUrl: './camera.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Camera {
    private readonly dialogRef = inject(MatDialogRef<Camera, CardScanResult>);
    private readonly destroyRef = inject(DestroyRef);
    private readonly document = inject(DOCUMENT);
    private readonly openCv = inject(OpenCvService);
    private readonly ocr = inject(CardOcrService);
    private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
    private readonly cardSearch = inject(CardSearchService);
    private readonly router = inject(Router);
    private stream: MediaStream | null = null;
    private closed = false;
    private detectionFrame?: number;
    private goodCardFrames = 0;
    private lastDetection: CardDetection | null = null;
    private lastDetectionAt = 0;
    private missedCardFrames = 0;
    private retryAfter = 0;
    // Outline acquisition stays forgiving. A separate capture window measures
    // actual card detail before OCR.
    private readonly requiredGoodFrames = 3;
    private readonly detectionIntervalMs = 120;
    private readonly maxCornerMovementRatio = 0.025;
    // The browser may not expose focus controls. Instead, keep the native camera
    // running and watch the card sharpness until it settles, then keep the
    // clearest frame observed during that window.
    private readonly maxSharpnessSamples = 12;
    private readonly minSharpnessSamples = 5;
    private readonly sharpnessInitialDelayMs = 300;
    private readonly sharpnessSampleIntervalMs = 160;
    private readonly sharpnessWindowSize = 4;
    private readonly sharpnessStabilityRatio = 0.05;
    readonly loading = signal(true);
    readonly error = signal('');
    readonly languages = CARD_LANGUAGES;
    readonly language = signal(CARD_LANGUAGES[0]);
    readonly processing = signal(false);
    readonly progress = signal('');
    readonly result = signal<CardScanResult | null>(null);
    readonly name = signal('');
    readonly previewDetection = signal<CardDetection | null>(null);
    readonly outlinePoints = computed(
        () =>
            this.previewDetection()
                ?.corners?.map(({ x, y }) => `${x},${y}`)
                .join(' ') ?? '',
    );
    readonly outlineViewBox = computed(() => {
        const detection = this.previewDetection();
        return `0 0 ${detection?.sourceWidth ?? 640} ${detection?.sourceHeight ?? 480}`;
    });
    constructor() {
        this.dialogRef
            .beforeClosed()
            .pipe(takeUntilDestroyed())
            .subscribe(() => this.stopCamera());
        this.destroyRef.onDestroy(() => this.stopCamera());
        // Browser-only callback that runs after the video element exists.
        afterNextRender(() => void this.startCamera());
    }
    selectLanguage(code: string): void {
        const language = this.languages.find((option) => option.code === code);
        if (language) this.language.set(language);
    }
    /**
     * Lightweight outline acquisition. Once the card outline is stable, start an
     * adaptive sharpness sampling phase. The camera remains live so any native
     * autofocus can continue working while we measure the resulting frames.
     */
    private async watchForCard(): Promise<void> {
        if (this.closed || this.error() || this.processing() || this.result()) return;
        const video = this.video()?.nativeElement;
        if (
            this.loading() ||
            !video ||
            video.readyState < 2 ||
            !video.videoWidth ||
            !video.videoHeight
        ) {
            this.scheduleCardDetection();
            return;
        }
        const view = this.document.defaultView;
        if (!view) return;
        const now = view.performance.now();
        if (now < this.retryAfter || now - this.lastDetectionAt < this.detectionIntervalMs) {
            this.scheduleCardDetection();
            return;
        }
        this.lastDetectionAt = now;
        try {
            const [{ cv }, { evaluateCardFrame }] = await Promise.all([
                this.openCv.load(),
                import('./normalize-card'),
            ]);
            if (this.closed || this.processing() || this.result()) return;
            const preview = this.captureVideoFrame(video, 640);
            const detection = evaluateCardFrame(cv, preview);
            preview.width = 0;
            this.previewDetection.set(detection);
            const stable =
                detection.detected &&
                this.lastDetection?.detected === true &&
                this.isStableDetection(this.lastDetection, detection);
            if (detection.detected) {
                this.goodCardFrames = stable ? this.goodCardFrames + 1 : 1;
                this.missedCardFrames = 0;
                this.lastDetection = detection;
                this.progress.set(
                    this.goodCardFrames >= 2
                        ? 'Hold the card steady…'
                        : 'Card detected. Keep it still…',
                );
            } else {
                this.missedCardFrames++;
                if (!this.goodCardFrames || this.missedCardFrames > 1) {
                    this.goodCardFrames = 0;
                    this.lastDetection = null;
                    this.progress.set(this.getDetectionMessage(detection));
                }
            }
            if (detection.detected && this.goodCardFrames >= this.requiredGoodFrames) {
                this.goodCardFrames = 0;
                this.progress.set('Card found. Waiting for the sharpest image…');
                this.cancelCardDetection();
                await this.captureCard();
                return;
            }
        } catch {
            if (this.closed) return;
            // A transient preview detection error should never close the camera.
            this.goodCardFrames = 0;
            this.lastDetection = null;
            this.previewDetection.set(null);
            this.retryAfter = view.performance.now() + 3000;
            this.progress.set('Waiting for the scanner. Retrying automatically…');
        }
        this.scheduleCardDetection();
    }
    private isStableDetection(previous: CardDetection, current: CardDetection): boolean {
        if (
            !previous.corners ||
            !current.corners ||
            previous.corners.length !== 4 ||
            current.corners.length !== 4
        ) {
            return false;
        }
        const width = current.sourceWidth ?? 1;
        const height = current.sourceHeight ?? 1;
        const diagonal = Math.hypot(width, height);
        if (!diagonal) return false;
        // Rotating a tilted card can change which corner sorts first without
        // moving its outline. Compare cyclic orders instead of resetting acquisition.
        const averageMovement = Math.min(
            ...current.corners.map(
                (_, offset) =>
                    current.corners!.reduce((sum, point, index) => {
                        const previousPoint = previous.corners![(index + offset) % 4];
                        return (
                            sum + Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y)
                        );
                    }, 0) / 4,
            ),
        );
        return averageMovement / diagonal <= this.maxCornerMovementRatio;
    }
    private isSharpnessStable(history: readonly number[]): boolean {
        if (history.length < this.minSharpnessSamples) return false;
        const window = history.slice(-this.sharpnessWindowSize);
        if (window.length < this.sharpnessWindowSize) return false;
        const average = window.reduce((sum, value) => sum + value, 0) / window.length;
        if (average <= 0) return false;
        const minimum = Math.min(...window);
        const maximum = Math.max(...window);
        const spread = (maximum - minimum) / average;
        const trend = Math.abs(window[window.length - 1] - window[0]) / average;
        return spread <= this.sharpnessStabilityRatio && trend <= this.sharpnessStabilityRatio;
    }
    private getDetectionMessage(detection: CardDetection): string {
        switch (detection.reason) {
            case 'outline':
                return 'Keep all four corners visible against a contrasting background.';
            case 'perspective':
                return 'Tilt the card slightly toward the camera.';
            case 'ready':
                return 'Hold the card steady…';
        }
    }
    /** Capture the current camera image at OCR-friendly resolution. */
    private captureVideoFrame(video: HTMLVideoElement, maxDimension = 3840): HTMLCanvasElement {
        const frame = this.document.createElement('canvas');
        const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
        frame.width = Math.round(video.videoWidth * scale);
        frame.height = Math.round(video.videoHeight * scale);
        const context = frame.getContext('2d');
        if (!context) {
            throw new Error('Unable to capture a camera frame in this browser.');
        }
        context.drawImage(video, 0, 0, frame.width, frame.height);
        return frame;
    }
    /**

     * Freeze the visible video on exactly the frame accepted by detection.

     * The MediaStream remains alive so scanning can resume without asking for

     * camera permission again.

     */
    private freezeVideoOnFrame(video: HTMLVideoElement, frame: HTMLCanvasElement): void {
        this.cancelCardDetection();
        video.pause();
        // Pausing alone could display a slightly newer camera frame because
        // OpenCV needed time to evaluate the captured image. Detaching the
        // stream and using the accepted frame as the poster guarantees that
        // the user sees exactly the image being sent to OCR/search.
        video.poster = frame.toDataURL('image/jpeg', 0.95);
        video.srcObject = null;
        video.load();
    }
    /** Resume automatic scanning after an unsuccessful capture, OCR, or search. */
    private async resumeCameraPreview(): Promise<void> {
        const video = this.video()?.nativeElement;
        if (this.closed || !video || !this.stream) return;
        try {
            if (video.srcObject !== this.stream) {
                video.removeAttribute('poster');
                video.srcObject = this.stream;
            }
            if (video.paused) await video.play();
            if (this.closed) return;
            this.scheduleCardDetection();
        } catch {
            if (!this.closed) {
                this.error.set(
                    'The camera stopped responding. Close this dialog and reopen the scanner.',
                );
            }
        }
    }
    private scheduleCardDetection(): void {
        if (this.closed || this.error() || this.processing() || this.result()) return;
        const view = this.document.defaultView;
        if (!view) return;
        if (this.detectionFrame !== undefined) {
            view.cancelAnimationFrame(this.detectionFrame);
        }
        this.detectionFrame = view.requestAnimationFrame(() => {
            this.detectionFrame = undefined;
            void this.watchForCard();
        });
    }
    private cancelCardDetection(): void {
        const view = this.document.defaultView;
        if (view && this.detectionFrame !== undefined) {
            view.cancelAnimationFrame(this.detectionFrame);
        }
        this.detectionFrame = undefined;
    }
    private async captureCard(): Promise<void> {
        const video = this.video()?.nativeElement;
        if (this.closed || this.error() || this.processing() || this.loading() || !video) return;
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
            this.progress.set('Waiting for the camera… Scanning will continue automatically.');
            this.scheduleCardDetection();
            return;
        }
        this.cancelCardDetection();
        this.processing.set(true);
        this.result.set(null);
        this.name.set('');
        this.progress.set('Hold still while the scanner finds the sharpest frame…');
        let best: CardCapture | null = null;
        let retryMessage = 'Keep the card in view. Scanning again automatically…';
        let retryDelayMs = 900;
        try {
            const [
                { cv },
                { evaluateCardFrame, normalizeCard, evaluateCardCaptureQuality, prepareCardForOcr },
            ] = await Promise.all([this.openCv.load(), import('./normalize-card')]);
            if (this.closed) return;
            // Keep the preview live while the camera's own autofocus/exposure
            // continues working. Stop early once the measured sharpness has
            // stabilized; otherwise fall back to the best frame after the cap.
            let previous: CardDetection | null = null;
            let missedSamples = 0;
            let lastVideoTime = -1;
            const sharpnessHistory: number[] = [];
            for (let sample = 0; sample < this.maxSharpnessSamples; sample++) {
                await new Promise<void>((resolve) =>
                    setTimeout(
                        resolve,
                        sample === 0
                            ? this.sharpnessInitialDelayMs
                            : this.sharpnessSampleIntervalMs,
                    ),
                );
                if (this.closed) return;
                if (video.readyState < 2 || video.currentTime === lastVideoTime) continue;
                lastVideoTime = video.currentTime;
                const frame = this.captureVideoFrame(video);
                let card: HTMLCanvasElement | undefined;
                try {
                    const detection = evaluateCardFrame(cv, frame);
                    this.previewDetection.set(detection);
                    missedSamples = detection.detected ? 0 : missedSamples + 1;
                    const moved =
                        missedSamples > 2 ||
                        (detection.detected &&
                            previous !== null &&
                            !this.isStableDetection(previous, detection));
                    if (moved) {
                        if (best) {
                            best.frame.width = 0;
                            best.card.width = 0;
                            best = null;
                        }
                        sharpnessHistory.length = 0;
                    }
                    if (detection.detected) previous = detection;
                    else if (missedSamples > 2) previous = null;
                    if (!detection.detected) {
                        retryMessage = `${this.getDetectionMessage(detection)} Scanning automatically…`;
                        continue;
                    }
                    card = normalizeCard(cv, frame, detection);
                    const quality = evaluateCardCaptureQuality(cv, card);
                    if (!quality.usable) {
                        retryMessage =
                            'Hold still in even lighting. Waiting for a sharper image and scanning again automatically…';
                        this.progress.set('Card found. Waiting for a sharper image…');
                        continue;
                    }
                    sharpnessHistory.push(quality.sharpness);
                    if (!best || quality.sharpness > best.sharpness) {
                        if (best) {
                            best.frame.width = 0;
                            best.card.width = 0;
                        }
                        best = { frame, card, sharpness: quality.sharpness };
                    }
                    if (this.isSharpnessStable(sharpnessHistory)) {
                        this.progress.set('Image is sharp and stable. Capturing…');
                        break;
                    }
                    this.progress.set('Card found. Waiting for the image to sharpen…');
                } finally {
                    // Keep only the best full-resolution image in memory.
                    if (best?.frame !== frame) frame.width = 0;
                    if (card && best?.card !== card) card.width = 0;
                }
            }
            if (!best) return;
            this.freezeVideoOnFrame(video, best.frame);
            this.previewDetection.set(null);
            this.progress.set('Reading the clearest frame…');
            const card = best.card;
            const language = this.language();
            const result: CardScanResult = {
                name: '',
                normalizedImage: card.toDataURL('image/png'),
                width: card.width,
                height: card.height,
                language: language.code,
                rawText: '',
                confidence: null,
            };
            // Show the exact selected image while OCR and search run.
            this.result.set(result);
            if (!language.ocrModel) {
                this.error.set('Text recognition is unavailable for this language.');
                return;
            }
            this.progress.set('Preparing card for text recognition…');
            const recognized = await this.ocr.recognizeCard(
                prepareCardForOcr(cv, card),
                language,
                (message) => {
                    if (!this.closed) this.progress.set(message);
                },
            );
            if (this.closed) return;
            const readable = recognized.filter((candidate) => candidate.text.trim().length > 0);
            if (!readable.length) {
                retryMessage =
                    'Text was unclear. Keep the card steady and reduce glare; scanning again automatically…';
                return;
            }
            // Do not discard OCR evidence from lower-confidence passes. One pass
            // may find rules text while another is the only one that sees the title.
            const rawText = this.mergeOcrText(readable);
            const confidence =
                readable.reduce((sum, candidate) => sum + candidate.confidence, 0) /
                readable.length;
            this.result.set({
                ...result,
                rawText,
                confidence,
            });
            this.progress.set('Searching for the card…');
            // Await search so another capture cannot overlap this attempt.
            const cards = await firstValueFrom(
                this.cardSearch
                    .searchByPrompt(rawText)
                    .pipe(timeout({ first: 45000 }), takeUntilDestroyed(this.destroyRef)),
            ).catch(() => {
                retryMessage = 'Search is temporarily unavailable. Retrying automatically…';
                retryDelayMs = 3000;
                return null;
            });
            if (this.closed || !cards) return;
            if (cards.total_results < 1) {
                retryMessage = 'Card not identified yet. Reading another image automatically…';
                return;
            }
            const oracleId = cards.data[0]?.oracle_id;
            if (!oracleId) {
                retryMessage = 'No usable match yet. Reading another image automatically…';
                return;
            }
            this.dialogRef.close();
            void this.router.navigate(['/card'], {
                queryParams: { oracle_id: oracleId },
            });
        } catch {
            retryMessage = 'Reading was interrupted. Scanning again automatically…';
            retryDelayMs = 3000;
        } finally {
            if (best) {
                best.frame.width = 0;
                best.card.width = 0;
            }
            if (!this.closed) {
                this.processing.set(false);
                this.result.set(null);
                this.previewDetection.set(null);
                this.goodCardFrames = 0;
                this.missedCardFrames = 0;
                this.lastDetection = null;
                this.lastDetectionAt = 0;
                if (!this.error()) {
                    this.progress.set(retryMessage);
                    this.retryAfter =
                        (this.document.defaultView?.performance.now() ?? 0) + retryDelayMs;
                    await this.resumeCameraPreview();
                } else {
                    this.progress.set('');
                }
            }
        }
    }
    private mergeOcrText(results: readonly CardOcrResult[]): string {
        const lines = new Map<string, string>();
        for (const result of results) {
            for (const rawLine of result.text.split(/\r?\n/)) {
                const line = rawLine.replace(/\s+/g, ' ').trim();
                if (!line) continue;
                const key = line
                    .toLocaleLowerCase()
                    .replace(/[^\p{L}\p{N}]+/gu, ' ')
                    .trim();
                if (!key) continue;
                const existing = lines.get(key);
                if (!existing || line.length > existing.length) {
                    lines.set(key, line);
                }
            }
        }
        return [...lines.values()].join('\n');
    }
    useCard(): void {
        const result = this.result();
        const name = this.name().trim();
        if (!result || !name || this.processing()) return;
        this.dialogRef.close({ ...result, name });
    }
    private async startCamera(): Promise<void> {
        const video = this.video()?.nativeElement;
        if (this.closed || !video) return;
        if (!navigator.mediaDevices?.getUserMedia) {
            this.error.set(
                'Camera access is unavailable. Use a supported browser on HTTPS or localhost.',
            );
            this.loading.set(false);
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 3840 },
                    height: { ideal: 2160 },
                },
            });
            if (this.closed) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            this.stream = stream;
            video.removeAttribute('poster');
            video.srcObject = stream;
            await video.play();
            if (!this.closed) {
                this.loading.set(false);
                this.progress.set('Position the whole card inside the camera.');
                this.goodCardFrames = 0;
                this.lastDetection = null;
                this.lastDetectionAt = 0;
                this.missedCardFrames = 0;
                this.scheduleCardDetection();
            }
        } catch (error: unknown) {
            if (this.closed) return;
            const name = error instanceof DOMException ? error.name : '';
            switch (name) {
                case 'NotAllowedError':
                case 'SecurityError':
                    this.error.set(
                        'Camera access was denied. Allow camera access in your browser settings, then reopen this dialog.',
                    );
                    break;
                case 'NotFoundError':
                    this.error.set('No camera was found. Connect a camera and reopen this dialog.');
                    break;
                case 'NotReadableError':
                    this.error.set(
                        'The camera could not be started. Close other apps using it and reopen this dialog.',
                    );
                    break;
                default:
                    this.error.set('Unable to show the camera. Close this dialog and try again.');
            }
            this.loading.set(false);
            this.stopCamera();
        }
    }
    private stopCamera(): void {
        if (this.closed) return;
        this.closed = true;
        this.cancelCardDetection();
        this.ocr.stop();
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        const video = this.video()?.nativeElement;
        if (video) video.srcObject = null;
    }
}
