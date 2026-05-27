"use client";

import { useState, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
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

function normalizeField(f) {
  return {
    key: f.key ?? "",
    label: f.label ?? "",
    placeholder: f.placeholder ?? "",
    hint: f.hint ?? "",
    type: f.type ?? "input",
    required: f.required ?? false,
  };
}

const HARDCODED_FORMS = {
  polyclinic: {
    name: "Polyclinic",
    icon: "🏥",
    greeting: "",
    system_prompt: "",
    variables: [
      {
        key: "clinic_name",
        label: "Clinic Name",
        placeholder: "e.g. Sunrise Polyclinic",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "address",
        label: "Clinic Address",
        placeholder: "e.g. MG Road, Ernakulam",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "hours",
        label: "Working Hours",
        placeholder: "e.g. Mon–Sat 8am–8pm",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "clinic_phone",
        label: "Clinic Phone Number",
        placeholder: "e.g. 0484-1234567",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "doctors",
        label: "Doctors & Departments",
        placeholder: "e.g. Dr. Anil Kumar – General Medicine",
        hint: "",
        type: "textarea",
        required: true,
      },
      {
        key: "fees",
        label: "Consultation Fees",
        placeholder: "e.g. General Medicine – ₹300",
        hint: "",
        type: "textarea",
        required: true,
      },
      {
        key: "appointment_types",
        label: "Appointment Types",
        placeholder: "e.g. Walk-in, Prior appointment",
        hint: "",
        type: "input",
        required: false,
      },
      {
        key: "languages",
        label: "Languages Spoken",
        placeholder: "e.g. Malayalam, English",
        hint: "",
        type: "input",
        required: false,
      },
      {
        key: "fallback_number",
        label: "Fallback Phone Number",
        placeholder: "e.g. +91 98765 43210",
        hint: "Calls forward here if AI is unavailable",
        type: "input",
        required: false,
      },
      {
        key: "extra_notes",
        label: "Anything else to know",
        placeholder: "Special instructions, parking info, etc.",
        hint: "",
        type: "textarea",
        required: false,
      },
    ],
  },
  diagnostic: {
    name: "Diagnostic Centre",
    icon: "🔬",
    greeting: "",
    system_prompt: "",
    variables: [
      {
        key: "clinic_name",
        label: "Centre Name",
        placeholder: "e.g. LifeCare Diagnostics",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "address",
        label: "Centre Address",
        placeholder: "e.g. Palarivattom, Kochi",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "hours",
        label: "Working Hours",
        placeholder: "e.g. Mon–Sat 7am–7pm",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "clinic_phone",
        label: "Centre Phone",
        placeholder: "e.g. 0484-9876543",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "home_collection",
        label: "Home Collection Details",
        placeholder: "e.g. Available 7am–10am within 10km",
        hint: "",
        type: "textarea",
        required: false,
      },
      {
        key: "tests_packages",
        label: "Tests & Health Packages",
        placeholder: "e.g. CBC – ₹200",
        hint: "",
        type: "textarea",
        required: true,
      },
      {
        key: "report_turnaround",
        label: "Report Turnaround Time",
        placeholder: "e.g. Same day for routine tests",
        hint: "",
        type: "input",
        required: false,
      },
      {
        key: "languages",
        label: "Languages Spoken",
        placeholder: "e.g. Malayalam, English",
        hint: "",
        type: "input",
        required: false,
      },
      {
        key: "fallback_number",
        label: "Fallback Phone Number",
        placeholder: "e.g. +91 98765 43210",
        hint: "Calls forward here if AI is unavailable",
        type: "input",
        required: false,
      },
      {
        key: "extra_notes",
        label: "Anything else to know",
        placeholder: "Fasting requirements, insurance, etc.",
        hint: "",
        type: "textarea",
        required: false,
      },
    ],
  },
  dental: {
    name: "Dental Clinic",
    icon: "🦷",
    greeting: "",
    system_prompt: "",
    variables: [
      {
        key: "clinic_name",
        label: "Clinic Name",
        placeholder: "e.g. SmileCare Dental",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "address",
        label: "Clinic Address",
        placeholder: "e.g. Thrissur Road, Palakkad",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "hours",
        label: "Working Hours",
        placeholder: "e.g. Mon–Sat 9am–7pm",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "clinic_phone",
        label: "Clinic Phone",
        placeholder: "e.g. 0491-1234567",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "doctors",
        label: "Dentists & Specialisations",
        placeholder: "e.g. Dr. Anoop – Orthodontics",
        hint: "",
        type: "textarea",
        required: true,
      },
      {
        key: "treatments",
        label: "Treatments Offered",
        placeholder: "e.g. Scaling, Root Canal, Implants",
        hint: "",
        type: "textarea",
        required: true,
      },
      {
        key: "fees",
        label: "Treatment Fees",
        placeholder: "e.g. Scaling – ₹800",
        hint: "",
        type: "textarea",
        required: false,
      },
      {
        key: "languages",
        label: "Languages Spoken",
        placeholder: "e.g. Malayalam, English",
        hint: "",
        type: "input",
        required: false,
      },
      {
        key: "fallback_number",
        label: "Fallback Phone Number",
        placeholder: "e.g. +91 98765 43210",
        hint: "Calls forward here if AI is unavailable",
        type: "input",
        required: false,
      },
      {
        key: "extra_notes",
        label: "Anything else to know",
        placeholder: "Insurance, EMI, parking, etc.",
        hint: "",
        type: "textarea",
        required: false,
      },
    ],
  },
  hospital: {
    name: "Hospital",
    icon: "🏨",
    greeting: "",
    system_prompt: "",
    variables: [
      {
        key: "clinic_name",
        label: "Hospital Name",
        placeholder: "e.g. City General Hospital",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "address",
        label: "Hospital Address",
        placeholder: "e.g. NH Bypass, Thiruvananthapuram",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "hours",
        label: "OPD Hours",
        placeholder: "e.g. Mon–Sat 8am–6pm; Emergency 24/7",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "clinic_phone",
        label: "Main Phone Number",
        placeholder: "e.g. 0471-1234567",
        hint: "",
        type: "input",
        required: true,
      },
      {
        key: "departments",
        label: "Departments & Specialities",
        placeholder: "e.g. Cardiology, Orthopaedics",
        hint: "",
        type: "textarea",
        required: true,
      },
      {
        key: "doctors",
        label: "Key Doctors",
        placeholder: "e.g. Dr. Suresh Nair – Cardiologist",
        hint: "",
        type: "textarea",
        required: false,
      },
      {
        key: "fees",
        label: "OPD / Consultation Fees",
        placeholder: "e.g. General OPD – ₹200",
        hint: "",
        type: "textarea",
        required: false,
      },
      {
        key: "emergency_number",
        label: "Emergency / Ambulance Number",
        placeholder: "e.g. 108",
        hint: "",
        type: "input",
        required: false,
      },
      {
        key: "insurance",
        label: "Insurance & Cashless",
        placeholder: "e.g. Star Health, Ayushman Bharat",
        hint: "",
        type: "input",
        required: false,
      },
      {
        key: "languages",
        label: "Languages Spoken",
        placeholder: "e.g. Malayalam, English, Tamil",
        hint: "",
        type: "input",
        required: false,
      },
      {
        key: "fallback_number",
        label: "Fallback Phone Number",
        placeholder: "e.g. +91 98765 43210",
        hint: "Calls forward here if AI is unavailable",
        type: "input",
        required: false,
      },
      {
        key: "extra_notes",
        label: "Anything else to know",
        placeholder: "Visiting hours, pharmacy, parking, etc.",
        hint: "",
        type: "textarea",
        required: false,
      },
    ],
  },
};

async function fetchTemplate(slug) {
  // Try DB first
  const { data } = await supabase
    .from("prompt_templates")
    .select("*")
    .eq("slug", slug)
    .single();
  if (data) return data;

  // Seed from hardcoded if built-in and not yet in DB
  const hardcoded = HARDCODED_FORMS[slug];
  if (hardcoded) return { slug, ...hardcoded, _seedOnly: true };

  throw new Error("Template not found");
}

export default function EditFacilityPage({ params }) {
  const { slug } = use(params);
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const { data: template, isLoading } = useSWR(`template:${slug}`, () =>
    fetchTemplate(slug),
  );

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏢");
  const [prompt, setPrompt] = useState("");
  const [greeting, setGreeting] = useState("");
  const [fields, setFields] = useState([makeField()]);

  useEffect(() => {
    if (template) {
      setName(template.name ?? "");
      setIcon(template.icon ?? "🏢");
      setPrompt(template.system_prompt ?? "");
      setGreeting(template.greeting ?? "");
      setFields(
        template.variables?.length
          ? template.variables.map(normalizeField)
          : [makeField()],
      );
    }
  }, [template]);

  function updateField(i, key, val) {
    setFields((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: val };
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
      toast.error("Name is required.");
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
    // Upsert — handles both first-time save of built-ins and updates of custom ones
    const { error } = await supabase.from("prompt_templates").upsert(
      {
        slug,
        name: name.trim(),
        icon: icon.trim() || "🏢",
        category: "healthcare",
        system_prompt: prompt.trim(),
        greeting: greeting.trim(),
        variables: validFields,
      },
      { onConflict: "slug" },
    );
    setSaving(false);

    if (error) {
      toast.error(error.message ?? "Save failed.");
      return;
    }

    // If this was a seed-only built-in, it's now persisted — re-fetch
    toast.success("Saved.");
  }

  if (isLoading) return <div style={{ ...sk, width: "100%", height: 300 }} />;
  if (!template)
    return (
      <p style={{ color: "var(--ink-400)", fontSize: "0.9rem" }}>
        Template not found.
      </p>
    );

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
        <h1 style={s.pageTitle}>Edit — {template.name}</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ ...s.btnPrimary, marginLeft: "auto" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => router.push("/dashboard/form-builder")}
          style={s.btnGhost}
        >
          ← Back
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
              onChange={(e) => setName(e.target.value)}
              style={s.input}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Icon</label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              style={{ ...s.input, textAlign: "center", fontSize: 20 }}
            />
          </div>
        </div>
        <div style={s.field}>
          <label style={s.label}>Slug (read-only)</label>
          <input
            value={slug}
            disabled
            style={{
              ...s.input,
              fontFamily: "var(--font-mono)",
              fontSize: "0.8rem",
              opacity: 0.5,
            }}
            title="Slug cannot be changed"
          />
          <p style={s.hint}>
            Slug is fixed. Changes here save to Supabase and override built-in
            defaults.
          </p>
        </div>
      </div>

      {/* Prompt */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>AI Prompt Template</h2>
        <p style={s.hint}>
          Use {`{{variable_key}}`} syntax matching field keys below.
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
                  <label style={s.label}>Key</label>
                  <input
                    value={field.key}
                    onChange={(e) => updateField(i, "key", e.target.value)}
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
                    style={s.input}
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Hint</label>
                  <input
                    value={field.hint}
                    onChange={(e) => updateField(i, "hint", e.target.value)}
                    style={s.input}
                  />
                </div>
              </div>

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

const sk = {
  background: "var(--border)",
  borderRadius: 10,
  animation: "pulse 1.4s ease-in-out infinite",
};
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
