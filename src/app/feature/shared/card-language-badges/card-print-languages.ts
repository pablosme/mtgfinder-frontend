import type { CardPrintLanguage } from '../interface/card-print-language.interface';

export function getCardPrintLanguage(code: string): CardPrintLanguage {
    const normalized = code.trim().toLowerCase() || 'und';
    return (
        CARD_PRINT_LANGUAGES.find((language) => language.code === normalized) ?? {
            code: normalized,
            label: `Language: ${normalized.toUpperCase()}`,
            flagCode: null,
        }
    );
}

// These flags are display conventions, not language identifiers. Codes and names
// remain explicit. English/Portuguese follow the GB/BR treatment in Stitch V2.
export const CARD_PRINT_LANGUAGES: readonly CardPrintLanguage[] = [
    { code: 'en', label: 'English', flagCode: 'gb' },
    { code: 'es', label: 'Spanish', flagCode: 'es' },
    { code: 'fr', label: 'French', flagCode: 'fr' },
    { code: 'de', label: 'German', flagCode: 'de' },
    { code: 'it', label: 'Italian', flagCode: 'it' },
    { code: 'pt', label: 'Portuguese', flagCode: 'br' },
    { code: 'ja', label: 'Japanese', flagCode: 'jp' },
    { code: 'ko', label: 'Korean', flagCode: 'kr' },
    { code: 'ru', label: 'Russian', flagCode: 'ru' },
    { code: 'zhs', label: 'Chinese, simplified', flagCode: 'cn' },
    { code: 'zht', label: 'Chinese, traditional', flagCode: 'tw' },
    { code: 'he', label: 'Hebrew', flagCode: 'il' },
    { code: 'ar', label: 'Arabic', flagCode: null },
    { code: 'la', label: 'Latin', flagCode: null },
    { code: 'grc', label: 'Ancient Greek', flagCode: null },
    { code: 'sa', label: 'Sanskrit', flagCode: null },
    { code: 'ph', label: 'Phyrexian', flagCode: null },
    { code: 'und', label: 'Unknown language', flagCode: null },
];
