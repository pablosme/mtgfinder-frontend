import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { inject, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { CardFormatLegality } from '../interface/card-format-legality.interface';

const FORMAT_LABELS: Readonly<Record<string, string>> = {
    standardbrawl: 'Standard Brawl',
    historicbrawl: 'Historic Brawl',
    paupercommander: 'Pauper Commander',
    duel: 'Duel Commander',
    oldschool: 'Old School',
    penny: 'Penny Dreadful',
};

const STATUS_KEYS: Readonly<Record<CardFormatLegality['status'], string>> = {
    legal: 'formatLegality.status.legal',
    restricted: 'formatLegality.status.restricted',
    banned: 'formatLegality.status.banned',
    not_legal: 'formatLegality.status.not_legal',
    unknown: 'formatLegality.status.unknown',
};

const STATUS_ORDER: Readonly<Record<CardFormatLegality['status'], number>> = {
    legal: 0,
    restricted: 1,
    banned: 2,
    not_legal: 3,
    unknown: 4,
};

export interface DisplayCardFormatLegality {
    readonly key: string;
    readonly format: string;
    readonly status: CardFormatLegality['status'];
    readonly statusKey: string;
    readonly fallbackLabel: string;
}

@Component({
    imports: [TranslocoDirective],
    selector: 'app-card-format-legalities',
    templateUrl: './card-format-legalities.html',
    styleUrl: './card-format-legalities.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardFormatLegalities {
    readonly legalities = input.required<Readonly<Record<string, string>> | null>();
    readonly formats = computed<DisplayCardFormatLegality[]>(() =>
        Object.entries(this.legalities() ?? {})
            .map(([key, value]): DisplayCardFormatLegality => {
                const format = key.trim().toLowerCase();
                const normalized = value.trim().toLowerCase();
                let status: CardFormatLegality['status'] = 'unknown';
                if (
                    normalized === 'legal' ||
                    normalized === 'restricted' ||
                    normalized === 'banned' ||
                    normalized === 'not_legal'
                ) {
                    status = normalized;
                }

                return {
                    key,
                    format:
                        FORMAT_LABELS[format] ??
                        format.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
                    status,
                    statusKey: STATUS_KEYS[status],
                    fallbackLabel: value.trim().replace(/[_-]+/g, ' '),
                };
            })
            .sort(
                (left, right) =>
                    STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
                    left.format.localeCompare(right.format, 'en'),
            ),
    );
}
