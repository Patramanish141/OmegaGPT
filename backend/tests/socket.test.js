import jwt from "jsonwebtoken";
import mongoose from "mongoose";

jest.mock("../utils/openai.js", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue("This is a mocked AI reply."),
  streamOpenAIResponse: jest.fn(),
}));

import { streamOpenAIResponse } from "../utils/openai.js";
import Thread from "../models/Thread.js";
import { connect, clearDatabase, closeDatabase } from "./db.js";
import {
  startServer,
  stopServer,
  closeAllClients,
  loginAndGetCookie,
  connectClient,
  once,
  waitFor,
  finiteStream,
  gatedStream,
  throwingStream,
} from "./socketHarness.js";

process.env.TOKEN_KEY = process.env.TOKEN_KEY || "test-secret-key-for-jest";

const alice = {
  email: "alice@example.com",
  username: "alice",
  password: "correcthorse123",
};
const bob = {
  email: "bob@example.com",
  username: "bob",
  password: "supersecret1",
};

beforeAll(async () => {
  await connect();
  await startServer();
}, 120000);

afterEach(async () => {
  closeAllClients();
  await clearDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await stopServer();
  await closeDatabase();
});

/** Collects every `chat:token` until `chat:done` arrives. */
const collectStream = (socket) =>
  new Promise((resolve, reject) => {
    const tokens = [];
    const timer = setTimeout(() => reject(new Error("stream timed out")), 5000);
    const onToken = (payload) => tokens.push(payload);
    socket.on("chat:token", onToken);
    socket.once("chat:done", (done) => {
      clearTimeout(timer);
      socket.off("chat:token", onToken);
      resolve({ tokens, done });
    });
    socket.once("chat:error", (err) => {
      clearTimeout(timer);
      socket.off("chat:token", onToken);
      reject(new Error(`chat:error ${err.code}: ${err.message}`));
    });
  });

describe("connection auth", () => {
  test("rejects a handshake with no cookie and no auth token", async () => {
    await expect(connectClient()).rejects.toThrow("Unauthorized");
  });

  test("rejects a handshake carrying a malformed token", async () => {
    await expect(
      connectClient({ cookie: "token=not-a-real-jwt" })
    ).rejects.toThrow("Unauthorized");
  });

  test("rejects a token signed with the wrong secret", async () => {
    const forged = jwt.sign(
      { id: new mongoose.Types.ObjectId().toString() },
      "wrong-secret"
    );
    await expect(connectClient({ cookie: `token=${forged}` })).rejects.toThrow(
      "Unauthorized"
    );
  });

  test("rejects a well-formed token for a user that no longer exists", async () => {
    const orphan = jwt.sign(
      { id: new mongoose.Types.ObjectId().toString() },
      process.env.TOKEN_KEY
    );
    await expect(connectClient({ cookie: `token=${orphan}` })).rejects.toThrow(
      "Unauthorized"
    );
  });

  test("accepts the JWT cookie the REST routes issue and announces the session", async () => {
    const cookie = await loginAndGetCookie(alice);
    const socket = await connectClient({ cookie });

    const ready = await once(socket, "session:ready");
    expect(ready.username).toBe(alice.username);
    expect(ready.userId).toEqual(expect.any(String));
  });

  test("accepts a token passed via handshake auth, for non-browser clients", async () => {
    const cookie = await loginAndGetCookie(alice);
    const token = cookie.split("token=")[1];

    const socket = await connectClient({ auth: { token } });
    const ready = await once(socket, "session:ready");
    expect(ready.username).toBe(alice.username);
  });
});

describe("message streaming", () => {
  let socket;

  beforeEach(async () => {
    const cookie = await loginAndGetCookie(alice);
    socket = await connectClient({ cookie });
    await once(socket, "session:ready");
  });

  test("streams the reply one token at a time and ends with the full content", async () => {
    streamOpenAIResponse.mockImplementation(finiteStream(["Hello", ", ", "world"]));

    const streamed = collectStream(socket);
    const started = once(socket, "chat:start");
    socket.emit("chat:send", { threadId: "thread-1", message: "Hi there" });

    const start = await started;
    expect(start.threadId).toBe("thread-1");
    expect(start.messageId).toEqual(expect.any(String));
    // A new thread is titled after its first user message, as in SigmaGPT.
    expect(start.title).toBe("Hi there");

    const { tokens, done } = await streamed;
    expect(tokens.map((t) => t.token)).toEqual(["Hello", ", ", "world"]);
    // Every frame is tagged with the turn it belongs to.
    expect(tokens.every((t) => t.messageId === start.messageId)).toBe(true);
    expect(done.content).toBe("Hello, world");
    expect(done.aborted).toBe(false);
  });

  test("persists both the user message and the streamed reply", async () => {
    streamOpenAIResponse.mockImplementation(finiteStream(["saved"]));

    const streamed = collectStream(socket);
    socket.emit("chat:send", { threadId: "thread-2", message: "Remember this" });
    await streamed;

    const thread = await Thread.findOne({ threadId: "thread-2" });
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]).toMatchObject({
      role: "user",
      content: "Remember this",
    });
    expect(thread.messages[1]).toMatchObject({
      role: "assistant",
      content: "saved",
    });
  });

  test("replays the thread history to the model on a follow-up turn", async () => {
    streamOpenAIResponse.mockImplementation(finiteStream(["ok"]));

    const first = collectStream(socket);
    socket.emit("chat:send", { threadId: "thread-3", message: "first" });
    await first;

    const second = collectStream(socket);
    socket.emit("chat:send", { threadId: "thread-3", message: "second" });
    await second;

    const [messages] = streamOpenAIResponse.mock.calls[1];
    expect(messages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "second" },
    ]);
  });

  test("announces the updated thread so the sidebar can refresh", async () => {
    streamOpenAIResponse.mockImplementation(finiteStream(["hi"]));

    const updated = once(socket, "thread:updated");
    socket.emit("chat:send", { threadId: "thread-4", message: "Title me" });

    const payload = await updated;
    expect(payload).toMatchObject({ threadId: "thread-4", title: "Title me" });
  });

  test("rejects a send with no message before calling the model", async () => {
    const error = once(socket, "chat:error");
    socket.emit("chat:send", { threadId: "thread-5" });

    expect(await error).toMatchObject({
      code: "BAD_REQUEST",
      threadId: "thread-5",
    });
    expect(streamOpenAIResponse).not.toHaveBeenCalled();
  });

  test("rejects a second send while a reply is still streaming", async () => {
    streamOpenAIResponse.mockImplementation(gatedStream(["one"]));

    const firstToken = once(socket, "chat:token");
    socket.emit("chat:send", { threadId: "thread-6", message: "first" });
    await firstToken;

    const error = once(socket, "chat:error");
    socket.emit("chat:send", { threadId: "thread-6", message: "second" });

    expect(await error).toMatchObject({ code: "STREAM_IN_PROGRESS" });
    expect(streamOpenAIResponse).toHaveBeenCalledTimes(1);
  });

  test("reports a model failure without losing the user's own message", async () => {
    streamOpenAIResponse.mockImplementation(
      throwingStream(new Error("upstream exploded"))
    );

    const error = once(socket, "chat:error");
    socket.emit("chat:send", { threadId: "thread-7", message: "will fail" });

    expect(await error).toMatchObject({
      code: "STREAM_FAILED",
      threadId: "thread-7",
    });

    const thread = await Thread.findOne({ threadId: "thread-7" });
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]).toMatchObject({
      role: "user",
      content: "will fail",
    });
  });

  // Regression guard mirroring the REST suite: a socket is scoped to its own
  // user, so a reused threadId cannot reach into someone else's thread.
  test("a second user reusing the same threadId gets their own thread", async () => {
    streamOpenAIResponse.mockImplementation(finiteStream(["reply"]));

    const mine = collectStream(socket);
    socket.emit("chat:send", { threadId: "shared-id", message: "message from alice" });
    await mine;

    const bobCookie = await loginAndGetCookie(bob);
    const bobSocket = await connectClient({ cookie: bobCookie });
    await once(bobSocket, "session:ready");

    const theirs = collectStream(bobSocket);
    bobSocket.emit("chat:send", { threadId: "shared-id", message: "message from bob" });
    await theirs;

    const threads = await Thread.find({ threadId: "shared-id" });
    expect(threads).toHaveLength(2);
    const contents = threads.map((t) => t.messages[0].content).sort();
    expect(contents).toEqual(["message from alice", "message from bob"]);
  });
});

describe("stop and disconnect handling", () => {
  let socket;

  beforeEach(async () => {
    const cookie = await loginAndGetCookie(alice);
    socket = await connectClient({ cookie });
    await once(socket, "session:ready");
  });

  test("chat:stop ends the turn and keeps the partial reply", async () => {
    streamOpenAIResponse.mockImplementation(gatedStream(["par", "tial"]));

    const tokens = [];
    socket.on("chat:token", (t) => tokens.push(t.token));
    const done = once(socket, "chat:done");

    socket.emit("chat:send", { threadId: "stop-1", message: "start" });
    await waitFor(() => tokens.length === 2);
    socket.emit("chat:stop");

    const payload = await done;
    expect(payload.aborted).toBe(true);
    expect(payload.content).toBe("partial");

    const thread = await Thread.findOne({ threadId: "stop-1" });
    expect(thread.messages[1]).toMatchObject({
      role: "assistant",
      content: "partial",
    });
  });

  test("a disconnect mid-stream aborts the model call and still saves what arrived", async () => {
    streamOpenAIResponse.mockImplementation(gatedStream(["half ", "done"]));

    const tokens = [];
    socket.on("chat:token", (t) => tokens.push(t.token));
    socket.emit("chat:send", { threadId: "drop-1", message: "start" });
    await waitFor(() => tokens.length === 2);

    socket.disconnect();

    const thread = await waitFor(async () => {
      const found = await Thread.findOne({ threadId: "drop-1" });
      return found?.messages.length === 2 ? found : null;
    });
    expect(thread.messages[1]).toMatchObject({
      role: "assistant",
      content: "half done",
    });
  });

  test("a disconnect before any token leaves only the user message", async () => {
    streamOpenAIResponse.mockImplementation(gatedStream([]));

    const started = once(socket, "chat:start");
    socket.emit("chat:send", { threadId: "drop-2", message: "start" });
    await started;

    socket.disconnect();

    // Give the server a chance to do the wrong thing before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const thread = await Thread.findOne({ threadId: "drop-2" });
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]).toMatchObject({
      role: "user",
      content: "start",
    });
  });
});
