"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const FIELD_TYPES = ["input", "textarea", "file"];

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function makeField() {
  return {
    key: "",
    label: "",
    placeholder: "",
    hint: "",
    type: "input",
    required: false,
  };
}

export default function NewFacilityPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [icon, setIcon] = useState("🏢");
  const [prompt, setPrompt] = useState("");
  const [greeting, setGreeting] = useState("");
  const [fields, setFields] = useState([makeField()]);

  function handleNameChange(val) {
    setName(val);
    setSlug(slugify(val));
  }

  function updateField(i, key, val) {
    setFields((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: val };
      // Auto-generate key from label
      if (key === "label") next[i].key = slugify(val);
      return next;
    });
  }

  function addField() {
    setFields((prev) => [...prev, makeField()]);
  }

  function removeField(i) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  function moveField(i, dir) {
    setFields((prev) => {
      const next = [...prev];
      const target = i + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Facility name is required.");
      return;
    }
    if (!slug.trim()) {
      toast.error("Slug is required.");
      return;
    }
    if (!prompt.trim()) {
      toast.error("System prompt is required.");
      return;
    }
    const validFields = fields.filter((f) => f.label.trim() && f.key.trim());
    if (validFields.length === 0) {
      toast.error("Add at least one field.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("prompt_templates").insert({
      slug: slug.trim(),
      name: name.trim(),
      icon: icon.trim() || "🏢",
      category: "healthcare",
      system_prompt: prompt.trim(),
      greeting: greeting.trim(),
      variables: validFields,
    });
    setSaving(false);

    if (error) {
      if (error.code === "23505")
        toast.error("A facility type with this slug already exists.");
      else toast.error(error.message ?? "Save failed.");
      return;
    }

    toast.success("Facility type created.");
    router.push("/dashboard/form-builder");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        maxWidth: 720,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={s.pageTitle}>New Facility Type</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ ...s.btnPrimary, marginLeft: "auto" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={() => router.back()} style={s.btnGhost}>
          Cancel
        </button>
      </div>

      {/* Basic info */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Basic Info</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div style={s.field}>
            <label style={s.label}>Facility Type Name *</label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Veterinary Clinic"
              style={s.input}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Icon</label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🏢"
              style={{ ...s.input, textAlign: "center", fontSize: 20 }}
            />
          </div>
        </div>
        <div style={s.field}>
          <label style={s.label}>Slug (auto-generated)</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="veterinary_clinic"
            style={{
              ...s.input,
              fontFamily: "var(--font-mono)",
              fontSize: "0.8rem",
            }}
          />
        </div>
      </div>

      {/* Prompt */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>AI Prompt Template</h2>
        <p style={s.hint}>
          Use {`{{variable_key}}`} syntax. Keys must match field keys below
          exactly.
        </p>
        <div style={s.field}>
          <label style={s.label}>Greeting</label>
          <input
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Hello, welcome to {{clinic_name}}…"
            style={s.input}
          />
        </div>
        <div style={{ ...s.field, marginTop: 12 }}>
          <label style={s.label}>
            System Prompt *
            <span style={{ float: "right", fontWeight: 400 }}>
              {prompt.length}/8000
            </span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={8000}
            rows={10}
            placeholder={`You are a helpful voice assistant for {{clinic_name}}. The clinic is located at {{address}}…`}
            style={{
              ...s.input,
              resize: "vertical",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Field builder */}
      <div style={s.section}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h2 style={{ ...s.sectionTitle, margin: 0 }}>
            Onboarding Form Fields
          </h2>
          <button
            onClick={addField}
            style={{ ...s.btnGhost, marginLeft: "auto", fontSize: "0.8rem" }}
          >
            + Add Field
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {fields.map((field, i) => (
            <div key={i} style={s.fieldCard}>
              {/* Row 1 — label + key + type */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 120px",
                  gap: 8,
                }}
              >
                <div style={s.field}>
                  <label style={s.label}>Label</label>
                  <input
                    value={field.label}
                    onChange={(e) => updateField(i, "label", e.target.value)}
                    placeholder="e.g. Clinic Name"
                    style={s.input}
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Key (auto)</label>
                  <input
                    value={field.key}
                    onChange={(e) => updateField(i, "key", e.target.value)}
                    placeholder="clinic_name"
                    style={{
                      ...s.input,
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.78rem",
                    }}
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Type</label>
                  <select
                    value={field.type}
                    onChange={(e) => updateField(i, "type", e.target.value)}
                    style={s.select}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2 — placeholder + hint */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <div style={s.field}>
                  <label style={s.label}>Placeholder</label>
                  <input
                    value={field.placeholder}
                    onChange={(e) =>
                      updateField(i, "placeholder", e.target.value)
                    }
                    placeholder="e.g. Sunrise Vet Clinic"
                    style={s.input}
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Hint</label>
                  <input
                    value={field.hint}
                    onChange={(e) => updateField(i, "hint", e.target.value)}
                    placeholder="Optional helper text"
                    style={s.input}
                  />
                </div>
              </div>

              {/* Row 3 — required toggle + reorder + delete */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 8,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    color: "var(--ink-600)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) =>
                      updateField(i, "required", e.target.checked)
                    }
                  />
                  Required
                </label>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button
                    onClick={() => moveField(i, -1)}
                    disabled={i === 0}
                    style={s.iconBtn}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveField(i, 1)}
                    disabled={i === fields.length - 1}
                    style={s.iconBtn}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeField(i)}
                    style={{ ...s.iconBtn, color: "#e11d48" }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addField}
          style={{ ...s.btnGhost, width: "100%", marginTop: 12 }}
        >
          + Add Field
        </button>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

const s = {
  pageTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "1.75rem",
    fontWeight: 400,
    color: "var(--ink-900)",
    margin: 0,
  },
  section: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "1.5rem",
  },
  sectionTitle: {
    fontFamily: "var(--font-sans)",
    fontSize: "0.9rem",
    fontWeight: 500,
    color: "var(--ink-700)",
    margin: "0 0 1rem",
  },
  field: { display: "flex", flexDirection: "column", gap: 5 },
  label: {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--ink-500)",
    fontWeight: 500,
  },
  input: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    background: "var(--surface)",
    outline: "none",
    minHeight: 36,
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: "0.84rem",
    fontFamily: "var(--font-sans)",
    color: "var(--ink-900)",
    background: "var(--surface)",
    outline: "none",
    minHeight: 36,
    cursor: "pointer",
    width: "100%",
  },
  hint: { fontSize: "0.78rem", color: "var(--ink-400)", margin: "0 0 1rem" },
  fieldCard: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 14px",
  },
  btnPrimary: {
    background: "#2563EB",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 18px",
    fontSize: "0.84rem",
    fontWeight: 500,
    cursor: "pointer",
    minHeight: 40,
    fontFamily: "var(--font-sans)",
  },
  btnGhost: {
    background: "transparent",
    color: "var(--ink-500)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "8px 14px",
    fontSize: "0.84rem",
    cursor: "pointer",
    minHeight: 40,
    fontFamily: "var(--font-sans)",
  },
  iconBtn: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 5,
    padding: "3px 8px",
    cursor: "pointer",
    fontSize: "0.8rem",
    color: "var(--ink-500)",
    fontFamily: "var(--font-sans)",
  },
};
