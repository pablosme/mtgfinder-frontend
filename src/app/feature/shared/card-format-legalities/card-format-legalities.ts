import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { CardFormatLegality } from '../interface/card-format-legality.interface';

const FORMAT_LABELS: Readonly<Record<string, string>> = {
    standardbrawl: 'Standard Brawl',
    historicbrawl: 'Historic Brawl',
    paupercommander: 'Pauper Commander',
    duel: 'Duel Commander',
    oldschool: 'Old School',
    penny: 'Penny Dreadful',
};

const STATUS_LABELS: Readonly<Record<CardFormatLegality['status'], string>> = {
    legal: 'Legal',
    restricted: 'Restricted (1×)',
    banned: 'Banned',
    not_legal: 'Not legal',
    unknown: 'Unknown',
};

const STATUS_ORDER: Readonly<Record<CardFormatLegality['status'], number>> = {
    legal: 0,
    restricted: 1,
    banned: 2,
    not_legal: 3,
    unknown: 4,
};

@Component({
    selector: 'app-card-format-legalities',
    templateUrl: './card-format-legalities.html',
    styleUrl: './card-format-legalities.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardFormatLegalities {
    readonly legalities = input.required<Readonly<Record<string, string>> | null>();
    readonly formats = computed<CardFormatLegality[]>(() =>
        Object.entries(this.legalities() ?? {})
            .map(([key, value]): CardFormatLegality => {
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
                        (format
                            .replace(/[_-]+/g, ' ')
                            .replace(/\b\w/g, (letter) => letter.toUpperCase()) ||
                            'Unknown format'),
                    status,
                    statusLabel:
                        status === 'unknown'
                            ? value.trim().replace(/[_-]+/g, ' ') || STATUS_LABELS.unknown
                            : STATUS_LABELS[status],
                };
            })
            .sort(
                (left, right) =>
                    STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
                    left.format.localeCompare(right.format, 'en'),
            ),
    );
}
