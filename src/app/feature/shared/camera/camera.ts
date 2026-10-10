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
import type { PreferredCamera } from '../interface/preferred-camera.interface';
import type { CardDetection } from '../interface/card-detection.interface';
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
    // Require two consecutive stable border detections (~240ms) to confirm lock without sluggishness
    private readonly requiredGoodFrames = 2;
    private readonly detectionIntervalMs = 120;
    private readonly maxCornerMovementRatio = 0.04;
    private readonly minCaptureDetectionScore = 0.45;
    private readonly minCaptureAreaRatio = 0.05;
    private readonly minCapturePerspectiveRatio = 0.4;
    private readonly minCardAspectRatio = 0.62;
    private readonly maxCardAspectRatio = 0.8;
    private readonly captureBurstFrames = 3;
    private readonly captureBurstIntervalMs = 70;
    private readonly preferredCameraStorageKey = 'mtg-best-camera-device-id-v2';

    readonly loading = signal(true);
    readonly error = signal('');
    readonly languages = CARD_LANGUAGES;
    readonly language = signal(CARD_LANGUAGES[0]);
    readonly processing = signal(false);
    readonly progress = signal('');
    readonly result = signal<CardScanResult | null>(null);
    readonly name = signal('');
    readonly previewDetection = signal<CardDetection | null>(null);
    readonly cameras = signal<Array<{ deviceId: string; label: string }>>([]);
    readonly selectedCameraId = signal('');
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

            const captureReady = this.isCaptureReadyDetection(detection);
            const stable =
                captureReady &&
                this.lastDetection !== null &&
                this.isStableDetection(this.lastDetection, detection);

            if (captureReady) {
                this.goodCardFrames = stable ? this.goodCardFrames + 1 : 1;
                this.missedCardFrames = 0;
                this.lastDetection = detection;
                this.progress.set(
                    this.goodCardFrames >= this.requiredGoodFrames
                        ? 'Card border locked…'
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

            if (captureReady && this.goodCardFrames >= this.requiredGoodFrames) {
                this.goodCardFrames = 0;
                this.progress.set('Card found. Confirming border…');
                this.cancelCardDetection();
                await this.captureCard();
                return;
            }
        } catch {
            if (this.closed) return;
            this.goodCardFrames = 0;
            this.lastDetection = null;
            this.previewDetection.set(null);
            this.retryAfter = view.performance.now() + 1000;
            this.progress.set('Waiting for the scanner. Retrying automatically…');
        }

        this.scheduleCardDetection();
    }

    private isFrontCameraLabel(label: string): boolean {
        const value = label.toLocaleLowerCase().trim();

        return (
            value.includes('facing front') ||
            value.includes('front camera') ||
            value.includes('front-facing') ||
            value.includes('selfie')
        );
    }

    private isBackCameraLabel(label: string): boolean {
        const value = label.toLocaleLowerCase().trim();

        return (
            value.includes('facing back') ||
            value.includes('back camera') ||
            value.includes('rear camera') ||
            value.includes('rear-facing') ||
            value.includes('environment')
        );
    }

    private getPreferredCamera(): PreferredCamera | null {
        try {
            const raw = this.document.defaultView?.localStorage?.getItem(
                this.preferredCameraStorageKey,
            );
            if (!raw) return null;
            if (raw.startsWith('{')) {
                const parsed = JSON.parse(raw) as PreferredCamera;
                if (parsed.deviceId) return parsed;
            }
            return { deviceId: raw };
        } catch {
            return null;
        }
    }

    private savePreferredCamera(camera: PreferredCamera): void {
        try {
            this.document.defaultView?.localStorage?.setItem(
                this.preferredCameraStorageKey,
                JSON.stringify(camera),
            );
        } catch {
            // Storage unavailable in private browsing or quota exceeded
        }
    }

    private async resolvePreferredCameraDeviceId(
        preferred: PreferredCamera,
    ): Promise<string | undefined> {
        if (!navigator.mediaDevices?.enumerateDevices) return undefined;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cameras = devices.filter((d) => d.kind === 'videoinput' && !!d.deviceId);
            const exactMatch = cameras.find((c) => c.deviceId === preferred.deviceId);
            if (exactMatch) return exactMatch.deviceId;

            if (preferred.label) {
                const labelMatch = cameras.find((c) => c.label && c.label === preferred.label);
                if (labelMatch) return labelMatch.deviceId;
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    private async detectAndSaveBestCamera(): Promise<{
        deviceId?: string;
        stream?: MediaStream;
    }> {
        let permissionStream: MediaStream | null = null;

        try {
            /*
             * Camera labels are often hidden until permission has been granted.
             */
            permissionStream = await this.requestCameraStream();

            if (this.closed) {
                permissionStream.getTracks().forEach((track) => track.stop());
                return {};
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const allCameras = devices.filter(
                (device) => device.kind === 'videoinput' && !!device.deviceId,
            );

            if (!allCameras.length) {
                return { stream: permissionStream };
            }

            const nonFrontCameras = allCameras.filter(
                (camera) => !this.isFrontCameraLabel(camera.label),
            );

            const explicitRearCameras = nonFrontCameras.filter((camera) =>
                this.isBackCameraLabel(camera.label),
            );

            const candidates = explicitRearCameras.length ? explicitRearCameras : nonFrontCameras;

            if (!candidates.length) {
                return { stream: permissionStream };
            }

            const activeTrack = permissionStream.getVideoTracks()[0];
            const activeDeviceId = activeTrack?.getSettings?.().deviceId;
            const activeCamera = candidates.find((c) => c.deviceId === activeDeviceId);

            // If only one candidate rear camera, adopt permissionStream directly!
            if (candidates.length === 1) {
                const winner = candidates[0];
                this.savePreferredCamera({ deviceId: winner.deviceId, label: winner.label });
                return { deviceId: winner.deviceId, stream: permissionStream };
            }

            // Multiple candidates: score the active stream first without restarting it
            let bestCamera = activeCamera ?? candidates[0];
            let bestScore = activeTrack ? this.scoreCamera(activeTrack) : Number.NEGATIVE_INFINITY;

            // Stop permission stream before probing other physical cameras
            permissionStream.getTracks().forEach((track) => track.stop());
            permissionStream = null;

            // Probe other rear cameras (excluding the one we already evaluated)
            const remainingCandidates = candidates.filter((c) => c.deviceId !== activeDeviceId);

            for (const camera of remainingCandidates) {
                if (this.closed) return {};

                // Brief delay so hardware HAL releases previous camera
                await new Promise((resolve) => setTimeout(resolve, 60));

                let testStream: MediaStream | null = null;
                try {
                    testStream = await this.requestCameraStream(camera.deviceId, true);
                    const track = testStream.getVideoTracks()[0];
                    if (!track) continue;

                    const settings = track.getSettings?.() ?? {};
                    const facingMode = settings.facingMode?.toLocaleLowerCase();
                    if (
                        facingMode === 'user' ||
                        this.isFrontCameraLabel(`${camera.label} ${track.label}`)
                    ) {
                        continue;
                    }

                    const score = this.scoreCamera(track);
                    if (score > bestScore) {
                        bestScore = score;
                        bestCamera = camera;
                    }
                } catch (error) {
                    console.warn('[Camera candidate probe failed]', camera.label, error);
                } finally {
                    testStream?.getTracks().forEach((track) => track.stop());
                }
            }

            this.savePreferredCamera({
                deviceId: bestCamera.deviceId,
                label: bestCamera.label,
            });
            console.log(
                '[Camera] Best camera detected and saved:',
                bestCamera,
                'score:',
                bestScore,
            );

            return { deviceId: bestCamera.deviceId };
        } finally {
            permissionStream?.getTracks().forEach((track) => track.stop());
        }
    }
    private isCaptureReadyDetection(detection: CardDetection): boolean {
        const aspectRatio = detection.aspectRatio ?? 0;
        return (
            detection.detected === true &&
            detection.corners?.length === 4 &&
            (detection.score ?? 0) >= this.minCaptureDetectionScore &&
            (detection.areaRatio ?? 0) >= this.minCaptureAreaRatio &&
            (detection.perspectiveRatio ?? 0) >= this.minCapturePerspectiveRatio &&
            aspectRatio >= this.minCardAspectRatio &&
            aspectRatio <= this.maxCardAspectRatio
        );
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
        if (this.closed || this.error() || this.processing() || this.loading() || !video) {
            return;
        }

        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
            this.progress.set('Waiting for the camera… Scanning will continue automatically.');
            this.scheduleCardDetection();
            return;
        }

        this.cancelCardDetection();
        this.processing.set(true);
        this.result.set(null);
        this.name.set('');
        this.progress.set('Card found. Confirming border…');

        let best: {
            frame: HTMLCanvasElement;
            card: HTMLCanvasElement;
            detectionScore: number;
            sharpness: number;
        } | null = null;
        let retryMessage = 'Keep the whole card visible. Scanning again automatically…';
        let retryDelayMs = 500;

        try {
            const [
                { cv },
                { evaluateCardFrame, normalizeCard, evaluateCardCaptureQuality, prepareCardForOcr },
            ] = await Promise.all([this.openCv.load(), import('./normalize-card')]);

            if (this.closed) return;

            /*
             * Use a very short burst instead of a long "wait until sharp" phase.
             * Each frame is detected again at capture time, so the corners used by
             * normalization belong to the exact same image being normalized.
             */
            for (let sample = 0; sample < this.captureBurstFrames; sample++) {
                if (sample > 0) {
                    await new Promise<void>((resolve) =>
                        setTimeout(resolve, this.captureBurstIntervalMs),
                    );
                }

                if (this.closed) return;

                const frame = this.captureVideoFrame(video);
                let card: HTMLCanvasElement | null = null;

                try {
                    const detection = evaluateCardFrame(cv, frame);
                    this.previewDetection.set(detection);

                    if (!this.isCaptureReadyDetection(detection)) {
                        continue;
                    }

                    card = normalizeCard(cv, frame, detection);
                    const quality = evaluateCardCaptureQuality(cv, card);
                    const detectionScore = detection.score ?? 0;

                    const isBetter =
                        !best ||
                        detectionScore > best.detectionScore + 0.03 ||
                        (Math.abs(detectionScore - best.detectionScore) <= 0.03 &&
                            quality.sharpness > best.sharpness);

                    if (isBetter) {
                        if (best) {
                            best.frame.width = 0;
                            best.frame.height = 0;
                            best.card.width = 0;
                            best.card.height = 0;
                        }

                        best = {
                            frame,
                            card,
                            detectionScore,
                            sharpness: quality.sharpness,
                        };

                        card = null;
                    }
                } finally {
                    if (best?.frame !== frame) {
                        frame.width = 0;
                        frame.height = 0;
                    }

                    if (card) {
                        card.width = 0;
                        card.height = 0;
                    }
                }
            }

            if (!best && this.lastDetection?.corners?.length === 4) {
                const fallbackFrame = this.captureVideoFrame(video);
                const scaleX =
                    fallbackFrame.width / (this.lastDetection.sourceWidth || fallbackFrame.width);
                const scaleY =
                    fallbackFrame.height /
                    (this.lastDetection.sourceHeight || fallbackFrame.height);
                const fallbackCorners = this.lastDetection.corners.map((p) => ({
                    x: p.x * scaleX,
                    y: p.y * scaleY,
                }));
                const fallbackDetection: CardDetection = {
                    ...this.lastDetection,
                    corners: fallbackCorners,
                    sourceWidth: fallbackFrame.width,
                    sourceHeight: fallbackFrame.height,
                };
                try {
                    const card = normalizeCard(cv, fallbackFrame, fallbackDetection);
                    const quality = evaluateCardCaptureQuality(cv, card);
                    best = {
                        frame: fallbackFrame,
                        card,
                        detectionScore: this.lastDetection.score ?? 0.5,
                        sharpness: quality.sharpness,
                    };
                } catch {
                    fallbackFrame.width = 0;
                    fallbackFrame.height = 0;
                }
            }

            if (!best) {
                retryMessage =
                    'The card border moved or was incomplete. Hold it still and keep all four corners visible…';
                return;
            }

            this.freezeVideoOnFrame(video, best.frame);
            this.previewDetection.set(null);

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

            this.result.set(result);

            if (!language.ocrModel) {
                this.error.set('Text recognition is unavailable for this language.');
                return;
            }

            this.progress.set('Reading card text…');

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

            const cards = await firstValueFrom(
                this.cardSearch
                    .searchByPrompt(rawText, {}, 1)
                    .pipe(timeout({ first: 45000 }), takeUntilDestroyed(this.destroyRef)),
            ).catch((err: unknown) => {
                console.error('[Camera] Search error:', err);
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
            retryDelayMs = 1000;
        } finally {
            if (best) {
                best.frame.width = 0;
                best.frame.height = 0;
                best.card.width = 0;
                best.card.height = 0;
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
    async manualCapture(): Promise<void> {
        if (this.closed || this.processing() || this.loading()) return;
        const detection = this.previewDetection() || this.lastDetection;
        if (!detection?.corners || detection.corners.length !== 4) return;
        this.lastDetection = detection;
        this.goodCardFrames = this.requiredGoodFrames;
        this.cancelCardDetection();
        await this.captureCard();
    }
    useCard(): void {
        const result = this.result();
        const name = this.name().trim();
        if (!result || !name || this.processing()) return;
        this.dialogRef.close({ ...result, name });
    }
    async selectCamera(event: Event): Promise<void> {
        const select = event.target as HTMLSelectElement | null;

        const deviceId = select?.value ?? '';

        if (
            !deviceId ||
            deviceId === this.selectedCameraId() ||
            this.closed ||
            this.loading() ||
            this.processing()
        ) {
            return;
        }

        const camera = this.cameras().find((c) => c.deviceId === deviceId);
        this.savePreferredCamera({ deviceId, label: camera?.label ?? '' });

        await this.switchCamera(deviceId);
    }
    private sendTelemetry(param: string): void {
        const location = this.document.location;
        const hostname = location.hostname || 'localhost';
        const url = new URL(`http://${hostname}:8080/telemetry`);
        url.searchParams.set('param', param);
        void fetch(url.toString(), {
            method: 'GET',
            cache: 'no-store',
        }).catch(() => {
            // Telemetry is diagnostic only and must never interrupt scanning.
        });
    }
    private async refreshCameraList(track: MediaStreamTrack): Promise<void> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cameras = devices
                .filter((device) => device.kind === 'videoinput')
                .map((device, index) => ({
                    deviceId: device.deviceId,
                    label: device.label || `Camera ${index + 1}`,
                }));
            this.cameras.set(cameras);
            const settings = track.getSettings();
            const currentDeviceId = settings.deviceId ?? '';
            if (currentDeviceId) {
                this.selectedCameraId.set(currentDeviceId);
                const currentCam = cameras.find((c) => c.deviceId === currentDeviceId);
                if (currentCam) {
                    const preferred = this.getPreferredCamera();
                    if (!preferred || preferred.deviceId === currentDeviceId || !preferred.label) {
                        this.savePreferredCamera({
                            deviceId: currentDeviceId,
                            label: currentCam.label,
                        });
                    }
                }
            }
            let capabilities: MediaTrackCapabilities | undefined;
            try {
                capabilities = track.getCapabilities?.();
            } catch {
                capabilities = undefined;
            }
            this.sendTelemetry(
                JSON.stringify({
                    event: 'camera-active',
                    label: track.label,
                    settings,
                    capabilities,
                    cameras: cameras.map((camera) => ({
                        label: camera.label,
                        deviceId: camera.deviceId,
                        current: camera.deviceId === currentDeviceId,
                    })),
                }),
            );
        } catch (error: unknown) {
            this.sendTelemetry(
                JSON.stringify({
                    event: 'camera-list-error',
                    error: error instanceof Error ? error.message : String(error),
                }),
            );
        }
    }
    private async switchCamera(deviceId: string): Promise<void> {
        const video = this.video()?.nativeElement;
        if (this.closed || !video) return;
        this.cancelCardDetection();
        this.loading.set(true);
        this.error.set('');
        this.progress.set('Switching camera…');
        this.previewDetection.set(null);
        this.goodCardFrames = 0;
        this.lastDetection = null;
        this.lastDetectionAt = 0;
        this.missedCardFrames = 0;
        const previousStream = this.stream;
        this.stream = null;
        video.pause();
        video.srcObject = null;
        previousStream?.getTracks().forEach((track) => track.stop());
        try {
            const stream = await this.requestCameraStream(deviceId);
            if (this.closed) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            const track = stream.getVideoTracks()[0];
            if (!track) {
                stream.getTracks().forEach((currentTrack) => currentTrack.stop());
                throw new Error('The selected camera did not provide a video track.');
            }
            this.stream = stream;
            video.removeAttribute('poster');
            video.srcObject = stream;
            await video.play();
            if (this.closed) return;
            this.loading.set(false);
            this.progress.set('Position the whole card inside the camera.');
            void this.refreshCameraList(track);
            this.scheduleCardDetection();
        } catch (error: unknown) {
            this.sendTelemetry(
                JSON.stringify({
                    event: 'camera-switch-error',
                    deviceId,
                    error: error instanceof Error ? error.message : String(error),
                }),
            );
            if (!this.closed) {
                this.loading.set(false);
                this.error.set('Unable to switch to the selected camera.');
                this.progress.set('');
            }
        }
    }
    private async requestCameraStream(
        deviceId?: string,
        exactDevice = false,
    ): Promise<MediaStream> {
        const video: MediaTrackConstraints = deviceId
            ? exactDevice
                ? {
                      deviceId: {
                          exact: deviceId,
                      },
                      width: {
                          ideal: 3840,
                      },
                      height: {
                          ideal: 2160,
                      },
                      frameRate: {
                          ideal: 30,
                      },
                  }
                : {
                      deviceId: {
                          ideal: deviceId,
                      },
                      facingMode: {
                          ideal: 'environment',
                      },
                      width: {
                          ideal: 3840,
                      },
                      height: {
                          ideal: 2160,
                      },
                      frameRate: {
                          ideal: 30,
                      },
                  }
            : {
                  facingMode: {
                      ideal: 'environment',
                  },
                  width: {
                      ideal: 3840,
                  },
                  height: {
                      ideal: 2160,
                  },
                  frameRate: {
                      ideal: 30,
                  },
              };
        try {
            return await navigator.mediaDevices.getUserMedia({
                audio: false,
                video,
            });
        } catch (error: unknown) {
            /*
             * If the camera rejects our resolution preferences, retry using
             * only the selected device/facing mode.
             */
            if (!(error instanceof DOMException) || error.name !== 'OverconstrainedError') {
                throw error;
            }
            return navigator.mediaDevices.getUserMedia({
                audio: false,
                video: deviceId
                    ? exactDevice
                        ? {
                              deviceId: {
                                  exact: deviceId,
                              },
                          }
                        : {
                              deviceId: {
                                  ideal: deviceId,
                              },
                              facingMode: {
                                  ideal: 'environment',
                              },
                          }
                    : {
                          facingMode: {
                              ideal: 'environment',
                          },
                      },
            });
        }
    }
    private async maximizeCameraResolution(track: MediaStreamTrack): Promise<void> {
        if (!track.getCapabilities) return;
        try {
            const settings = track.getSettings?.() ?? {};
            if ((settings.width ?? 0) >= 1280) return;
            const capabilities = track.getCapabilities?.();
            if (!capabilities) return;
            const width = capabilities.width?.max;
            const height = capabilities.height?.max;
            if (!width && !height) return;
            if (width && settings.width && width <= settings.width) return;
            const constraints: MediaTrackConstraints = {};
            if (width) {
                constraints.width = { ideal: width };
            }
            if (height) {
                constraints.height = { ideal: height };
            }
            // if (supported.resizeMode) {
            //     constraints.resizeMode = 'none';
            // }
            await track.applyConstraints(constraints);
        } catch {
            /*
             * Maximum-resolution negotiation is an optimization only. Keep the
             * already-working stream if this browser/driver rejects it.
             */
        }
    }
    private scoreCamera(track: MediaStreamTrack): number {
        const settings = (track.getSettings?.() ?? {}) as MediaTrackSettings & {
            resizeMode?: string;
        };

        const capabilities = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
            focusMode?: string[];
            focusDistance?: {
                min: number;
                max: number;
                step?: number;
            };
            torch?: boolean;
        };

        let score = 0;

        const focusModes = capabilities.focusMode ?? [];

        /*
         * For card scanning, autofocus capability matters much more
         * than a small difference in resolution.
         */
        if (focusModes.includes('continuous')) {
            score += 100;
        }

        if (focusModes.includes('single-shot')) {
            score += 40;
        }

        if (focusModes.includes('manual')) {
            score += 10;
        }

        /*
         * Camera 0 on your phone distinguished itself particularly well here.
         * A wider focus range is valuable for close card scanning.
         */
        if (capabilities.focusDistance) {
            const range = capabilities.focusDistance.max - capabilities.focusDistance.min;

            score += Math.min(100, range * 20);
        }

        /*
         * Resolution matters, but do not let megapixels dominate
         * autofocus characteristics.
         */
        const width = settings.width ?? 0;

        const height = settings.height ?? 0;

        const megapixels = (width * height) / 1_000_000;

        score += Math.min(30, megapixels * 2);

        if (settings.resizeMode === 'none') {
            score += 10;
        }

        /*
         * torch is a boolean, NOT boolean[].
         */
        if (capabilities.torch === true) {
            score += 10;
        }

        return score;
    }
    private getCameraFacing(
        device: MediaDeviceInfo,
        track: MediaStreamTrack,
    ): 'front' | 'back' | 'unknown' {
        const settings = track.getSettings() as MediaTrackSettings & {
            facingMode?: string;
        };
        const text = `${device.label} ${track.label}`.toLocaleLowerCase().trim();
        const facingMode = settings.facingMode?.toLocaleLowerCase().trim();
        if (facingMode === 'environment') {
            return 'back';
        }
        if (facingMode === 'user') {
            return 'front';
        }
        if (
            text.includes('facing back') ||
            text.includes('back camera') ||
            text.includes('rear camera') ||
            text.includes('rear-facing') ||
            text.includes('environment')
        ) {
            return 'back';
        }
        if (
            text.includes('facing front') ||
            text.includes('front camera') ||
            text.includes('front-facing') ||
            text.includes('selfie')
        ) {
            return 'front';
        }
        return 'unknown';
    }
    private async startCamera(): Promise<void> {
        const video = this.video()?.nativeElement;
        if (this.closed || !video) {
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            this.error.set(
                'Camera access is unavailable. Use a supported browser on HTTPS or localhost.',
            );
            this.loading.set(false);
            return;
        }
        try {
            this.loading.set(true);
            const preferred = this.getPreferredCamera();
            let stream: MediaStream | null = null;

            if (preferred) {
                this.progress.set('Starting camera…');
                try {
                    stream = await this.requestCameraStream(preferred.deviceId);
                } catch (error) {
                    console.warn(
                        '[Camera] Failed to open remembered camera directly, checking fallback:',
                        error,
                    );
                    const resolvedId = await this.resolvePreferredCameraDeviceId(preferred);
                    if (resolvedId && resolvedId !== preferred.deviceId) {
                        try {
                            stream = await this.requestCameraStream(resolvedId);
                            this.savePreferredCamera({
                                deviceId: resolvedId,
                                label: preferred.label,
                            });
                        } catch {
                            stream = null;
                        }
                    }
                    if (!stream && !this.closed) {
                        stream = await this.requestCameraStream();
                    }
                }
            }

            if (!stream) {
                if (this.closed) return;
                this.progress.set('Selecting the best camera…');
                const detection = await this.detectAndSaveBestCamera();
                if (this.closed) return;
                stream = detection.stream ?? (await this.requestCameraStream(detection.deviceId));
            }

            if (this.closed) {
                stream?.getTracks().forEach((track) => track.stop());
                return;
            }

            this.stream = stream;
            video.removeAttribute('poster');
            video.srcObject = stream;
            await video.play();

            if (this.closed) {
                return;
            }

            this.loading.set(false);
            this.progress.set('Position the whole card inside the camera.');
            this.goodCardFrames = 0;
            this.lastDetection = null;
            this.lastDetectionAt = 0;
            this.missedCardFrames = 0;

            const track = stream.getVideoTracks()[0];
            if (track) {
                void this.refreshCameraList(track);
            }

            /*
             * Start Tesseract while the user is positioning the card so the first
             * OCR pass does not also pay worker/model startup latency.
             */
            void this.ocr.warmUpCardOcr(this.language()).catch(() => {
                /*
                 * recognizeCard() will surface the OCR error if OCR is needed.
                 */
            });
            this.scheduleCardDetection();
        } catch (error: unknown) {
            if (this.closed) {
                return;
            }
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
                case 'OverconstrainedError':
                    this.error.set(
                        'The camera could not provide a compatible video mode. Close this dialog and try again.',
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
