import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideTransloco, Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { Injectable } from '@angular/core';

import { CardDetail } from './card-detail';

@Injectable()
class EmptyTranslocoLoader implements TranslocoLoader {
    getTranslation(): Observable<Translation> {
        return of({});
    }
}

describe('CardDetail', () => {
    let component: CardDetail;
    let fixture: ComponentFixture<CardDetail>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [CardDetail],
            providers: [
                provideRouter([]),
                provideHttpClient(),
                provideTransloco({
                    config: { availableLangs: ['en'], defaultLang: 'en' },
                    loader: EmptyTranslocoLoader,
                }),
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(CardDetail);
        component = fixture.componentInstance;
        await fixture.whenStable();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
