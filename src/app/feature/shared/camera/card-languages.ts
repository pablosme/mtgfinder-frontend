import type { CardLanguage } from '../interface/card-language.interface';

export const CARD_LANGUAGES: readonly CardLanguage[] = [
    { code: 'en', label: 'English', ocrModel: 'eng' },
    { code: 'es', label: 'Spanish · Español', ocrModel: 'spa' },
    { code: 'fr', label: 'French · Français', ocrModel: 'fra' },
    { code: 'de', label: 'German · Deutsch', ocrModel: 'deu' },
    { code: 'it', label: 'Italian · Italiano', ocrModel: 'ita' },
    { code: 'pt', label: 'Portuguese · Português', ocrModel: 'por' },
    { code: 'ja', label: 'Japanese · 日本語', ocrModel: 'jpn' },
    { code: 'ko', label: 'Korean · 한국어', ocrModel: 'kor' },
    { code: 'ru', label: 'Russian · Русский', ocrModel: 'rus' },
    { code: 'zhs', label: 'Chinese, simplified · 简体中文', ocrModel: 'chi_sim' },
    { code: 'zht', label: 'Chinese, traditional · 繁體中文', ocrModel: 'chi_tra' },
    { code: 'ar', label: 'Arabic · العربية', ocrModel: 'ara' },
    { code: 'he', label: 'Hebrew · עברית', ocrModel: 'heb' },
    { code: 'la', label: 'Latin · Latina', ocrModel: 'lat' },
    { code: 'grc', label: 'Ancient Greek · Ἑλληνική', ocrModel: 'grc' },
    { code: 'sa', label: 'Sanskrit · संस्कृतम्', ocrModel: 'san' },
    { code: 'ph', label: 'Phyrexian (manual name)', ocrModel: null },
];
