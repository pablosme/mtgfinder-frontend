import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('../../feature/home/home').then((module) => module.Home),
    },
    {
        path: 'card',
        loadComponent: () =>
            import('../../feature/card-detail/card-detail').then((module) => module.CardDetail),
    },
    {
        path: 'search-syntax',
        loadComponent: () =>
            import('../../feature/search-syntax/search-syntax').then(
                (module) => module.SearchSyntax,
            ),
    },
];
