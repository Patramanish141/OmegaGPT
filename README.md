# OmegaGPT

An AI chat application with JWT auth, persistent multi-thread history, and
assistant replies streamed **token by token over a WebSocket**.

---

## Try it

**Live:** <http://ec2-16-171-166-254.eu-north-1.compute.amazonaws.com>

Log in with the demo account — no signup needed:

| Field | Value |
|---|---|
| Email | `demo@omegachat.dev` |
| Password | `Demo@1234` |

---

## Tech stack (MEAN)

| Layer | Technology |
|---|---|
| **M**ongoDB | MongoDB Atlas via Mongoose 9 |
| **E**xpress | Express 5, Socket.IO 4, `jsonwebtoken`, `bcryptjs`, `cookie-parser`, `cors` |
| **A**ngular | Angular 22 (standalone, zoneless, signals), RxJS 7, `socket.io-client`, `marked` + `highlight.js` |
| **N**ode.js | Node 24, OpenAI SDK 6 |
| Delivery | GitHub Actions on a self-hosted EC2 runner, PM2, nginx |

---

## Architecture

```
                    ┌──────────────────────── nginx (:80) ────────────────────────┐
                    │                                                             │
  browser ──────────┤  /            →  /var/www/omegachat      (Angular bundle)   │
                    │  /api/…       →  proxy  127.0.0.1:8080   (REST)             │
                    │  /socket.io/  →  proxy  127.0.0.1:8080   (HTTP 101 upgrade) │
                    └─────────────────────────────┬───────────────────────────────┘
                                                  │
                                    ┌─────────────┴─────────────┐
                                    │  Express 5 + Socket.IO    │
                                    │  (one http.Server, :8080) │
                                    └─────────────┬─────────────┘
                                      ┌───────────┴───────────┐
                                  MongoDB Atlas          OpenAI API
                                  (users, threads)    (streamed chunks)
```

Express and Socket.IO share **one** `http.Server`, so the whole API lives behind
a single port and nginx needs exactly one upgrade-aware location.

### Frontend structure

Smart (container) components talk to services; presentational components only
receive inputs and emit outputs.

```
src/app/
├── core/
│   ├── api.tokens.ts              API_BASE_URL injection token ('' = same origin)
│   ├── models/                    ChatMessage, Thread, and the socket event contracts
│   ├── guards/
│   │   ├── auth.guard.ts          protects the chat route
│   │   └── guest.guard.ts         keeps signed-in users off /login and /signup
│   └── services/
│       ├── auth.service.ts        login / signup / logout / session probe (HttpClient)
│       ├── socket.service.ts      connection lifecycle, events → Observables
│       ├── thread-api.service.ts  list / read / delete threads (HttpClient)
│       └── chat.service.ts        all chat state; the only consumer of the socket
├── shared/
│   ├── markdown.ts / .pipe.ts     marked + highlight.js rendering
│   └── toast/                     notifications
└── features/
    ├── auth/login, auth/signup    SMART  — reactive forms over AuthService
    └── chat/
        ├── chat-page/             SMART  — the only component here that injects services
        ├── sidebar/               presentational — thread list
        ├── chat-window/           presentational — composes the three below
        ├── navbar/                presentational — user chip + logout menu
        ├── message-list/          presentational — transcript + streaming bubble
        └── chat-input/            presentational — prompt box, send / stop
```

`ChatService` is the single source of truth. It keeps state in **signals**
(`messages`, `threads`, `activeThreadId`, `streamingText`, `isStreaming`), which
matters because Angular 22 runs **zoneless** — signals are what drive change
detection here, not `zone.js`.

---

## WebSocket message protocol

**Transport** — Socket.IO 4 at `/socket.io`, default namespace `/`.

**Handshake / authentication.** The connection is authorised by the same
`token` JWT cookie the REST routes issue, sent automatically because the client
connects `withCredentials: true`. A server-side middleware verifies the JWT and
loads the user before the connection is accepted. Non-browser clients may pass
the same JWT as `auth: { token }` instead. A failed handshake is rejected with
`connect_error` carrying the message `Unauthorized`.

### Client → server

| Event | Payload | Meaning |
|---|---|---|
| `chat:send` | `{ threadId: string, message: string }` | Ask for a reply. Creates the thread on first use, titled after this message. |
| `chat:stop` | *(none)* | Cut the in-flight reply short. Whatever has streamed so far is kept and saved. |

### Server → client

| Event | Payload | Meaning |
|---|---|---|
| `session:ready` | `{ userId: string, username: string }` | Emitted once on connect; confirms who the socket belongs to. |
| `chat:start` | `{ threadId, messageId, title }` | The turn was accepted, the user's message is persisted, tokens follow. |
| `chat:token` | `{ threadId, messageId, token }` | One chunk of the reply. Concatenate in arrival order. |
| `chat:done` | `{ threadId, messageId, content, aborted }` | The turn ended. `content` is the full reply as stored; `aborted` is `true` when it was stopped early. |
| `chat:error` | `{ threadId, messageId, code, message }` | The turn failed. `threadId`/`messageId` may be `null` if it never started. |
| `thread:updated` | `{ threadId, title, updatedAt }` | A thread changed — refresh the sidebar. Broadcast to every socket of that user, so a second tab stays in sync. |

### Error codes

| Code | Cause | Did the server keep the user's message? |
|---|---|---|
| `BAD_REQUEST` | `threadId` or `message` missing/blank | No |
| `STREAM_IN_PROGRESS` | A reply is already streaming on this connection | No |
| `STREAM_FAILED` | The model call failed mid-turn | Yes |

### A normal turn

```
client                                   server
  │  chat:send {threadId, message}  ───────▶   persist user message
  │  ◀─── chat:start {threadId, messageId, title}
  │  ◀─── chat:token {token: "Hel"}
  │  ◀─── chat:token {token: "lo"}
  │            …                            stream from the OpenAI SDK
  │  ◀─── chat:done {content: "Hello", aborted: false}
  │  ◀─── thread:updated {threadId, title, updatedAt}   (persist assistant message)
```

### Rules the implementation guarantees

- **One turn per connection.** A second `chat:send` while a reply is streaming
  is refused with `STREAM_IN_PROGRESS`.
- **Nothing is lost.** The user's message is persisted at `chat:start`, before
  the model is called. The assistant's message is persisted when the turn ends —
  including a partial reply after a `chat:stop` or a dropped connection.
- **A disconnect aborts the model call.** Dropping the socket fires the
  `AbortSignal` passed to the OpenAI SDK, so nobody pays for tokens no one will
  read.
- **Sockets are scoped to their user.** Every read and write is filtered by the
  `userId` from the JWT, so a guessed or reused `threadId` cannot reach another
  account's thread.

---

## REST API

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ email, username, password }` | Register; sets the httpOnly JWT cookie |
| POST | `/api/auth/login` | `{ email, password }` | Authenticate; sets the cookie |
| POST | `/api/auth/logout` | — | Clear the cookie |
| POST | `/api/auth/verify` | — | Session probe → `{ status, username }` |
| GET | `/api/thread` | — | Threads, newest first |
| GET | `/api/thread/:threadId` | — | Messages in a thread |
| DELETE | `/api/thread/:threadId` | — | Delete a thread |
| POST | `/api/chat` | `{ threadId, message }` | Non-streaming fallback; the Angular client does not use it |
| GET | `/health` | — | Liveness probe |

Everything under `/api` except `/api/auth` requires a valid `token` cookie and
answers `401` without one.

---

## Getting started

### Prerequisites

- Node.js 20+ (24.x in CI)
- A MongoDB connection string (Atlas or local)
- An OpenAI API key

### Backend

```bash
cd backend
cp .env.example .env      # then fill in the three required values
npm install
npm run dev               # node --watch server.js, listens on :8080
```

### Frontend

```bash
cd frontend
npm install
npm start                 # ng serve on :4200
```

`ng serve` proxies `/api` and `/socket.io` (with `ws: true`) to `localhost:8080`
via `proxy.conf.json`, so the browser sees a single origin and the auth cookie
just works — no CORS in the loop during development.

Open <http://localhost:4200>.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `TOKEN_KEY` | Yes | Secret used to sign and verify JWTs |
| `PORT` | No | API port (default `8080`) |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini` |
| `HISTORY_LIMIT` | No | Messages replayed to the model (default `20`) |
| `CORS_ORIGINS` | No | Comma-separated allowlist for REST *and* the socket handshake |
| `COOKIE_SECURE` | No | `true` once the site is served over HTTPS |
| `COOKIE_SAMESITE` | No | Default `lax` |

---

## Testing

### Backend — Jest + Supertest (46 tests)

In-memory MongoDB via `mongodb-memory-server` and a mocked OpenAI client. No
real database, no real API calls.

```bash
cd backend
npm test
npm run test:coverage
```

| Suite | Covers |
|---|---|
| `auth.test.js` | Signup hashes the password, duplicate emails are rejected, login issues a verifiable JWT cookie |
| `chat.test.js` | REST chat routes reject anonymous requests; threads are isolated per user |
| `cors.test.js` | Preflight, credentialed origins, and CORS headers on a body-parser rejection |
| `apiAuth.test.js` | The `/api/auth` mount, httpOnly cookie, logout, and that the chat guard does not swallow it |
| `socket.test.js` | **WebSocket:** handshake auth (no cookie, malformed token, wrong secret, deleted user, valid cookie, `auth.token`), token-by-token streaming, history replay, persistence, `thread:updated`, validation, concurrent-send refusal, model failure, per-user isolation, `chat:stop`, and disconnect mid-stream |

The socket tests drive a real `http.Server` with a real Socket.IO server and a
real `socket.io-client`; only the model call is mocked.

### Frontend — Vitest via `ng test` (39 tests)

```bash
cd frontend
npm test
```

| Spec | Covers |
|---|---|
| `auth.guard.spec.ts` | `authGuard` admits a session, redirects otherwise, preserves the intended URL; `guestGuard` in both directions |
| `chat.service.spec.ts` | Optimistic send, token accumulation, stale-turn filtering, `chat:done` handling, error rollback by code, thread upsert ordering, open/delete |
| `auth.service.spec.ts` | Login/signup response shapes, the HTTP-200-means-failure case, one shared session probe, logout on a failed request |
| `message-list.spec.ts` | **Component rendering:** empty state, user text vs. rendered markdown, highlight.js classes surviving sanitization, `<script>` stripped, the streaming bubble and its caret |

---

## Deployment

**`.github/workflows/deploy.yml`** — two sequential jobs on a self-hosted
runner. `backend` installs production deps, checks `/etc/omegachat/backend.env`
has the three required keys, and restarts PM2. `frontend` runs its own
`actions/setup-node` cache keyed on `frontend/package-lock.json`, runs
`npm ci`, builds with `ng build --configuration production`, and rsyncs the
bundle to `/var/www/omegachat`.

**`deploy/nginx/omegachat.conf`** — serves the Angular bundle with an SPA
fallback, proxies `/api/`, and gives `/socket.io/` the upgrade handshake nginx
does not do by default:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;   # from a map on $http_upgrade
proxy_read_timeout 7d;                             # token streams idle between chunks
```

**`backend/ecosystem.config.cjs`** — PM2 app `omegachat-backend`, `cwd` set to
`__dirname` so the runner needs no hardcoded workspace path. It is `.cjs`
because the backend is an ESM package and PM2 `require()`s its ecosystem file.

Host setup (once):

```bash
sudo mkdir -p /etc/omegachat && sudo nano /etc/omegachat/backend.env
sudo mkdir -p /var/www/omegachat
sudo cp deploy/nginx/omegachat.conf /etc/nginx/sites-available/omegachat
sudo ln -s /etc/nginx/sites-available/omegachat /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Author

Built by **Manish Patra**
