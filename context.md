Project Context
Overview
Tofabza Sounds is a Next.js 16 App Router dashboard plus a separate Node/WebSocket telephony service for AI phone agents. The dashboard manages clients, agents, campaigns, onboarding submissions, API keys, settings, knowledge bases, call logs, costs, and analytics. The Railway service handles live call audio, STT, LLM/RAG, TTS, and call-log updates.

The Next app uses Supabase for Auth, Postgres, and Storage. Most route handlers use a service-role Supabase client after operator/session checks. Runtime telephony is provider-abstracted in lib/telephony/\*, with Exotel and Twilio partially wired; MyOperator/Plivo provider files exist but are not clearly integrated into app routes/websocket handling.

The voice pipeline is split: dashboard preview/API code lives in lib/sarvam/_, lib/google/_, app/api/voices/\*; live calls use Railway-only code in telephony-server/src/voice/provider.js, reading env directly and avoiding Next/server-only imports.

Architecture
Frontend/framework: Next.js 16, React 19, App Router, JavaScript-only. Pages/routes under app/_.
Backend/services: Next route handlers under app/api/_; Railway Node service under telephony-server/src/_.
Database: Supabase Postgres inferred from .from() usage; no migrations/schema files found.
Deployment: Next app on Vercel (vercel.json); telephony server on Railway via telephony-server/Dockerfile and railway.toml.
State management: SWR-style server data in pages; persisted Zustand UI store in store/ui.js (tofabza-ui localStorage).
Authentication: Supabase Auth. proxy.js protects most paths, rate-limits login/API via optional Upstash, and hardcodes ALLOWED_EMAIL = tonyeappen@tofabza.com. lib/auth/requireOperator.js uses OPERATOR_EMAIL.
Major Modules
Dashboard shell/UI: app/dashboard/layout.js, components/layout/Sidebar.js, app/globals.css, store/ui.js.
Auth/login/middleware: app/login/page.js, proxy.js, lib/auth/requireOperator.js, lib/supabase/_.
Clients: app/dashboard/clients/_, app/api/clients/[id]/delete-data/route.js.
Agents/onboarding: app/dashboard/agents/_, app/dashboard/onboarding/_, app/onboard/[agent_id]/page.js, app/api/onboard/[agent_id]/_.
Campaigns/contacts: app/dashboard/campaigns/_, app/api/campaigns/[id]/contacts/route.js, app/api/campaigns/[id]/launch/route.js, app/api/cron/campaigns/route.js.
Telephony provider abstraction: lib/telephony/index.js, lib/telephony/types.js, lib/telephony/providers/_.
Webhooks: app/api/webhooks/exotel/_, app/api/webhooks/twilio/[agent_id]/route.js.
Live telephony service: telephony-server/src/index.js, websocket/callHandler.js, websocket/callHandlerTwilio.js, voice/provider.js, pipeline/llm.js.
RAG/KB: lib/rag/_, lib/gemini/embeddings.js, app/api/kb/_, app/api/rag/query/route.js.
Settings/secrets: lib/settings.js, app/api/settings/route.js, lib/encryption/index.js.
Logging/costs/email: lib/logger.js, app/api/logs/route.js, lib/costs/pricing.js, lib/email/client.js.
Core Data Model
clients: parent for agents, campaigns, call logs, KBs.
agents: belongs to clients; fields used include id, client_id, name, type, status, language, config. config stores prompt/greeting/voice/fallback/LLM/runtime options.
campaigns: client_id, agent_id, status, scheduled_at, config; cron launches due scheduled rows.
contacts: campaign contacts; campaign_id, phone, name, status, call_sid, called_at.
call_logs: call lifecycle; call_sid, agent_id, client_id, campaign_id, caller_number, direction, status, duration_seconds, total_cost_inr, transcript, timestamps.
knowledge_bases: KB metadata; active owner pattern is owner_type="agent", owner_id=agents.id.
kb_chunks: content chunks with embeddings; queried through RPC match_chunks.
settings: key, value, is_sensitive; sensitive values encrypted as iv:tag:ciphertext.
api_keys: name, key_hash, key_prefix, last_used; raw keys are returned once only.
onboarding_submissions, prompt_templates, voices, debug_logs, debug_logs_retention_summary.
Storage buckets inferred: onboarding-files.
Runtime Flows
Auth: proxy.js skips public /login and /api/webhooks/_, checks Supabase session, enforces hardcoded email, attaches CSP/security headers. API routes often also call requireOperator().
Campaign launch: POST /api/campaigns/[id]/launch loads campaign + pending contacts, marks campaign running, calls telephony.initiateCall, inserts call_logs, updates contact call_sid, throttles 1 call/2s, then marks campaign completed.
Scheduled campaigns: GET /api/cron/campaigns with Authorization: Bearer CRON_SECRET finds due campaigns and POSTs internally to launch route with x-internal-secret.
Exotel inbound: POST /api/webhooks/exotel/[agent_id] validates active agent and returns JSON WSS config to Railway /ws/call?agent_id=....
Twilio inbound: POST /api/webhooks/twilio/[agent_id] returns TwiML <Connect><Stream> to Railway /ws/twilio, passing agent_id.
Live call: Railway loads active agent, plays greeting, buffers audio, VAD triggers on silence, STT via Sarvam/Google, fetches RAG context from Next /api/rag/query, calls Vertex AI Gemini, TTS via Sarvam/Google, streams audio back, updates call_logs.
KB upload/query: upload extracts PDF/TXT/MD/DOCX text, chunks, embeds via Vertex AI Gemini, inserts knowledge_bases/kb_chunks; query uses RPC match_chunks.
Integrations
Supabase: DB/Auth/Storage; NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, Railway uses SUPABASE_URL.
Exotel: outbound/inbound/status/AgentStream; EXOTEL_ACCOUNT_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_SUBDOMAIN, EXOTEL_EXOPHONE.
Twilio: partial outbound/inbound/media support; TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.
Sarvam: STT/TTS/voices; SARVAM_API_KEY, optional base URL/timeouts/defaults.
Google Cloud: STT/TTS via service account in live service; preview helpers under lib/google/_.
Vertex AI Gemini: chat + embeddings; VERTEX_AI_PROJECT_ID, VERTEX_AI_LOCATION, service account credentials, model defaults.
Upstash: optional proxy rate limits.
Resend: operator emails.
Sentry: configured in instrumentation_ and sentry.\*.config.js.
Important Configuration
TELEPHONY_PROVIDER, VOICE_PROVIDER, RAILWAY_WS_URL, NEXTJS_URL, NEXT_PUBLIC_APP_URL, INTERNAL_API_SECRET, CRON_SECRET, SETTINGS_ENCRYPTION_KEY, MAX_CALL_DURATION_S, OPERATOR_EMAIL, UPSTASH_REDIS_REST_URL/TOKEN, RESEND_API_KEY, RESEND_FROM_ADDRESS.
