import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { OracleCard } from '../shared/interface/card-search.interface';
import { CardSearchInput } from '../shared/card-search-input/card-search-input';

@Component({
    selector: 'app-header',
    imports: [CardSearchInput, RouterLink],
    templateUrl: './header.html',
    styleUrl: './header.scss',
})
export class Header {
    readonly isHome = signal(true);

    private readonly router = inject(Router);

    constructor() {
        this.isHome.set(this.router.url.split(/[?#]/, 1)[0] === '/');
        this.router.events
            .pipe(
                filter((event): event is NavigationEnd => event instanceof NavigationEnd),
                takeUntilDestroyed(),
            )
            .subscribe((event) => {
                this.isHome.set(event.urlAfterRedirects.split(/[?#]/, 1)[0] === '/');
            });
    }

    selectCard(card: OracleCard): void {
        if (!card.oracle_id) return;

        void this.router.navigate(['/card'], { queryParams: { oracle_id: card.oracle_id } });
    }
}
