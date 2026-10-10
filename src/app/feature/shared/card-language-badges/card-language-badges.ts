import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { inject, ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { LanguageService } from '../../../core/i18n/language.service';
import type { CardPrintLanguage } from '../interface/card-print-language.interface';
import { getCardPrintLanguage } from './card-print-languages';
import { ManaText } from '../mana-text/mana-text';

@Component({
    imports: [TranslocoDirective, ManaText],
    selector: 'app-card-language-badges',
    templateUrl: './card-language-badges.html',
    styleUrl: './card-language-badges.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class.language-selector]': 'selectable()',
        '[attr.role]': 'selectable() ? "group" : null',
        '[attr.aria-label]':
            'selectable() ? (language.current() && transloco.translate("cardLanguages.selector")) : null',
    },
})
export class CardLanguageBadges {
    protected readonly transloco = inject(TranslocoService);
    protected readonly language = inject(LanguageService);
    readonly languages = input.required<readonly string[]>();
    readonly selectable = input(false);
    readonly selectedLanguage = input<string | null>(null);
    readonly languageSelected = output<string>();
    readonly badges = computed<readonly CardPrintLanguage[]>(() =>
        this.languages().map(getCardPrintLanguage),
    );
}
