/**
 * telephony-server/src/lib/callLog.js
 *
 * Creates and updates call_logs rows in Supabase.
 * Non-fatal — failures logged but don't crash the call.
 */

/**
 * @param {object} supabase
 * @param {object} params
 * @returns {Promise<string|null>} callLogId
 */
export async function createCallLog(
  supabase,
  { callSid, agentId, clientId, callerNumber, direction, campaignId },
) {
  try {
    const { data, error } = await supabase
      .from("call_logs")
      .insert({
        call_sid: callSid,
        agent_id: agentId,
        client_id: clientId,
        caller_number: callerNumber,
        direction: direction ?? "inbound",
        campaign_id: campaignId ?? null,
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error("[callLog] create failed:", err?.message);
    return null;
  }
}

/**
 * @param {object} supabase
 * @param {string|null} callLogId
 * @param {object} params
 */
export async function updateCallLog(
  supabase,
  callLogId,
  { status, duration, transcript },
) {
  if (!callLogId) return;
  try {
    await supabase
      .from("call_logs")
      .update({
        status,
        duration_seconds: duration,
        ended_at: new Date().toISOString(),
        ...(transcript ? { transcript } : {}),
      })
      .eq("id", callLogId);
  } catch (err) {
    console.error("[callLog] update failed:", err?.message);
  }
}
