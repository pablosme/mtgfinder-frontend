/** Repeatable query parameters shared by name, fuzzy-name and prompt searches. */
export interface CardSearchFilters {
    type?: string[];
    keyword?: string[];
    colors?: string[];
    color_identity?: string[];
    legality?: string[];
    rarity?: string[];
    set?: string[];
    collection?: string[];
    cmc?: string[];
    layout?: string[];
    power?: string[];
    toughness?: string[];
    loyalty?: string[];
}
