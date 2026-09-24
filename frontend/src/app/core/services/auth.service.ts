import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';

import { API_BASE_URL } from '../api.tokens';
import {
  AuthResponse,
  AuthResult,
  Credentials,
  SignupDetails,
  VerifyResponse,
} from '../models/auth.models';

/** The JWT lives in an httpOnly cookie, so every call opts into credentials. */
const WITH_CREDENTIALS = { withCredentials: true } as const;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly usernameSignal = signal<string | null>(null);
  private readonly sessionCheckedSignal = signal(false);

  /** Null when signed out. */
  readonly username = this.usernameSignal.asReadonly();
  readonly sessionChecked = this.sessionCheckedSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.usernameSignal() !== null);

  /** In-flight session probe, shared so concurrent guards make one request. */
  private probe: Observable<boolean> | null = null;

  /**
   * Resolves the current session, hitting the server at most once per page
   * load. Route guards call this instead of reading `isAuthenticated`
   * directly, which would be false on a hard refresh before the probe lands.
   */
  ensureSession(): Observable<boolean> {
    if (this.sessionCheckedSignal()) {
      return of(this.isAuthenticated());
    }
    this.probe ??= this.http
      .post<VerifyResponse>(`${this.baseUrl}/api/auth/verify`, {}, WITH_CREDENTIALS)
      .pipe(
        map((res) => (res.status ? res.username ?? res.user ?? null : null)),
        catchError(() => of(null)),
        tap((name) => {
          this.usernameSignal.set(name ?? null);
          this.sessionCheckedSignal.set(true);
        }),
        map((name) => name !== null),
        finalize(() => (this.probe = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.probe;
  }

  login(credentials: Credentials): Observable<AuthResult> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/api/auth/login`, credentials, WITH_CREDENTIALS)
      .pipe(map((res) => this.adopt(res)));
  }

  signup(details: SignupDetails): Observable<AuthResult> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/api/auth/signup`, details, WITH_CREDENTIALS)
      .pipe(map((res) => this.adopt(res)));
  }

  logout(): Observable<void> {
    return this.http.post(`${this.baseUrl}/api/auth/logout`, {}, WITH_CREDENTIALS).pipe(
      catchError(() => of(null)),
      tap(() => this.clearSession()),
      map(() => undefined),
    );
  }

  /** Drops the local session without calling the server. */
  clearSession(): void {
    this.usernameSignal.set(null);
    this.sessionCheckedSignal.set(true);
  }

  /**
   * `/login` returns `user` as a plain username string while `/signup` returns
   * the user object; both also send a top-level `username`. This flattens the
   * three shapes into one.
   */
  private adopt(res: AuthResponse): AuthResult {
    const username =
      res.username ?? (typeof res.user === 'string' ? res.user : res.user?.username) ?? null;

    if (res.success && username) {
      this.usernameSignal.set(username);
      this.sessionCheckedSignal.set(true);
      return { success: true, message: res.message, username };
    }

    return { success: false, message: res.message || 'Something went wrong', username: null };
  }
}
