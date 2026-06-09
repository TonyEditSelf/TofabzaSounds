const fs = require('fs');

function processTwilio() {
  const file = 'telephony-server/src/websocket/callHandlerTwilio.js';
  let content = fs.readFileSync(file, 'utf8');

  // 1. Import logger
  content = content.replace(
    'import { createCallLog, updateCallLog } from "../lib/callLog.js";',
    'import { createCallLog, updateCallLog } from "../lib/callLog.js";\nimport { Logger, loggerContext } from "../lib/logger.js";'
  );

  // 2. Setup context in handleCall
  content = content.replace(
    'export function handleCall(ws, req) {',
    'export function handleCall(ws, req) {\n  const loggerCtx = Logger.createContext();\n  loggerContext.run(loggerCtx, () => _handleCall(ws, req));\n}\n\nfunction _handleCall(ws, req) {'
  );

  // 3. Add callSid to logger context
  content = content.replace(
    /streamSid = msg\.streamSid \?\? msg\.start\?\.streamSid;\s*callSid = msg\.start\?\.callSid;/,
    'streamSid = msg.streamSid ?? msg.start?.streamSid;\n        callSid = msg.start?.callSid;\n        Logger.setState({ callSid });'
  );

  // 4. Update console.log to Logger.log
  content = content.replace(/console\.log\(\s*`\[twilio\]/g, 'Logger.log("WS", `');
  content = content.replace(/console\.log\(\s*"\[twilio\]/g, 'Logger.log("WS", "');
  content = content.replace(/console\.error\(\s*"\[twilio\]/g, 'Logger.error("WS", "');
  content = content.replace(/console\.warn\(\s*`\[twilio\]/g, 'Logger.warn("WS", `');
  
  // Specific stages
  content = content.replace(/console\.log\(\s*`\[twilio\/stt\/interim\]/g, 'Logger.log("STT:INTERIM", `');
  content = content.replace(/console\.log\(\s*`\[twilio\/stt\/final\]/g, 'Logger.log("STT", `');
  content = content.replace(/console\.error\(\s*"\[twilio\/stt\/stream\]/g, 'Logger.error("STT", "');
  content = content.replace(/console\.log\(\s*`\[twilio\/llm\]/g, 'Logger.log("LLM", `');
  content = content.replace(/console\.error\(\s*"\[twilio\/llm\]/g, 'Logger.error("LLM", "');
  content = content.replace(/console\.warn\(\s*"\[twilio\/llm\]/g, 'Logger.warn("LLM", "');
  content = content.replace(/console\.log\(\s*`\[twilio\/tts\/batch\]/g, 'Logger.log("TTS", `');
  content = content.replace(/console\.log\(\s*`\[twilio\/tts\/stream\]/g, 'Logger.log("TTS", `');
  content = content.replace(/console\.log\(\s*`\[twilio\/pipeline\]/g, 'Logger.log("PIPELINE", `');
  content = content.replace(/console\.log\(\s*`\[twilio\/vad\]/g, 'Logger.log("AUDIO", `');

  // 5. Add VAD logging
  content = content.replace(
    'isSpeaking = true;',
    'isSpeaking = true;\n        Logger.log("AUDIO", "speech_start detected");'
  );

  content = content.replace(
    /silenceMs = 0;\n\s*isSpeaking = false;/g,
    'Logger.log("AUDIO", `speech_end detected (silence_duration_ms=${silenceMs})`);\n      silenceMs = 0;\n      isSpeaking = false;'
  );

  // 6. Add Payload & Sequence number logging
  content = content.replace(
    /case "media":\s*\{/,
    'case "media": {\n        const seq = msg.sequenceNumber ?? msg.media?.chunk;\n        Logger.log("AUDIO", `Received media chunk=${seq} size=${data.length} bytes`);\n        Logger.setState({ currentStage: "MEDIA_IN" });'
  );

  // 7. Add Anomaly flags
  content = content.replace(
    'console.log(`[twilio/vad] ignored short utterance ${durationMs}ms`);',
    'Logger.anomaly("AUDIO", `ignored short utterance ${durationMs}ms`);'
  );

  // 8. Add End of Call Performance Summary
  content = content.replace(
    'console.log(`[twilio] callEnded callSid=${callSid}`);',
    'Logger.log("WS", `callEnded callSid=${callSid}`);\n      Logger.perfSummary();'
  );

  fs.writeFileSync('scratch/callHandlerTwilio.instrumented.js', content);
}

processTwilio();
