import type { SupportedLanguage } from './supported-language.interface';

export const DEFAULT_LANGUAGE = 'en';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
    { code: 'en', abbreviation: 'EN', flagCode: 'gb', nativeName: 'English', dir: 'ltr' },
    { code: 'fr', abbreviation: 'FR', flagCode: 'fr', nativeName: 'Français', dir: 'ltr' },
    { code: 'de', abbreviation: 'DE', flagCode: 'de', nativeName: 'Deutsch', dir: 'ltr' },
    { code: 'it', abbreviation: 'IT', flagCode: 'it', nativeName: 'Italiano', dir: 'ltr' },
    { code: 'ja', abbreviation: 'JA', flagCode: 'jp', nativeName: '日本語', dir: 'ltr' },
    { code: 'es', abbreviation: 'ES', flagCode: 'es', nativeName: 'Español', dir: 'ltr' },
    { code: 'pt', abbreviation: 'PT', flagCode: 'br', nativeName: 'Português', dir: 'ltr' },
    { code: 'zh-Hans', abbreviation: 'ZHS', flagCode: 'cn', nativeName: '简体中文', dir: 'ltr' },
    { code: 'ru', abbreviation: 'RU', flagCode: 'ru', nativeName: 'Русский', dir: 'ltr' },
    { code: 'ko', abbreviation: 'KO', flagCode: 'kr', nativeName: '한국어', dir: 'ltr' },
    { code: 'zh-Hant', abbreviation: 'ZHT', flagCode: 'tw', nativeName: '繁體中文', dir: 'ltr' },
    { code: 'la', abbreviation: 'LA', flagCode: 'va', nativeName: 'Latina', dir: 'ltr' },
    { code: 'grc', abbreviation: 'GRC', flagCode: 'gr', nativeName: 'Ἑλληνικὴ ἀρχαία', dir: 'ltr' },
    { code: 'sa', abbreviation: 'SA', flagCode: 'in', nativeName: 'संस्कृतम्', dir: 'ltr' },
    { code: 'ar', abbreviation: 'AR', flagCode: 'sa', nativeName: 'العربية', dir: 'rtl' },
    { code: 'he', abbreviation: 'HE', flagCode: 'il', nativeName: 'עברית', dir: 'rtl' },
    { code: 'ph', abbreviation: 'PH', flagCode: null, nativeName: 'Phyrexian', dir: 'ltr' },
];

