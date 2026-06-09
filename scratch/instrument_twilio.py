import os
import re

def process_twilio(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Imports
    content = re.sub(
        r'(import \{ createCallLog, updateCallLog \} from "../lib/callLog.js";)',
        r'\1\nimport { Logger, loggerContext } from "../lib/logger.js";',
        content
    )

    # HandleCall wrap
    content = re.sub(
        r'export function handleCall\(ws, req\) \{\n  console.log\("\[twilio\] handler hit"\);',
        'export function handleCall(ws, req) {\n  const loggerCtx = Logger.createContext();\n  ws.loggerCtx = loggerCtx;\n  loggerContext.run(loggerCtx, () => {\n  Logger.log("WS", "handler hit");',
        content
    )
    
    # Close the handleCall wrapper at the very end of the file
    # We replace the last closing brace.
    content = content.replace('}\n', '  });\n}\n', 1) # wait, replacing '}\n' 1 time from end is tricky.
    # It's easier to use a regex that matches the end of the file.
    content = re.sub(r'\}\s*$', '  });\n}\n', content)

    # Add callSid
    content = re.sub(
        r'(callSid = msg\.start\?\.callSid;\n\s*)console\.log\(`\[twilio\] start callSid=\$\{callSid\}`\);',
        r'\1Logger.setState({ callSid });\n        Logger.log("WS", `start callSid=${callSid}`);',
        content
    )

    # Basic logs
    content = content.replace('console.log(`[twilio]', 'Logger.log("WS", `')
    content = content.replace('console.log("[twilio]', 'Logger.log("WS", "')
    content = content.replace('console.error("[twilio]', 'Logger.error("WS", "')
    content = content.replace('console.warn(`[twilio]', 'Logger.warn("WS", `')

    content = content.replace('console.log(`[twilio/stt/interim]', 'Logger.log("STT:INTERIM", `')
    content = content.replace('console.log(`[twilio/stt/final]', 'Logger.log("STT", `')
    content = content.replace('console.log(`[twilio/stt]', 'Logger.log("STT", `')
    content = content.replace('console.error("[twilio/stt/stream]', 'Logger.error("STT", "')
    content = content.replace('console.warn(`[twilio/stt/stream]', 'Logger.warn("STT", `')

    content = content.replace('console.log(`[twilio/llm]', 'Logger.log("LLM", `')
    content = content.replace('console.error("[twilio/llm]', 'Logger.error("LLM", "')
    content = content.replace('console.warn("[twilio/llm]', 'Logger.warn("LLM", "')

    content = content.replace('console.log(`[twilio/tts/batch]', 'Logger.log("TTS", `')
    content = content.replace('console.log(`[twilio/tts/stream]', 'Logger.log("TTS", `')

    content = content.replace('console.log(`[twilio/pipeline]', 'Logger.log("PIPELINE", `')
    content = content.replace('console.log(`[twilio/vad]', 'Logger.log("AUDIO", `')

    # Media chunks
    content = re.sub(
        r'(case "media": \{\n\s*const payload = msg\.media\?\.payload;\n\s*if \(!payload\) return;)',
        r'\1\n        const seq = msg.sequenceNumber ?? msg.media?.chunk;\n        Logger.log("AUDIO", `Received media chunk=${seq} size=${data.length} bytes`);\n        Logger.setState({ currentStage: "MEDIA_IN", bufferSize: pcmChunks.length });',
        content
    )

    # VAD start
    content = re.sub(
        r'(if \(!isSpeaking\) \{\n\s*isSpeaking = true;)',
        r'\1\n            Logger.log("AUDIO", "speech_start detected");',
        content
    )

    # VAD end
    content = re.sub(
        r'(if \(silenceMs >= VAD_SILENCE_DURATION\) \{)',
        r'\1\n              Logger.log("AUDIO", `speech_end detected (silence_duration_ms=${silenceMs})`);\n              Logger.setState({ currentStage: "VAD_SPEECH_END", totalTurns: ctx?.state.totalTurns + 1 });',
        content
    )
    
    content = content.replace('ctx?.state', 'loggerCtx.state')

    # Anomalies
    content = content.replace(
        'Logger.log("AUDIO", `ignored short utterance ${durationMs}ms`);',
        'Logger.anomaly("AUDIO", `ignored short utterance ${durationMs}ms`);'
    )
    content = content.replace(
        'console.warn(\n                      `[twilio/stt/fallback] streaming returned no transcript; using batch audioMs=${fallbackDurationMs}`,\n                    );',
        'Logger.anomaly("STT", `streaming returned no transcript; using batch audioMs=${fallbackDurationMs}`);'
    )

    # Wrap WS message block
    content = re.sub(
        r'ws\.on\("message", async \(data\) => \{',
        r'ws.on("message", (data) => {\n    loggerContext.run(ws.loggerCtx, async () => {',
        content
    )
    # the end of ws.on message is before ws.on("close", ...)
    content = re.sub(
        r'(\n  \}\);\n\n  ws\.on\("close")',
        r'\n    });\n\1',
        content
    )

    # Wrap WS close block
    content = re.sub(
        r'ws\.on\("close", \(\) => \{',
        r'ws.on("close", () => {\n    loggerContext.run(ws.loggerCtx, () => {',
        content
    )
    # the end of ws.on close is before the end of handleCall
    content = re.sub(
        r'(if \(streamingStt\) \{\n\s*streamingStt\.close\(\);\n\s*\}\n\s*\});)',
        r'\1\n    });',
        content
    )

    # Call ended summary
    content = content.replace(
        'Logger.log("WS", `callEnded callSid=${callSid}`);\n    if (callTimeout) clearTimeout(callTimeout);',
        'Logger.log("WS", `callEnded callSid=${callSid}`);\n    Logger.perfSummary();\n    if (callTimeout) clearTimeout(callTimeout);'
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

process_twilio('telephony-server/src/websocket/callHandlerTwilio.js')
