"use client";

/**
 * TemplateSelector
 * ─────────────────────────────────────────────────────
 * Sits at the TOP of the agent new/edit form.
 * Fetches prompt_templates from Supabase, renders 4 cards.
 * On selection → calls onSelect(template) which the parent
 * uses to auto-populate form fields.
 *
 * USAGE in app/dashboard/agents/new/page.js:
 *
 *   import TemplateSelector from '@/components/agents/TemplateSelector';
 *
 *   // In your form state:
 *   const [formData, setFormData] = useState({ ... });
 *
 *   function handleTemplateSelect(template) {
 *     setFormData(prev => ({
 *       ...prev,
 *       config: {
 *         ...prev.config,
 *         prompt: template.system_prompt,
 *         greeting: template.greeting,
 *         templateSlug: template.slug,
 *         templateVariables: template.variables,
 *       }
 *     }));
 *     setTemplateVars(
 *       Object.fromEntries(template.variables.map(v => [v.key, '']))
 *     );
 *   }
 *
 *   // In your JSX, ABOVE the system prompt textarea:
 *   <TemplateSelector onSelect={handleTemplateSelect} />
 *
 *   // Then render TemplateVariableFields below it.
 * ─────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from "react";

import { createClient } from "@/lib/supabase/client";
const supabase = createClient();

// ── styles using your existing CSS variables ──────────────────
const S = {
  section: {
    marginBottom: "2rem",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.75rem",
  },
  sectionLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--ink-500)",
  },
  skipBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    fontSize: "0.8rem",
    color: "var(--ink-400)",
    padding: "2px 0",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "0.75rem",
  },
  card: (selected, disabled) => ({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    padding: "1rem 1rem 0.85rem",
    background: selected ? "var(--saffron-100)" : "var(--surface)",
    border: selected
      ? "1.5px solid var(--saffron-500)"
      : "1px solid var(--border)",
    borderRadius: "10px",
    cursor: disabled ? "default" : "pointer",
    transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
    boxShadow: selected ? "0 0 0 3px rgba(249,115,22,0.12)" : "none",
    opacity: disabled ? 0.5 : 1,
    userSelect: "none",
  }),
  cardIcon: {
    fontSize: "1.5rem",
    lineHeight: 1,
    marginBottom: "0.1rem",
  },
  cardName: {
    fontFamily: "var(--font-serif)",
    fontSize: "1rem",
    fontWeight: 700,
    color: "var(--ink-900)",
  },
  cardDesc: {
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
    color: "var(--ink-500)",
    lineHeight: 1.4,
  },
  selectedBadge: {
    position: "absolute",
    top: "0.6rem",
    right: "0.6rem",
    background: "var(--saffron-500)",
    color: "#fff",
    fontFamily: "var(--font-mono)",
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "2px 7px",
    borderRadius: "999px",
  },
  skeleton: {
    background: "var(--border)",
    borderRadius: "10px",
    height: "110px",
    animation: "pulse 1.4s ease-in-out infinite",
  },
  error: {
    fontFamily: "var(--font-sans)",
    fontSize: "0.8rem",
    color: "var(--crimson-500)",
    padding: "0.75rem 1rem",
    background: "var(--crimson-100)",
    borderRadius: "8px",
    border: "1px solid var(--crimson-500)",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    margin: "1.5rem 0 0",
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    background: "var(--border)",
  },
  dividerText: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--ink-300)",
    whiteSpace: "nowrap",
  },
};

// ── TemplateVariableFields ────────────────────────────────────
// Renders the variable input fields after a template is selected.
// Exported separately so parent can place it wherever it wants.
export function TemplateVariableFields({
  variables = [],
  values = {},
  onChange,
}) {
  if (!variables.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={S.sectionHeader}>
        <span style={S.sectionLabel}>Clinic Details</span>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "0.75rem",
            color: "var(--ink-400)",
          }}
        >
          These fill into your system prompt automatically
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.875rem",
        }}
      >
        {variables.map((v) => (
          <div
            key={v.key}
            style={{
              gridColumn: [
                "doctors",
                "fees",
                "departments",
                "tests_and_packages",
                "facilities",
              ].includes(v.key)
                ? "1 / -1"
                : undefined,
              display: "flex",
              flexDirection: "column",
              gap: "5px",
            }}
          >
            <label
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--ink-700)",
              }}
            >
              {v.label}
            </label>
            {[
              "doctors",
              "fees",
              "departments",
              "tests_and_packages",
              "facilities",
            ].includes(v.key) ? (
              <textarea
                rows={3}
                value={values[v.key] || ""}
                onChange={(e) => onChange(v.key, e.target.value)}
                placeholder={v.placeholder}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.85rem",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "8px 10px",
                  background: "var(--surface)",
                  color: "var(--ink-900)",
                  resize: "vertical",
                  minHeight: "72px",
                  outline: "none",
                }}
              />
            ) : (
              <input
                type="text"
                value={values[v.key] || ""}
                onChange={(e) => onChange(v.key, e.target.value)}
                placeholder={v.placeholder}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.85rem",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "8px 10px",
                  background: "var(--surface)",
                  color: "var(--ink-900)",
                  outline: "none",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * applyVariables(template, variableValues)
 * ─────────────────────────────────────────
 * Replaces {{variable}} placeholders in the system prompt
 * and greeting with actual values. Call this before saving.
 *
 * Returns { system_prompt, greeting } with variables filled in.
 */
export function applyVariables(template, variableValues = {}) {
  let prompt = template.system_prompt;
  let greeting = template.greeting;

  Object.entries(variableValues).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    const filled = value || `[${key}]`; // leave placeholder if empty
    prompt = prompt.replace(regex, filled);
    greeting = greeting.replace(regex, filled);
  });

  return { system_prompt: prompt, greeting };
}

// ── Main TemplateSelector component ──────────────────────────
export default function TemplateSelector({
  onSelect,
  selectedSlug = null,
  disabled = false,
}) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(selectedSlug);
  const [skipped, setSkipped] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("prompt_templates")
        .select("*")
        .eq("is_active", true)
        .eq("category", "healthcare")
        .order("sort_order", { ascending: true });

      if (err) throw err;
      setTemplates(data || []);
    } catch (e) {
      setError(
        "Could not load templates. You can still write a custom prompt below.",
      );
      console.error("[TemplateSelector]", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function handleSelect(template) {
    if (disabled) return;
    setSelected(template.slug);
    setSkipped(false);
    onSelect?.(template);
  }

  function handleSkip() {
    setSelected(null);
    setSkipped(true);
    onSelect?.(null);
  }

  if (skipped) return null; // parent shows custom prompt textarea

  return (
    <div style={S.section}>
      <div style={S.sectionHeader}>
        <span style={S.sectionLabel}>Start from a template</span>
        <button type="button" style={S.skipBtn} onClick={handleSkip}>
          Write custom prompt instead
        </button>
      </div>

      {loading && (
        <div style={S.grid}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={S.skeleton} />
          ))}
        </div>
      )}

      {error && !loading && <p style={S.error}>{error}</p>}

      {!loading && !error && (
        <div style={S.grid}>
          {templates.map((t) => {
            const isSelected = selected === t.slug;
            return (
              <div
                key={t.id}
                style={S.card(isSelected, disabled)}
                onClick={() => handleSelect(t)}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onKeyDown={(e) => e.key === "Enter" && handleSelect(t)}
              >
                {isSelected && <span style={S.selectedBadge}>Selected</span>}
                <span style={S.cardIcon}>{t.icon}</span>
                <span style={S.cardName}>{t.name}</span>
                <span style={S.cardDesc}>{t.description}</span>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div style={S.divider}>
          <div style={S.dividerLine} />
          <span style={S.dividerText}>fill in clinic details below</span>
          <div style={S.dividerLine} />
        </div>
      )}
    </div>
  );
}
