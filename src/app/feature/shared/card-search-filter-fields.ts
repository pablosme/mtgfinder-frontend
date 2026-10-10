import type { CardSearchFilterField } from './interface/card-search-filter-field.interface';

export const CARD_SEARCH_FILTER_FIELDS: readonly CardSearchFilterField[] = [
    { key: 'type', label: 'Type', placeholder: 'e.g. Legendary Creature' },
    { key: 'keyword', label: 'Keyword', placeholder: 'e.g. Flying' },
    {
        key: 'colors',
        alias: 'color',
        label: 'Colors',
        placeholder: 'e.g. W,U or C',
        hint: 'W, U, B, R, G; C for colorless. Use G,B for both colors; repeat the filter for either color.',
    },
    {
        key: 'color_identity',
        label: 'Color identity',
        placeholder: 'e.g. B,G or C',
        hint: 'W, U, B, R, G; C for colorless. Use G,B for both colors; repeat the filter for either color.',
    },
    {
        key: 'legality',
        label: 'Legality',
        placeholder: 'e.g. commander or modern:banned',
        hint: 'Format alone means legal. Optional status: legal, not_legal, restricted, banned.',
    },
    {
        key: 'rarity',
        label: 'Rarity',
        placeholder: 'common, uncommon, rare, mythic, special or bonus',
        options: ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'],
    },
    { key: 'set', label: 'Set', placeholder: 'Set name or code' },
    {
        key: 'collection',
        label: 'Collection',
        placeholder: 'Set name, code or collector number',
        hint: 'Matches a set name/code or an exact collector number.',
    },
    {
        key: 'cmc',
        label: 'Mana value (CMC)',
        placeholder: 'e.g. 0 or 2.5',
    },
    { key: 'layout', label: 'Layout', placeholder: 'e.g. normal or transform' },
    { key: 'power', label: 'Power', placeholder: 'e.g. 2 or *' },
    { key: 'toughness', label: 'Toughness', placeholder: 'e.g. 3 or *' },
    { key: 'loyalty', label: 'Loyalty', placeholder: 'e.g. 4 or X' },
];
