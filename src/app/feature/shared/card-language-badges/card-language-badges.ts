import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { CardPrintLanguage } from '../interface/card-print-language.interface';
import { getCardPrintLanguage } from './card-print-languages';

@Component({
    selector: 'app-card-language-badges',
    templateUrl: './card-language-badges.html',
    styleUrl: './card-language-badges.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class.language-selector]': 'selectable()',
        '[attr.role]': 'selectable() ? "group" : null',
        '[attr.aria-label]': 'selectable() ? "Print language" : null',
    },
})
export class CardLanguageBadges {
    readonly languages = input.required<readonly string[]>();
    readonly selectable = input(false);
    readonly selectedLanguage = input<string | null>(null);
    readonly languageSelected = output<string>();
    readonly badges = computed<readonly CardPrintLanguage[]>(() =>
        this.languages().map(getCardPrintLanguage),
    );
}
