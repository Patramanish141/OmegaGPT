import "dotenv/config";

const DEFAULT_ORIGINS = [
  "http://localhost:4200",
  "http://ec2-16-171-18-152.eu-north-1.compute.amazonaws.com",
];

// CORS_ORIGINS="https://a.example,https://b.example"
export const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : DEFAULT_ORIGINS;

export const PORT = Number(process.env.PORT) || 8080;

// 3 days, in seconds — matches the JWT lifetime in utils/SecretToken.js.
export const TOKEN_MAX_AGE_SECONDS = 3 * 24 * 60 * 60;

// The EC2 deployment is served over plain HTTP, so `secure` stays opt-in.
export const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.COOKIE_SAMESITE || "lax",
  secure: process.env.COOKIE_SECURE === "true",
  maxAge: TOKEN_MAX_AGE_SECONDS * 1000,
  path: "/",
};

// Only the most recent slice of a thread is replayed to the model, so a long
// conversation cannot grow the prompt without bound.
export const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT) || 20;

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
