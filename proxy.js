/**
 * proxy.js - Next.js 16 middleware (replaces middleware.js)
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

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ALLOWED_EMAIL = "tonyeappen@tofabza.com";

/**
 * Paths that skip the session check entirely.
 * Exotel webhooks POST here without a session - do NOT add auth there.
 * Onboarding links are sent to clients, so the page + submit API are public.
 */
const PUBLIC_PATHS = [
  "/login",
  "/onboard",
  "/api/onboard",
  "/api/webhooks",
];

function pathMatchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// â”€â”€â”€ CSP Strings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


// â”€â”€â”€ Rate limiters (lazy-init so they only construct once per cold-start) â”€â”€â”€

let loginLimiter = null;
let apiLimiter = null;

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
  if (loginLimiter) return { loginLimiter, apiLimiter };

  const redis = getRedis();
  if (!redis) return {}; // no Redis -> no rate-limiting (safe for local dev)

  loginLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "rl:login",
    analytics: false,
  });

  // 1000 req/min - generous for a single-user app
  apiLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1000, "1 m"),
    prefix: "rl:api",
    analytics: false,
  });

  return { loginLimiter, apiLimiter };
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
 * Always called before returning - even on redirects.
 *
 * @param {NextResponse} res
 * @returns {NextResponse}
 */
function attachSecurityHeaders(res) {
  res.headers.set("Content-Security-Policy", DASHBOARD_CSP);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=()",
  );
  return res;
}

// â”€â”€â”€ Main middleware export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Next.js 16 middleware entry point.
 * Named `proxy` - this IS the default export for the middleware file.
 *
 * @param {import('next/server').NextRequest} req
 * @returns {Promise<NextResponse>}
 */
export async function proxy(req) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);

  // 1. Static assets and Next.js internals
  //    (These are already excluded by the matcher below, but as a safety net:)
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public/")
  ) {
    return NextResponse.next();
  }

  // 2. Rate-limit login attempts
  const { loginLimiter: ll, apiLimiter: al } = getLimiters();

  if (ll && pathname.startsWith("/login") && req.method === "POST") {
    const { success, reset } = await ll.limit(ip);
    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000).toString();
      return rateLimitExceeded(retryAfter);
    }
  }

  // Rate-limit API routes
  if (al && pathname.startsWith("/api/")) {
    const { success, reset } = await al.limit(ip);
    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000).toString();
      return rateLimitExceeded(retryAfter);
    }
  }

  // 5. Public paths: skip session check, just attach headers
  const isPublic = PUBLIC_PATHS.some((p) => pathMatchesPrefix(pathname, p));
  if (isPublic) {
    const res = NextResponse.next();
    return attachSecurityHeaders(res);
  }

  // 6. Session check via Supabase
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
    return attachSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // No session -> redirect to login
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    // Preserve the original destination so we can redirect back after login
    loginUrl.searchParams.set("next", pathname);
    return attachSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // 7. Single-user email lock
  if (session.user.email !== ALLOWED_EMAIL) {
    // Sign out any intruder immediately, then redirect
    try {
      await supabase.auth.signOut();
    } catch (_) {
      // Best-effort - the redirect is what matters
    }
    const loginUrl = new URL("/login?error=unauthorised", req.url);
    return attachSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // 8. All checks passed: attach headers and continue
  return attachSecurityHeaders(res);
}

// â”€â”€â”€ Matcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Excludes:
//   - _next/static: compiled JS/CSS bundles
//   - _next/image: Next.js image optimisation service
//   - favicon.ico: browser auto-request
//
// Everything else (pages, API routes, fonts, etc.) goes through proxy().
