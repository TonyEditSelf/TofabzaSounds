/**
 * public/widget/v1/embed.js
 *
 * Tofabza Sounds Widget — v1
 * Vanilla JS, Shadow DOM, no dependencies.
 * Injected via <script> tag on client sites.
 *
 * Flow:
 *   1. Read window.TofabzaWidgetId
 *   2. Fetch token from /api/widget/token
 *   3. Inject Shadow DOM UI
 *   4. Text input → POST /api/chat → display reply
 *   5. Mic button → MediaRecorder → POST /api/stt → transcript → chat
 */

(function () {
  "use strict";

  const WIDGET_ID = window.TofabzaWidgetId;
  const BASE_URL = "http://localhost:3000";

  if (!WIDGET_ID) {
    console.error("[Tofabza] TofabzaWidgetId is not set.");
    return;
  }

  // ── State ────────────────────────────────────────────────────────────────────

  let token = null;
  let sessionId = crypto.randomUUID();
  let history = [];
  let recording = false;
  let mediaRec = null;
  let audioCtx = null;
  let widgetConfig = null;

  // ── Token fetch ───────────────────────────────────────────────────────────────

  async function fetchToken() {
    try {
      const res = await fetch(`${BASE_URL}/api/widget/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widget_id: WIDGET_ID,
          origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error?.message ?? "Token fetch failed");
      token = data.token;
    } catch (err) {
      console.warn(
        "[Tofabza] Token fetch failed — proceeding without token:",
        err.message,
      );
    }
  }

  // ── Shadow DOM setup ──────────────────────────────────────────────────────────

  function createWidget() {
    const host = document.createElement("div");
    host.id = "tofabza-widget-host";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }

        #bubble {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: var(--accent, #2563EB);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
          z-index: 2147483647;
          transition: transform 0.2s;
        }
        #bubble:hover { transform: scale(1.08); }

        #window {
          position: fixed;
          bottom: 92px;
          right: 24px;
          width: 360px;
          max-height: 520px;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.15);
          display: none;
          flex-direction: column;
          z-index: 2147483646;
          overflow: hidden;
        }
        #window.open { display: flex; }

        #header {
          background: var(--accent, #2563EB);
          padding: 14px 16px;
          color: #fff;
          font-weight: 600;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        #close-btn {
          background: none;
          border: none;
          color: rgba(255,255,255,0.8);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }

        #messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-height: 200px;
          max-height: 340px;
        }

        .msg {
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 0.84rem;
          line-height: 1.5;
          word-break: break-word;
        }
        .msg.user {
          align-self: flex-end;
          background: var(--accent, #2563EB);
          color: #fff;
          border-radius: 12px 12px 0 12px;
        }
        .msg.assistant {
          align-self: flex-start;
          background: #F3F4F6;
          color: #111;
          border-radius: 12px 12px 12px 0;
        }
        .msg.error {
          align-self: flex-start;
          background: #FEE2E2;
          color: #B91C1C;
          font-size: 0.78rem;
        }
        .typing {
          align-self: flex-start;
          background: #F3F4F6;
          border-radius: 12px 12px 12px 0;
          padding: 10px 14px;
          font-size: 1.2rem;
          letter-spacing: 2px;
          color: #9CA3AF;
        }

        #input-bar {
          border-top: 1px solid #E5E7EB;
          padding: 10px 12px;
          display: flex;
          gap: 8px;
          align-items: center;
        }
        #text-input {
          flex: 1;
          border: 1px solid #E5E7EB;
          border-radius: 20px;
          padding: 8px 14px;
          font-size: 0.84rem;
          outline: none;
          font-family: system-ui, sans-serif;
        }
        #text-input:focus { border-color: var(--accent, #2563EB); }

        #send-btn, #mic-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
          transition: background 0.15s;
        }
        #send-btn { background: var(--accent, #2563EB); color: #fff; }
        #send-btn:hover { opacity: 0.85; }
        #mic-btn { background: #F3F4F6; color: #374151; }
        #mic-btn.recording { background: #FEE2E2; color: #E11D48; animation: pulse 1s infinite; }

        #unavailable {
          padding: 2rem;
          text-align: center;
          font-size: 0.84rem;
          color: #6B7280;
          display: none;
        }

        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

        @media (max-width: 480px) {
          #window {
            right: 8px;
            left: 8px;
            width: auto;
            bottom: 80px;
          }
        }
      </style>

      <!-- Bubble button -->
      <button id="bubble" aria-label="Open chat">💬</button>

      <!-- Chat window -->
      <div id="window" role="dialog" aria-label="Chat assistant">
        <div id="header">
          <span id="widget-name">Assistant</span>
          <button id="close-btn" aria-label="Close chat">✕</button>
        </div>
        <div id="messages"></div>
        <div id="unavailable">Chat is temporarily unavailable. Please try again later.</div>
        <div id="call-bar" style="display:none; padding:8px 12px; border-top:1px solid #E5E7EB; align-items:center; justify-content:space-between; gap:8px;">
          <span id="call-timer" style="font-family:monospace; font-size:0.84rem; color:#6B7280;">00:00</span>
          <button id="end-call-btn" style="background:#E11D48; color:#fff; border:none; border-radius:20px; padding:8px 18px; font-size:0.84rem; cursor:pointer;">End Call</button>
        </div>
        <div id="input-bar">
          <input id="text-input" type="text" placeholder="Type a message…" maxlength="500" />
          <button id="send-btn" aria-label="Send">➤</button>
          <button id="mic-btn" aria-label="Record voice">🎤</button>
        </div>
      </div>
    `;

    return shadow;
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────────

  function addMessage(shadow, role, text) {
    const msgs = shadow.getElementById("messages");
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function showTyping(shadow) {
    const msgs = shadow.getElementById("messages");
    const div = document.createElement("div");
    div.className = "typing";
    div.id = "typing-indicator";
    div.textContent = "···";
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping(shadow) {
    shadow.getElementById("typing-indicator")?.remove();
  }

  function setLoading(shadow, loading) {
    const sendBtn = shadow.getElementById("send-btn");
    const input = shadow.getElementById("text-input");
    sendBtn.disabled = loading;
    input.disabled = loading;
  }

  // ── Chat ──────────────────────────────────────────────────────────────────────

  async function sendMessage(shadow, text, detectedLang) {
    if (!text.trim()) return;
    console.log("[tofabza] sendMessage called:", text);

    addMessage(shadow, "user", text);
    history.push({ role: "user", content: text });
    setLoading(shadow, true);
    showTyping(shadow);

    try {
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widget_id: WIDGET_ID,
          session_id: sessionId,
          message: text,
          token,
          history: history.slice(-20),
          language: detectedLang ?? widgetConfig?.language ?? "ml-IN",
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const data = await res.json();
      hideTyping(shadow);

      if (!res.ok || data.error) {
        addMessage(
          shadow,
          "error",
          data?.error?.message ?? "Something went wrong. Please try again.",
        );
        return;
      }

      addMessage(shadow, "assistant", data.reply);
      history.push({ role: "assistant", content: data.reply });

      // Play TTS
      playTTS(
        data.reply,
        data.language ?? detectedLang ?? widgetConfig?.language ?? "ml-IN",
        widgetConfig?.voice_id ?? "anand",
      );
    } catch (err) {
      console.error("[tofabza] chat error:", err);
      hideTyping(shadow);
      if (err.name === "AbortError" || err.name === "TimeoutError") {
        addMessage(shadow, "error", "Response timed out. Please try again.");
      } else {
        addMessage(
          shadow,
          "error",
          "Chat is temporarily unavailable. Please try again later.",
        );
      }
    } finally {
      setLoading(shadow, false);
    }
  }

  // ── Voice Call State ──────────────────────────────────────────────────────────

  let callActive = false;
  let currentTTSSource = null;
  let callStartTime = null;
  let callTimerInterval = null;
  let isProcessing = false; // true while STT/LLM/TTS running — don't listen

  // VAD constants
  const VAD_SILENCE_THRESHOLD = 8; // RMS below this = silence
  const VAD_SILENCE_DURATION = 1500; // ms silence before auto-send
  const MIN_SPEECH_SIZE = 8000; // bytes — skip if too short

  // ── Call controls ─────────────────────────────────────────────────────────────

  function showCallBar(shadow) {
    const callBar = shadow.getElementById("call-bar");
    if (!callBar) return;
    callBar.style.display = "flex";
    callStartTime = Date.now();
    callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      const timerEl = shadow.getElementById("call-timer");
      if (timerEl) timerEl.textContent = `${mm}:${ss}`;
    }, 1000);
  }

  function hideCallBar(shadow) {
    const callBar = shadow.getElementById("call-bar");
    if (callBar) callBar.style.display = "none";
    if (callTimerInterval) {
      clearInterval(callTimerInterval);
      callTimerInterval = null;
    }
    callStartTime = null;
    const timerEl = shadow.getElementById("call-timer");
    if (timerEl) timerEl.textContent = "00:00";
  }

  function endCall(shadow) {
    callActive = false;
    isProcessing = false;
    if (currentTTSSource) {
      try {
        currentTTSSource.stop();
      } catch (_) {}
      currentTTSSource = null;
    }
    hideCallBar(shadow);
    shadow.getElementById("mic-btn").textContent = "🎤";
    shadow.getElementById("mic-btn").classList.remove("recording");
    addMessage(shadow, "assistant", "Call ended.");
  }

  // ── Single listen cycle ───────────────────────────────────────────────────────

  async function listenOnce(shadow) {
    console.log(
      "[tofabza] listenOnce — callActive:",
      callActive,
      "isProcessing:",
      isProcessing,
    );
    if (!callActive || isProcessing) return;

    const mimeType = getSupportedMimeType();
    const options = mimeType ? { mimeType } : {};
    const chunks = [];

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      endCall(shadow);
      return;
    }

    const rec = new MediaRecorder(stream, options);

    // VAD setup
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") await audioCtx.resume();

    const vadSource = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    vadSource.connect(analyser);

    const dataArr = new Uint8Array(analyser.frequencyBinCount);
    let speechDetected = false;
    let silenceStart = null;
    let vadRunning = true;

    // Update mic indicator
    shadow.getElementById("mic-btn").classList.add("recording");
    shadow.getElementById("mic-btn").textContent = "🎤";

    function checkVAD() {
      if (!vadRunning || !callActive) return;
      analyser.getByteTimeDomainData(dataArr);

      let sum = 0;
      for (let i = 0; i < dataArr.length; i++) {
        const v = (dataArr[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArr.length) * 100;

      if (rms > VAD_SILENCE_THRESHOLD) {
        speechDetected = true;
        silenceStart = null;
      } else if (speechDetected) {
        if (!silenceStart) silenceStart = Date.now();
        if (Date.now() - silenceStart > VAD_SILENCE_DURATION) {
          vadRunning = false;
          rec.stop();
          return;
        }
      }
      requestAnimationFrame(checkVAD);
    }

    // Hard 30s cap
    const hardStop = setTimeout(() => {
      if (vadRunning) {
        vadRunning = false;
        rec.stop();
      }
    }, 30_000);

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    rec.onstop = async () => {
      clearTimeout(hardStop);
      vadRunning = false;
      stream.getTracks().forEach((t) => t.stop());
      shadow.getElementById("mic-btn").classList.remove("recording");

      if (!callActive) return;

      const totalSize = chunks.reduce((s, c) => s + c.size, 0);
      if (totalSize < MIN_SPEECH_SIZE || !speechDetected) {
        // No speech — listen again
        setTimeout(() => listenOnce(shadow), 300);
        return;
      }

      // Process speech
      isProcessing = true;
      shadow.getElementById("mic-btn").textContent = "⏳";

      try {
        // STT
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "audio");

        const sttRes = await fetch(`${BASE_URL}/api/stt`, {
          method: "POST",
          headers: { "X-Audio-Mime": mimeType || "audio/webm" },
          body: formData,
          signal: AbortSignal.timeout(15_000),
        });
        const sttData = await sttRes.json();

        if (!sttRes.ok || !sttData.transcript) {
          addMessage(shadow, "error", "Didn't catch that.");
          isProcessing = false;
          shadow.getElementById("mic-btn").textContent = "🎤";
          setTimeout(() => listenOnce(shadow), 500);
          return;
        }

        // Show transcript
        addMessage(shadow, "user", sttData.transcript);
        history.push({ role: "user", content: sttData.transcript });

        // Chat
        showTyping(shadow);
        const chatRes = await fetch(`${BASE_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            widget_id: WIDGET_ID,
            session_id: sessionId,
            message: sttData.transcript,
            token,
            history: history.slice(-20),
            language: sttData.languageCode,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        const chatData = await chatRes.json();
        hideTyping(shadow);

        if (!chatRes.ok || !chatData.reply) {
          addMessage(
            shadow,
            "error",
            "I had trouble responding. Please try again.",
          );
          isProcessing = false;
          shadow.getElementById("mic-btn").textContent = "🎤";
          setTimeout(() => listenOnce(shadow), 500);
          return;
        }

        history.push({ role: "assistant", content: chatData.reply });

        // TTS first — show text after speaking
        await playTTSAndWait(
          chatData.reply,
          chatData.language ??
            sttData.languageCode ??
            widgetConfig?.language ??
            "ml-IN",
          widgetConfig?.voice_id ?? "anand",
        );
        // Show text after TTS finishes
        addMessage(shadow, "assistant", chatData.reply);
      } catch (err) {
        hideTyping(shadow);
        addMessage(shadow, "error", "Something went wrong. Continuing call...");
      } finally {
        isProcessing = false;
        shadow.getElementById("mic-btn").textContent = "🎤";
        console.log(
          "[tofabza] loop check — callActive:",
          callActive,
          "isProcessing:",
          isProcessing,
        );
        if (callActive) setTimeout(() => listenOnce(shadow), 300);
      }
    };
    // dfdsfd fdsfdfsdfds

    rec.start(200);
    requestAnimationFrame(checkVAD);
  }

  // ── TTS with await ────────────────────────────────────────────────────────────

  async function playTTSAndWait(text, language, speaker) {
    return new Promise(async (resolve) => {
      try {
        const res = await fetch(`${BASE_URL}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language, speaker, pace: 1.0 }),
        });
        if (!res.ok) {
          resolve();
          return;
        }

        const arrayBuffer = await res.arrayBuffer();
        if (!audioCtx)
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") await audioCtx.resume();

        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        currentTTSSource = source;
        source.onended = () => {
          currentTTSSource = null;
          resolve();
        };
        // If call ended during TTS, resolve immediately
        if (!callActive) {
          resolve();
          return;
        }
        source.start();
      } catch {
        resolve();
      }
    });
  }

  // ── Start call ────────────────────────────────────────────────────────────────

  async function startCall(shadow) {
    if (callActive) return;
    callActive = true;
    showCallBar(shadow);

    // Play greeting then start listening
    if (widgetConfig?.greeting) {
      addMessage(shadow, "assistant", widgetConfig.greeting);
      await playTTSAndWait(
        widgetConfig.greeting,
        widgetConfig.language ?? "ml-IN",
        widgetConfig.voice_id ?? "anand",
      );
    }

    listenOnce(shadow);
  }

  // Keep getSupportedMimeType here
  function getSupportedMimeType() {
    const PREFERRED_FORMATS = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const fmt of PREFERRED_FORMATS) {
      if (MediaRecorder.isTypeSupported(fmt)) return fmt;
    }
    return "";
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  async function init() {
    await fetchToken();

    const shadow = createWidget();
    const bubble = shadow.getElementById("bubble");
    const win = shadow.getElementById("window");
    const closeBtn = shadow.getElementById("close-btn");
    const sendBtn = shadow.getElementById("send-btn");
    const input = shadow.getElementById("text-input");
    const micBtn = shadow.getElementById("mic-btn");

    // Apply accent color from config if available
    try {
      const wRes = await fetch(`${BASE_URL}/api/widget/${WIDGET_ID}/config`);
      if (wRes.ok) {
        widgetConfig = await wRes.json();
        const accent = widgetConfig?.accentColor ?? "#2563EB";
        shadow.host.style.setProperty("--accent", accent);
        shadow.getElementById("widget-name").textContent =
          widgetConfig?.name ?? "Assistant";

        // Greeting shown when call starts — not here
      }
    } catch (_) {}

    // Toggle open/close
    bubble.addEventListener("click", () => {
      const isOpen = win.classList.toggle("open");
      bubble.textContent = isOpen ? "✕" : "💬";
      if (isOpen) {
        input.focus();
        // Unlock AudioContext on user gesture
        if (!audioCtx)
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
      }
    });

    closeBtn.addEventListener("click", () => {
      win.classList.remove("open");
      bubble.textContent = "💬";
    });

    // Send on button click
    sendBtn.addEventListener("click", async () => {
      if (callActive) return; // call loop handles messaging
      const text = input.value.trim();
      input.value = "";
      await sendMessage(shadow, text);
    });

    // Send on Enter
    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (callActive) return; // call loop handles messaging
        const text = input.value.trim();
        input.value = "";
        await sendMessage(shadow, text);
      }
    });

    // End call
    const endCallBtn = shadow.getElementById("end-call-btn");
    if (endCallBtn) {
      endCallBtn.addEventListener("click", () => endCall(shadow));
    }

    // Mic toggle
    micBtn.addEventListener("click", () => {
      if (!callActive) {
        startCall(shadow);
      } else {
        endCall(shadow);
      }
    });
  }

  // Start after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
