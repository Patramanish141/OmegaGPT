import "dotenv/config";
import OpenAI from "openai";
import { OPENAI_MODEL } from "../config/index.js";

// Constructed lazily: importing this module must not throw when OPENAI_API_KEY
// is absent, because the test suite imports app.js (and therefore this file)
// with no key set and mocks the calls out.
let client;

export const getClient = () => {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
};

/**
 * Non-streaming completion, used by the legacy REST fallback at POST /api/chat.
 *
 * @param {string} message
 * @returns {Promise<string>} the assistant reply
 */
const getOpenAIAPIResponse = async (message) => {
  try {
    const completion = await getClient().chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: message }],
    });
    return completion.choices[0].message.content;
  } catch (err) {
    console.log(err);
  }
};

/**
 * Streaming completion. Yields the assistant reply one delta at a time so the
 * socket layer can forward each chunk as a `chat:token` frame.
 *
 * @param {{role: "user"|"assistant", content: string}[]} messages full history
 * @param {{signal?: AbortSignal}} [options]
 * @returns {AsyncGenerator<string, void, void>}
 */
export async function* streamOpenAIResponse(messages, { signal } = {}) {
  const stream = await getClient().chat.completions.create(
    {
      model: OPENAI_MODEL,
      messages,
      stream: true,
    },
    { signal }
  );

  for await (const chunk of stream) {
    const token = chunk?.choices?.[0]?.delta?.content;
    if (token) yield token;
  }
}

export default getOpenAIAPIResponse;
