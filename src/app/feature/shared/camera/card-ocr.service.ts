import { TranslocoService } from '@jsverse/transloco';
import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import type { PSM, Worker } from 'tesseract.js';

import type { CardLanguage } from '../interface/card-language.interface';
import type { CardNameRecognition } from '../interface/card-name-recognition.interface';
import type { CardTitleImage } from '../interface/card-title-image.interface';
import type { CardNameCandidate } from '../interface/card-name-candidate.interface';
import { readCardName, selectCardName } from './card-name-recognition';
import type { CardOcrImage } from '../interface/card-ocr-image.interface';

export interface CardOcrTextBlock {
    text: string;
    confidence: number;

    bbox: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    };
}

export interface CardOcrResult {
    variant: CardOcrImage['variant'];
    text: string;
    confidence: number;
    blocks: CardOcrTextBlock[];
    width: number;
    height: number;
    pageSegMode: PSM;
}

/**
 * One OCR session per camera dialog.
 *
 * Full-card OCR workers are kept alive for the lifetime of the dialog so
 * automatic scan retries don't pay the expensive Tesseract initialization
 * cost every time.
 */
@Injectable()
export class CardOcrService {
    private readonly transloco = inject(TranslocoService);
    private readonly document = inject(DOCUMENT);
    private readonly cancellation = new AbortController();

    /**
     * Worker used by recognize(), which follows the older card-name-only flow.
     */
    private worker: Worker | null = null;

    /**
     * Every persistent worker owned by this service.
     */
    private readonly workers = new Set<Worker>();

    /**
     * Persistent pool used by full-card OCR.
     */
    private cardWorkers: Worker[] = [];
    private cardWorkerLanguage: string | null = null;
    private cardWorkerInitialization: Promise<Worker[]> | null = null;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.stop());
    }

    /**
     * Legacy/specialized card-title OCR.
     *
     * This remains intentionally more exhaustive because it is specifically
     * trying to recognize the card name from cropped title images.
     */
    async recognize(
        images: readonly CardTitleImage[],
        language: CardLanguage,
        progress: (message: string) => void,
    ): Promise<CardNameRecognition> {
        if (!language.ocrModel) {
            throw new Error(this.transloco.translate('scanner.ocr.manual'));
        }

        const { default: tesseract } = await import('tesseract.js');
        const { createWorker, OEM, PSM } = tesseract;

        if (this.cancellation.signal.aborted) {
            throw new Error(this.transloco.translate('scanner.ocr.cancelled'));
        }

        const base = new URL('assets/tesseract/', this.document.baseURI);

        /*
         * Check/warm the model HTTP cache before creating the worker.
         */
        progress(this.transloco.translate('scanner.ocr.loading', { language: this.transloco.translate(language.label) }));

        const response = await this.waitFor(
            fetch(
                new URL(
                    `languages/${language.ocrModel}/4.0.0_best_int/${language.ocrModel}.traineddata.gz`,
                    base,
                ),
                {
                    signal: this.cancellation.signal,
                },
            ),
        );

        if (!response.ok) {
            throw new Error(
                this.transloco.translate('scanner.ocr.modelFailed', { language: this.transloco.translate(language.label) }),
            );
        }

        await this.waitFor(response.arrayBuffer());

        if (this.cancellation.signal.aborted) {
            throw new Error(this.transloco.translate('scanner.ocr.cancelled'));
        }

        let finished = false;
        let pass = 0;

        const totalPasses = images.length * 2;

        let rejectInitialization: (error: Error) => void = () => {};

        const initializationError = new Promise<never>((_, reject) => {
            rejectInitialization = reject;
        });

        const pending = createWorker(
            language.ocrModel,
            OEM.LSTM_ONLY,
            {
                workerPath: new URL('worker.min.js', base).href,

                corePath: new URL('core/', base).href,

                langPath: new URL(`languages/${language.ocrModel}/4.0.0_best_int`, base).href,

                workerBlobURL: false,

                logger: ({ status, progress: fraction }) => {
                    if (finished || this.cancellation.signal.aborted) {
                        return;
                    }

                    progress(
                        status === 'recognizing text'
                            ? this.transloco.translate('scanner.ocr.readingName', { pass, total: totalPasses, percent: Math.round(fraction * 100) })
                            : this.transloco.translate('scanner.ocr.loading', { language: this.transloco.translate(language.label) }),
                    );
                },

                errorHandler: () =>
                    rejectInitialization(
                        new Error(this.transloco.translate('scanner.ocr.loadFailed')),
                    ),
            },

            language.code === 'en'
                ? {
                      /*
                       * MTG names contain invented names and fantasy terms that
                       * ordinary English dictionaries can distort.
                       */
                      load_system_dawg: '0',
                      load_freq_dawg: '0',
                  }
                : {},
        ).then((worker) => {
            if (finished || this.cancellation.signal.aborted) {
                void worker.terminate();

                throw new Error(this.transloco.translate('scanner.ocr.cancelled'));
            }

            this.worker = worker;

            return worker;
        });

        try {
            const worker = await this.waitFor(Promise.race([pending, initializationError]));

            await this.waitFor(
                worker.setParameters({
                    tessedit_pageseg_mode: PSM.SINGLE_LINE,
                    preserve_interword_spaces: '1',
                    user_defined_dpi: '300',
                }),
            );

            const candidates: CardNameCandidate[] = [];

            for (const { image, source } of images) {
                for (const mode of [PSM.SINGLE_LINE, PSM.RAW_LINE]) {
                    pass++;

                    await this.waitFor(
                        worker.setParameters({
                            tessedit_pageseg_mode: mode,
                        }),
                    );

                    const { data } = await this.waitFor(
                        worker.recognize(
                            image,
                            {},
                            {
                                text: true,
                                blocks: true,
                            },
                        ),
                    );

                    candidates.push({
                        ...readCardName(data, image.width, language.code),
                        source,
                    });
                }
            }

            return selectCardName(candidates);
        } finally {
            finished = true;

            const worker = this.worker;

            this.worker = null;

            if (worker) {
                await worker.terminate();
            }
        }
    }

    /**
     * Start Tesseract before a card is captured.
     *
     * Call this when the camera opens. Initialization then happens while the
     * user is positioning the card rather than after capture.
     */
    async warmUpCardOcr(language: CardLanguage): Promise<void> {
        if (!language.ocrModel || this.cancellation.signal.aborted) {
            return;
        }

        await this.ensureCardWorkers(language, () => {});
    }

    /**
     * Optimized full-card OCR.
     *
     * Strategy:
     *
     * 1. Reuse persistent workers.
     * 2. Start with SPARSE_TEXT.
     * 3. Process only one small batch at a time.
     * 4. Stop as soon as enough identifying text exists.
     * 5. Try additional image variants only if necessary.
     * 6. Run AUTO only once as a final fallback.
     *
     * Six prepared images therefore usually require only 1-2 OCR passes
     * instead of always requiring 12.
     */
    async recognizeCard(
        images: readonly CardOcrImage[],
        language: CardLanguage,
        progress: (message: string) => void,
    ): Promise<CardOcrResult[]> {
        if (!language.ocrModel) {
            throw new Error(this.transloco.translate('scanner.ocr.unavailable'));
        }

        if (this.cancellation.signal.aborted) {
            throw new Error(this.transloco.translate('scanner.ocr.cancelled'));
        }

        if (!images.length) {
            return [];
        }

        const { default: tesseract } = await import('tesseract.js');
        const { PSM } = tesseract;

        /*
         * Initialization normally already happened through warmUpCardOcr().
         * If not, this safely initializes the pool now.
         */
        const workers = await this.ensureCardWorkers(language, progress);

        if (!workers.length) {
            throw new Error(this.transloco.translate('scanner.ocr.initializeFailed'));
        }

        const results: CardOcrResult[] = [];

        let completedPasses = 0;

        const recognize = async (
            worker: Worker,
            imageData: CardOcrImage,
            mode: PSM,
        ): Promise<CardOcrResult> => {
            if (this.cancellation.signal.aborted) {
                throw new Error(this.transloco.translate('scanner.ocr.cancelled'));
            }

            const { image, variant } = imageData;

            await this.waitFor(
                worker.setParameters({
                    tessedit_pageseg_mode: mode,
                }),
            );

            progress(
                mode === PSM.AUTO
                    ? this.transloco.translate('scanner.ocr.detailed')
                    : completedPasses === 0
                      ? this.transloco.translate('scanner.ocr.reading')
                      : this.transloco.translate(completedPasses === 1 ? 'scanner.ocr.passComplete' : 'scanner.ocr.passesComplete', { count: completedPasses }),
            );

            /*
             * Do not request blocks here.
             *
             * The camera flow only needs recognized text for card search.
             * Constructing Tesseract's block hierarchy adds CPU and memory cost.
             */
            const { data } = await this.waitFor(worker.recognize(image));

            completedPasses++;

            progress(
                this.transloco.translate(completedPasses === 1 ? 'scanner.ocr.passComplete' : 'scanner.ocr.passesComplete', { count: completedPasses }),
            );

            return {
                variant,

                text: data.text?.trim() ?? '',

                confidence: data.confidence ?? 0,

                /*
                 * Retained for interface compatibility.
                 *
                 * Full-card scanning doesn't need the bounding boxes.
                 */
                blocks: [],

                width: image.width,
                height: image.height,

                pageSegMode: mode,
            };
        };

        /**
         * Execute at most one job per worker at the same time.
         *
         * A Tesseract worker must not receive overlapping recognize() calls.
         */
        const runBatch = async (batch: readonly CardOcrImage[], mode: PSM): Promise<void> => {
            const batchResults = await Promise.all(
                batch.map((image, index) => recognize(workers[index], image, mode)),
            );

            results.push(...batchResults);
        };

        /*
         * FAST PATH
         *
         * With two workers this normally means only two OCR passes.
         */
        let offset = 0;

        const firstBatch = images.slice(0, Math.min(workers.length, images.length));

        await runBatch(firstBatch, PSM.SPARSE_TEXT);

        offset += firstBatch.length;

        if (this.hasUsefulCardText(results)) {
            return results;
        }

        /*
         * FALLBACK
         *
         * Try additional prepared image variants only when the previous
         * recognition wasn't sufficient.
         */
        while (offset < images.length) {
            if (this.cancellation.signal.aborted) {
                throw new Error(this.transloco.translate('scanner.ocr.cancelled'));
            }

            const batch = images.slice(offset, offset + workers.length);

            await runBatch(batch, PSM.SPARSE_TEXT);

            offset += batch.length;

            if (this.hasUsefulCardText(results)) {
                return results;
            }
        }

        /*
         * LAST RESORT
         *
         * AUTO is substantially more expensive.
         *
         * Rather than running AUTO against every image variant, run it exactly
         * once against the variant that produced the most promising text.
         */
        const bestResult = this.getBestCardOcrResult(results);

        const fallbackImage =
            (bestResult
                ? images.find((image) => image.variant === bestResult.variant)
                : undefined) ?? images[0];

        progress(this.transloco.translate('scanner.ocr.detailed'));

        const detailed = await recognize(workers[0], fallbackImage, PSM.AUTO);

        results.push(detailed);

        return results;
    }

    /**
     * Create/reuse the persistent full-card OCR worker pool.
     */
    private async ensureCardWorkers(
        language: CardLanguage,
        progress: (message: string) => void,
    ): Promise<Worker[]> {
        const model = language.ocrModel;

        if (!model) {
            throw new Error(this.transloco.translate('scanner.ocr.unavailable'));
        }

        if (this.cancellation.signal.aborted) {
            throw new Error(this.transloco.translate('scanner.ocr.cancelled'));
        }

        /*
         * Already initialized for this model.
         */
        if (this.cardWorkerLanguage === model && this.cardWorkers.length > 0) {
            return this.cardWorkers;
        }

        /*
         * If another caller is already initializing the pool, reuse the same
         * promise instead of creating another set of workers.
         */
        if (this.cardWorkerInitialization) {
            return this.cardWorkerInitialization;
        }

        this.cardWorkerInitialization = (async () => {
            await this.disposeCardWorkers();

            const { default: tesseract } = await import('tesseract.js');
            const { createWorker, OEM, PSM } = tesseract;

            const base = new URL('assets/tesseract/', this.document.baseURI);

            const hardwareConcurrency =
                this.document.defaultView?.navigator.hardwareConcurrency ?? 4;

            /*
             * Tesseract workers are memory-heavy.
             *
             * Two workers provide useful parallelism without creating the
             * 4-worker pool that the previous implementation could create.
             *
             * Low-end devices stay on one worker.
             */
            const workerCount = hardwareConcurrency >= 4 ? 2 : 1;

            progress(this.transloco.translate('scanner.ocr.loading', { language: this.transloco.translate(language.label) }));

            const created: Worker[] = [];

            try {
                for (let index = 0; index < workerCount; index++) {
                    if (this.cancellation.signal.aborted) {
                        throw new Error(this.transloco.translate('scanner.ocr.cancelled'));
                    }

                    let rejectInitialization: (error: Error) => void = () => {};

                    const initializationError = new Promise<never>((_, reject) => {
                        rejectInitialization = reject;
                    });

                    const pending = createWorker(
                        model,
                        OEM.LSTM_ONLY,
                        {
                            workerPath: new URL('worker.min.js', base).href,

                            corePath: new URL('core/', base).href,

                            langPath: new URL(`languages/${model}/4.0.0_best_int`, base).href,

                            workerBlobURL: false,

                            errorHandler: () => {
                                rejectInitialization(
                                    new Error(
                                        this.transloco.translate('scanner.ocr.loadFailed'),
                                    ),
                                );
                            },
                        },

                        language.code === 'en'
                            ? {
                                  /*
                                   * Avoid dictionary correction of fantasy
                                   * names, collector data and MTG terminology.
                                   */
                                  load_system_dawg: '0',
                                  load_freq_dawg: '0',
                              }
                            : {},
                    );

                    const guarded = pending.then(async (worker) => {
                        if (this.cancellation.signal.aborted) {
                            await worker.terminate();

                            throw new Error(this.transloco.translate('scanner.ocr.cancelled'));
                        }

                        return worker;
                    });

                    const worker = await this.waitFor(Promise.race([guarded, initializationError]));

                    await this.waitFor(
                        worker.setParameters({
                            tessedit_pageseg_mode: PSM.SPARSE_TEXT,

                            preserve_interword_spaces: '1',

                            user_defined_dpi: '300',
                        }),
                    );

                    created.push(worker);
                    this.workers.add(worker);
                }

                this.cardWorkers = created;
                this.cardWorkerLanguage = model;

                return created;
            } catch (error) {
                for (const worker of created) {
                    this.workers.delete(worker);
                }

                await Promise.allSettled(created.map((worker) => worker.terminate()));

                throw error;
            }
        })();

        try {
            return await this.cardWorkerInitialization;
        } finally {
            this.cardWorkerInitialization = null;
        }
    }

    /**
     * Determines whether we already have enough text to perform the backend
     * fuzzy/vector card search.
     *
     * We don't need a perfect transcription of the entire rules box.
     */
    private hasUsefulCardText(results: readonly CardOcrResult[]): boolean {
        const readable = results.filter((result) => result.text.trim().length > 0);

        if (!readable.length) {
            return false;
        }

        const combined = readable
            .map((result) => result.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        const words = combined.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]{1,}/gu) ?? [];

        const bestConfidence = Math.max(...readable.map((result) => result.confidence));

        /*
         * Intentionally optimized for identification rather than perfect OCR.
         *
         * High-confidence text needs only a few words.
         * Lower-confidence recognition needs more evidence.
         */
        return (
            (bestConfidence >= 55 && words.length >= 3) ||
            (bestConfidence >= 35 && words.length >= 6) ||
            words.length >= 12
        );
    }

    /**
     * Select the OCR variant that produced the most promising recognition.
     *
     * Used only to select which image gets the expensive AUTO fallback pass.
     */
    private getBestCardOcrResult(results: readonly CardOcrResult[]): CardOcrResult | null {
        let best: CardOcrResult | null = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (const result of results) {
            const text = result.text.trim();

            if (!text) {
                continue;
            }

            const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]{1,}/gu)?.length ?? 0;

            const score =
                result.confidence + Math.min(words * 3, 30) + Math.min(text.length / 10, 20);

            if (score > bestScore) {
                bestScore = score;
                best = result;
            }
        }

        return best;
    }

    /**
     * Release persistent full-card workers.
     *
     * Normally this only happens when switching OCR language or destroying the
     * dialog.
     */
    private async disposeCardWorkers(): Promise<void> {
        const workers = this.cardWorkers;

        this.cardWorkers = [];
        this.cardWorkerLanguage = null;

        for (const worker of workers) {
            this.workers.delete(worker);
        }

        await Promise.allSettled(workers.map((worker) => worker.terminate()));
    }

    /**
     * Stop every OCR operation owned by this dialog.
     */
    stop(): void {
        this.cancellation.abort();

        /*
         * Specialized title-recognition worker.
         */
        const singleWorker = this.worker;

        this.worker = null;

        if (singleWorker) {
            void singleWorker.terminate();
        }

        /*
         * Persistent full-card workers.
         */
        const workers = [...this.workers];

        this.workers.clear();

        this.cardWorkers = [];
        this.cardWorkerLanguage = null;
        this.cardWorkerInitialization = null;

        for (const worker of workers) {
            void worker.terminate();
        }
    }

    /**
     * Bound Tesseract/fetch operations and reject immediately if the camera
     * dialog closes.
     */
    private waitFor<T>(operation: Promise<T>): Promise<T> {
        const signal = this.cancellation.signal;

        let timeout: ReturnType<typeof setTimeout>;
        let cancel: () => void;

        return new Promise<T>((resolve, reject) => {
            cancel = () => reject(new Error(this.transloco.translate('scanner.ocr.cancelled')));

            timeout = setTimeout(
                () => reject(new Error(this.transloco.translate('scanner.ocr.timeout'))),
                90_000,
            );

            signal.addEventListener('abort', cancel, {
                once: true,
            });

            void operation.then(resolve, reject);

            if (signal.aborted) {
                cancel();
            }
        }).finally(() => {
            clearTimeout(timeout);

            signal.removeEventListener('abort', cancel);
        });
    }
}
