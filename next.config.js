/**
 * next.config.js — Tofabza Sounds Platform
 *
 * Rules:
 *  - JavaScript only, never next.config.ts
 *  - React Compiler enabled (stable in Next.js 16)
 *  - All routes dynamic by default — opt-in caching via "use cache" directive only
 *  - Three.js imports restricted to /(marketing) routes only
 *  - ffmpeg never runs on Vercel — telephony-server on Railway handles it
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Experimental ──────────────────────────────────────────────────────────
  reactCompiler: true,

  // ── Images ────────────────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },

  // ── Security & CSP headers ────────────────────────────────────────────────
  async headers() {
    return [
      {
        // Dashboard + API routes
        source: "/((?!_next/static|_next/image|favicon.ico|widget).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
              "font-src 'self' fonts.gstatic.com",
              "img-src 'self' data: blob: *.supabase.co",
              "connect-src 'self' *.supabase.co api.sarvam.ai api.openai.com",
              "media-src 'self' blob: *.supabase.co",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
      {
        // Widget embed script
        source: "/widget/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=3600" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // Widget API routes — allow cross-origin from client sites
        source: "/api/widget/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
      {
        source: "/api/stt",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, X-Audio-Mime",
          },
        ],
      },
      {
        source: "/api/tts",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
      {
        source: "/api/chat",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },

  // ── Redirects ─────────────────────────────────────────────────────────────
  async redirects() {
    return [
      // Root → dashboard for logged-in users (middleware handles auth redirect)
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },

  // ── Turbopack: stub Three.js (browser-only) ───────────────────────────────
  // turbopack: {
  //   resolveAlias: {
  //     three: false,
  //     "@react-three/fiber": false,
  //     "@react-three/drei": false,
  //   },
  // },

  // ── Logging ───────────────────────────────────────────────────────────────
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === "development",
    },
  },

  // ── Vercel-specific ───────────────────────────────────────────────────────
  // Increase max duration for /api/stt and /api/tts proxy routes
  // (set per-route via route segment config — this is the global fallback)
  // Free tier: 10s. Pro: 300s. Set to 25s as safe default for audio proxying.
  serverExternalPackages: ["@node-rs/argon2"], // example native dep if added later
};

// Sentry
import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(nextConfig, {
  org: "tofabza",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  automaticVercelMonitors: true,
});
