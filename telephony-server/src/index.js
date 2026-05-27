/**
 * telephony-server/src/index.js
 *
 * Entry point — HTTP + WebSocket server on Railway.
 * HTTP: health check + basic auth validation
 * WebSocket: /ws/call — Exotel AgentStream bidirectional audio
 */

import "dotenv/config";
import http from "http";
import { WebSocketServer } from "ws";
import { handleCall } from "./websocket/callHandler.js";

const PORT = process.env.PORT || 8080;

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // Health check — Railway uses this
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

// ── WebSocket server ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  // Basic auth validation (optional — if using Basic Auth in WSS URL)
  const authHeader = req.headers["authorization"];
  const exotelConfigured =
    process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN;

  if (exotelConfigured) {
    if (!authHeader) {
      console.warn("[ws] Rejected — missing Authorization header");
      ws.close(1008, "Unauthorised");
      return;
    }
    const expected = `Basic ${Buffer.from(`${process.env.EXOTEL_API_KEY}:${process.env.EXOTEL_API_TOKEN}`).toString("base64")}`;
    if (authHeader !== expected) {
      console.warn("[ws] Rejected — invalid Authorization header");
      ws.close(1008, "Unauthorised");
      return;
    }
  }

  const url = req.url ?? "/";
  if (url.startsWith("/plivo")) {
    handleCall(ws, req, "plivo");
  } else {
    handleCall(ws, req, "exotel");
  }
});

wss.on("error", (err) => {
  console.error("[wss] Error:", err.message);
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[server] Tofabza telephony server running on port ${PORT}`);
  console.log(`[server] Exotel WS: ws://localhost:${PORT}/ws/call`);
  console.log(`[server] Plivo  WS: ws://localhost:${PORT}/plivo`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM — shutting down gracefully");
  server.close(() => process.exit(0));
});

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
  // Don't crash — log and continue
});
