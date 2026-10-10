import type { CardPrintLanguage } from '../interface/card-print-language.interface';

export function getCardPrintLanguage(code: string): CardPrintLanguage {
    const normalized = code.trim().toLowerCase() || 'und';
    return (
        CARD_PRINT_LANGUAGES.find((language) => language.code === normalized) ?? {
            code: normalized,
            label: 'cardLanguages.other',
            flagCode: null,
        }
    );
}

// These flags are display conventions, not language identifiers. Codes and names
// remain explicit. English/Portuguese follow the GB/BR treatment in Stitch V2.
export const CARD_PRINT_LANGUAGES: readonly CardPrintLanguage[] = [
    { code: 'en', label: 'cardLanguages.en', flagCode: 'gb' },
    { code: 'es', label: 'cardLanguages.es', flagCode: 'es' },
    { code: 'fr', label: 'cardLanguages.fr', flagCode: 'fr' },
    { code: 'de', label: 'cardLanguages.de', flagCode: 'de' },
    { code: 'it', label: 'cardLanguages.it', flagCode: 'it' },
    { code: 'pt', label: 'cardLanguages.pt', flagCode: 'br' },
    { code: 'ja', label: 'cardLanguages.ja', flagCode: 'jp' },
    { code: 'ko', label: 'cardLanguages.ko', flagCode: 'kr' },
    { code: 'ru', label: 'cardLanguages.ru', flagCode: 'ru' },
    { code: 'zhs', label: 'cardLanguages.zhs', flagCode: 'cn' },
    { code: 'zht', label: 'cardLanguages.zht', flagCode: 'tw' },
    { code: 'he', label: 'cardLanguages.he', flagCode: 'il' },
    { code: 'ar', label: 'cardLanguages.ar', flagCode: 'sa' },
    { code: 'la', label: 'cardLanguages.la', flagCode: 'va' },
    { code: 'grc', label: 'cardLanguages.grc', flagCode: 'gr' },
    { code: 'sa', label: 'cardLanguages.sa', flagCode: 'in' },
    { code: 'ph', label: 'cardLanguages.ph', flagCode: null },
    { code: 'und', label: 'cardLanguages.und', flagCode: null },
];
