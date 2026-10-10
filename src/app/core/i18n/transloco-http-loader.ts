import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
    private readonly http = inject(HttpClient);

    getTranslation(lang: string): Observable<Translation> {
        // Keep URLs relative to the document base, including during Angular SSR.
        return this.http.get<Translation>(`i18n/${lang}.json`);
    }
}
