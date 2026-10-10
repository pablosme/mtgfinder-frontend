import type { CardSearchFilterField } from './interface/card-search-filter-field.interface';

export const CARD_SEARCH_FILTER_FIELDS: readonly CardSearchFilterField[] = [
    { key: 'type', label: "search.filters.type.label", placeholder: "search.filters.type.placeholder" },
    { key: 'keyword', label: "search.filters.keyword.label", placeholder: "search.filters.keyword.placeholder" },
    {
        key: 'colors',
        alias: 'color',
        label: "search.filters.colors.label",
        placeholder: "search.filters.colors.placeholder",
        hint: "search.filters.colors.hint",
    },
    {
        key: 'color_identity',
        label: "search.filters.colorIdentity.label",
        placeholder: "search.filters.colorIdentity.placeholder",
        hint: "search.filters.colorIdentity.hint",
    },
    {
        key: 'legality',
        label: "search.filters.legality.label",
        placeholder: "search.filters.legality.placeholder",
        hint: "search.filters.legality.hint",
    },
    {
        key: 'rarity',
        label: "search.filters.rarity.label",
        placeholder: "search.filters.rarity.placeholder",
        options: ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'],
    },
    { key: 'set', label: "search.filters.set.label", placeholder: "search.filters.set.placeholder" },
    {
        key: 'collection',
        label: "search.filters.collection.label",
        placeholder: "search.filters.collection.placeholder",
        hint: "search.filters.collection.hint",
    },
    {
        key: 'cmc',
        label: "search.filters.cmc.label",
        placeholder: "search.filters.cmc.placeholder",
    },
    { key: 'layout', label: "search.filters.layout.label", placeholder: "search.filters.layout.placeholder" },
    { key: 'power', label: "search.filters.power.label", placeholder: "search.filters.power.placeholder" },
    { key: 'toughness', label: "search.filters.toughness.label", placeholder: "search.filters.toughness.placeholder" },
    { key: 'loyalty', label: "search.filters.loyalty.label", placeholder: "search.filters.loyalty.placeholder" },
];
