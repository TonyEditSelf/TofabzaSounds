import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

// Facility-specific form fields
// These match the {{variable}} keys in each prompt template
const FACILITY_FORMS = {
  polyclinic: [
    {
      key: "clinic_name",
      label: "Clinic Name",
      placeholder: "e.g. Sunrise Polyclinic",
      required: true,
    },
    {
      key: "address",
      label: "Clinic Address",
      placeholder: "e.g. MG Road, Ernakulam",
      required: true,
    },
    {
      key: "hours",
      label: "Working Hours",
      placeholder: "e.g. Mon–Sat 8am–8pm, Sun 9am–1pm",
      required: true,
    },
    {
      key: "clinic_phone",
      label: "Clinic Phone Number",
      placeholder: "e.g. 0484-1234567",
      required: true,
    },
    {
      key: "doctors",
      label: "Doctors & Departments",
      placeholder:
        "e.g. Dr. Anil Kumar – General Medicine (Mon/Wed/Fri)\nDr. Priya Nair – Gynaecology (Tue/Thu)",
      required: true,
      multiline: true,
    },
    {
      key: "fees",
      label: "Consultation Fees",
      placeholder: "e.g. General Medicine – ₹300\nGynaecology – ₹500",
      required: true,
      multiline: true,
    },
    {
      key: "appointment_types",
      label: "Appointment Types",
      placeholder: "e.g. Walk-in, Prior appointment, Online",
      multiline: false,
    },
    {
      key: "languages",
      label: "Languages Spoken",
      placeholder: "e.g. Malayalam, English, Hindi",
    },
    {
      key: "fallback_number",
      label: "Fallback Phone Number",
      placeholder: "e.g. +91 98765 43210",
      hint: "Calls will forward here if AI is unavailable",
    },
    {
      key: "extra_notes",
      label: "Anything else to know",
      placeholder:
        "Special instructions, parking info, insurance accepted, etc.",
      multiline: true,
    },
  ],
  diagnostic: [
    {
      key: "centre_name",
      label: "Centre Name",
      placeholder: "e.g. LifeCare Diagnostics",
      required: true,
    },
    {
      key: "address",
      label: "Centre Address",
      placeholder: "e.g. Palarivattom, Kochi",
      required: true,
    },
    {
      key: "hours",
      label: "Working Hours",
      placeholder: "e.g. Mon–Sat 7am–7pm",
      required: true,
    },
    {
      key: "centre_phone",
      label: "Centre Phone",
      placeholder: "e.g. 0484-9876543",
      required: true,
    },
    {
      key: "home_collection",
      label: "Home Collection Details",
      placeholder:
        "e.g. Available 7am–10am within 10km radius. ₹100 collection charge.",
      multiline: true,
    },
    {
      key: "tests_packages",
      label: "Tests & Health Packages",
      placeholder:
        "e.g. CBC – ₹200, Blood Sugar – ₹80, Full Body Checkup – ₹1499",
      required: true,
      multiline: true,
    },
    {
      key: "report_turnaround",
      label: "Report Turnaround Time",
      placeholder:
        "e.g. Same day for routine tests, 24–48 hrs for advanced panels",
    },
    {
      key: "doctors",
      label: "Doctors / Pathologists",
      placeholder: "e.g. Dr. Rema Nair – Pathologist",
      multiline: true,
    },
    {
      key: "languages",
      label: "Languages Spoken",
      placeholder: "e.g. Malayalam, English",
    },
    {
      key: "fallback_number",
      label: "Fallback Phone Number",
      placeholder: "e.g. +91 98765 43210",
      hint: "Calls will forward here if AI is unavailable",
    },
    {
      key: "extra_notes",
      label: "Anything else to know",
      placeholder:
        "Fasting requirements, sample collection info, insurance, parking, etc.",
      multiline: true,
    },
  ],
  dental: [
    {
      key: "clinic_name",
      label: "Clinic Name",
      placeholder: "e.g. SmileCare Dental",
      required: true,
    },
    {
      key: "address",
      label: "Clinic Address",
      placeholder: "e.g. Thrissur Road, Palakkad",
      required: true,
    },
    {
      key: "hours",
      label: "Working Hours",
      placeholder: "e.g. Mon–Sat 9am–7pm",
      required: true,
    },
    {
      key: "clinic_phone",
      label: "Clinic Phone",
      placeholder: "e.g. 0491-1234567",
      required: true,
    },
    {
      key: "doctors",
      label: "Dentists & Specialisations",
      placeholder: "e.g. Dr. Anoop – Orthodontics\nDr. Meera – Endodontics",
      required: true,
      multiline: true,
    },
    {
      key: "treatments",
      label: "Treatments Offered",
      placeholder: "e.g. Scaling, Root Canal, Implants, Braces, Whitening",
      required: true,
      multiline: true,
    },
    {
      key: "fees",
      label: "Treatment Fees",
      placeholder: "e.g. Scaling – ₹800, RCT – ₹3500, Implant – ₹25000",
      multiline: true,
    },
    {
      key: "appointment_types",
      label: "Appointment Types",
      placeholder: "e.g. Prior appointment only, Emergency walk-ins accepted",
    },
    {
      key: "languages",
      label: "Languages Spoken",
      placeholder: "e.g. Malayalam, English",
    },
    {
      key: "fallback_number",
      label: "Fallback Phone Number",
      placeholder: "e.g. +91 98765 43210",
      hint: "Calls will forward here if AI is unavailable",
    },
    {
      key: "extra_notes",
      label: "Anything else to know",
      placeholder:
        "Insurance accepted, EMI options, special equipment, parking, etc.",
      multiline: true,
    },
  ],
  hospital: [
    {
      key: "hospital_name",
      label: "Hospital Name",
      placeholder: "e.g. City General Hospital",
      required: true,
    },
    {
      key: "address",
      label: "Hospital Address",
      placeholder: "e.g. NH Bypass, Thiruvananthapuram",
      required: true,
    },
    {
      key: "hours",
      label: "OPD Hours",
      placeholder: "e.g. Mon–Sat 8am–6pm; Emergency 24/7",
      required: true,
    },
    {
      key: "hospital_phone",
      label: "Main Phone Number",
      placeholder: "e.g. 0471-1234567",
      required: true,
    },
    {
      key: "departments",
      label: "Departments & Specialities",
      placeholder: "e.g. Cardiology, Orthopaedics, Neurology, Paediatrics",
      required: true,
      multiline: true,
    },
    {
      key: "doctors",
      label: "Key Doctors",
      placeholder: "e.g. Dr. Suresh Nair – Cardiologist (Mon/Wed/Fri OPD)",
      multiline: true,
    },
    {
      key: "fees",
      label: "OPD / Consultation Fees",
      placeholder: "e.g. General OPD – ₹200, Specialist – ₹500",
      multiline: true,
    },
    {
      key: "emergency_number",
      label: "Emergency / Ambulance Number",
      placeholder: "e.g. 0471-9876543 or 108",
    },
    {
      key: "insurance",
      label: "Insurance & Cashless",
      placeholder:
        "e.g. Empanelled with Star Health, ICICI Lombard, Ayushman Bharat",
    },
    {
      key: "appointment_types",
      label: "Appointment Types",
      placeholder:
        "e.g. OPD walk-in, Prior appointment for specialists, Teleconsultation",
    },
    {
      key: "languages",
      label: "Languages Spoken",
      placeholder: "e.g. Malayalam, English, Tamil",
    },
    {
      key: "fallback_number",
      label: "Fallback Phone Number",
      placeholder: "e.g. +91 98765 43210",
      hint: "Calls will forward here if AI is unavailable",
    },
    {
      key: "extra_notes",
      label: "Anything else to know",
      placeholder:
        "Visiting hours, canteen, pharmacy, parking, special facilities, etc.",
      multiline: true,
    },
  ],
};

const FACILITY_LABELS = {
  polyclinic: "Polyclinic",
  diagnostic: "Diagnostic Centre",
  dental: "Dental Clinic",
  hospital: "Hospital",
};

// ── GET /api/onboard/[agent_id] ──────────────────────────
export async function GET(req, { params }) {
  const { agent_id } = await params;
  const sb = supabaseAdmin();

  const { data: agent, error } = await sb
    .from("agents")
    .select("id, name, type, language, config, status")
    .eq("id", agent_id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  const facilityType = agent.config?.facility_type || "polyclinic";

  // DB takes priority — allows operator to override built-in forms via form builder
  let template_vars = null;
  const { data: tmpl } = await sb
    .from("prompt_templates")
    .select("variables")
    .eq("slug", facilityType)
    .single();

  if (tmpl?.variables?.length) {
    template_vars = tmpl.variables;
  } else {
    // Fall back to hardcoded
    template_vars = FACILITY_FORMS[facilityType] || [];
  }

  return NextResponse.json({
    agent: {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      language: agent.language,
      facility_type: facilityType,
      facility_label: FACILITY_LABELS[facilityType] || facilityType,
    },
    template_vars,
  });
}

// ── POST /api/onboard/[agent_id] ─────────────────────────
export async function POST(req, { params }) {
  const { agent_id } = await params;
  const sb = supabaseAdmin();

  const { data: agent, error: agentErr } = await sb
    .from("agents")
    .select("id, client_id")
    .eq("id", agent_id)
    .single();

  if (agentErr || !agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  let parsedForm = {};
  try {
    const raw = formData.get("form_data");
    parsedForm = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid form_data JSON." },
      { status: 400 },
    );
  }

  const uploadedFiles = [];
  const rawFiles = formData.getAll("files");

  for (const file of rawFiles) {
    if (!file || !file.name) continue;
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds 10 MB limit.` },
        { status: 400 },
      );
    }

    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    if (!allowed.includes(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed: ${file.name}` },
        { status: 400 },
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${agent_id}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await sb.storage
      .from("onboarding-files")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      return NextResponse.json(
        { error: `Failed to upload ${file.name}.` },
        { status: 500 },
      );
    }

    uploadedFiles.push({
      name: file.name,
      path: storagePath,
      size: file.size,
      type: file.type,
    });
  }

  const { data: submission, error: insertErr } = await sb
    .from("onboarding_submissions")
    .insert({
      agent_id,
      form_data: parsedForm,
      files: uploadedFiles,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("Submission insert error:", insertErr);
    return NextResponse.json(
      { error: "Failed to save submission." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, submission_id: submission.id });
}
