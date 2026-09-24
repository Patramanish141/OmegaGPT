import http from "node:http";
import request from "supertest";
import { io as ioClient } from "socket.io-client";

import app from "../app.js";
import attachSocketServer from "../realtime/socket.js";

let httpServer;
let ioServer;
let baseUrl;
const openSockets = new Set();

export const startServer = async () => {
  httpServer = http.createServer(app);
  ioServer = attachSocketServer(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  return { ioServer, baseUrl };
};

export const stopServer = async () => {
  closeAllClients();
  if (ioServer) await new Promise((resolve) => ioServer.close(resolve));
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
};

export const closeAllClients = () => {
  for (const socket of openSockets) socket.close();
  openSockets.clear();
};

/** Registers a user and returns their `token=...` cookie pair. */
export const loginAndGetCookie = async (user) => {
  await request(app).post("/signup").send(user);
  const res = await request(app)
    .post("/login")
    .send({ email: user.email, password: user.password });
  return res.headers["set-cookie"].map((c) => c.split(";")[0]).join("; ");
};

/** Opens a client socket, resolving on connect and rejecting on connect_error. */
export const connectClient = ({ cookie, auth } = {}) =>
  new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      reconnection: false,
      forceNew: true,
      extraHeaders: cookie ? { Cookie: cookie } : undefined,
      auth,
    });
    openSockets.add(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => {
      openSockets.delete(socket);
      socket.close();
      reject(err);
    });
  });

/** Resolves with the payload of the first `event` the socket receives. */
export const once = (socket, event, timeout = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeout
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

/** Polls `check` until it returns a truthy value, or fails after `timeout`. */
export const waitFor = async (check, { timeout = 5000, interval = 20 } = {}) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};

const abortError = () => {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
};

/** Mock stream that yields every token and then ends. */
export const finiteStream = (tokens) =>
  async function* () {
    for (const token of tokens) yield token;
  };

/**
 * Mock stream that yields `head` and then hangs until the AbortSignal fires,
 * which makes abort-path assertions deterministic instead of time-dependent.
 */
export const gatedStream = (head) =>
  async function* (_messages, { signal } = {}) {
    for (const token of head) yield token;
    await new Promise((_resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      signal?.addEventListener("abort", () => reject(abortError()), { once: true });
    });
  };

/** Mock stream that fails immediately, for the error path. */
export const throwingStream = (error) =>
  // eslint-disable-next-line require-yield
  async function* () {
    throw error;
  };
