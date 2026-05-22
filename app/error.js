"use client";

/**
 * app/error.js — Global React Error Boundary
 *
 * Catches unhandled errors in the dashboard subtree.
 * Shows a human-readable message + Retry button.
 * Logs to Sentry in production.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * @param {{ error: Error, reset: () => void }} props
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      Sentry.captureException(error);
    } else {
      console.error("[GlobalError]", error);
    }
  }, [error]);

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <p style={styles.label}>SOMETHING WENT WRONG</p>
        <h1 style={styles.heading}>Unexpected error</h1>
        <p style={styles.message}>
          {error?.message || "An unexpected error occurred. Please try again."}
        </p>
        <button style={styles.button} onClick={reset}>
          Retry
        </button>
      </div>
    </div>
  );
}

/** Inline styles — no Tailwind dependency, works even if CSS fails to load */
const styles = {
  overlay: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0F1013",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    padding: "1.5rem",
  },
  card: {
    background: "#15161A",
    border: "1px solid #2a2a2a",
    borderRadius: "12px",
    padding: "2.5rem",
    maxWidth: "420px",
    width: "100%",
    textAlign: "center",
  },
  label: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.14em",
    color: "#F97316",
    marginBottom: "0.5rem",
  },
  heading: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "#0A0B0F",
    marginBottom: "0.75rem",
  },
  message: {
    fontSize: "0.9rem",
    color: "#4A4E6B",
    lineHeight: 1.6,
    marginBottom: "1.75rem",
  },
  button: {
    display: "inline-block",
    background: "#F97316",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    padding: "0.75rem 2rem",
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: "pointer",
    minHeight: "44px", // accessibility tap target
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
};
