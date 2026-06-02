# Project Context - Tofabza Sounds

This is a Next.js 16 App Router dashboard plus a separate Railway WebSocket telephony server for AI phone agents. The app is Exotel-only now. Do not reintroduce public widget/embed routes or Plivo code.

## What Exists

- Dashboard/auth: `app/dashboard/*`, `app/login/page.js`, `proxy.js`, `lib/auth/requireOperator.js`.
- Clients: CRUD, detail tabs, checklist, call-data deletion in `app/dashboard/clients/*` and `app/api/clients/[id]/delete-data/route.js`.
- Agents: create/edit/configure agents, onboarding links, Exotel webhook display, KB upload/delete in `app/dashboard/agents/*`.
- Campaigns: campaign CRUD, CSV/contact handling, cron launch, Exotel outbound calls, contact status APIs in `app/dashboard/campaigns/*`, `app/api/cron/campaigns/route.js`, `app/api/campaigns/[id]/*`.
- Calls/analytics/costs: dashboard pages under `app/dashboard/calls`, `analytics`, and `costs`.
- Voice tooling: Sarvam voices plus Google TTS preview in `app/dashboard/voice-explorer/page.js`, `lib/sarvam/*`, `lib/google/*`, `app/api/voices/google-preview/route.js`.
- RAG/KB: upload, extraction, chunking, embeddings, and search in `lib/rag/*`, `lib/gemini/embeddings.js`, `app/api/kb/*`.
- Email alerts: Resend helpers in `lib/email/client.js`.
- Telephony server: separate Node service in `telephony-server/src/*`; handles Exotel AgentStream WebSocket audio, Sarvam STT/TTS, Gemini/RAG replies, and call logging.
- Exotel protocol sample: `Agent-Stream-echobot/*` is reference-only and not part of the Next.js app.

## Stack And State

- Framework: Next.js 16, React 19, App Router.
- Database/auth/storage: Supabase Postgres, Auth, and Storage.
- Auth model: single operator. `proxy.js` protects dashboard/API paths using Supabase session and `ALLOWED_EMAIL`; API routes often use service-role clients.
- State: SWR for server data; persisted Zustand store `tofabza-ui` for sidebar/client filter/theme.
- Styling: mostly inline style objects plus CSS variables in `app/globals.css`; Tailwind is installed/imported but not the dominant styling approach.
- Deploy: Next.js app on Vercel; telephony server on Railway.

## Integrations And Credentials

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Exotel: current telephony provider for outbound calls, inbound answer webhook, status callbacks, AgentStream WSS. Uses `EXOTEL_ACCOUNT_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_SUBDOMAIN`, `EXOTEL_EXOPHONE`, `RAILWAY_WS_URL`, `NEXTJS_URL`.
- Twilio: desired future telephony provider. Add env-driven provider selection so `TELEPHONY_PROVIDER=exotel|twilio` switches outbound calls, inbound webhooks, status callbacks, and WebSocket/media handling without code edits.
- Sarvam: STT/TTS and voice metadata. Uses `SARVAM_API_KEY`, optional `SARVAM_API_BASE_URL`, timeout/default settings.
- Gemini: embeddings and call LLM. Uses `GEMINI_API_KEY`; models also come from settings/defaults.
- Google Cloud TTS: dashboard voice preview. Uses `GOOGLE_TTS_API_KEY` plus settings fallback keys in `lib/settings.js`.
- Resend: cost/campaign/circuit emails. Uses `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `OPERATOR_EMAIL`.
- Upstash: optional rate limiting in `proxy.js`. Uses `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`; disabled if missing.

## Core Data Model

- `clients`: client records; referenced by agents, campaigns, call logs, KBs.
- `agents`: `client_id`, `name`, `type`, `status`, `language`, `voice_id`, `config`. `config` stores prompt, greeting, facility type, Exotel number, fallback number, LLM/voice settings.
- `campaigns`: `client_id`, `agent_id`, `name`, `status`, `type`, `scheduled_at`, `config`.
- `contacts`: campaign contacts used by launch/status APIs; fields include `campaign_id`, `phone`, `name`, `status`, `call_sid`, `called_at`.
- `campaign_contacts`: legacy/alternate contact table still touched by campaign detail UI. This must be reconciled with `contacts`.
- `call_logs`: call lifecycle records: `call_sid`, `agent_id`, `client_id`, `campaign_id`, `caller_number`, `direction`, `status`, `duration_seconds`, `total_cost_inr`, `transcript`, timestamps.
- `knowledge_bases`: KB owner records. Active owner type is `agent`.
- `kb_chunks`: KB content chunks with embeddings; queried through Supabase RPC `match_chunks`.
- `settings`: key/value config. Sensitive values are encrypted as `iv:tag:ciphertext`.
- `api_keys`: stores `key_hash` and `key_prefix`, never raw keys.
- `onboarding_submissions`: agent onboarding form data and uploaded file metadata.
- `prompt_templates`: form/prompt templates by facility type.
- `voices`: Sarvam voice records; Google voices are static in `lib/google/voices.js`.

No migration files were found that prove FK cascade rules or RLS state. Treat schema above as inferred from code usage.

## Critical Runtime Flows

- Inbound Exotel: Exotel calls `app/api/webhooks/exotel/[agent_id]/route.js`, which returns WSS config pointing to Railway `/ws/call?agent_id=...`.
- Outbound campaign: `app/api/campaigns/[id]/launch/route.js` loads pending contacts, calls Exotel, inserts `call_logs`, updates contacts with `call_sid`, then marks campaign complete.
- Status callback: `app/api/webhooks/exotel/status/route.js` updates `call_logs` and matching contacts.
- Live call pipeline: Railway receives Exotel events, buffers PCM media, VAD detects silence, Sarvam STT transcribes, Gemini/RAG responds, Sarvam TTS synthesizes, PCM is streamed back.
- KB flow: upload file, extract text, chunk, embed with Gemini, store in `kb_chunks`, query through `match_chunks`.

## Known Blockers

1. Campaign contacts are split between `contacts` and `campaign_contacts`; choose one table and update upload/read/launch/status consistently.
2. Exotel status callback auth may reject real callbacks because route expects `x-internal-secret`, while Exotel callback setup may not send that header.
3. Audio format is inconsistent: Exotel path declares 16 kHz PCM, but Sarvam TTS currently requests 8 kHz WAV and sends stripped PCM without upsampling.
4. Google TTS settings exist in `lib/settings.js`, but the settings UI does not fully expose Google credential/default fields. Desired behavior: `VOICE_PROVIDER=google|sarvam` or equivalent env/settings switch controls preview and runtime TTS/STT provider selection.
5. Several CSS variables are widely used but not globally defined, especially `--border`, `--surface-2`, `--surface-3`, `--ink-500`, `--ink-300`, `--emerald-600`.
6. Root page/metadata still look like create-next-app defaults.

## Build Priorities

1. Fix campaign contact table drift.
2. Complete Google TTS settings/runtime wiring, including an env-driven provider switch between Sarvam and Google for voice preview and live runtime audio.
3. Add env-driven telephony provider selection between Exotel and Twilio, keeping Exotel working while adding Twilio outbound, inbound, status callback, and media/WebSocket support.
4. Fix Exotel status callback auth and live audio sample-rate mismatch.
5. Add missing global CSS tokens and real dark theme variable mappings.
6. Add Supabase migrations/schema docs for all inferred tables, storage buckets, RPCs, and RLS.
7. Add smoke tests for auth, campaign launch, telephony webhooks, voice preview, KB upload/query, and status callbacks.
