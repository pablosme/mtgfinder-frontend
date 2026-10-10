import { describe, expect, it } from 'vitest';

import {
    ALL_LANGUAGE_TYPOGRAPHY_CLASSES,
    LANGUAGE_TYPOGRAPHY_CLASSES,
    getLanguageTypographyClass,
} from './language-typography';

describe('Language Typography Mapping', () => {
    it('maps Ancient Greek (grc) to lang-grc', () => {
        expect(getLanguageTypographyClass('grc')).toBe('lang-grc');
    });

    it('maps Sanskrit (sa) to lang-sa', () => {
        expect(getLanguageTypographyClass('sa')).toBe('lang-sa');
    });

    it('maps Phyrexian (ph) to lang-phy', () => {
        expect(getLanguageTypographyClass('ph')).toBe('lang-phy');
    });

    it('returns null for languages without specialized typography', () => {
        expect(getLanguageTypographyClass('en')).toBeNull();
        expect(getLanguageTypographyClass('es')).toBeNull();
        expect(getLanguageTypographyClass('fr')).toBeNull();
        expect(getLanguageTypographyClass('de')).toBeNull();
        expect(getLanguageTypographyClass('ja')).toBeNull();
        expect(getLanguageTypographyClass('zh-Hans')).toBeNull();
        expect(getLanguageTypographyClass('ar')).toBeNull();
        expect(getLanguageTypographyClass('he')).toBeNull();
        expect(getLanguageTypographyClass('unknown')).toBeNull();
    });

    it('defines all supported specialized typography classes in ALL_LANGUAGE_TYPOGRAPHY_CLASSES', () => {
        expect(ALL_LANGUAGE_TYPOGRAPHY_CLASSES).toEqual(['lang-grc', 'lang-sa', 'lang-phy']);
        expect(Object.values(LANGUAGE_TYPOGRAPHY_CLASSES)).toEqual(
            ALL_LANGUAGE_TYPOGRAPHY_CLASSES,
        );
    });
});

