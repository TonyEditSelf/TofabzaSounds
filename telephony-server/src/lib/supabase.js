/**
 * telephony-server/src/lib/supabase.js
 *
 * Shared Supabase singleton for the telephony server.
 * Previously each module (callHandler.js, callHandlerTwilio.js, llm.js)
 * created its own client, wasting connection pool slots and auth state.
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

if (!process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL env var is required");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY env var is required");
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } },
);
