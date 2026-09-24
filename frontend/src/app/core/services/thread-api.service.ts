import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../api.tokens';
import { ChatMessage, Thread, ThreadSummary } from '../models/chat.models';

const WITH_CREDENTIALS = { withCredentials: true } as const;

/** REST half of the chat API: everything except the streamed reply itself. */
@Injectable({ providedIn: 'root' })
export class ThreadApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listThreads(): Observable<ThreadSummary[]> {
    return this.http
      .get<Thread[]>(`${this.baseUrl}/api/thread`, WITH_CREDENTIALS)
      .pipe(
        map((threads) =>
          threads.map(({ threadId, title, updatedAt }) => ({ threadId, title, updatedAt })),
        ),
      );
  }

  getMessages(threadId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(
      `${this.baseUrl}/api/thread/${encodeURIComponent(threadId)}`,
      WITH_CREDENTIALS,
    );
  }

  deleteThread(threadId: string): Observable<unknown> {
    return this.http.delete(
      `${this.baseUrl}/api/thread/${encodeURIComponent(threadId)}`,
      WITH_CREDENTIALS,
    );
  }
}
