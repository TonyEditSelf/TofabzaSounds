/**
 * telephony-server/src/index.js
 *
 * Entry point - HTTP + WebSocket server on Railway.
 * HTTP: health check + basic auth validation
 * WebSocket: /ws/call - Exotel AgentStream bidirectional audio
 */

import "dotenv/config";
import http from "http";
import { WebSocketServer } from "ws";
import { handleCall } from "./websocket/callHandler.js";
import { handleCall as handleCallTwilio } from "./websocket/callHandlerTwilio.js";

const PORT = process.env.PORT || 8080;

// â”€â”€ HTTP server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const server = http.createServer((req, res) => {
  // Health check - Railway uses this
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "tofabza-telephony",
        ts: Date.now(),
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

// â”€â”€ WebSocket server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  console.log("[upgrade] url:", req.url);
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  if (req.url === "/ws/twilio" || req.url.startsWith("/ws/twilio?")) {
    handleCallTwilio(ws, req);
    return;
  }
  // Basic auth validation (optional if using Basic Auth in WSS URL)
  const authHeader = req.headers["authorization"];
  const url2 = new URL(req.url, "wss://localhost");
  const isExotel = (url2.searchParams.get("provider") ?? "exotel") === "exotel";
  const exotelConfigured =
    process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN;

  if (isExotel && exotelConfigured) {
    if (!authHeader) {
      console.warn("[ws] Rejected - missing Authorization header");
      ws.close(1008, "Unauthorised");
      return;
    }
    const expected = `Basic ${Buffer.from(`${process.env.EXOTEL_API_KEY}:${process.env.EXOTEL_API_TOKEN}`).toString("base64")}`;
    if (authHeader !== expected) {
      console.warn("[ws] Rejected - invalid Authorization header");
      ws.close(1008, "Unauthorised");
      return;
    }
  }
  const url = new URL(req.url, "wss://localhost");
  const provider = url.searchParams.get("provider") ?? "exotel";

  if (provider === "twilio") {
    handleCallTwilio(ws, req);
  } else {
    handleCall(ws, req);
  }
});

wss.on("error", (err) => {
  console.error("[wss] Error:", err.message);
});

// â”€â”€ Start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

server.listen(PORT, () => {
  console.log(`[server] Tofabza telephony server running on port ${PORT}`);
  console.log(`[server] Exotel WS: ws://localhost:${PORT}/ws/call`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM - shutting down gracefully");
  server.close(() => process.exit(0));
});

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
  // Don't crash - log and continue
});
