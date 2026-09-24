import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/** Presentational prompt box. Owns only the draft text. */
@Component({
  selector: 'app-chat-input',
  templateUrl: './chat-input.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatInput {
  readonly streaming = input(false);
  readonly send = output<string>();
  readonly stop = output<void>();

  readonly draft = signal('');

  onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  submit(): void {
    const text = this.draft().trim();
    if (!text || this.streaming()) return;
    this.send.emit(text);
    this.draft.set('');
  }
}
