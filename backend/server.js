import dotenv from "dotenv";
dotenv.config();

import http from "node:http";
import dns from "node:dns";
import mongoose from "mongoose";

import app from "./app.js";
import { PORT } from "./config/index.js";
import attachSocketServer from "./realtime/socket.js";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

// Express and Socket.IO share one http.Server, so the whole app lives behind a
// single port and a single nginx upgrade-aware location block.
const server = http.createServer(app);
attachSocketServer(server);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to DB");
  } catch (err) {
    console.log("Failed to connect with DB", err);
  }
};

server.listen(PORT, () => {
  console.log(`server running on ${PORT}`);
  connectDB();
});

export default server;
