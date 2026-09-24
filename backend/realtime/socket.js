import { Server } from "socket.io";
import { parse as parseCookie } from "cookie";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

import User from "../models/UserModel.js";
import { allowedOrigins } from "../config/index.js";
import { streamOpenAIResponse } from "../utils/openai.js";
import {
  appendUserMessage,
  appendAssistantMessage,
  toHistory,
} from "../services/chatService.js";

/**
 * Handshake guard. Reuses the same `token` JWT cookie the REST routes use, so
 * a browser that is logged in is automatically authorised on the socket with
 * no extra round trip. `handshake.auth.token` is accepted as well for
 * non-browser clients (tests, CLI tools) that cannot set a cookie header.
 */
export const authenticateSocket = async (socket, next) => {
  try {
    const header = socket.handshake.headers?.cookie;
    const token =
      (header ? parseCookie(header).token : undefined) ||
      socket.handshake.auth?.token;

    if (!token) return next(new Error("Unauthorized"));

    const data = jwt.verify(token, process.env.TOKEN_KEY);
    const user = await User.findById(data.id);
    if (!user) return next(new Error("Unauthorized"));

    socket.data.userId = data.id;
    socket.data.username = user.username;
    return next();
  } catch {
    return next(new Error("Unauthorized"));
  }
};

/**
 * Ends the socket's in-flight stream: persists whatever the model produced
 * (even a partial reply, so an aborted or dropped stream is not lost) and
 * tells the client the turn is over.
 */
const finalizeStream = async (socket, { aborted, notify }) => {
  const stream = socket.data.stream;
  if (!stream) return;
  socket.data.stream = null;

  const { threadId, messageId, content } = stream;

  let thread = null;
  if (content.length > 0) {
    thread = await appendAssistantMessage({
      userId: socket.data.userId,
      threadId,
      content,
    });
  }

  if (!notify) return;

  socket.emit("chat:done", { threadId, messageId, content, aborted });

  if (thread) {
    socket.nsp.to(`user:${socket.data.userId}`).emit("thread:updated", {
      threadId,
      title: thread.title,
      updatedAt: thread.updatedAt,
    });
  }
};

const emitError = (socket, { threadId, messageId, code, message }) =>
  socket.emit("chat:error", {
    threadId: threadId ?? null,
    messageId: messageId ?? null,
    code,
    message,
  });

const handleChatSend = async (socket, payload) => {
  const threadId =
    typeof payload?.threadId === "string" ? payload.threadId.trim() : "";
  const message =
    typeof payload?.message === "string" ? payload.message.trim() : "";

  if (!threadId || !message) {
    return emitError(socket, {
      threadId: threadId || null,
      code: "BAD_REQUEST",
      message: "threadId and message are required",
    });
  }

  // One turn at a time per connection: a second send would otherwise interleave
  // two token streams into the same transcript.
  if (socket.data.stream) {
    return emitError(socket, {
      threadId,
      code: "STREAM_IN_PROGRESS",
      message: "A reply is already streaming on this connection",
    });
  }

  const messageId = randomUUID();
  const controller = new AbortController();
  socket.data.stream = { controller, threadId, messageId, content: "" };

  try {
    const thread = await appendUserMessage({
      userId: socket.data.userId,
      threadId,
      message,
    });

    socket.emit("chat:start", { threadId, messageId, title: thread.title });

    const tokens = streamOpenAIResponse(toHistory(thread), {
      signal: controller.signal,
    });

    for await (const token of tokens) {
      // The client disconnected or sent chat:stop while we were awaiting.
      if (!socket.data.stream) break;
      socket.data.stream.content += token;
      socket.emit("chat:token", { threadId, messageId, token });
    }

    await finalizeStream(socket, {
      aborted: controller.signal.aborted,
      notify: socket.connected,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      // An abort is an expected end, not a failure.
      await finalizeStream(socket, { aborted: true, notify: socket.connected });
      return;
    }

    console.log(err);
    await finalizeStream(socket, { aborted: false, notify: false });

    if (socket.connected) {
      emitError(socket, {
        threadId,
        messageId,
        code: "STREAM_FAILED",
        message: "Failed to generate a reply",
      });
    }
  }
};

export const registerChatHandlers = (socket) => {
  socket.join(`user:${socket.data.userId}`);

  socket.emit("session:ready", {
    userId: socket.data.userId,
    username: socket.data.username,
  });

  socket.on("chat:send", (payload) => {
    handleChatSend(socket, payload).catch((err) => console.log(err));
  });

  socket.on("chat:stop", () => {
    socket.data.stream?.controller.abort();
  });

  socket.on("disconnect", () => {
    socket.data.stream?.controller.abort();
  });
};

/**
 * Attaches the Socket.IO server to the same http.Server Express listens on, so
 * the app keeps a single port and nginx only needs one upgrade-aware location.
 */
export const attachSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.use(authenticateSocket);
  io.on("connection", registerChatHandlers);

  return io;
};

export default attachSocketServer;
