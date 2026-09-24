import { InjectionToken } from '@angular/core';

/**
 * Origin the REST API and the socket live on. Empty means "same origin", which
 * is how both `ng serve` (via proxy.conf.json) and the nginx deployment are
 * set up. Override the provider to point a build at a separate API host.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '',
});
