export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  timestamp?: string;
}

/** What the sidebar needs to list a conversation. */
export interface ThreadSummary {
  threadId: string;
  title: string;
  updatedAt?: string;
}

/** A full thread document as returned by GET /api/thread. */
export interface Thread extends ThreadSummary {
  _id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * WebSocket protocol — see README.md "WebSocket message protocol".
 * ------------------------------------------------------------------ */

export type ChatErrorCode = 'BAD_REQUEST' | 'STREAM_IN_PROGRESS' | 'STREAM_FAILED';

export interface ChatSendPayload {
  threadId: string;
  message: string;
}

export interface SessionReadyPayload {
  userId: string;
  username: string;
}

export interface ChatStartPayload {
  threadId: string;
  messageId: string;
  title: string;
}

export interface ChatTokenPayload {
  threadId: string;
  messageId: string;
  token: string;
}

export interface ChatDonePayload {
  threadId: string;
  messageId: string;
  content: string;
  aborted: boolean;
}

export interface ChatErrorPayload {
  threadId: string | null;
  messageId: string | null;
  code: ChatErrorCode;
  message: string;
}

export interface ThreadUpdatedPayload {
  threadId: string;
  title: string;
  updatedAt: string;
}

export interface ServerToClientEvents {
  'session:ready': (payload: SessionReadyPayload) => void;
  'chat:start': (payload: ChatStartPayload) => void;
  'chat:token': (payload: ChatTokenPayload) => void;
  'chat:done': (payload: ChatDonePayload) => void;
  'chat:error': (payload: ChatErrorPayload) => void;
  'thread:updated': (payload: ThreadUpdatedPayload) => void;
}

export interface ClientToServerEvents {
  'chat:send': (payload: ChatSendPayload) => void;
  'chat:stop': () => void;
}
