import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { Injectable } from '@angular/core';
import { provideTransloco, Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { LanguageService } from './language.service';
import { ALL_LANGUAGE_TYPOGRAPHY_CLASSES } from './language-typography';

@Injectable()
class MockTranslocoLoader implements TranslocoLoader {
    getTranslation(): Observable<Translation> {
        return of({ 'metadata.title': 'MTG Finder' });
    }
}

describe('LanguageService typography management', () => {
    let service: LanguageService;
    let doc: Document;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideTransloco({
                    config: {
                        availableLangs: ['en', 'grc', 'sa', 'ph', 'es'],
                        defaultLang: 'en',
                    },
                    loader: MockTranslocoLoader,
                }),
                LanguageService,
            ],
        });

        service = TestBed.inject(LanguageService);
        doc = TestBed.inject(DOCUMENT);

        // Clean any existing language classes from test environment
        for (const cls of ALL_LANGUAGE_TYPOGRAPHY_CLASSES) {
            doc.body.classList.remove(cls);
        }
    });

    afterEach(() => {
        for (const cls of ALL_LANGUAGE_TYPOGRAPHY_CLASSES) {
            doc.body.classList.remove(cls);
        }
        doc.body.classList.remove('unrelated-custom-class');
    });

    it('should be created and not apply specialized font class for default English', () => {
        expect(service).toBeTruthy();
        expect(doc.body.classList.contains('lang-grc')).toBe(false);
        expect(doc.body.classList.contains('lang-sa')).toBe(false);
        expect(doc.body.classList.contains('lang-phy')).toBe(false);
    });

    it('applies lang-grc when switching to Ancient Greek', () => {
        service.applyTypographyClass('grc');
        expect(doc.body.classList.contains('lang-grc')).toBe(true);
        expect(doc.body.classList.contains('lang-sa')).toBe(false);
        expect(doc.body.classList.contains('lang-phy')).toBe(false);
    });

    it('removes lang-grc and applies lang-sa when switching from Ancient Greek to Sanskrit', () => {
        service.applyTypographyClass('grc');
        expect(doc.body.classList.contains('lang-grc')).toBe(true);

        service.applyTypographyClass('sa');
        expect(doc.body.classList.contains('lang-grc')).toBe(false);
        expect(doc.body.classList.contains('lang-sa')).toBe(true);
        expect(doc.body.classList.contains('lang-phy')).toBe(false);
    });

    it('removes lang-sa and applies lang-phy when switching from Sanskrit to Phyrexian', () => {
        service.applyTypographyClass('sa');
        expect(doc.body.classList.contains('lang-sa')).toBe(true);

        service.applyTypographyClass('ph');
        expect(doc.body.classList.contains('lang-sa')).toBe(false);
        expect(doc.body.classList.contains('lang-grc')).toBe(false);
        expect(doc.body.classList.contains('lang-phy')).toBe(true);
    });

    it('removes lang-phy when returning to English', () => {
        service.applyTypographyClass('ph');
        expect(doc.body.classList.contains('lang-phy')).toBe(true);

        service.applyTypographyClass('en');
        expect(doc.body.classList.contains('lang-phy')).toBe(false);
        expect(doc.body.classList.contains('lang-grc')).toBe(false);
        expect(doc.body.classList.contains('lang-sa')).toBe(false);
    });

    it('preserves unrelated body classes across all transitions', () => {
        doc.body.classList.add('unrelated-custom-class');

        service.applyTypographyClass('grc');
        expect(doc.body.classList.contains('unrelated-custom-class')).toBe(true);
        expect(doc.body.classList.contains('lang-grc')).toBe(true);

        service.applyTypographyClass('sa');
        expect(doc.body.classList.contains('unrelated-custom-class')).toBe(true);
        expect(doc.body.classList.contains('lang-sa')).toBe(true);

        service.applyTypographyClass('ph');
        expect(doc.body.classList.contains('unrelated-custom-class')).toBe(true);
        expect(doc.body.classList.contains('lang-phy')).toBe(true);

        service.applyTypographyClass('es');
        expect(doc.body.classList.contains('unrelated-custom-class')).toBe(true);
        expect(doc.body.classList.contains('lang-phy')).toBe(false);
    });
});

