import { CARD_SEARCH_FILTER_FIELDS } from '../shared/card-search-filter-fields';
import type { CardSearchFilters } from '../shared/interface/card-search-filters.interface';
import type { SearchSyntaxCommand } from './search-syntax-command.interface';

const COMMAND_HELP: Readonly<Record<keyof CardSearchFilters, Omit<SearchSyntaxCommand, 'field'>>> =
    {
        type: {
            description: 'searchSyntax.commands.type.description',
            examples: ['/type=creature', '/type="Legendary Creature"', '/type=dragon'],
            notes: ['searchSyntax.commands.type.notes.quote'],
        },
        keyword: {
            description: 'searchSyntax.commands.keyword.description',
            examples: ['/keyword=flying', '/keyword="first strike"'],
            notes: ['searchSyntax.commands.keyword.notes.abilityName'],
        },
        colors: {
            description: 'searchSyntax.commands.colors.description',
            examples: ['/color=U', '/color=G,B', '/color=C', '/color=G /color=B'],
            notes: [
                'searchSyntax.commands.colors.notes.letters',
                'searchSyntax.commands.colors.notes.format',
                'searchSyntax.commands.colors.notes.combine',
            ],
        },
        color_identity: {
            description: 'searchSyntax.commands.color_identity.description',
            examples: ['/color_identity=W,U', '/color_identity=C'],
            notes: [
                'searchSyntax.commands.color_identity.notes.notation',
                'searchSyntax.commands.color_identity.notes.combine',
            ],
        },
        legality: {
            description: 'searchSyntax.commands.legality.description',
            examples: [
                '/legality=commander',
                '/legality=modern:banned',
                '/legality=vintage:restricted',
            ],
            notes: [
                'searchSyntax.commands.legality.notes.default',
                'searchSyntax.commands.legality.notes.statuses',
                'searchSyntax.commands.legality.notes.formats',
            ],
        },
        rarity: {
            description: 'searchSyntax.commands.rarity.description',
            examples: ['/rarity=rare', '/rarity=common /rarity=uncommon'],
            notes: ['searchSyntax.commands.rarity.notes.mythic'],
        },
        set: {
            description: 'searchSyntax.commands.set.description',
            examples: ['/set=lea', '/set="Limited Edition Alpha"'],
            notes: ['searchSyntax.commands.set.notes.quote'],
        },
        collection: {
            description: 'searchSyntax.commands.collection.description',
            examples: ['/collection=lea', '/collection=232'],
            notes: [
                'searchSyntax.commands.collection.notes.printings',
                'searchSyntax.commands.collection.notes.multipleSets',
            ],
        },
        cmc: {
            description: 'searchSyntax.commands.cmc.description',
            examples: ['/cmc=0', '/cmc=3', '/cmc=2.5'],
            notes: [
                'searchSyntax.commands.cmc.notes.number',
                'searchSyntax.commands.cmc.notes.operators',
            ],
        },
        layout: {
            description: 'searchSyntax.commands.layout.description',
            examples: ['/layout=normal', '/layout=transform'],
            notes: ['searchSyntax.commands.layout.notes.identifier'],
        },
        power: {
            description: 'searchSyntax.commands.power.description',
            examples: ['/power=2', '/power=*'],
            notes: ['searchSyntax.commands.power.notes.asterisk'],
        },
        toughness: {
            description: 'searchSyntax.commands.toughness.description',
            examples: ['/toughness=3', '/toughness=*'],
            notes: ['searchSyntax.commands.toughness.notes.combine'],
        },
        loyalty: {
            description: 'searchSyntax.commands.loyalty.description',
            examples: ['/loyalty=4', '/loyalty=X'],
            notes: ['searchSyntax.commands.loyalty.notes.symbol'],
        },
    };

export const SEARCH_SYNTAX_COMMANDS: readonly SearchSyntaxCommand[] = CARD_SEARCH_FILTER_FIELDS.map(
    (field) => ({ field, ...COMMAND_HELP[field.key] }),
);
