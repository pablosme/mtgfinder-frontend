export const LANGUAGE_TYPOGRAPHY_CLASSES: Readonly<Record<string, string>> = {
    grc: 'lang-grc',
    sa: 'lang-sa',
    ph: 'lang-phy',
};

export const ALL_LANGUAGE_TYPOGRAPHY_CLASSES: readonly string[] = [
    'lang-grc',
    'lang-sa',
    'lang-phy',
];

export function getLanguageTypographyClass(code: string): string | null {
    return LANGUAGE_TYPOGRAPHY_CLASSES[code] ?? null;
}

