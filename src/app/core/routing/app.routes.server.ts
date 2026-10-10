import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
    {
        path: 'card',
        renderMode: RenderMode.Server,
    },
    {
        path: '**',
        renderMode: RenderMode.Prerender,
    },
];
