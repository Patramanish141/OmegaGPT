import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { ChatService } from '../../../core/services/chat.service';
import { ChatWindow } from '../chat-window/chat-window';
import { Sidebar } from '../sidebar/sidebar';

/**
 * Container for the chat screen. It is the only component here that talks to
 * services; Sidebar and ChatWindow are driven entirely by its inputs.
 */
@Component({
  selector: 'app-chat-page',
  templateUrl: './chat-page.html',
  imports: [Sidebar, ChatWindow],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPage implements OnInit {
  private readonly chat = inject(ChatService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly username = this.auth.username;
  readonly threads = this.chat.threads;
  readonly messages = this.chat.messages;
  readonly activeThreadId = this.chat.activeThreadId;
  readonly streamingText = this.chat.streamingText;
  readonly isStreaming = this.chat.isStreaming;
  readonly isNewChat = this.chat.isNewChat;
  readonly loading = this.chat.loading;
  readonly error = this.chat.error;

  ngOnInit(): void {
    this.chat.start();
  }

  onSend(message: string): void {
    this.chat.send(message);
  }

  onStop(): void {
    this.chat.stop();
  }

  onNewChat(): void {
    this.chat.startNewThread();
  }

  onSelectThread(threadId: string): void {
    this.chat.openThread(threadId);
  }

  onDeleteThread(threadId: string): void {
    this.chat.deleteThread(threadId);
  }

  onDismissError(): void {
    this.chat.dismissError();
  }

  onLogout(): void {
    this.chat.reset();
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
