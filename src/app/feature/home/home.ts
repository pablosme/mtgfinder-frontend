import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { OracleCard } from '../shared/interface/card-search.interface';
import { CardSearchInput } from '../shared/card-search-input/card-search-input';

@Component({
    selector: 'app-home',
    imports: [CardSearchInput],
    templateUrl: './home.html',
    styleUrl: './home.scss',
})
export class Home {
    private readonly router = inject(Router);

    selectCard(card: OracleCard): void {
        if (!card.oracle_id) return;

        void this.router.navigate(['/card'], { queryParams: { oracle_id: card.oracle_id } });
    }
}
