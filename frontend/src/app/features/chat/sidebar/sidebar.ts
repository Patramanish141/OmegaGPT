import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ThreadSummary } from '../../../core/models/chat.models';

/** Presentational thread list. Every action is delegated upwards. */
@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  readonly threads = input.required<readonly ThreadSummary[]>();
  readonly activeThreadId = input<string | null>(null);

  readonly newChat = output<void>();
  readonly selectThread = output<string>();
  readonly deleteThread = output<string>();

  onDelete(event: Event, threadId: string): void {
    event.stopPropagation(); // do not also select the thread being deleted
    this.deleteThread.emit(threadId);
  }
}
