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

/** One OCR session per dialog; workers and pending jobs end when it closes. */
@Injectable()
export class CardOcrService {
    private readonly document = inject(DOCUMENT);
    private readonly cancellation = new AbortController();
    private worker: Worker | null = null;
    private readonly workers = new Set<Worker>();

    constructor() {
        inject(DestroyRef).onDestroy(() => this.stop());
    }

    async recognize(
        images: readonly CardTitleImage[],
        language: CardLanguage,
        progress: (message: string) => void,
    ): Promise<CardNameRecognition> {
        if (!language.ocrModel) throw new Error('Enter the name manually for this language.');
        const { default: tesseract } = await import('tesseract.js');
        const { createWorker, OEM, PSM } = tesseract;
        if (this.cancellation.signal.aborted) throw new Error('Scanning cancelled.');

        const base = new URL('assets/tesseract/', this.document.baseURI);
        // Check and warm the model's HTTP cache before creating a worker. This lets
        // common download failures and cancellation settle before worker initialization.
        progress(`Loading ${language.label} text recognition…`);
        const response = await this.waitFor(
            fetch(
                new URL(
                    `languages/${language.ocrModel}/4.0.0_best_int/${language.ocrModel}.traineddata.gz`,
                    base,
                ),
                { signal: this.cancellation.signal },
            ),
        );
        if (!response.ok)
            throw new Error(
                `Unable to load ${language.label} text recognition. Check your connection and retry.`,
            );
        await this.waitFor(response.arrayBuffer());
        if (this.cancellation.signal.aborted) throw new Error('Scanning cancelled.');

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
                    if (finished || this.cancellation.signal.aborted) return;
                    progress(
                        status === 'recognizing text'
                            ? `Reading card name (${pass}/${totalPasses})… ${Math.round(fraction * 100)}%`
                            : `Loading ${language.label} text recognition…`,
                    );
                },
                // Tesseract may report model-loading failures without rejecting createWorker.
                errorHandler: () =>
                    rejectInitialization(
                        new Error('Unable to load or run text recognition. Please retry.'),
                    ),
            },
            language.code === 'en'
                ? {
                      // MTG names contain invented names that ordinary English dictionaries distort.
                      load_system_dawg: '0',
                      load_freq_dawg: '0',
                  }
                : {},
        ).then((worker) => {
            if (finished || this.cancellation.signal.aborted) {
                void worker.terminate();
                throw new Error('Scanning cancelled.');
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
                    await this.waitFor(worker.setParameters({ tessedit_pageseg_mode: mode }));
                    const { data } = await this.waitFor(
                        worker.recognize(image, {}, { text: true, blocks: true }),
                    );
                    candidates.push({ ...readCardName(data, image.width, language.code), source });
                }
            }
            return selectCardName(candidates);
        } finally {
            finished = true;
            const worker = this.worker;
            this.worker = null;
            if (worker) await worker.terminate();
        }
    }

    async recognizeCard(
        images: readonly CardOcrImage[],
        language: CardLanguage,
        progress: (message: string) => void,
    ): Promise<CardOcrResult[]> {
        if (!language.ocrModel) {
            throw new Error('OCR is not available for this language.');
        }

        const { default: tesseract } = await import('tesseract.js');
        const { createWorker, OEM, PSM } = tesseract;

        if (this.cancellation.signal.aborted) {
            throw new Error('Scanning cancelled.');
        }

        const base = new URL('assets/tesseract/', this.document.baseURI);

        progress(`Loading ${language.label} text recognition…`);

        /*
         * Warm/check the traineddata once.
         */
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
                `Unable to load ${language.label} text recognition. Check your connection and retry.`,
            );
        }

        await this.waitFor(response.arrayBuffer());

        if (this.cancellation.signal.aborted) {
            throw new Error('Scanning cancelled.');
        }

        /*
         * Full-card OCR modes.
         */
        const modes = [PSM.AUTO, PSM.SPARSE_TEXT];

        /*
         * Don't create one worker per OCR pass.
         *
         * Tesseract workers are relatively expensive. Two workers per mode gives
         * us at most four concurrent workers while still processing several image
         * variants in parallel.
         */
        const hardwareConcurrency = this.document.defaultView?.navigator.hardwareConcurrency ?? 4;

        const workersPerMode = Math.max(
            1,
            Math.min(2, Math.floor(hardwareConcurrency / modes.length)),
        );

        const totalPasses = images.length * modes.length;

        let completedPasses = 0;
        let finished = false;

        const updateProgress = (fraction?: number) => {
            if (finished || this.cancellation.signal.aborted) {
                return;
            }

            const suffix = fraction !== undefined ? ` ${Math.round(fraction * 100)}%` : '';

            progress(`Reading card (${completedPasses}/${totalPasses})…${suffix}`);
        };

        const createOcrWorker = async (mode: Tesseract.PSM): Promise<Worker> => {
            let rejectInitialization: (error: Error) => void = () => {};

            const initializationError = new Promise<never>((_, reject) => {
                rejectInitialization = reject;
            });

            const pending = createWorker(
                language.ocrModel!,
                OEM.LSTM_ONLY,
                {
                    workerPath: new URL('worker.min.js', base).href,

                    corePath: new URL('core/', base).href,

                    langPath: new URL(`languages/${language.ocrModel}/4.0.0_best_int`, base).href,

                    workerBlobURL: false,

                    logger: ({ status, progress: fraction }) => {
                        if (status === 'recognizing text') {
                            updateProgress(fraction);
                        }
                    },

                    errorHandler: () => {
                        rejectInitialization(
                            new Error('Unable to load or run text recognition. Please retry.'),
                        );
                    },
                },

                language.code === 'en'
                    ? {
                          /*
                           * Important for MTG:
                           *
                           * names, collector numbers and fantasy terms should not
                           * be "corrected" using an English dictionary.
                           */
                          load_system_dawg: '0',
                          load_freq_dawg: '0',
                      }
                    : {},
            );

            // A timed-out/failed pool can finish initializing after this scan
            // has already returned. Never let it join the next automatic retry.
            const guarded = pending.then(async (worker) => {
                if (finished || this.cancellation.signal.aborted) {
                    await worker.terminate();
                    throw new Error('Scanning cancelled.');
                }
                // Register before racing initialization errors so a failure's
                // cleanup also owns a worker that resolved at the same time.
                this.workers.add(worker);
                return worker;
            });
            const worker = await this.waitFor(Promise.race([guarded, initializationError]));

            if (finished || this.cancellation.signal.aborted) {
                await worker.terminate();
                throw new Error('Scanning cancelled.');
            }

            await this.waitFor(
                worker.setParameters({
                    tessedit_pageseg_mode: mode,
                    preserve_interword_spaces: '1',
                    user_defined_dpi: '300',
                }),
            );

            return worker;
        };

        const recognize = async (
            worker: Worker,
            imageData: CardOcrImage,
            mode: Tesseract.PSM,
        ): Promise<CardOcrResult> => {
            const { image, variant } = imageData;

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

            const blocks: CardOcrTextBlock[] = [];

            for (const block of data.blocks ?? []) {
                const text = block.text?.trim();

                if (!text) {
                    continue;
                }

                blocks.push({
                    text,

                    confidence: block.confidence ?? 0,

                    bbox: {
                        x0: block.bbox.x0,
                        y0: block.bbox.y0,
                        x1: block.bbox.x1,
                        y1: block.bbox.y1,
                    },
                });
            }

            completedPasses++;
            updateProgress();

            return {
                variant,
                text: data.text.trim(),
                confidence: data.confidence ?? 0,
                blocks,
                width: image.width,
                height: image.height,
                pageSegMode: mode,
            };
        };

        try {
            /*
             * Create independent pools because PSM is a worker parameter.
             *
             * AUTO workers always remain AUTO.
             * SPARSE_TEXT workers always remain SPARSE_TEXT.
             */
            const pools = await Promise.all(
                modes.map(async (mode) => ({
                    mode,

                    workers: await Promise.all(
                        Array.from({ length: workersPerMode }, () => createOcrWorker(mode)),
                    ),
                })),
            );

            /*
             * Give each worker its own queue.
             *
             * Each queue is sequential internally, but all queues execute
             * concurrently.
             */
            const jobs: Promise<CardOcrResult[]>[] = [];

            for (const pool of pools) {
                for (let workerIndex = 0; workerIndex < pool.workers.length; workerIndex++) {
                    const worker = pool.workers[workerIndex];

                    const assignedImages = images.filter(
                        (_, imageIndex) => imageIndex % pool.workers.length === workerIndex,
                    );

                    jobs.push(
                        (async () => {
                            const results: CardOcrResult[] = [];

                            for (const image of assignedImages) {
                                if (this.cancellation.signal.aborted) {
                                    throw new Error('Scanning cancelled.');
                                }

                                results.push(await recognize(worker, image, pool.mode));
                            }

                            return results;
                        })(),
                    );
                }
            }

            return (await Promise.all(jobs)).flat();
        } finally {
            finished = true;

            const workers = [...this.workers];

            this.workers.clear();

            await Promise.allSettled(workers.map((worker) => worker.terminate()));
        }
    }

    stop(): void {
        this.cancellation.abort();

        const workers = [...this.workers];
        this.workers.clear();

        for (const worker of workers) {
            void worker.terminate();
        }
    }

    /** Bound worker operations and settle outstanding promises when the dialog closes. */
    private waitFor<T>(operation: Promise<T>): Promise<T> {
        const signal = this.cancellation.signal;
        let timeout: ReturnType<typeof setTimeout>;
        let cancel: () => void;
        return new Promise<T>((resolve, reject) => {
            cancel = () => reject(new Error('Scanning cancelled.'));
            timeout = setTimeout(
                () => reject(new Error('Text recognition took too long. Please retry.')),
                90_000,
            );
            signal.addEventListener('abort', cancel, { once: true });
            void operation.then(resolve, reject);
            if (signal.aborted) cancel();
        }).finally(() => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', cancel);
        });
    }
}
