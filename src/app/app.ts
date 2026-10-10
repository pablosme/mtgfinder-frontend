import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Component, afterNextRender, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { LanguageService } from './core/i18n/language.service';
import { Footer } from './feature/footer/footer';
import { Header } from './feature/header/header';

@Component({
    selector: 'app-root',
    imports: [TranslocoDirective, Footer, Header, RouterOutlet],
    templateUrl: './app.html',
    styleUrl: './app.scss',
})
export class App {
    constructor() {
        inject(Title).setTitle(inject(TranslocoService).translate('metadata.title'));

        // Apply the saved language only after hydration so the first client render matches the server HTML.
        const language = inject(LanguageService);
        afterNextRender(() => void language.restore());
    }
}
