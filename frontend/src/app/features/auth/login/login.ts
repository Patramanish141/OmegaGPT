import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';

/** Container for the sign-in screen. */
@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly showPassword = signal(false);
  readonly loading = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  togglePassword(): void {
    this.showPassword.update((shown) => !shown);
  }

  submit(): void {
    if (this.form.invalid || this.loading()) return;

    this.loading.set(true);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: (result) => {
        this.loading.set(false);
        if (result.success) {
          this.toast.success(result.message);
          this.router.navigate(['/']);
        } else {
          // A wrong password comes back as HTTP 200 with a message, not an error.
          this.toast.error(result.message);
          this.form.patchValue({ password: '' });
        }
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not reach the server. Try again.');
      },
    });
  }
}
