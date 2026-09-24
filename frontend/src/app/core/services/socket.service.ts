import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Socket, io } from 'socket.io-client';

import { API_BASE_URL } from '../api.tokens';
import { ClientToServerEvents, ServerToClientEvents } from '../models/chat.models';

export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'unauthorized';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Thin reactive wrapper around socket.io-client. It owns the connection
 * lifecycle and turns server events into Observables; it knows nothing about
 * chat semantics, which live in ChatService.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly baseUrl = inject(API_BASE_URL);

  private socket: AppSocket | null = null;

  private readonly statusSignal = signal<SocketStatus>('idle');
  readonly status = this.statusSignal.asReadonly();

  /**
   * Opens the connection if it is not already open. The handshake carries the
   * httpOnly JWT cookie, so there is no token to pass here.
   */
  connect(): void {
    const socket = this.ensureSocket();
    if (socket.connected) return;
    this.statusSignal.set('connecting');
    socket.connect();
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.statusSignal.set('disconnected');
  }

  emit<K extends keyof ClientToServerEvents>(
    event: K,
    ...args: Parameters<ClientToServerEvents[K]>
  ): void {
    this.ensureSocket().emit(event, ...args);
  }

  /**
   * Stream of payloads for one server event. Unsubscribing detaches the
   * listener, so components and services do not leak handlers across reloads.
   */
  on<K extends keyof ServerToClientEvents>(
    event: K,
  ): Observable<Parameters<ServerToClientEvents[K]>[0]> {
    return new Observable((subscriber) => {
      const socket = this.ensureSocket();
      const handler = (payload: Parameters<ServerToClientEvents[K]>[0]) =>
        subscriber.next(payload);

      socket.on(event, handler as never);
      return () => {
        socket.off(event, handler as never);
      };
    });
  }

  private ensureSocket(): AppSocket {
    if (this.socket) return this.socket;

    // An empty base URL means same origin; socket.io reads '/' as the default
    // namespace on the page's own host, which is what nginx and `ng serve`
    // (through proxy.conf.json) both serve.
    this.socket = io(this.baseUrl || '/', {
      path: '/socket.io',
      withCredentials: true,
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => this.statusSignal.set('connected'));
    this.socket.on('disconnect', () => this.statusSignal.set('disconnected'));
    this.socket.on('connect_error', (err: Error) => {
      // The handshake guard rejects with exactly this message.
      this.statusSignal.set(err.message === 'Unauthorized' ? 'unauthorized' : 'disconnected');
    });

    return this.socket;
  }
}
