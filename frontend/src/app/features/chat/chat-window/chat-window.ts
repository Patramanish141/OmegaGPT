import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ChatMessage } from '../../../core/models/chat.models';
import { ChatInput } from '../chat-input/chat-input';
import { MessageList } from '../message-list/message-list';
import { Navbar } from '../navbar/navbar';

/**
 * Presentational chat pane. Holds no state of its own: everything it shows is
 * an input and everything it does is an output.
 */
@Component({
  selector: 'app-chat-window',
  templateUrl: './chat-window.html',
  imports: [Navbar, MessageList, ChatInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWindow {
  readonly username = input<string | null>(null);
  readonly messages = input.required<readonly ChatMessage[]>();
  readonly streamingText = input<string | null>(null);
  readonly isNewChat = input(false);
  readonly isStreaming = input(false);
  readonly loading = input(false);
  readonly error = input<string | null>(null);

  readonly send = output<string>();
  readonly stop = output<void>();
  readonly logout = output<void>();
  readonly dismissError = output<void>();
}
