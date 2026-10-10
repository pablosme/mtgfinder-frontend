import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

export const routes: Routes = [
    {
        path: '',
        providers: [provideTranslocoScope({ scope: 'home', alias: 'home' })],
        loadComponent: () => import('../../feature/home/home').then((module) => module.Home),
    },
    {
        path: 'card',
        providers: [provideTranslocoScope({ scope: 'card-detail', alias: 'cardDetail' })],
        loadComponent: () =>
            import('../../feature/card-detail/card-detail').then((module) => module.CardDetail),
    },
    {
        path: 'search-syntax',
        providers: [provideTranslocoScope({ scope: 'search-syntax', alias: 'searchSyntax' })],
        loadComponent: () =>
            import('../../feature/search-syntax/search-syntax').then(
                (module) => module.SearchSyntax,
            ),
    },
];
