import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { authInterceptor } from '../auth/auth-interceptor';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
        provideRouter(
            routes,
            withComponentInputBinding(),
            withInMemoryScrolling({ anchorScrolling: 'enabled' }),
        ),
        provideClientHydration(withEventReplay()),
    ],
};
