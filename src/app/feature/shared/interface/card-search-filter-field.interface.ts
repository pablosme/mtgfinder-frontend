import type { CardSearchFilters } from './card-search-filters.interface';

export interface CardSearchFilterField {
    key: keyof CardSearchFilters;
    alias?: string;
    label: string;
    placeholder: string;
    hint?: string;
    options?: readonly string[];
}
