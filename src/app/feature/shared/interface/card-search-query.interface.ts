import type { CardSearchFilters } from './card-search-filters.interface';

/** The editable search expression, separated into name and API filters. */
export interface CardSearchQuery {
    name: string;
    filters: CardSearchFilters;
    error: string;
}
