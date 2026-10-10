import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../core/environment/environment';
import { CardSearchResponse, OracleCard } from './interface/card-search.interface';
import { CardSearchFilters } from './interface/card-search-filters.interface';

@Injectable({ providedIn: 'root' })
export class CardSearchService {
    // Keep the active filters when moving between the home and header searches.
    readonly filters = signal<CardSearchFilters>({});

    private readonly http = inject(HttpClient);
    private readonly cardsUrl = `${environment.apiBaseUrl.replace(/\/+$/, '')}/cards`;

    getCardInfo(oracleId: string): Observable<OracleCard> {
        return this.http.get<OracleCard>(`${this.cardsUrl}/${encodeURIComponent(oracleId)}`);
    }

    searchByName(
        name: string,
        filters: CardSearchFilters = this.filters(),
    ): Observable<CardSearchResponse> {
        return this.search(this.cardsUrl, 'name', name, filters);
    }

    searchByFuzzyName(
        name: string,
        filters: CardSearchFilters = this.filters(),
    ): Observable<CardSearchResponse> {
        return this.search(`${this.cardsUrl}/fuzzy`, 'name', name, filters);
    }

    searchByPrompt(
        prompt: string,
        filters: CardSearchFilters = this.filters(),
        limit?: number,
    ): Observable<CardSearchResponse> {
        return this.search(`${this.cardsUrl}/vector`, 'prompt', prompt, filters, limit);
    }

    private search(
        url: string,
        parameter: 'name' | 'prompt',
        value: string,
        filters: CardSearchFilters,
        limit?: number,
    ): Observable<CardSearchResponse> {
        let params = new HttpParams().set(parameter, value);
        if (limit !== undefined) {
            params = params.set('limit', limit.toString());
        }
        for (const [key, values] of Object.entries(filters ?? {})) {
            for (const value of values ?? []) {
                const normalized = value.trim();
                if (normalized) params = params.append(key, normalized);
            }
        }
        return this.http.get<CardSearchResponse>(url, { params });
    }
}
