import { DOCUMENT, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import type { SupportedLanguage } from './supported-language.interface';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './supported-languages';
import {
    ALL_LANGUAGE_TYPOGRAPHY_CLASSES,
    getLanguageTypographyClass,
} from './language-typography';

const STORAGE_KEY = 'mtgfinder.language';

/**
 * Owns the active interface language. Components that translate imperatively (inside
 * `computed` or plain methods) should read `current()` so they re-evaluate on a switch.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
    private readonly transloco = inject(TranslocoService);
    private readonly document = inject(DOCUMENT);
    private readonly title = inject(Title);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly active = signal(DEFAULT_LANGUAGE);

    readonly languages = SUPPORTED_LANGUAGES;
    /** Language whose translations are fully loaded and rendered. */
    readonly current = this.active.asReadonly();
    /** Full SupportedLanguage object for the currently active language. */
    readonly currentLanguage = computed<SupportedLanguage>(
        () =>
            SUPPORTED_LANGUAGES.find((item) => item.code === this.active()) ??
            SUPPORTED_LANGUAGES[0],
    );

    constructor() {
        this.applyTypographyClass(this.active());

        this.transloco.langChanges$
            .pipe(takeUntilDestroyed())
            .subscribe((lang) => {
                this.applyTypographyClass(lang);
            });
    }

    /** Applies the appropriate CSS typography class to the document body. */
    applyTypographyClass(code: string): void {
        const body = this.document?.body;
        if (!body) return;

        for (const cls of ALL_LANGUAGE_TYPOGRAPHY_CLASSES) {
            body.classList.remove(cls);
        }

        const targetClass = getLanguageTypographyClass(code);
        if (targetClass) {
            body.classList.add(targetClass);
        }
    }

    /** Switches language live: loads files first so nothing flashes untranslated keys. */
    async use(code: string): Promise<void> {
        const language = SUPPORTED_LANGUAGES.find((item) => item.code === code);
        if (!language || code === this.active()) return;

        try {
            await firstValueFrom(this.transloco.load(code));
        } catch {
            return;
        }

        this.transloco.setActiveLang(code);
        this.active.set(code);
        this.document.documentElement.lang = language.code;
        this.document.documentElement.dir = language.dir;
        this.title.setTitle(this.transloco.translate('metadata.title'));
        this.applyTypographyClass(code);
        if (this.isBrowser) {
            try {
                localStorage.setItem(STORAGE_KEY, code);
            } catch {
                // Storage can be unavailable (private mode); the switch still applies.
            }
        }
    }

    /** Applies the saved language. Call only in the browser, after hydration. */
    async restore(): Promise<void> {
        if (!this.isBrowser) return;

        let stored: string | null = null;
        try {
            stored = localStorage.getItem(STORAGE_KEY);
        } catch {
            return;
        }
        if (stored) await this.use(stored);
    }
}
