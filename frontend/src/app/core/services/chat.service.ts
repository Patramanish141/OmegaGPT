import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { v4 as uuidv4 } from 'uuid';

import {
  ChatDonePayload,
  ChatErrorPayload,
  ChatMessage,
  ChatStartPayload,
  ChatTokenPayload,
  ThreadSummary,
  ThreadUpdatedPayload,
} from '../models/chat.models';
import { SocketService } from './socket.service';
import { ThreadApiService } from './thread-api.service';

interface ActiveStream {
  threadId: string;
  messageId: string;
  content: string;
}

/**
 * Owns all chat state. Threads and history come over REST; the assistant reply
 * arrives token by token over the socket and is only appended to `messages`
 * once the turn ends, so a partial reply never looks like a stored one.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly socket = inject(SocketService);
  private readonly api = inject(ThreadApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly threadsSignal = signal<ThreadSummary[]>([]);
  private readonly messagesSignal = signal<ChatMessage[]>([]);
  private readonly activeThreadIdSignal = signal<string>(uuidv4());
  private readonly streamSignal = signal<ActiveStream | null>(null);
  private readonly errorSignal = signal<string | null>(null);
  private readonly loadingSignal = signal(false);

  readonly threads = this.threadsSignal.asReadonly();
  readonly messages = this.messagesSignal.asReadonly();
  readonly activeThreadId = this.activeThreadIdSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  readonly isStreaming = computed(() => this.streamSignal() !== null);

  /** Text streamed so far, or null when nothing is streaming into this thread. */
  readonly streamingText = computed(() => {
    const stream = this.streamSignal();
    return stream && stream.threadId === this.activeThreadIdSignal() ? stream.content : null;
  });

  /** True before the first message of a conversation, for the empty state. */
  readonly isNewChat = computed(
    () => this.messagesSignal().length === 0 && this.streamSignal() === null,
  );

  constructor() {
    this.listen();

    // A dropped connection kills any in-flight turn; surface that instead of
    // leaving a half-written reply on screen forever.
    effect(() => {
      const status = this.socket.status();
      if ((status === 'disconnected' || status === 'unauthorized') && untracked(this.streamSignal)) {
        this.finishStream();
        this.errorSignal.set('Connection lost before the reply finished.');
      }
    });
  }

  /** Opens the socket and loads the thread list. Called by the chat container. */
  start(): void {
    this.socket.connect();
    this.loadThreads();
  }

  loadThreads(): void {
    this.api
      .listThreads()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (threads) => this.threadsSignal.set(threads),
        error: () => this.errorSignal.set('Could not load your conversations.'),
      });
  }

  openThread(threadId: string): void {
    if (threadId === this.activeThreadIdSignal() && this.messagesSignal().length > 0) return;

    this.activeThreadIdSignal.set(threadId);
    this.messagesSignal.set([]);
    this.loadingSignal.set(true);

    this.api
      .getMessages(threadId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (messages) => {
          this.messagesSignal.set(messages);
          this.loadingSignal.set(false);
        },
        error: () => {
          this.loadingSignal.set(false);
          this.errorSignal.set('Could not open that conversation.');
        },
      });
  }

  startNewThread(): void {
    this.activeThreadIdSignal.set(uuidv4());
    this.messagesSignal.set([]);
    this.errorSignal.set(null);
  }

  deleteThread(threadId: string): void {
    this.api
      .deleteThread(threadId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.threadsSignal.update((threads) =>
            threads.filter((thread) => thread.threadId !== threadId),
          );
          if (threadId === this.activeThreadIdSignal()) this.startNewThread();
        },
        error: () => this.errorSignal.set('Could not delete that conversation.'),
      });
  }

  /** Sends a prompt. The user's own message is shown immediately. */
  send(text: string): void {
    const message = text.trim();
    if (!message || this.isStreaming()) return;

    this.errorSignal.set(null);
    this.messagesSignal.update((messages) => [...messages, { role: 'user', content: message }]);
    this.socket.emit('chat:send', { threadId: this.activeThreadIdSignal(), message });
  }

  /** Asks the server to cut the reply short; what arrived so far is kept. */
  stop(): void {
    if (this.isStreaming()) this.socket.emit('chat:stop');
  }

  dismissError(): void {
    this.errorSignal.set(null);
  }

  /** Clears every trace of the session, for logout. */
  reset(): void {
    this.socket.disconnect();
    this.threadsSignal.set([]);
    this.messagesSignal.set([]);
    this.streamSignal.set(null);
    this.errorSignal.set(null);
    this.activeThreadIdSignal.set(uuidv4());
  }

  private listen(): void {
    this.socket
      .on('chat:start')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload: ChatStartPayload) => {
        this.streamSignal.set({
          threadId: payload.threadId,
          messageId: payload.messageId,
          content: '',
        });
        // Show the thread in the sidebar as soon as it exists server-side.
        this.upsertThread({ threadId: payload.threadId, title: payload.title });
      });

    this.socket
      .on('chat:token')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload: ChatTokenPayload) => {
        this.streamSignal.update((stream) =>
          stream && stream.messageId === payload.messageId
            ? { ...stream, content: stream.content + payload.token }
            : stream,
        );
      });

    this.socket
      .on('chat:done')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload: ChatDonePayload) => {
        if (payload.content && payload.threadId === this.activeThreadIdSignal()) {
          this.messagesSignal.update((messages) => [
            ...messages,
            { role: 'assistant', content: payload.content },
          ]);
        }
        this.finishStream();
      });

    this.socket
      .on('chat:error')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload: ChatErrorPayload) => {
        // The server only persists the user's message once a turn actually
        // starts, so roll the optimistic bubble back when it never did.
        if (payload.code !== 'STREAM_FAILED') this.dropTrailingUserMessage();
        this.finishStream();
        this.errorSignal.set(payload.message);
      });

    this.socket
      .on('thread:updated')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload: ThreadUpdatedPayload) => this.upsertThread(payload));
  }

  private finishStream(): void {
    this.streamSignal.set(null);
  }

  private dropTrailingUserMessage(): void {
    this.messagesSignal.update((messages) =>
      messages.at(-1)?.role === 'user' ? messages.slice(0, -1) : messages,
    );
  }

  /** Inserts or refreshes a thread and moves it to the top, newest first. */
  private upsertThread(summary: ThreadSummary): void {
    this.threadsSignal.update((threads) => [
      summary,
      ...threads.filter((thread) => thread.threadId !== summary.threadId),
    ]);
  }
}
