/** Presentation of one format's legality as returned for the current card. */
export interface CardFormatLegality {
    key: string;
    format: string;
    status: 'legal' | 'restricted' | 'banned' | 'not_legal' | 'unknown';
    statusLabel: string;
}
