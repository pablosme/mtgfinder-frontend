import type { CardSearchFilterField } from './interface/card-search-filter-field.interface';
import type { CardSearchFilters } from './interface/card-search-filters.interface';
import type { CardSearchQuery } from './interface/card-search-query.interface';

export function parseCardSearchQuery(
    query: string,
    fields: readonly CardSearchFilterField[],
): CardSearchQuery {
    const filters: CardSearchFilters = {};
    // Keep quoted values together, including escaped quotes and unfinished input.
    const tokens = query.match(/(?:[^\s"\\]|\\.|"(?:\\.|[^"\\])*"?)+/g) ?? [];

    const name = tokens
        .filter((token) => !token.startsWith('/') || token.startsWith('//'))
        .join(' ');

    for (const token of tokens) {
        // Split-card names such as "Fire // Ice" are ordinary name text.
        if (!token.startsWith('/') || token.startsWith('//')) {
            continue;
        }

        const match = /^\/([a-z_]+)=(.*)$/i.exec(token);
        if (!match) {
            return { name, filters, error: 'Choose a filter and enter it as /filter=value.' };
        }
        const command = match[1].toLowerCase();
        const field = fields.find((field) => field.key === command || field.alias === command);
        if (!field) {
            return {
                name,
                filters,
                error: `Unknown filter /${command}. Use / to choose a filter.`,
            };
        }

        let value = match[2];
        if (value.startsWith('"')) {
            try {
                // JSON string syntax also supports quotes and backslashes inside a value.
                value = JSON.parse(value) as string;
            } catch {
                return { name, filters, error: `Finish the quoted value for /${command}.` };
            }
        } else if (value.includes('"')) {
            return {
                name,
                filters,
                error: `Wrap the whole /${command} value in double quotes.`,
            };
        }
        value = value.trim();
        if (!value) {
            return {
                name,
                filters,
                error: `Enter a value for /${command}: ${field.placeholder}.`,
            };
        }

        if (field.key === 'colors' || field.key === 'color_identity') {
            value = value.replace(/[\s,]/g, '').toUpperCase();
            if (!/^(C|[WUBRG]+)$/.test(value)) {
                return {
                    name,
                    filters,
                    error: 'Use W, U, B, R, G for colors, or C alone for colorless.',
                };
            }
        }
        if (
            field.key === 'cmc' &&
            (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))
        ) {
            return {
                name,
                filters,
                error: 'Mana value (CMC) must be a nonnegative number, such as 0 or 2.5.',
            };
        }
        if (field.key === 'legality') {
            value = value.toLowerCase();
            if (!/^[a-z0-9_]+(?::(?:legal|not_legal|restricted|banned))?$/.test(value)) {
                return {
                    name,
                    filters,
                    error: 'Enter a format, optionally followed by :legal, :not_legal, :restricted or :banned.',
                };
            }
        }
        if (field.options) {
            value = value.toLowerCase();
            if (!field.options.includes(value)) {
                return {
                    name,
                    filters,
                    error: `${field.label}: use ${field.options.join(', ')}.`,
                };
            }
        }
        (filters[field.key] ??= []).push(value);
    }

    return { name, filters, error: '' };
}

export function formatCardSearchFilters(
    filters: CardSearchFilters,
    fields: readonly CardSearchFilterField[],
): string {
    return fields
        .flatMap((field) =>
            (filters[field.key] ?? []).map(
                (value) =>
                    `/${field.alias ?? field.key}=${/[\s"\\]/.test(value) ? JSON.stringify(value) : value}`,
            ),
        )
        .join(' ');
}
