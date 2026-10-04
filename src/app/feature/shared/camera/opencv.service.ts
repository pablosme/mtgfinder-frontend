import { DOCUMENT, Injectable, inject } from '@angular/core';
import type * as OpenCv from '@techstark/opencv-js';

@Injectable({ providedIn: 'root' })
export class OpenCvService {
    private readonly document = inject(DOCUMENT);
    private runtime: Promise<{ cv: typeof OpenCv }> | null = null;

    load(): Promise<{ cv: typeof OpenCv }> {
        if (this.runtime) return this.runtime;
        const browser = this.document.defaultView as
            (Window & { cv?: Promise<typeof OpenCv> }) | null;
        if (!browser) return Promise.reject(new Error('Card scanning requires a browser.'));

        const script = this.document.createElement('script');
        script.src = new URL('assets/opencv/opencv.js', this.document.baseURI).href;
        script.async = true;
        this.runtime = new Promise<{ cv: typeof OpenCv }>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Card scanner took too long to load. Please try again.'));
            }, 45_000);
            script.onerror = () => {
                clearTimeout(timeout);
                reject(
                    new Error('Unable to load the card scanner. Check your connection and retry.'),
                );
            };
            script.onload = () => {
                void Promise.resolve(browser.cv)
                    .then((cv) => {
                        if (!cv?.Mat) throw new Error('Unable to initialize the card scanner.');
                        resolve({ cv });
                    })
                    .catch(reject)
                    .finally(() => clearTimeout(timeout));
            };
            this.document.head.appendChild(script);
        }).catch((error: unknown) => {
            script.remove();
            this.runtime = null;
            throw error;
        });
        return this.runtime;
    }
}
