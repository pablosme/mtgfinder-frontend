import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../environment/environment';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
    const apiBaseUrl = environment.apiBaseUrl.replace(/\/+$/, '');
    const isApiRequest =
        !!apiBaseUrl &&
        (request.url === apiBaseUrl ||
            request.url.startsWith(`${apiBaseUrl}/`) ||
            request.url.startsWith(`${apiBaseUrl}?`) ||
            request.url.startsWith(`${apiBaseUrl}#`));

    if (!isApiRequest || !environment.apiToken) {
        return next(request);
    }

    return next(
        request.clone({
            setHeaders: { 'X-API-Key': environment.apiToken },
        }),
    );
};
