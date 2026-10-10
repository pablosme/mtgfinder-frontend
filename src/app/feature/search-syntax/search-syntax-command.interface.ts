import type { CardSearchFilterField } from '../shared/interface/card-search-filter-field.interface';

export interface SearchSyntaxCommand {
    readonly field: CardSearchFilterField;
    readonly description: string;
    readonly examples: readonly string[];
    readonly notes: readonly string[];
}
