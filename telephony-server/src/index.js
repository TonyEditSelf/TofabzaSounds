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

// â”€â”€ WebSocket server

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  console.log("[upgrade] url:", req.url);
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  const url = req.url || "";
  const parsedUrl = new URL(url, "ws://localhost");
  console.log("[ws] incoming:", url);

  if (
    parsedUrl.pathname === "/ws/twilio" ||
    (parsedUrl.pathname === "/ws/call" &&
      parsedUrl.searchParams.get("provider") === "twilio")
  ) {
    console.log("[ws] route → TWILIO");
    return handleCallTwilio(ws, req);
  }

  if (parsedUrl.pathname === "/ws/call") {
    console.log("[ws] route → EXOTEL");
    const authHeader = req.headers["authorization"];
    const exotelConfigured =
      process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN;
    if (exotelConfigured) {
      if (!authHeader) {
        ws.close(1008, "Unauthorised");
        return;
      }
      const expected = `Basic ${Buffer.from(`${process.env.EXOTEL_API_KEY}:${process.env.EXOTEL_API_TOKEN}`).toString("base64")}`;
      if (authHeader !== expected) {
        ws.close(1008, "Unauthorised");
        return;
      }
    }
    return handleCall(ws, req);
  }

  console.log("[ws] unknown route, closing");
  ws.close();
});

wss.on("error", (err) => {
  console.error("[wss] Error:", err.message);
});

// â”€â”€ Start

server.listen(PORT, () => {
  console.log(`[server] Tofabza telephony server running on port ${PORT}`);
  console.log(`[server] Exotel WS: ws://localhost:${PORT}/ws/call`);
  console.log(`[server] Twilio WS: ws://localhost:${PORT}/ws/twilio`);
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
