"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── icons ────────────────────────────────────────────────────────────────────
function Icon({ d, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  copy: "M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8l-4-4H8zM16 4v4h4M10 12h4M10 16h4",
  trash:
    "M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2",
  plus: "M12 5v14M5 12h14",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z",
  eyeoff:
    "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22",
  check: "M20 6L9 17l-5-5",
  clock: "M12 2a10 10 0 100 20A10 10 0 0012 2zM12 6v6l4 2",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── new key modal ────────────────────────────────────────────────────────────
function NewKeyModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to create key");
      return;
    }
    onCreate(body); // { id, name, key, key_prefix, created_at }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 28,
          width: 400,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          animation: "modalIn 0.2s ease",
        }}
      >
        <h2
          style={{
            margin: "0 0 4px",
            fontSize: 17,
            fontWeight: 700,
            fontFamily: "var(--font-serif)",
            color: "var(--ink-900)",
          }}
        >
          New API Key
        </h2>
        <p
          style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 0 20px" }}
        >
          Give this key a descriptive name — e.g. "Production", "Zapier", "Dev".
        </p>

        <label style={labelStyle}>Key Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="e.g. Production server"
          style={{
            ...inputStyle,
            borderColor: error ? "var(--crimson-500)" : "var(--border)",
          }}
        />
        {error && (
          <p
            style={{ fontSize: 12, color: "var(--crimson-500)", marginTop: 6 }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 20,
            justifyContent: "flex-end",
          }}
        >
          <button onClick={onClose} style={ghostBtn}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            style={{
              ...primaryBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating…" : "Create Key"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── reveal modal — shown ONCE after key creation ─────────────────────────────
function RevealModal({ keyData, onClose }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(keyData.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 28,
          width: 480,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          animation: "modalIn 0.2s ease",
        }}
      >
        {/* success header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--emerald-600)18",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--emerald-600)",
            }}
          >
            <Icon d={ICONS.check} size={18} />
          </div>
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--ink-900)",
                fontFamily: "var(--font-serif)",
              }}
            >
              Key created —{" "}
              <span style={{ color: "var(--emerald-600)" }}>
                {keyData.name}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
              Copy it now — you won't see it again
            </div>
          </div>
        </div>

        {/* warning banner */}
        <div
          style={{
            background: "var(--saffron-500)12",
            border: "1px solid var(--saffron-500)40",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--saffron-500)",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          ⚠ This is the only time this key will be shown. Store it securely — it
          cannot be recovered.
        </div>

        {/* key display */}
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "var(--ink-900)",
              wordBreak: "break-all",
              flex: 1,
              letterSpacing: "0.02em",
            }}
          >
            {keyData.key}
          </code>
          <button
            onClick={handleCopy}
            style={{
              flexShrink: 0,
              background: copied ? "var(--emerald-600)" : "var(--cobalt-600)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              transition: "background 0.15s",
            }}
          >
            <Icon d={copied ? ICONS.check : ICONS.copy} size={13} />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <button
          onClick={onClose}
          style={{
            ...primaryBtn,
            width: "100%",
            marginTop: 20,
            justifyContent: "center",
          }}
        >
          Done, I've saved it
        </button>
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function ApiKeysPage() {
  const supabase = createClient();

  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [revealKey, setRevealKey] = useState(null); // key to show in reveal modal
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ── load keys ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, created_at, last_used")
        .order("created_at", { ascending: false });
      setKeys(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // ── after key creation ────────────────────────────────────────────────────────
  function handleCreated(keyData) {
    // keyData = { id, name, key, key_prefix, created_at }
    setShowNew(false);
    setRevealKey(keyData);
    // add to list (without the raw key)
    setKeys((prev) => [
      {
        id: keyData.id,
        name: keyData.name,
        key_prefix: keyData.key_prefix,
        created_at: keyData.created_at,
        last_used: null,
      },
      ...prev,
    ]);
  }

  // ── delete ───────────────────────────────────────────────────────────────────
  async function handleDelete(id) {
    setDeletingId(id);
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    setDeletingId(null);
    setConfirmId(null);
    if (error) showToast("Delete failed: " + error.message, "error");
    else {
      setKeys((prev) => prev.filter((k) => k.id !== id));
      showToast("Key deleted");
    }
  }

  // ── copy prefix ───────────────────────────────────────────────────────────────
  async function copyPrefix(prefix) {
    await navigator.clipboard.writeText(prefix + "…");
    showToast("Prefix copied");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--page)",
        fontFamily: "var(--font-sans)",
        color: "var(--ink-900)",
      }}
    >
      {/* toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            padding: "12px 18px",
            background:
              toast.type === "error"
                ? "var(--crimson-500)"
                : "var(--emerald-600)",
            color: "#fff",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            animation: "slideUp 0.25s ease",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* modals */}
      {showNew && (
        <NewKeyModal
          onClose={() => setShowNew(false)}
          onCreate={handleCreated}
        />
      )}
      {revealKey && (
        <RevealModal keyData={revealKey} onClose={() => setRevealKey(null)} />
      )}

      {/* ── header ── */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "0 32px",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 860,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 60,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "var(--cobalt-600)18",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--cobalt-600)",
              }}
            >
              <Icon d={ICONS.key} size={15} />
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: "var(--font-serif)",
                  color: "var(--ink-900)",
                }}
              >
                API Keys
              </h1>
              <p style={{ margin: 0, fontSize: 11, color: "var(--ink-500)" }}>
                {keys.length} key{keys.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowNew(true)}
            style={{ ...primaryBtn, gap: 7 }}
          >
            <Icon d={ICONS.plus} size={14} />
            New API Key
          </button>
        </div>
      </div>

      {/* ── body ── */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 32px" }}>
        {/* info banner */}
        <div
          style={{
            background: "var(--cobalt-600)08",
            border: "1px solid var(--cobalt-600)25",
            borderRadius: 10,
            padding: "12px 16px",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            marginBottom: 24,
          }}
        >
          <div style={{ color: "var(--cobalt-600)", marginTop: 1 }}>
            <Icon d={ICONS.shield} size={15} />
          </div>
          <div
            style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.6 }}
          >
            API keys authenticate requests to Tofabza Sounds. Pass the key in
            the{" "}
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                background: "var(--surface-2)",
                padding: "1px 5px",
                borderRadius: 4,
              }}
            >
              Authorization: Bearer &lt;key&gt;
            </code>{" "}
            header. Keys are hashed on storage — the full key is shown only once
            at creation.
          </div>
        </div>

        {/* ── table ── */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 56,
                  borderRadius: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  animation: "skeleton 1.4s ease infinite",
                }}
              />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "64px 24px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--ink-700)",
                marginBottom: 6,
              }}
            >
              No API keys yet
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--ink-500)",
                marginBottom: 20,
              }}
            >
              Create your first key to start authenticating external requests.
            </div>
            <button onClick={() => setShowNew(true)} style={primaryBtn}>
              <Icon d={ICONS.plus} size={14} />
              Create API Key
            </button>
          </div>
        ) : (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 180px 180px 180px auto",
                padding: "10px 20px",
                borderBottom: "1px solid var(--border)",
                gap: 12,
              }}
            >
              {["Name", "Prefix", "Created", "Last Used", ""].map((h, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ink-400)",
                    letterSpacing: "0.05em",
                    fontFamily: "var(--font-sans)",
                    textAlign: i === 4 ? "right" : "left",
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* rows */}
            {keys.map((k, i) => (
              <div
                key={k.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 180px 180px 180px auto",
                  padding: "14px 20px",
                  borderBottom:
                    i < keys.length - 1 ? "1px solid var(--border)" : "none",
                  alignItems: "center",
                  gap: 12,
                  background:
                    confirmId === k.id ? "var(--crimson-500)06" : "transparent",
                  transition: "background 0.15s",
                }}
              >
                {/* name */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: "var(--surface-2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--ink-500)",
                      flexShrink: 0,
                    }}
                  >
                    <Icon d={ICONS.key} size={13} />
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink-900)",
                    }}
                  >
                    {k.name}
                  </span>
                </div>

                {/* prefix */}
                <div
                  onClick={() => copyPrefix(k.key_prefix)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--ink-500)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    cursor: "pointer",
                    userSelect: "none",
                    width: "fit-content",
                  }}
                  title="Click to copy prefix"
                >
                  {k.key_prefix}••••••••
                </div>

                {/* created */}
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                  {fmtDate(k.created_at)}
                </div>

                {/* last used */}
                <div
                  style={{
                    fontSize: 12,
                    color: k.last_used ? "var(--ink-700)" : "var(--ink-400)",
                  }}
                >
                  {k.last_used ? (
                    <span title={fmtDate(k.last_used)}>
                      {relativeTime(k.last_used)}
                    </span>
                  ) : (
                    <span style={{ fontStyle: "italic" }}>Never used</span>
                  )}
                </div>

                {/* actions */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    alignItems: "center",
                  }}
                >
                  {confirmId === k.id ? (
                    <>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--crimson-500)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Delete?
                      </span>
                      <button
                        onClick={() => handleDelete(k.id)}
                        disabled={deletingId === k.id}
                        style={{
                          background: "var(--crimson-500)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "5px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor:
                            deletingId === k.id ? "not-allowed" : "pointer",
                          opacity: deletingId === k.id ? 0.7 : 1,
                        }}
                      >
                        {deletingId === k.id ? "…" : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        style={{
                          ...ghostBtn,
                          fontSize: 12,
                          padding: "5px 10px",
                        }}
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(k.id)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--ink-400)",
                        cursor: "pointer",
                        padding: 5,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--crimson-500)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--ink-400)")
                      }
                      title="Delete key"
                    >
                      <Icon d={ICONS.trash} size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* usage snippet */}
        {keys.length > 0 && (
          <div
            style={{
              marginTop: 24,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid var(--border)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink-500)",
                letterSpacing: "0.04em",
              }}
            >
              USAGE EXAMPLE
            </div>
            <pre
              style={{
                margin: 0,
                padding: "16px 18px",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--ink-700)",
                lineHeight: 1.7,
                overflowX: "auto",
                background: "var(--surface-2)",
              }}
            >{`curl -X POST https://your-app.vercel.app/api/chat \\
  -H "Authorization: Bearer tf_live_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "message": "Hello" }'`}</pre>
          </div>
        )}
      </div>

      <style>{`
        @keyframes skeleton {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── shared style tokens ────────────────────────────────────────────────────────
const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-500)",
  marginBottom: 6,
  letterSpacing: "0.03em",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: "var(--ink-900)",
  fontFamily: "var(--font-sans)",
  outline: "none",
};

const ghostBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 7,
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--ink-700)",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};

const primaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "var(--cobalt-600)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
