import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ════════════════════════════════════════════════════════════
// JSON CLEANUP (CRITICAL FIX)
// ════════════════════════════════════════════════════════════

function stripJsonMarkdown(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// ════════════════════════════════════════════════════════════
// NORMALIZATION UTILITIES
// ════════════════════════════════════════════════════════════

function normalizeEmail(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;

  let normalized = raw.toLowerCase().trim();

  normalized = normalized
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+underscore\s+/g, "_")
    .replace(/\s+dash\s+/g, "-")
    .replace(/\s+hyphen\s+/g, "-")
    .replace(/\s+/g, "");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) return null;

  return normalized;
}

function normalizePhone(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 11) return `+${digits}`;
  return null;
}

function normalizeName(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;

  let normalized = raw
    .replace(/\b(um|uh|like|you know|basically|literally)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  return normalized
    .toLowerCase()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizeLocation(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;

  return raw
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .map(w => (w.length === 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function normalizeStringArray(raw: string[] | null): string[] | null {
  if (!Array.isArray(raw)) return null;

  const normalized = Array.from(
    new Set(
      raw
        .filter(v => typeof v === "string" && v.trim())
        .map(v =>
          v
            .toLowerCase()
            .trim()
            .split(" ")
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
        )
    )
  );

  return normalized.length ? normalized : null;
}

// ════════════════════════════════════════════════════════════
// NORMALIZATION CONTRACT
// ════════════════════════════════════════════════════════════

function validateAndNormalize(raw: any) {
  return {
    candidate_name: normalizeName(raw.candidate_name),
    candidate_email: normalizeEmail(raw.candidate_email),
    candidate_phone: normalizePhone(raw.candidate_phone),

    work_scope_snapshot: raw.work_scope_snapshot
      ? {
          role_function: raw.work_scope_snapshot.role_function || null,
          trade: raw.work_scope_snapshot.trade || null,
          primary_skills: normalizeStringArray(raw.work_scope_snapshot.primary_skills),
          experience_level: raw.work_scope_snapshot.experience_level || null,
          typical_work_type: normalizeStringArray(raw.work_scope_snapshot.typical_work_type),
          exclusions: normalizeStringArray(raw.work_scope_snapshot.exclusions),
        }
      : null,

    service_area_snapshot: raw.service_area_snapshot
      ? {
          base_location: normalizeLocation(raw.service_area_snapshot.base_location),
          service_areas: normalizeStringArray(raw.service_area_snapshot.service_areas),
          travel_limit: raw.service_area_snapshot.travel_limit || null,
        }
      : null,
  };
}

// ════════════════════════════════════════════════════════════
// EXTRACTION SYSTEM PROMPT (UNCHANGED CONTRACT)
// ════════════════════════════════════════════════════════════

const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction agent.

You ONLY extract data. You do NOT infer, normalize, or enrich.

Return JSON ONLY. No markdown. No explanations.

Required JSON schema:
{
  "candidate_name": string | null,
  "candidate_email": string | null,
  "candidate_phone": string | null,
  "work_scope_snapshot": {
    "role_function": string | null,
    "trade": string | null,
    "primary_skills": array | null,
    "experience_level": string | null,
    "typical_work_type": array | null,
    "exclusions": array | null
  } | null,
  "service_area_snapshot": {
    "base_location": string | null,
    "service_areas": array | null,
    "travel_limit": string | null
  } | null
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 20) {
      throw new Error("Missing or invalid transcript");
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) throw new Error("OPENAI_API_KEY not configured");

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      throw new Error(await openaiResponse.text());
    }

    const result = await openaiResponse.json();
    const rawText = result.choices[0].message.content;

    const cleaned = stripJsonMarkdown(rawText);
    const parsed = JSON.parse(cleaned);

    const normalized = validateAndNormalize(parsed);

    return new Response(
      JSON.stringify({ success: true, data: normalized }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[EXTRACT ERROR]", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});