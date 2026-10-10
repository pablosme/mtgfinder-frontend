import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    computed,
    inject,
    signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { LanguageService } from '../../../core/i18n/language.service';
import { ManaText } from '../mana-text/mana-text';

@Component({
    selector: 'app-language-selector',
    imports: [TranslocoDirective, ManaText],
    templateUrl: './language-selector.html',
    styleUrl: './language-selector.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSelector {
    readonly language = inject(LanguageService);
    private readonly elementRef = inject(ElementRef<HTMLElement>);

    readonly isOpen = signal(false);
    readonly currentLang = computed(() => this.language.currentLanguage());

    toggleOpen(): void {
        this.isOpen.update((open) => !open);
    }

    close(): void {
        this.isOpen.set(false);
    }

    selectLanguage(code: string): void {
        void this.language.use(code);
        this.close();
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.isOpen()) return;
        const target = event.target as Node | null;
        if (target && !this.elementRef.nativeElement.contains(target)) {
            this.close();
        }
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        if (this.isOpen()) {
            this.close();
        }
    }
}
