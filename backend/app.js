import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import chatRoutes from "./routes/chat.js";
import authRoute from "./routes/AuthRoute.js";
import { allowedOrigins } from "./config/index.js";

const app = express();

// cors() stays ahead of express.json() so that a body-parser rejection still
// comes back with CORS headers instead of surfacing as a CORS failure.
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

// Auth is mounted under /api/auth so that nginx only has to proxy /api and
// /socket.io; the SPA owns the bare /login and /signup paths. It must come
// before the /api chat router, whose requireAuth would otherwise 401 it.
app.use("/api/auth", authRoute);
app.use("/api", chatRoutes);

// SigmaGPT's original root mount, kept so existing clients and tests still work.
app.use("/", authRoute);

export default app;
