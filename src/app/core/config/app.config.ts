import {
    ApplicationConfig,
    inject,
    provideAppInitializer,
    isDevMode,
    provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';

import { firstValueFrom } from 'rxjs';

import { routes } from '../routing/app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { authInterceptor } from '../auth/auth-interceptor';
import { TranslocoHttpLoader } from '../i18n/transloco-http-loader';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../i18n/supported-languages';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
        provideTransloco({
            config: {
                availableLangs: SUPPORTED_LANGUAGES.map((language) => language.code),
                defaultLang: DEFAULT_LANGUAGE,
                fallbackLang: DEFAULT_LANGUAGE,
                reRenderOnLangChange: true,
                prodMode: !isDevMode(),
            },
            loader: TranslocoHttpLoader,
        }),
        provideAppInitializer(() => firstValueFrom(inject(TranslocoService).load('en'))),
        provideRouter(
            routes,
            withComponentInputBinding(),
            withInMemoryScrolling({ anchorScrolling: 'enabled' }),
        ),
        provideClientHydration(withEventReplay()),
    ],
};
