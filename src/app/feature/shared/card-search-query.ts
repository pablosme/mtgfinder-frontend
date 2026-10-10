import type { TranslocoService } from '@jsverse/transloco';
import type { CardSearchFilterField } from './interface/card-search-filter-field.interface';
import type { CardSearchFilters } from './interface/card-search-filters.interface';
import type { CardSearchQuery } from './interface/card-search-query.interface';

export function parseCardSearchQuery(
    query: string,
    fields: readonly CardSearchFilterField[],
    translate: TranslocoService['translate'],
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
            return { name, filters, error: translate('validation.search.syntax') };
        }
        const command = match[1].toLowerCase();
        const field = fields.find((field) => field.key === command || field.alias === command);
        if (!field) {
            return {
                name,
                filters,
                error: translate('validation.search.unknown', { command }),
            };
        }

        let value = match[2];
        if (value.startsWith('"')) {
            try {
                // JSON string syntax also supports quotes and backslashes inside a value.
                value = JSON.parse(value) as string;
            } catch {
                return { name, filters, error: translate('validation.search.unfinishedQuote', { command }) };
            }
        } else if (value.includes('"')) {
            return {
                name,
                filters,
                error: translate('validation.search.quoteWholeValue', { command }),
            };
        }
        value = value.trim();
        if (!value) {
            return {
                name,
                filters,
                error: translate('validation.search.missingValue', { command, example: translate(field.placeholder) }),
            };
        }

        if (field.key === 'colors' || field.key === 'color_identity') {
            value = value.replace(/[\s,]/g, '').toUpperCase();
            if (!/^(C|[WUBRG]+)$/.test(value)) {
                return {
                    name,
                    filters,
                    error: translate('validation.search.colors'),
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
                error: translate('validation.search.manaValue'),
            };
        }
        if (field.key === 'legality') {
            value = value.toLowerCase();
            if (!/^[a-z0-9_]+(?::(?:legal|not_legal|restricted|banned))?$/.test(value)) {
                return {
                    name,
                    filters,
                    error: translate('validation.search.legality'),
                };
            }
        }
        if (field.options) {
            value = value.toLowerCase();
            if (!field.options.includes(value)) {
                return {
                    name,
                    filters,
                    error: translate('validation.search.options', { label: translate(field.label), options: field.options.join(', ') }),
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
