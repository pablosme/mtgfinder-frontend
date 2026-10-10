import { CARD_SEARCH_FILTER_FIELDS } from '../shared/card-search-filter-fields';
import type { CardSearchFilters } from '../shared/interface/card-search-filters.interface';
import type { SearchSyntaxCommand } from './search-syntax-command.interface';

const COMMAND_HELP: Readonly<Record<keyof CardSearchFilters, Omit<SearchSyntaxCommand, 'field'>>> =
    {
        type: {
            description:
                'Filter by card type, supertype or subtype, such as creature, legendary or Dragon.',
            examples: ['/type=creature', '/type="Legendary Creature"', '/type=dragon'],
            notes: ['Put a phrase containing spaces inside double quotes.'],
        },
        keyword: {
            description: 'Look for a keyword ability, such as flying, trample or first strike.',
            examples: ['/keyword=flying', '/keyword="first strike"'],
            notes: ['Use an ability name here, rather than a sentence from the rules text.'],
        },
        colors: {
            description: 'Filter by the card’s colors using the five Magic color letters.',
            examples: ['/color=U', '/color=G,B', '/color=C', '/color=G /color=B'],
            notes: [
                'W = white, U = blue, B = black, R = red, G = green. Use C alone for colorless.',
                'G,B and GB are equivalent. Lowercase letters are accepted. For spaces, quote the value: /color="G, B".',
                'Use /color=G,B for both colors; repeat /color=G /color=B for either color. Do not combine C with another color.',
            ],
        },
        color_identity: {
            description:
                'Filter by color identity, which can include colors beyond the card’s own color, such as those in its rules text.',
            examples: ['/color_identity=W,U', '/color_identity=C'],
            notes: [
                'Uses the same W, U, B, R, G and C notation as colors.',
                'Combine letters in one value for both colors, or repeat the command for alternatives.',
            ],
        },
        legality: {
            description:
                'Specify a format, optionally followed by a legality status after a colon.',
            examples: [
                '/legality=commander',
                '/legality=modern:banned',
                '/legality=vintage:restricted',
            ],
            notes: [
                'A format without a status means legal: /legality=commander and /legality=commander:legal are equivalent.',
                'Supported statuses: legal, not_legal, restricted and banned. Keep the underscore in not_legal.',
                'Use a format identifier such as standard, modern, pioneer, legacy, vintage or commander. These examples specify filters, not the legality of a particular card.',
            ],
        },
        rarity: {
            description: 'Filter by printing rarity. Use one of the supported values listed below.',
            examples: ['/rarity=rare', '/rarity=common /rarity=uncommon'],
            notes: [
                'Use mythic for mythic rare. Repeat the command to supply more than one rarity.',
            ],
        },
        set: {
            description: 'Find printings from a set by its name or code.',
            examples: ['/set=lea', '/set="Limited Edition Alpha"'],
            notes: ['Quote set names containing spaces.'],
        },
        collection: {
            description: 'Match a set name, set code or an exact collector number.',
            examples: ['/collection=lea', '/collection=232'],
            notes: [
                'This command searches printing information; it does not refer to cards you own.',
                'A collector number can occur in more than one set. Add /set= to specify a set as well.',
            ],
        },
        cmc: {
            description: 'Filter by mana value, also called converted mana cost or CMC.',
            examples: ['/cmc=0', '/cmc=3', '/cmc=2.5'],
            notes: [
                'Use a nonnegative number and a period for decimals.',
                'Comparison operators and ranges are not accepted here. Use /cmc=3, not /cmc=>3 or /cmc=2-4.',
            ],
        },
        layout: {
            description:
                'Filter by the card’s layout, such as a normal card or a transforming card.',
            examples: ['/layout=normal', '/layout=transform'],
            notes: ['Use the layout identifier as the value.'],
        },
        power: {
            description: 'Filter by the printed power value.',
            examples: ['/power=2', '/power=*'],
            notes: [
                'The asterisk is a characteristic value, as printed on some cards; it is not a wildcard for any power.',
            ],
        },
        toughness: {
            description: 'Filter by the printed toughness value.',
            examples: ['/toughness=3', '/toughness=*'],
            notes: ['Combine /power= and /toughness= to specify both characteristics.'],
        },
        loyalty: {
            description: 'Filter by the printed starting loyalty value of a planeswalker.',
            examples: ['/loyalty=4', '/loyalty=X'],
            notes: [
                'Enter the value shown on the card, including a symbolic value such as X when applicable.',
            ],
        },
    };

export const SEARCH_SYNTAX_COMMANDS: readonly SearchSyntaxCommand[] = CARD_SEARCH_FILTER_FIELDS.map(
    (field) => ({ field, ...COMMAND_HELP[field.key] }),
);
