import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, finalize, map, of, switchMap } from 'rxjs';

import { CardSearchService } from '../shared/card-search.service';
import { ManaText } from '../shared/mana-text/mana-text';
import { CardFace, CardPrint, OracleCard } from '../shared/interface/card-search.interface';

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
        return (
            (this.card()?.prints ?? []).find((print) => print.id === this.currentPrintId()) ?? null
        );
    });
    readonly faces = computed(() =>
        [...(this.currentPrint()?.faces ?? [])].sort((a, b) => a.face_index - b.face_index),
    );
    readonly facesWithImages = computed(() =>
        this.faces().filter((face) => this.imageUrl(face.image_uris) !== null),
    );
    readonly currentFaceIndex = signal(0);
    readonly currentFace = computed<CardFace | null>(() =>
        this.imageUrl(this.currentPrint()?.image_uris)
            ? null
            : (this.facesWithImages()[this.currentFaceIndex()] ?? null),
    );
    readonly canSwitchFaces = computed(
        () => !this.imageUrl(this.currentPrint()?.image_uris) && this.facesWithImages().length > 1,
    );
    readonly hasMultipleFaces = computed(() => this.faces().length > 1);

    private readonly route = inject(ActivatedRoute);
    private readonly cardSearch = inject(CardSearchService);

    constructor() {
        this.route.queryParamMap
            .pipe(
                map((params) => params.get('oracle_id')),
                distinctUntilChanged(),
                switchMap((oracleId) => {
                    this.card.set(null);
                    this.currentFaceIndex.set(0);
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
        this.currentFaceIndex.set(0);
    }

    switchFace(): void {
        if (this.canSwitchFaces()) {
            this.currentFaceIndex.update((index) => (index + 1) % this.facesWithImages().length);
        }
    }

    printImageUrl(print: CardPrint, face: CardFace | null = null): string | null {
        const image = this.imageUrl(print.image_uris) ?? this.imageUrl(face?.image_uris);
        if (image) return image;

        for (const candidate of [...(print.faces ?? [])].sort(
            (a, b) => a.face_index - b.face_index,
        )) {
            const faceImage = this.imageUrl(candidate.image_uris);
            if (faceImage) return faceImage;
        }
        return null;
    }

    private imageUrl(images: Record<string, unknown> | null | undefined): string | null {
        for (const size of [
            'normal',
            'large',
            'small',
            'png',
            'display',
            'grid',
            'thumb',
            'border_crop',
            'crop',
            'art_crop',
            'art',
        ]) {
            const image = images?.[size];
            if (typeof image === 'string' && image.trim()) return image;
        }
        return null;
    }
}
