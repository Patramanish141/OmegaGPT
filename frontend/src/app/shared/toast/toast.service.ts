import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const DISMISS_AFTER_MS = 4000;

/** Minimal stand-in for SigmaGPT's react-toastify notifications. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  private readonly toastsSignal = signal<Toast[]>([]);
  readonly toasts = this.toastsSignal.asReadonly();

  success(text: string): void {
    this.push('success', text);
  }

  error(text: string): void {
    this.push('error', text);
  }

  dismiss(id: number): void {
    this.toastsSignal.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private push(kind: ToastKind, text: string): void {
    const id = this.nextId++;
    this.toastsSignal.update((toasts) => [...toasts, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), DISMISS_AFTER_MS);
  }
}
