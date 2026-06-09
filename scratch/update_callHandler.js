const fs = require('fs');
const file = 'telephony-server/src/websocket/callHandler.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('import { getLLMReply } from "../pipeline/llm.js";', 'import { getLLMReply, streamLLMReply } from "../pipeline/llm.js";');

const varsToAdd = '  let markCounter = 0;\n  let playbackGeneration = 0;\n  let activeReplyAbort = null;\n  let pendingUserTranscript = null;';
content = content.replace('  let markCounter = 0;', varsToAdd);

const pipelineRegex = /\/\/\s*── Pipeline ──[\s\S]+?(?=\/\/\s*── Message handler ──)/;
const newPipeline = `// ── Pipeline ──────────────────────────────────────────────────────────────

  function takeReadyTtsChunks(text, force = false, minChars = 20) {
    const TTS_MIN_CHARS = 20;
    const TTS_MAX_CHARS = 130;
    const chunks = [];
    let rest = text.replace(/\\s+/g, " ");

    while (rest.trim().length) {
      const boundaryMatches = [...rest.matchAll(/[.!?\\u0964]\\s+/g)];
      const boundary = boundaryMatches.find((m) => m.index + m[0].length >= minChars);
      if (boundary) {
        const end = boundary.index + boundary[0].length;
        chunks.push(rest.slice(0, end).trim());
        rest = rest.slice(end).trimStart();
        continue;
      }
      if (rest.length >= TTS_MAX_CHARS) {
        const splitAt = rest.lastIndexOf(" ", TTS_MAX_CHARS);
        const end = splitAt > TTS_MIN_CHARS ? splitAt : TTS_MAX_CHARS;
        chunks.push(rest.slice(0, end).trim());
        rest = rest.slice(end).trimStart();
        continue;
      }
      break;
    }
    if (force && rest.trim()) {
      chunks.push(rest.trim());
      rest = "";
    }
    return { chunks, rest };
  }

  async function runReplyPipeline(transcript, initialTurn = false) {
    if (isProcessing || !agent) return;
    isProcessing = true;

    const t0 = Date.now();
    const generation = ++playbackGeneration;
    const activeLang = normalizeLanguageCode(agent.language ?? lang);
    const voiceProvider = getVoiceProvider(agent.config);
    const activeVoiceId = resolveVoiceId({
      languageCode: activeLang,
      agentConfig: agent.config,
      voiceProvider,
    });

    try {
      if (isBotSpeaking && !initialTurn) sendClear();

      let reply = "";
      let streamedReplyText = "";
      let pendingText = "";
      let ttsQueue = Promise.resolve();

      const enqueueTts = (text) => {
        if (!text?.trim()) return;
        const chunkText = text.replace(/\\([^)]*\\)/g, "").replace(/["*]/g, "").replace(/\\s+/g, " ").trim();
        if (!chunkText) return;

        ttsQueue = ttsQueue.then(async () => {
          if (activeReplyAbort?.signal.aborted || generation !== playbackGeneration) return;
          console.log(\`[tts/batch] chunk chars=\${chunkText.length}\`);
          const wav = await tts({
            text: chunkText,
            languageCode: activeLang,
            voiceId: activeVoiceId,
            pace: agent.config?.pace ?? 1.0,
            agentConfig: agent.config,
            voiceProvider,
          });
          if (activeReplyAbort?.signal.aborted || generation !== playbackGeneration) return;
          sendAudio(stripWavHeader(wav));
        });
      };

      activeReplyAbort = new AbortController();

      try {
        reply = await streamLLMReply({
          agentId: agent.id,
          history,
          language: activeLang,
          config: agent.config,
          signal: activeReplyAbort.signal,
          initialTurn,
          onToken: (token) => {
            streamedReplyText += token;
            pendingText += token;
            const ready = takeReadyTtsChunks(pendingText, false, 20);
            pendingText = ready.rest;
            ready.chunks.forEach(enqueueTts);
          },
        });

        const finalChunks = takeReadyTtsChunks(pendingText, true);
        finalChunks.chunks.forEach(enqueueTts);
        await ttsQueue;

      } catch (err) {
        if (err?.name === "AbortError") return;
        console.warn("[llm] streaming failed, falling back:", err?.message);
      }

      if (!reply?.trim() && streamedReplyText.trim()) {
        reply = streamedReplyText.trim();
      }

      if (!reply?.trim()) {
        reply = await getLLMReply({
          agentId: agent.id,
          history,
          language: activeLang,
          config: agent.config,
          initialTurn,
        });
        if (!reply?.trim()) {
          reply = agent?.config?.fallback_message ?? "I am sorry, please try again.";
        }
        const wav = await tts({
          text: reply,
          languageCode: activeLang,
          voiceId: activeVoiceId,
          pace: agent.config?.pace ?? 1.0,
          agentConfig: agent.config,
          voiceProvider,
        });
        sendAudio(stripWavHeader(wav));
      }

      console.log(\`[llm] "\${reply.slice(0, 80)}"\`);
      history = history.slice(-39);
      history.push({ role: "assistant", content: reply });
      console.log(\`[pipeline] reply done in \${Date.now() - t0}ms\`);
    } catch (err) {
      console.error("[pipeline error]", err?.message);
    } finally {
      if (activeReplyAbort) activeReplyAbort = null;
      isProcessing = false;
      if (pendingUserTranscript) {
        const queued = pendingUserTranscript;
        pendingUserTranscript = null;
        runReplyPipeline(queued).catch(err => console.error("[pipeline queued]", err?.message));
      }
    }
  }

  async function runPipeline(pcmBuffer) {
    if (isProcessing || !agent) return;
    isProcessing = true;
    const t0 = Date.now();
    try {
      if (isBotSpeaking) sendClear();
      const voiceProvider = getVoiceProvider(agent.config);
      const chimeTimer = setTimeout(() => playThinkingChime(), PIPELINE_TIMEOUT_MS);
      const activeLang = normalizeLanguageCode(agent.language ?? lang);
      const transcript = await stt({
        audioBuffer: pcmBuffer,
        languageCode: activeLang,
        mimeType: "audio/wav",
        agentConfig: agent.config,
        voiceProvider,
      });
      clearTimeout(chimeTimer);
      if (!transcript?.trim()) {
        isProcessing = false;
        return;
      }
      console.log(\`[stt] "\${transcript}"\`);
      history.push({ role: "user", content: transcript });
      isProcessing = false;
      await runReplyPipeline(transcript, false);
    } catch (err) {
      console.error("[pipeline stt]", err?.message);
      isProcessing = false;
    }
  }

  async function playThinkingChime() {
    const silence = Buffer.alloc(3200, 0);
    sendAudio(silence);
  }

  async function playInitialReply() {
    await runReplyPipeline("", true);
  }

`;

content = content.replace(pipelineRegex, newPipeline);
fs.writeFileSync(file, content);
console.log('Successfully updated callHandler.js');
