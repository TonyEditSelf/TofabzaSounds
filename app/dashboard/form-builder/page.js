"use client";

import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const HARDCODED = [
  { slug: "polyclinic", name: "Polyclinic", icon: "🏥", hardcoded: true },
  {
    slug: "diagnostic",
    name: "Diagnostic Centre",
    icon: "🔬",
    hardcoded: true,
  },
  { slug: "dental", name: "Dental Clinic", icon: "🦷", hardcoded: true },
  { slug: "hospital", name: "Hospital", icon: "🏨", hardcoded: true },
];

async function fetchCustom() {
  const slugs = HARDCODED.map((f) => f.slug);
  const { data, error } = await supabase
    .from("prompt_templates")
    .select("slug, name, icon, variables")
    .not("slug", "in", `(${slugs.join(",")})`)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export default function FormBuilderListPage() {
  const {
    data: custom = [],
    mutate,
    isLoading,
  } = useSWR("form-builder-list", fetchCustom);

  async function handleDelete(slug) {
    if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return;
    const { error } = await supabase
      .from("prompt_templates")
      .delete()
      .eq("slug", slug);
    if (error) {
      toast.error("Delete failed.");
      return;
    }
    toast.success("Deleted.");
    mutate();
  }

  const all = [
    ...HARDCODED,
    ...custom.map((c) => ({ ...c, hardcoded: false })),
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={s.pageTitle}>Form Builder</h1>
        <Link
          href="/dashboard/form-builder/new"
          style={{ marginLeft: "auto", textDecoration: "none" }}
        >
          <button style={s.btnPrimary}>+ New Facility Type</button>
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {isLoading
          ? [1, 2, 3].map((i) => (
              <div key={i} style={{ ...s.skeleton, height: 64 }} />
            ))
          : all.map((f) => (
              <div key={f.slug} style={s.row}>
                <span style={{ fontSize: 22 }}>{f.icon ?? "🏢"}</span>
                <div style={{ flex: 1 }}>
                  <p style={s.rowName}>{f.name}</p>
                  <p style={s.rowSlug}>
                    {f.slug} ·{" "}
                    {f.hardcoded
                      ? "built-in"
                      : `${f.variables?.length ?? 0} fields`}
                  </p>
                </div>
                {f.hardcoded ? (
                  <Link
                    href={`/dashboard/form-builder/${f.slug}`}
                    style={{ textDecoration: "none" }}
                  >
                    <button style={s.btnGhost}>Edit</button>
                  </Link>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link
                      href={`/dashboard/form-builder/${f.slug}`}
                      style={{ textDecoration: "none" }}
                    >
                      <button style={s.btnGhost}>Edit</button>
                    </Link>
                    <button
                      style={s.btnDelete}
                      onClick={() => handleDelete(f.slug)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
      </div>
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
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "14px 16px",
  },
  rowName: {
    margin: 0,
    fontSize: "0.9rem",
    fontWeight: 500,
    color: "var(--ink-900)",
  },
  rowSlug: {
    margin: 0,
    fontSize: "0.75rem",
    color: "var(--ink-400)",
    fontFamily: "var(--font-mono)",
  },
  badge: {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--ink-400)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "3px 10px",
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
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: "0.8rem",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
  },
  btnDelete: {
    background: "transparent",
    color: "var(--ink-400)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: "0.8rem",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
  },
  skeleton: {
    background: "var(--border)",
    borderRadius: 10,
    animation: "pulse 1.4s ease-in-out infinite",
  },
};
