import { AsyncLocalStorage } from "async_hooks";

export const loggerContext = new AsyncLocalStorage();

export const Logger = {
  get context() {
    return loggerContext.getStore();
  },

  _formatPrefix(stage) {
    const ctx = this.context;
    if (!ctx) return `[${stage}]`;
    const delta = Date.now() - ctx.callStart;
    const sid = ctx.callSid ? ` ${ctx.callSid}` : "";
    return `+${delta}ms${sid} [${stage}]`;
  },

  log(stage, ...args) {
    console.log(this._formatPrefix(stage), ...args);
  },

  warn(stage, ...args) {
    console.warn(this._formatPrefix(stage), ...args);
  },

  error(stage, ...args) {
    console.error(this._formatPrefix(stage), ...args);
  },

  anomaly(stage, reason, additionalInfo = {}) {
    this.warn(stage, `ANOMALY: ${reason}`, additionalInfo);
    this.snapshot(stage, `Triggered by anomaly: ${reason}`);
  },

  snapshot(stage, reason = "Manual Snapshot") {
    const ctx = this.context;
    if (!ctx) return;
    console.error(
      this._formatPrefix(stage),
      "--- PIPELINE STATE SNAPSHOT ---",
      `\nReason: ${reason}`,
      `\nActive Call ID: ${ctx.callSid || "Unknown"}`,
      `\nCurrent Stage: ${ctx.state.currentStage}`,
      `\nBuffer Size (PCM): ${ctx.state.bufferSize}`,
      `\nLast STT Result: "${(ctx.state.lastStt || "").slice(0, 100)}"`,
      `\nLast LLM Response: "${(ctx.state.lastLlm || "").slice(0, 100)}"`,
      `\nTTS Queue Depth: ${ctx.state.ttsQueueDepth}`,
      `\nTotal Turns: ${ctx.state.totalTurns}`,
      "\n-------------------------------"
    );
  },

  perfSummary(stage = "PERF") {
    const ctx = this.context;
    if (!ctx) return;
    
    const callDuration = Date.now() - ctx.callStart;
    const sttAvg = ctx.state.sttCount ? Math.round(ctx.state.sttTotalLatency / ctx.state.sttCount) : 0;
    const llmAvg = ctx.state.llmCount ? Math.round(ctx.state.llmTotalLatency / ctx.state.llmCount) : 0;
    const ttsAvg = ctx.state.ttsCount ? Math.round(ctx.state.ttsTotalLatency / ctx.state.ttsCount) : 0;

    console.log(
      this._formatPrefix(stage),
      "--- END OF CALL SUMMARY ---",
      `\nTotal Duration: ${callDuration}ms`,
      `\nTotal Turns: ${ctx.state.totalTurns}`,
      `\nAvg STT Latency: ${sttAvg}ms`,
      `\nAvg LLM TTFT Latency: ${llmAvg}ms`,
      `\nAvg TTS Latency: ${ttsAvg}ms`,
      `\nAnomalies Detected: ${ctx.state.anomalies}`,
      "\n---------------------------"
    );
  },

  setState(updates) {
    const ctx = this.context;
    if (!ctx) return;
    Object.assign(ctx.state, updates);
  },

  trackLatency(metric, ms) {
    const ctx = this.context;
    if (!ctx) return;
    if (metric === "stt") {
      ctx.state.sttCount++;
      ctx.state.sttTotalLatency += ms;
    } else if (metric === "llm") {
      ctx.state.llmCount++;
      ctx.state.llmTotalLatency += ms;
    } else if (metric === "tts") {
      ctx.state.ttsCount++;
      ctx.state.ttsTotalLatency += ms;
    }
  },

  createContext(callSid = null) {
    return {
      callSid,
      callStart: Date.now(),
      state: {
        currentStage: "CONNECTED",
        bufferSize: 0,
        lastStt: "",
        lastLlm: "",
        ttsQueueDepth: 0,
        totalTurns: 0,
        anomalies: 0,
        // Latency tracking
        sttCount: 0,
        sttTotalLatency: 0,
        llmCount: 0,
        llmTotalLatency: 0,
        ttsCount: 0,
        ttsTotalLatency: 0,
      }
    };
  }
};
