/**
 * proxy.js — Next.js 16 middleware (replaces middleware.js)
 *
 * Runs on the Node.js runtime (NOT Edge) so we can use full Node APIs
 * and @upstash/ratelimit with Upstash Redis.
 *
 * Responsibilities (in order):
 *   1. Rate-limit login attempts and API routes by IP
 *   2. Pass through public paths and static assets
 *   3. Verify Supabase session exists
 *   4. Verify session email === ALLOWED_EMAIL (single-user lock)
 *   5. Attach CSP headers on every response
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ─── Constants ──────────────────────────────────────────────────────────────

const ALLOWED_EMAIL = "tonyeappen@tofabza.com";

/**
 * Paths that skip the session check entirely.
 * Exotel webhooks POST here without a session — do NOT add auth there.
 */
const PUBLIC_PATHS = [
  "/login",
  "/api/webhooks",
  "/widget",
  "/api/widget",
  "/api/chat",
  "/api/stt",
  "/api/tts",
];

// ─── CSP Strings ────────────────────────────────────────────────────────────

/**
 * Applied to all dashboard + API routes.
 * frame-ancestors 'none' prevents clickjacking.
 */
const DASHBOARD_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  "font-src 'self' fonts.gstatic.com",
  "img-src 'self' data: blob: *.supabase.co",
  "connect-src 'self' *.supabase.co api.sarvam.ai api.openai.com",
  "media-src 'self' blob: *.supabase.co",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Applied to widget embed API routes only.
 * No frame-ancestors restriction so widgets can run inside iframes.
 */
const WIDGET_CSP = [
  "default-src 'self'",
  "connect-src 'self' *.supabase.co",
].join("; ");

// ─── Rate limiters (lazy-init so they only construct once per cold-start) ───

let loginLimiter = null;
let apiLimiter = null;
let widgetLimiter = null;

/**
 * Build all Upstash rate-limiters once, reuse across requests.
 * Skipped entirely if UPSTASH_REDIS_REST_URL is absent (local dev without Redis).
 */
function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function getLimiters() {
  if (loginLimiter) return { loginLimiter, apiLimiter, widgetLimiter };

  const redis = getRedis();
  if (!redis) return {}; // no Redis → no rate-limiting (safe for local dev)

  loginLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "rl:login",
    analytics: false,
  });

  // 1000 req/min — generous for a single-user app
  apiLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1000, "1 m"),
    prefix: "rl:api",
    analytics: false,
  });

  // Widget token endpoint: 20 req/min per IP
  widgetLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    prefix: "rl:widget",
    analytics: false,
  });

  return { loginLimiter, apiLimiter, widgetLimiter };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the real client IP, respecting Vercel's forwarding headers.
 * Falls back to a sentinel so rate-limit still has a key.
 *
 * @param {import('next/server').NextRequest} req
 * @returns {string}
 */
function getClientIp(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Return a 429 Too Many Requests response.
 * @param {string} retryAfter - seconds until the window resets
 */
function rateLimitExceeded(retryAfter = "60") {
  return new NextResponse(
    JSON.stringify({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please slow down.",
      },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfter,
        "X-RateLimit-Limit": retryAfter,
      },
    },
  );
}

/**
 * Attach security headers to a response without mutating the original.
 * Always called before returning — even on redirects.
 *
 * @param {NextResponse} res
 * @param {boolean}      isWidget - use Widget CSP instead of Dashboard CSP
 * @returns {NextResponse}
 */
function attachSecurityHeaders(res, isWidget = false) {
  res.headers.set(
    "Content-Security-Policy",
    isWidget ? WIDGET_CSP : DASHBOARD_CSP,
  );
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", isWidget ? "SAMEORIGIN" : "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=()",
  );
  return res;
}

// ─── Main middleware export ──────────────────────────────────────────────────

/**
 * Next.js 16 middleware entry point.
 * Named `proxy` — this IS the default export for the middleware file.
 *
 * @param {import('next/server').NextRequest} req
 * @returns {Promise<NextResponse>}
 */
export async function proxy(req) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);
  const isWidget = pathname.startsWith("/api/widget");

  // ── 1. Static assets & Next.js internals — skip everything ──────────────
  //    (These are already excluded by the matcher below, but as a safety net:)
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public/")
  ) {
    return NextResponse.next();
  }

  // ── 2. Rate-limit login attempts ─────────────────────────────────────────
  const { loginLimiter: ll, apiLimiter: al, widgetLimiter: wl } = getLimiters();

  if (ll && pathname.startsWith("/login") && req.method === "POST") {
    const { success, reset } = await ll.limit(ip);
    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000).toString();
      return rateLimitExceeded(retryAfter);
    }
  }

  // ── 3. Rate-limit widget token endpoint ──────────────────────────────────
  if (wl && pathname.startsWith("/api/widget/token")) {
    const { success, reset } = await wl.limit(ip);
    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000).toString();
      return rateLimitExceeded(retryAfter);
    }
  }

  // ── 4. Rate-limit all other API routes ───────────────────────────────────
  if (
    al &&
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/widget/token")
  ) {
    const { success, reset } = await al.limit(ip);
    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000).toString();
      return rateLimitExceeded(retryAfter);
    }
  }

  // ── 5. Public paths — skip session check, just attach headers ────────────
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) {
    const res = NextResponse.next();
    return attachSecurityHeaders(res, isWidget);
  }

  // ── 6. Session check via Supabase ────────────────────────────────────────
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let session;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch (err) {
    // If Supabase is unreachable, fail safe: redirect to login
    console.error("[proxy] Supabase session check failed:", err?.message);
    const loginUrl = new URL("/login?error=service_unavailable", req.url);
    return attachSecurityHeaders(NextResponse.redirect(loginUrl), isWidget);
  }

  // No session → redirect to login
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    // Preserve the original destination so we can redirect back after login
    loginUrl.searchParams.set("next", pathname);
    return attachSecurityHeaders(NextResponse.redirect(loginUrl), isWidget);
  }

  // ── 7. Single-user email lock ─────────────────────────────────────────────
  if (session.user.email !== ALLOWED_EMAIL) {
    // Sign out any intruder immediately, then redirect
    try {
      await supabase.auth.signOut();
    } catch (_) {
      // Best-effort — the redirect is what matters
    }
    const loginUrl = new URL("/login?error=unauthorised", req.url);
    return attachSecurityHeaders(NextResponse.redirect(loginUrl), isWidget);
  }

  // ── 8. All checks passed — attach headers and continue ───────────────────
  return attachSecurityHeaders(res, isWidget);
}

// ─── Matcher ─────────────────────────────────────────────────────────────────
//
// Excludes:
//   • _next/static  — compiled JS/CSS bundles
//   • _next/image   — Next.js image optimisation service
//   • favicon.ico   — browser auto-request
//   • /widget/*     — the embed script itself (public, no auth needed)
//
// Everything else (pages, API routes, fonts, etc.) goes through proxy().
