import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
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
import { MatDialog } from '@angular/material/dialog';
import { catchError, map, of, Subject, switchMap, timer } from 'rxjs';

import { CardSearchService } from '../card-search.service';
import { Camera } from '../camera/camera';
import { CardScanResult } from '../interface/card-scan-result.interface';
import { ManaText } from '../mana-text/mana-text';
import { OracleCard } from '../interface/card-search.interface';
import { formatCardSearchFilters, parseCardSearchQuery } from '../card-search-query';
import { CardSearchFilterField } from '../interface/card-search-filter-field.interface';
import { CARD_SEARCH_FILTER_FIELDS } from '../card-search-filter-fields';

@Component({
    selector: 'app-card-search-input',
    imports: [TranslocoDirective, ManaText],
    templateUrl: './card-search-input.html',
    styleUrl: './card-search-input.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardSearchInput {
    private readonly transloco = inject(TranslocoService);
    private readonly language = inject(LanguageService);
    private readonly cardSearch = inject(CardSearchService);
    private readonly dialog = inject(MatDialog);
    private readonly destroyRef = inject(DestroyRef);

    readonly filters = this.cardSearch.filters;
    readonly filterFields = CARD_SEARCH_FILTER_FIELDS;
    readonly inputId = input.required<string>();
    readonly cardSelected = output<OracleCard>();
    readonly cardScanned = output<CardScanResult>();
    readonly scannedCard = signal<CardScanResult | null>(null);
    readonly cards = signal<OracleCard[]>([]);
    readonly query = signal(formatCardSearchFilters(this.filters(), this.filterFields));
    readonly parsedQuery = computed(() => {
        // Reading the language makes validation messages re-translate on a live switch.
        this.language.current();
        return parseCardSearchQuery(
            this.query(),
            this.filterFields,
            this.transloco.translate.bind(this.transloco),
        );
    });
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
        this.language.current();
        if (!completion) return [];
        return this.filterFields.filter((field) =>
            [
                field.key,
                field.alias ?? '',
                this.transloco.translate<string>(field.label).toLowerCase(),
            ].some((value) => value.includes(completion.prefix)),
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
    readonly expanded = computed(
        () => this.open() && (this.suggestionCount() > 0 || !!this.status()),
    );
    readonly activeOptionId = computed(() =>
        this.expanded() && this.activeIndex() >= 0
            ? `${this.listId()}-${this.activeIndex()}`
            : null,
    );
    readonly status = computed(() => {
        this.language.current();
        if (this.pickingFilter()) {
            return this.matchingFilters().length
                ? this.transloco.translate('search.status.filterCount', {
                      count: this.matchingFilters().length,
                  })
                : this.transloco.translate('search.status.noFilters');
        }
        if (this.parsedQuery().error) return this.parsedQuery().error;
        if (this.selected() || !this.query().trim()) return '';
        if (!this.parsedQuery().name) return this.transloco.translate('search.status.nameRequired');
        if (this.loading()) return this.transloco.translate('search.status.loading');
        if (this.error()) return this.transloco.translate(this.error());
        return this.cards().length
            ? this.transloco.translate('search.status.resultCount', { count: this.cards().length })
            : this.transloco.translate('search.status.empty');
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
                              switchMap(() => this.cardSearch.searchByName(name, filters)),
                              //   switchMap(() => this.cardSearch.searchByPrompt(name, filters)),
                              map((response) => ({
                                  cards: response.data.filter((card) => card.oracle_id !== null),
                                  error: '',
                              })),
                              catchError(() =>
                                  of({
                                      cards: [],
                                      error: 'search.status.failed',
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

    openCamera(): void {
        this.open.set(false);
        this.activeIndex.set(-1);
        this.dialog
            .open<Camera, undefined, CardScanResult>(Camera, {
                width: '72rem',
                maxWidth: 'calc(100vw - 1rem)',
                height: '92dvh',
                maxHeight: 'calc(100dvh - 1rem)',
                ariaModal: true,
            })
            .afterClosed()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((result) => {
                if (!result) return;
                this.scannedCard.set(result);
                const filters = formatCardSearchFilters(this.filters(), this.filterFields);
                this.updateQuery(filters ? `${filters} ${result.name}` : result.name);
                this.caret.set(this.query().length);
                const input = this.searchInput().nativeElement;
                input.value = this.query();
                input.focus();
                input.setSelectionRange(this.caret(), this.caret());
                this.cardScanned.emit(result);
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
