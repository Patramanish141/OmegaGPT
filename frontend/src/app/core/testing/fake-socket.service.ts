import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { ClientToServerEvents, ServerToClientEvents } from '../models/chat.models';
import { SocketStatus } from '../services/socket.service';

/**
 * Drop-in SocketService for tests: records what was emitted and lets a spec
 * push server events by hand, with no real connection anywhere.
 */
@Injectable()
export class FakeSocketService {
  readonly statusSignal = signal<SocketStatus>('idle');
  readonly status = this.statusSignal.asReadonly();

  readonly emitted: { event: string; payload?: unknown }[] = [];
  connectCalls = 0;
  disconnectCalls = 0;

  private readonly subjects = new Map<string, Subject<unknown>>();

  connect(): void {
    this.connectCalls++;
    this.statusSignal.set('connected');
  }

  disconnect(): void {
    this.disconnectCalls++;
    this.statusSignal.set('disconnected');
  }

  emit<K extends keyof ClientToServerEvents>(
    event: K,
    ...args: Parameters<ClientToServerEvents[K]>
  ): void {
    this.emitted.push({ event, payload: args[0] });
  }

  on<K extends keyof ServerToClientEvents>(
    event: K,
  ): Observable<Parameters<ServerToClientEvents[K]>[0]> {
    return this.subject(event).asObservable() as Observable<
      Parameters<ServerToClientEvents[K]>[0]
    >;
  }

  /** Pushes a server event to every current subscriber. */
  fire<K extends keyof ServerToClientEvents>(
    event: K,
    payload: Parameters<ServerToClientEvents[K]>[0],
  ): void {
    this.subject(event).next(payload);
  }

  lastEmitted(): { event: string; payload?: unknown } | undefined {
    return this.emitted.at(-1);
  }

  private subject(event: string): Subject<unknown> {
    let subject = this.subjects.get(event);
    if (!subject) {
      subject = new Subject<unknown>();
      this.subjects.set(event, subject);
    }
    return subject;
  }
}
