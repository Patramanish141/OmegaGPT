import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Angular-side equivalent of the backend's requireAuth middleware. It resolves
 * the session before deciding, so a hard refresh on /chat does not bounce the
 * user to /login before the cookie has been checked.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth
    .ensureSession()
    .pipe(
      map((authenticated) =>
        authenticated
          ? true
          : router.createUrlTree(['/login'], { queryParams: { redirect: state.url } }),
      ),
    );
};
