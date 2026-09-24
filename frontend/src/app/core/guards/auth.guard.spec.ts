import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';
import { guestGuard } from './guest.guard';

describe('route guards', () => {
  let ensureSession: ReturnType<typeof vi.fn>;
  let router: Router;

  const route = {} as ActivatedRouteSnapshot;
  const stateFor = (url: string) => ({ url }) as RouterStateSnapshot;

  /** Guards return an Observable here, so unwrap it for the assertions. */
  const run = (guard: typeof authGuard, url = '/') =>
    new Promise<boolean | UrlTree>((resolve) => {
      const result = TestBed.runInInjectionContext(() => guard(route, stateFor(url)));
      (result as Observable<boolean | UrlTree>).subscribe(resolve);
    });

  beforeEach(() => {
    ensureSession = vi.fn();

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { ensureSession } }],
    });

    router = TestBed.inject(Router);
  });

  describe('authGuard', () => {
    it('lets a signed-in user through', async () => {
      ensureSession.mockReturnValue(of(true));

      await expect(run(authGuard)).resolves.toBe(true);
    });

    it('redirects a signed-out user to the login screen', async () => {
      ensureSession.mockReturnValue(of(false));

      const result = await run(authGuard, '/');

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toContain('/login');
    });

    it('remembers where the user was headed so login can return them', async () => {
      ensureSession.mockReturnValue(of(false));

      const result = await run(authGuard, '/some/deep/page');

      expect(router.serializeUrl(result as UrlTree)).toContain(
        'redirect=%2Fsome%2Fdeep%2Fpage',
      );
    });

    it('waits for the session probe instead of deciding on stale state', async () => {
      // The probe is the single source of truth; the guard must consult it
      // every time rather than reading a cached flag.
      ensureSession.mockReturnValue(of(true));

      await run(authGuard);

      expect(ensureSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('guestGuard', () => {
    it('lets a signed-out visitor reach the login screen', async () => {
      ensureSession.mockReturnValue(of(false));

      await expect(run(guestGuard, '/login')).resolves.toBe(true);
    });

    it('sends an already signed-in user back to the chat', async () => {
      ensureSession.mockReturnValue(of(true));

      const result = await run(guestGuard, '/login');

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/');
    });
  });
});
