import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    computed,
    inject,
    input,
    output,
    signal,
    viewChild,
    viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, Subject, switchMap, timer } from 'rxjs';

import { CardSearchService } from '../card-search.service';
import { ManaText } from '../mana-text/mana-text';
import { OracleCard } from '../interface/card-search.interface';
import { formatCardSearchFilters, parseCardSearchQuery } from '../card-search-query';
import { CardSearchFilterField } from '../interface/card-search-filter-field.interface';

@Component({
    selector: 'app-card-search-input',
    imports: [ManaText],
    templateUrl: './card-search-input.html',
    styleUrl: './card-search-input.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardSearchInput {
    private readonly cardSearch = inject(CardSearchService);

    readonly filters = this.cardSearch.filters;
    readonly filterFields: readonly CardSearchFilterField[] = [
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
    readonly inputId = input.required<string>();
    readonly cardSelected = output<OracleCard>();
    readonly cards = signal<OracleCard[]>([]);
    readonly query = signal(formatCardSearchFilters(this.filters(), this.filterFields));
    readonly parsedQuery = computed(() => parseCardSearchQuery(this.query(), this.filterFields));
    private readonly caret = signal(0);
    readonly filterCompletion = computed(() => {
        const caret = this.caret();
        // Quoted values remain one token, so slashes inside them never open suggestions.
        for (const match of this.query().matchAll(/(?:[^\s"\\]|\\.|"(?:\\.|[^"\\])*"?)+/g)) {
            const command = /^\/([a-z_]*)(?==|$)/i.exec(match[0]);
            if (!command) continue;
            const start = match.index;
            const end = start + command[0].length;
            if (caret > start && caret <= end) {
                return {
                    start,
                    end,
                    prefix: this.query()
                        .slice(start + 1, caret)
                        .toLowerCase(),
                    hasEquals: this.query()[end] === '=',
                };
            }
        }
        return null;
    });
    readonly matchingFilters = computed(() => {
        const completion = this.filterCompletion();
        if (!completion) return [];
        return this.filterFields.filter((field) =>
            [field.key, field.alias ?? '', field.label.toLowerCase()].some((value) =>
                value.includes(completion.prefix),
            ),
        );
    });
    readonly pickingFilter = computed(() => this.filterCompletion() !== null);
    readonly suggestionCount = computed(() =>
        this.pickingFilter() ? this.matchingFilters().length : this.cards().length,
    );
    readonly loading = signal(false);
    readonly error = signal('');
    readonly open = signal(false);
    readonly selected = signal(false);
    readonly activeIndex = signal(-1);
    readonly listId = computed(() => `${this.inputId()}-suggestions`);
    readonly expanded = computed(() => this.open() && this.suggestionCount() > 0);
    readonly activeOptionId = computed(() =>
        this.expanded() && this.activeIndex() >= 0
            ? `${this.listId()}-${this.activeIndex()}`
            : null,
    );
    readonly status = computed(() => {
        if (this.pickingFilter()) {
            return this.matchingFilters().length
                ? `${this.matchingFilters().length} filters. Keep typing to narrow them, or use the arrow keys and Enter to choose.`
                : 'No matching filters. Try another filter name.';
        }
        if (this.parsedQuery().error) return this.parsedQuery().error;
        if (this.selected() || !this.query().trim()) return '';
        if (!this.parsedQuery().name) return 'Enter a card name to search.';
        if (this.loading()) return 'Searching cards…';
        if (this.error()) return this.error();
        return this.cards().length
            ? `${this.cards().length} results. Use the arrow keys to choose a card.`
            : 'No cards found.';
    });

    private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

    private readonly searchTerms = new Subject<string>();
    private readonly options = viewChildren<ElementRef<HTMLButtonElement>>('option');

    constructor() {
        this.searchTerms
            .pipe(
                // New input cancels both the debounce timer and any pending request.
                switchMap((name) => {
                    const filters = this.filters();
                    return name && !this.parsedQuery().error
                        ? timer(250).pipe(
                              //   switchMap(() => this.cardSearch.searchByName(name, filters)),
                              switchMap(() => this.cardSearch.searchByPrompt(name, filters)),
                              map((response) => ({
                                  cards: response.data.filter((card) => card.oracle_id !== null),
                                  error: '',
                              })),
                              catchError(() =>
                                  of({
                                      cards: [],
                                      error: 'Unable to search cards. Please try again.',
                                  }),
                              ),
                          )
                        : of({ cards: [], error: '' });
                }),
                takeUntilDestroyed(),
            )
            .subscribe(({ cards, error }) => {
                console.log('cards', cards, 'error', error);
                this.cards.set(cards);
                this.error.set(error);
                this.loading.set(false);
            });
    }

    updateQuery(value: string): void {
        this.selected.set(false);
        this.query.set(value);
        this.cards.set([]);
        this.error.set('');
        this.open.set(true);
        this.activeIndex.set(-1);
        const { name, filters, error } = this.parsedQuery();
        // Incomplete tokens never replace the last valid filters or reach the API.
        if (!error) this.filters.set(filters);
        this.loading.set(name.length > 0 && !error);
        this.searchTerms.next(name);
    }

    onInput(event: Event): void {
        if ((event as InputEvent).isComposing) return;
        const input = this.searchInput().nativeElement;
        this.caret.set(input.selectionStart ?? input.value.length);
        this.updateQuery(input.value);
    }

    updateCaret(): void {
        const input = this.searchInput().nativeElement;
        const caret = input.selectionStart === input.selectionEnd ? input.selectionStart : -1;
        if (caret !== this.caret()) {
            this.caret.set(caret ?? input.value.length);
            this.activeIndex.set(-1);
        }
    }

    openFilterSuggestions(): void {
        const input = this.searchInput().nativeElement;
        this.updateCaret();
        if (!this.filterCompletion()) {
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? start;
            const before = this.query().slice(0, start);
            const after = this.query().slice(end);
            const token = `${before && !/\s$/.test(before) ? ' ' : ''}/`;
            const suffix = after && !/^\s/.test(after) ? ' ' : '';
            this.updateQuery(`${before}${token}${suffix}${after}`);
            this.caret.set(before.length + token.length);
            input.value = this.query();
            input.setSelectionRange(this.caret(), this.caret());
        }
        this.activeIndex.set(-1);
        input.focus();
        this.open.set(true);
    }

    addFilter(field: CardSearchFilterField): void {
        const completion = this.filterCompletion();
        if (!completion) return;
        const before = this.query().slice(0, completion.start);
        const after = this.query().slice(completion.end);
        const token = `/${field.alias ?? field.key}${completion.hasEquals ? '' : '='}`;
        this.updateQuery(`${before}${token}${after}`);
        const caret = before.length + token.length + (completion.hasEquals ? 1 : 0);
        this.caret.set(caret);
        this.open.set(false);
        const input = this.searchInput().nativeElement;
        input.value = this.query();
        input.focus();
        input.setSelectionRange(caret, caret);
    }

    clearFilters(): void {
        this.updateQuery(this.parsedQuery().name);
        this.caret.set(this.query().length);
        const input = this.searchInput().nativeElement;
        input.value = this.query();
        input.focus();
        input.setSelectionRange(this.caret(), this.caret());
    }

    onKeydown(event: KeyboardEvent): void {
        if (event.isComposing) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            this.open.set(false);
            this.activeIndex.set(-1);
            return;
        }

        const count = this.suggestionCount();
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!count) return;
            event.preventDefault();
            const current = this.open() ? this.activeIndex() : -1;
            const index =
                event.key === 'ArrowDown'
                    ? (current + 1) % count
                    : current <= 0
                      ? count - 1
                      : current - 1;
            this.open.set(true);
            this.activeIndex.set(index);
            // Keyboard events only run in the browser.
            this.options()[index]?.nativeElement.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter' && this.expanded()) {
            if (this.pickingFilter()) {
                const field = this.matchingFilters()[Math.max(0, this.activeIndex())];
                if (field) {
                    event.preventDefault();
                    this.addFilter(field);
                }
            } else {
                const card = this.cards()[this.activeIndex()];
                if (card) {
                    event.preventDefault();
                    this.selectCard(card);
                }
            }
        }
    }

    selectCard(card: OracleCard): void {
        this.selected.set(true);
        this.searchTerms.next('');
        const filters = formatCardSearchFilters(this.filters(), this.filterFields);
        this.query.set(filters ? `${filters} ${card.name}` : card.name);
        this.caret.set(this.query().length);
        this.cards.set([]);
        this.open.set(false);
        this.activeIndex.set(-1);
        this.cardSelected.emit(card);
    }
}
