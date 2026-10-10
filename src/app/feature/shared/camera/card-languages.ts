import type { CardLanguage } from '../interface/card-language.interface';

export const CARD_LANGUAGES: readonly CardLanguage[] = [
    { code: 'en', label: "cardLanguages.en", ocrModel: 'eng' },
    { code: 'es', label: "cardLanguages.es", ocrModel: 'spa' },
    { code: 'fr', label: "cardLanguages.fr", ocrModel: 'fra' },
    { code: 'de', label: "cardLanguages.de", ocrModel: 'deu' },
    { code: 'it', label: "cardLanguages.it", ocrModel: 'ita' },
    { code: 'pt', label: "cardLanguages.pt", ocrModel: 'por' },
    { code: 'ja', label: "cardLanguages.ja", ocrModel: 'jpn' },
    { code: 'ko', label: "cardLanguages.ko", ocrModel: 'kor' },
    { code: 'ru', label: "cardLanguages.ru", ocrModel: 'rus' },
    { code: 'zhs', label: "cardLanguages.zhs", ocrModel: 'chi_sim' },
    { code: 'zht', label: "cardLanguages.zht", ocrModel: 'chi_tra' },
    { code: 'ar', label: "cardLanguages.ar", ocrModel: 'ara' },
    { code: 'he', label: "cardLanguages.he", ocrModel: 'heb' },
    { code: 'la', label: "cardLanguages.la", ocrModel: 'lat' },
    { code: 'grc', label: "cardLanguages.grc", ocrModel: 'grc' },
    { code: 'sa', label: "cardLanguages.sa", ocrModel: 'san' },
    { code: 'ph', label: "cardLanguages.phyrexianManual", ocrModel: null },
];
