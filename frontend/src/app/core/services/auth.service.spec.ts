import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('adopts the session returned by a successful login', () => {
    const results: boolean[] = [];
    service.login({ email: 'a@b.c', password: 'pw' }).subscribe((r) => results.push(r.success));

    const req = http.expectOne('/api/auth/login');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ message: 'User logged in successfully', success: true, user: 'alice' });

    expect(results).toEqual([true]);
    expect(service.username()).toBe('alice');
    expect(service.isAuthenticated()).toBe(true);
  });

  // The backend answers a wrong password with HTTP 200 and no success flag.
  it('treats a 200 with no success flag as a failed login', () => {
    let message = '';
    service
      .login({ email: 'a@b.c', password: 'nope' })
      .subscribe((r) => (message = r.message));

    http.expectOne('/api/auth/login').flush({ message: 'Incorrect password or email' });

    expect(message).toBe('Incorrect password or email');
    expect(service.isAuthenticated()).toBe(false);
  });

  it('reads the username out of the object shape signup returns', () => {
    service.signup({ email: 'a@b.c', password: 'pw', username: 'bob' }).subscribe();

    http
      .expectOne('/api/auth/signup')
      .flush({ message: 'ok', success: true, user: { username: 'bob', email: 'a@b.c' } });

    expect(service.username()).toBe('bob');
  });

  it('probes the session once and reuses the answer', async () => {
    // Two guards resolving at once must share one request, so both subscribe
    // before the response is flushed.
    const first = firstValue(service.ensureSession());
    const second = firstValue(service.ensureSession());

    http.expectOne('/api/auth/verify').flush({ status: true, username: 'alice' });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);

    // A third call must not hit the network again.
    await expect(firstValue(service.ensureSession())).resolves.toBe(true);
    http.verify();
  });

  it('reports no session when the cookie is missing or stale', async () => {
    const probe = firstValue(service.ensureSession());
    http.expectOne('/api/auth/verify').flush({ status: false });

    await expect(probe).resolves.toBe(false);
    expect(service.username()).toBeNull();
    expect(service.sessionChecked()).toBe(true);
  });

  it('clears the session on logout even if the request fails', async () => {
    service.login({ email: 'a@b.c', password: 'pw' }).subscribe();
    http.expectOne('/api/auth/login').flush({ message: 'ok', success: true, user: 'alice' });

    const done = firstValue(service.logout());
    http.expectOne('/api/auth/logout').error(new ProgressEvent('network error'));

    await done;
    expect(service.username()).toBeNull();
  });
});

/** Promise for the first value an Observable emits. */
function firstValue<T>(source: {
  subscribe: (o: { next: (v: T) => void; error: (e: unknown) => void }) => unknown;
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    source.subscribe({ next: resolve, error: reject });
  });
}
