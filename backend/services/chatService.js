import Thread from "../models/Thread.js";
import { HISTORY_LIMIT } from "../config/index.js";

/**
 * Appends a user message to a thread, creating the thread on first message.
 * Persisted immediately so that a stream which later fails still leaves the
 * user's own message in the history.
 */
export const appendUserMessage = async ({ userId, threadId, message }) => {
  let thread = await Thread.findOne({ threadId, userId });

  if (!thread) {
    thread = new Thread({
      userId,
      threadId,
      title: message,
      messages: [{ role: "user", content: message }],
    });
  } else {
    thread.messages.push({ role: "user", content: message });
  }

  thread.updatedAt = new Date();
  await thread.save();
  return thread;
};

/** Appends the assistant's (possibly partial) reply to an existing thread. */
export const appendAssistantMessage = async ({ userId, threadId, content }) => {
  const thread = await Thread.findOne({ threadId, userId });
  if (!thread) return null;

  thread.messages.push({ role: "assistant", content });
  thread.updatedAt = new Date();
  await thread.save();
  return thread;
};

/**
 * The trailing slice of a thread, shaped for the Chat Completions API.
 * Mongoose subdocuments carry _id/timestamp fields the API rejects, so the
 * role/content pair is copied out explicitly.
 */
export const toHistory = (thread, limit = HISTORY_LIMIT) =>
  thread.messages
    .slice(-limit)
    .map(({ role, content }) => ({ role, content }));
