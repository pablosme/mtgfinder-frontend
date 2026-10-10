export interface SupportedLanguage {
    /** Transloco language code; also the translation file name and the HTML `lang` value. */
    readonly code: string;
    /** Short abbreviation displayed in UI badges / buttons (e.g. EN, PT, JA, ZHS, ZHT, GRC). */
    readonly abbreviation: string;
    /** Optional country flag code corresponding to flag-icons CSS class (e.g. gb, br, es). */
    readonly flagCode?: string | null;
    /** Name of the language written in that language. It is never translated. */
    readonly nativeName: string;
    readonly dir: 'ltr' | 'rtl';
}
