import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Injectable } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTransloco, Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';

import { Home } from './home';

@Injectable()
class EmptyTranslocoLoader implements TranslocoLoader {
    getTranslation(): Observable<Translation> {
        return of({});
    }
}

describe('Home', () => {
    let component: Home;
    let fixture: ComponentFixture<Home>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [Home],
            providers: [
                provideHttpClient(),
                provideRouter([]),
                provideTransloco({
                    config: { availableLangs: ['en'], defaultLang: 'en' },
                    loader: EmptyTranslocoLoader,
                }),
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(Home);
        component = fixture.componentInstance;
        await fixture.whenStable();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
