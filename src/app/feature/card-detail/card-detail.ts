import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, finalize, map, of, switchMap } from 'rxjs';

import { CardSearchService } from '../shared/card-search.service';
import { ManaText } from '../shared/mana-text/mana-text';
import { CardPrint, OracleCard } from '../shared/interface/card-search.interface';

@Component({
    selector: 'app-card-detail',
    imports: [KeyValuePipe, ManaText, RouterLink],
    templateUrl: './card-detail.html',
    styleUrl: './card-detail.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardDetail {
    readonly card = signal<OracleCard | null>(null);
    readonly loading = signal(false);
    readonly error = signal('');
    readonly currentPrintId = signal<string | null>(null);
    readonly currentPrint = computed(() => {
        return (this.card()?.prints ?? []).find((print) => print.id === this.currentPrintId()) ?? null;
    });

    private readonly route = inject(ActivatedRoute);
    private readonly cardSearch = inject(CardSearchService);

    constructor() {
        this.route.queryParamMap
            .pipe(
                map((params) => params.get('oracle_id')),
                distinctUntilChanged(),
                switchMap((oracleId) => {
                    this.card.set(null);
                    this.error.set('');

                    if (!oracleId) {
                        this.loading.set(false);
                        this.error.set('No oracle_id was provided.');
                        return of(null);
                    }

                    this.loading.set(true);
                    return this.cardSearch.getCardInfo(oracleId).pipe(
                        catchError(() => {
                            this.error.set('Unable to load this card.');
                            return of(null);
                        }),
                        finalize(() => this.loading.set(false)),
                    );
                }),
                takeUntilDestroyed(),
            )
            .subscribe((card) => {
                this.card.set(card);
                const prints = card?.prints ?? [];
                this.currentPrintId.set(
                    prints.find((print) => print.id === card?.fallback_print_id)?.id ??
                        prints[0]?.id ??
                        null,
                );
            });
    }

    selectPrint(print: CardPrint): void {
        this.currentPrintId.set(print.id);
    }

    printImageUrl(print: CardPrint): string | null {
        const image = print.image_uris?.['normal'] ?? print.image_uris?.['large'] ?? print.image_uris?.['small'];
        return typeof image === 'string' ? image : null;
    }
}
