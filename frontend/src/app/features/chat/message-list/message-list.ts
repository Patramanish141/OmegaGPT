import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  viewChild,
} from '@angular/core';

import { ChatMessage } from '../../../core/models/chat.models';
import { MarkdownPipe } from '../../../shared/markdown.pipe';

/**
 * Presentational transcript. Stored messages and the in-flight reply are
 * rendered separately so the streaming bubble can carry a caret.
 */
@Component({
  selector: 'app-message-list',
  templateUrl: './message-list.html',
  imports: [MarkdownPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageList {
  readonly messages = input.required<readonly ChatMessage[]>();
  readonly streamingText = input<string | null>(null);
  readonly isNewChat = input(false);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Keep the newest tokens in view as they arrive, after the DOM updates.
    afterRenderEffect(() => {
      this.messages();
      this.streamingText();
      const element = this.scroller()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}
