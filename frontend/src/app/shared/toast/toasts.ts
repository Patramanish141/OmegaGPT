import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from './toast.service';

/** Presentational host that renders whatever ToastService is holding. */
@Component({
  selector: 'app-toasts',
  templateUrl: './toasts.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toasts {
  private readonly toastService = inject(ToastService);
  readonly toasts = this.toastService.toasts;

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
