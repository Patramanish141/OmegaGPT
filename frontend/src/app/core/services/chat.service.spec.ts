import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ChatMessage, ThreadSummary } from '../models/chat.models';
import { FakeSocketService } from '../testing/fake-socket.service';
import { ChatService } from './chat.service';
import { SocketService } from './socket.service';
import { ThreadApiService } from './thread-api.service';

describe('ChatService', () => {
  let service: ChatService;
  let socket: FakeSocketService;
  let api: {
    listThreads: ReturnType<typeof vi.fn>;
    getMessages: ReturnType<typeof vi.fn>;
    deleteThread: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      listThreads: vi.fn().mockReturnValue(of([] as ThreadSummary[])),
      getMessages: vi.fn().mockReturnValue(of([] as ChatMessage[])),
      deleteThread: vi.fn().mockReturnValue(of({})),
    };

    TestBed.configureTestingModule({
      providers: [
        FakeSocketService,
        { provide: SocketService, useExisting: FakeSocketService },
        { provide: ThreadApiService, useValue: api },
      ],
    });

    socket = TestBed.inject(FakeSocketService);
    service = TestBed.inject(ChatService);
  });

  /** Drives one full turn up to (but not including) chat:done. */
  const beginTurn = (threadId = service.activeThreadId(), messageId = 'm1') => {
    service.send('Hello');
    socket.fire('chat:start', { threadId, messageId, title: 'Hello' });
    return messageId;
  };

  describe('sending', () => {
    it('shows the user message immediately and emits chat:send for the active thread', () => {
      const threadId = service.activeThreadId();

      service.send('  Hello there  ');

      expect(service.messages()).toEqual([{ role: 'user', content: 'Hello there' }]);
      expect(socket.lastEmitted()).toEqual({
        event: 'chat:send',
        payload: { threadId, message: 'Hello there' },
      });
    });

    it('ignores an empty or whitespace-only prompt', () => {
      service.send('   ');

      expect(service.messages()).toEqual([]);
      expect(socket.emitted).toHaveLength(0);
    });

    it('refuses a second prompt while a reply is still streaming', () => {
      beginTurn();
      socket.emitted.length = 0;

      service.send('too soon');

      expect(socket.emitted).toHaveLength(0);
      expect(service.messages()).toHaveLength(1);
    });
  });

  describe('receiving a stream', () => {
    it('accumulates tokens into streamingText without touching the stored messages', () => {
      const threadId = service.activeThreadId();
      const messageId = beginTurn(threadId);

      expect(service.isStreaming()).toBe(true);
      expect(service.streamingText()).toBe('');

      socket.fire('chat:token', { threadId, messageId, token: 'Hi' });
      socket.fire('chat:token', { threadId, messageId, token: ' there' });

      expect(service.streamingText()).toBe('Hi there');
      // Still just the user's own message until the turn ends.
      expect(service.messages()).toHaveLength(1);
    });

    it('ignores tokens belonging to a different turn', () => {
      const threadId = service.activeThreadId();
      const messageId = beginTurn(threadId);

      socket.fire('chat:token', { threadId, messageId, token: 'mine' });
      socket.fire('chat:token', { threadId, messageId: 'stale-turn', token: 'theirs' });

      expect(service.streamingText()).toBe('mine');
    });

    it('appends the finished reply and clears the streaming state on chat:done', () => {
      const threadId = service.activeThreadId();
      const messageId = beginTurn(threadId);
      socket.fire('chat:token', { threadId, messageId, token: 'Done' });

      socket.fire('chat:done', { threadId, messageId, content: 'Done', aborted: false });

      expect(service.isStreaming()).toBe(false);
      expect(service.streamingText()).toBeNull();
      expect(service.messages()).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Done' },
      ]);
    });

    it('keeps a stopped reply, since the server persisted the partial text', () => {
      const threadId = service.activeThreadId();
      const messageId = beginTurn(threadId);

      service.stop();
      socket.fire('chat:done', { threadId, messageId, content: 'part', aborted: true });

      expect(socket.emitted.some((e) => e.event === 'chat:stop')).toBe(true);
      expect(service.messages().at(-1)).toEqual({ role: 'assistant', content: 'part' });
    });

    it('does not leak a reply into a thread the user switched to mid-stream', () => {
      const original = service.activeThreadId();
      const messageId = beginTurn(original);

      api.getMessages.mockReturnValue(of([]));
      service.openThread('another-thread');
      socket.fire('chat:done', {
        threadId: original,
        messageId,
        content: 'late reply',
        aborted: false,
      });

      expect(service.messages()).toEqual([]);
      expect(service.isStreaming()).toBe(false);
    });

    it('hides tokens for a thread that is no longer on screen', () => {
      const original = service.activeThreadId();
      const messageId = beginTurn(original);

      service.openThread('another-thread');
      socket.fire('chat:token', { threadId: original, messageId, token: 'hidden' });

      expect(service.streamingText()).toBeNull();
    });
  });

  describe('errors', () => {
    it('rolls the optimistic message back when the turn never started', () => {
      service.send('rejected');

      socket.fire('chat:error', {
        threadId: service.activeThreadId(),
        messageId: null,
        code: 'BAD_REQUEST',
        message: 'threadId and message are required',
      });

      expect(service.messages()).toEqual([]);
      expect(service.error()).toBe('threadId and message are required');
    });

    it('keeps the user message when the model failed after the turn started', () => {
      const threadId = service.activeThreadId();
      const messageId = beginTurn(threadId);

      socket.fire('chat:error', {
        threadId,
        messageId,
        code: 'STREAM_FAILED',
        message: 'Failed to generate a reply',
      });

      // The server stored this message, so the client must keep showing it.
      expect(service.messages()).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(service.isStreaming()).toBe(false);
      expect(service.error()).toBe('Failed to generate a reply');
    });

    it('clears a dismissed error', () => {
      socket.fire('chat:error', {
        threadId: null,
        messageId: null,
        code: 'STREAM_FAILED',
        message: 'boom',
      });

      service.dismissError();

      expect(service.error()).toBeNull();
    });
  });

  describe('threads', () => {
    it('adds a brand new thread to the sidebar as soon as the turn starts', () => {
      const threadId = service.activeThreadId();
      beginTurn(threadId);

      expect(service.threads()).toEqual([{ threadId, title: 'Hello' }]);
    });

    it('moves an updated thread to the top without duplicating it', () => {
      const first: ThreadSummary = { threadId: 'a', title: 'A' };
      const second: ThreadSummary = { threadId: 'b', title: 'B' };
      api.listThreads.mockReturnValue(of([first, second]));
      service.loadThreads();

      socket.fire('thread:updated', {
        threadId: 'b',
        title: 'B updated',
        updatedAt: '2026-09-24T00:00:00.000Z',
      });

      expect(service.threads().map((t) => t.threadId)).toEqual(['b', 'a']);
      expect(service.threads()[0].title).toBe('B updated');
    });

    it('loads a thread history when one is opened', () => {
      const history: ChatMessage[] = [
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'reply' },
      ];
      api.getMessages.mockReturnValue(of(history));

      service.openThread('thread-42');

      expect(api.getMessages).toHaveBeenCalledWith('thread-42');
      expect(service.activeThreadId()).toBe('thread-42');
      expect(service.messages()).toEqual(history);
      expect(service.loading()).toBe(false);
    });

    it('surfaces a failure to open a thread', () => {
      api.getMessages.mockReturnValue(throwError(() => new Error('404')));

      service.openThread('missing');

      expect(service.error()).toBe('Could not open that conversation.');
      expect(service.loading()).toBe(false);
    });

    it('drops a deleted thread and starts a fresh one when it was active', () => {
      api.listThreads.mockReturnValue(of([{ threadId: 'x', title: 'X' }]));
      service.loadThreads();
      api.getMessages.mockReturnValue(of([{ role: 'user', content: 'hi' } as ChatMessage]));
      service.openThread('x');

      service.deleteThread('x');

      expect(service.threads()).toEqual([]);
      expect(service.activeThreadId()).not.toBe('x');
      expect(service.messages()).toEqual([]);
    });

    it('starts each new chat on its own thread id', () => {
      const first = service.activeThreadId();
      service.startNewThread();

      expect(service.activeThreadId()).not.toBe(first);
      expect(service.messages()).toEqual([]);
    });
  });

  it('opens the socket and loads threads on start', () => {
    service.start();

    expect(socket.connectCalls).toBe(1);
    expect(api.listThreads).toHaveBeenCalled();
  });

  it('drops all state and the connection on reset', () => {
    beginTurn();
    service.reset();

    expect(socket.disconnectCalls).toBe(1);
    expect(service.threads()).toEqual([]);
    expect(service.messages()).toEqual([]);
    expect(service.isStreaming()).toBe(false);
  });
});
