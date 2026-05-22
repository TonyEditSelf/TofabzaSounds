/**
 * telephony-server/server.js
 *
 * Exotel WebSocket server — ECHO MODE
 * Handles all Exotel WS events and reflects media back to caller.
 * This validates the WebSocket connection before building the AI pipeline.
 *
 * Exotel connects here via:
 *   wss://<railway-host>/
 *
 * Deploy: Railway, root directory = telephony-server/
 */

require("dotenv").config();

const { WebSocketServer, WebSocket } = require("ws");
const http = require("http");

const PORT = process.env.PORT || 5000;

// ─── Basic-auth check ─────────────────────────────────────────────────────────

function isAuthorized(req) {
  const auth = req.headers["authorization"] ?? "";
  if (!auth.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) return false;
    return (
      decoded.slice(0, sep) === process.env.EXOTEL_API_KEY &&
      decoded.slice(sep + 1) === process.env.EXOTEL_API_TOKEN
    );
  } catch {
    return false;
  }
}

// ─── HTTP server (Railway needs an HTTP listener for health checks) ───────────

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", mode: "echo" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ─── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  // Auth guard
  if (!isAuthorized(req)) {
    console.warn("[WS] Unauthorized connection attempt — closing");
    ws.close(1008, "Unauthorized");
    return;
  }

  // Per-connection state
  const state = {
    streamSid: null,
    callSid: null,
    from: null,
    to: null,
    mediaFormat: null,
    sequenceCount: 0,
  };

  console.log("[WS] New connection from", req.socket.remoteAddress);

  // ── Ping/pong keepalive (30s interval, 10s timeout) ──────────────────────
  let pingTimer = null;
  let pongTimeout = null;

  function schedulePing() {
    pingTimer = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.ping();
      pongTimeout = setTimeout(() => {
        console.warn(
          `[WS] ${state.callSid ?? "?"} — pong timeout, terminating`,
        );
        ws.terminate();
      }, 10_000);
    }, 30_000);
  }

  ws.on("pong", () => {
    clearTimeout(pongTimeout);
    schedulePing();
  });

  schedulePing();

  // ── Message handler ───────────────────────────────────────────────────────
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      console.warn("[WS] Non-JSON message received");
      return;
    }

    const event = msg.event;

    switch (event) {
      // ── connected ──────────────────────────────────────────────────────────
      case "connected": {
        console.log(`[connected] timestamp=${msg.timestamp}`);
        break;
      }

      // ── start ──────────────────────────────────────────────────────────────
      case "start": {
        // Exotel sends start fields either nested under msg.start or at top level
        const s = msg.start ?? msg;
        state.streamSid = s.stream_sid ?? msg.stream_sid;
        state.callSid = s.call_sid ?? msg.call_sid;
        state.from = s.from ?? msg.from;
        state.to = s.to ?? msg.to;
        state.mediaFormat = s.media_format ?? msg.media_format;

        console.log(
          `[start] stream_sid=${state.streamSid} call_sid=${state.callSid}` +
            ` from=${state.from} to=${state.to}` +
            ` format=${JSON.stringify(state.mediaFormat)}`,
        );
        break;
      }

      // ── media ──────────────────────────────────────────────────────────────
      case "media": {
        state.sequenceCount++;

        // Log every 50th packet to avoid flooding console
        if (state.sequenceCount % 50 === 1) {
          console.log(
            `[media] seq=${msg.sequence_number} chunk=${msg.media?.chunk}` +
              ` payload_len=${msg.media?.payload?.length ?? 0}`,
          );
        }

        // ECHO MODE: reflect media straight back to Exotel
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              event: "media",
              stream_sid: state.streamSid,
              media: msg.media,
            }),
          );
        }
        break;
      }

      // ── clear ──────────────────────────────────────────────────────────────
      case "clear": {
        console.log(`[clear] stream_sid=${msg.stream_sid}`);
        // Ack
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ event: "clear", stream_sid: state.streamSid }),
          );
        }
        break;
      }

      // ── dtmf ──────────────────────────────────────────────────────────────
      case "dtmf": {
        const { digit, duration } = msg.dtmf ?? {};
        console.log(`[dtmf] digit=${digit} duration=${duration}`);
        // Ack
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              event: "dtmf",
              stream_sid: state.streamSid,
              dtmf: { digit, duration },
            }),
          );
        }
        break;
      }

      // ── mark ──────────────────────────────────────────────────────────────
      case "mark": {
        const name = msg.mark?.name;
        console.log(`[mark] name=${name}`);
        // Ack
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              event: "mark",
              stream_sid: state.streamSid,
              mark: { name },
            }),
          );
        }
        break;
      }

      // ── stop ──────────────────────────────────────────────────────────────
      case "stop": {
        const { call_sid, account_sid, reason } = msg.stop ?? {};
        console.log(
          `[stop] call_sid=${call_sid} account_sid=${account_sid} reason=${reason}` +
            ` total_media_packets=${state.sequenceCount}`,
        );
        break;
      }

      default: {
        console.log(`[unknown event] ${event}`, msg);
      }
    }
  });

  // ── Close / error ─────────────────────────────────────────────────────────
  ws.on("close", (code, reason) => {
    clearTimeout(pingTimer);
    clearTimeout(pongTimeout);
    console.log(
      `[WS] Connection closed — call_sid=${state.callSid ?? "?"} code=${code} reason=${reason}`,
    );
  });

  ws.on("error", (err) => {
    console.error(
      `[WS] Error — call_sid=${state.callSid ?? "?"}:`,
      err.message,
    );
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] Telephony server running on port ${PORT} (echo mode)`);
});
