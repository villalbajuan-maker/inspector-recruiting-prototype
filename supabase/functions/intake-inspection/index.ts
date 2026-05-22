import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LandingIntakeInput {
  full_name: string;
  email: string;
  phone: string;
  base_zip: string;
  intent: "call_now" | "schedule_call";
  scheduled_at: string | null;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
  return phone;
}

function normalizeZip(zip: string): string {
  return zip.trim();
}

function validateInput(input: LandingIntakeInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.full_name || input.full_name.trim().length === 0) {
    errors.push("full_name is required");
  }

  if (!input.email || input.email.trim().length === 0) {
    errors.push("email is required");
  }

  if (!input.phone || input.phone.trim().length === 0) {
    errors.push("phone is required");
  }

  if (!input.base_zip || input.base_zip.trim().length === 0) {
    errors.push("base_zip is required");
  }

  if (!input.intent || !["call_now", "schedule_call"].includes(input.intent)) {
    errors.push("intent must be 'call_now' or 'schedule_call'");
  }

  if (input.intent === "schedule_call" && !input.scheduled_at) {
    errors.push("scheduled_at is required when intent is 'schedule_call'");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const input: LandingIntakeInput = await req.json();

    console.log("[LANDING_INTAKE] Received landing intake request");
    console.log("[LANDING_INTAKE] Candidate name:", input.full_name);
    console.log("[LANDING_INTAKE] Intent:", input.intent);

    const validation = validateInput(input);
    if (!validation.valid) {
      console.error("[LANDING_INTAKE] Validation failed:", validation.errors);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Validation failed",
          validation_errors: validation.errors,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const normalizedEmail = normalizeEmail(input.email);
    const normalizedPhone = normalizePhone(input.phone);
    const normalizedZip = normalizeZip(input.base_zip);
    const normalizedName = input.full_name.trim();

    console.log("[LANDING_INTAKE] Normalized data:", {
      email: normalizedEmail,
      phone: normalizedPhone,
      zip: normalizedZip
    });

    console.log("[LANDING_INTAKE] Step 1/3: Finding or creating candidate");

    const { data: existingCandidate } = await supabase
      .from("candidate")
      .select("id")
      .or(`email.eq.${normalizedEmail},phone.eq.${normalizedPhone}`)
      .maybeSingle();

    let candidateId: string;

    if (existingCandidate) {
      candidateId = existingCandidate.id;
      console.log("[LANDING_INTAKE] Found existing candidate:", candidateId);

      const { error: updateError } = await supabase
        .from("candidate")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", candidateId);

      if (updateError) {
        console.error("[LANDING_INTAKE] Failed to update candidate timestamp:", updateError);
      }
    } else {
      console.log("[LANDING_INTAKE] Creating new candidate");

      const { data: inspectionTrack } = await supabase
        .from("hiring_track")
        .select("id, family_id")
        .eq("track_key", "inspection")
        .single();

      if (!inspectionTrack) {
        throw new Error("Inspection hiring track not found");
      }

      const { data: newCandidate, error: createError } = await supabase
        .from("candidate")
        .insert({
          full_name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone,
          base_zip: normalizedZip,
          source: "landing",
          hiring_track_id: inspectionTrack.id,
          workforce_family_id: inspectionTrack.family_id,
          pipeline_stage: "intake",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (createError) {
        console.error("[LANDING_INTAKE] Failed to create candidate:", createError);
        throw new Error(`Failed to create candidate: ${createError.message}`);
      }

      candidateId = newCandidate.id;
      console.log("[LANDING_INTAKE] ✓ Created new candidate:", candidateId);
    }

    console.log("[LANDING_INTAKE] Step 2/3: Creating interview session");

    const sessionData: any = {
      candidate_id: candidateId,
      candidate_name: normalizedName,
      candidate_email: normalizedEmail,
      candidate_phone: normalizedPhone,
      status: "draft",
      intake_source: "landing",
      intent: input.intent,
      created_at: new Date().toISOString(),
    };

    if (input.intent === "schedule_call" && input.scheduled_at) {
      sessionData.scheduled_at = input.scheduled_at;
    }

    const { data: interviewSession, error: sessionError } = await supabase
      .from("interview_session")
      .insert(sessionData)
      .select("id")
      .single();

    if (sessionError) {
      console.error("[LANDING_INTAKE] Failed to create interview session:", sessionError);
      throw new Error(`Failed to create interview session: ${sessionError.message}`);
    }

    console.log("[LANDING_INTAKE] ✓ Created interview session:", interviewSession.id);

    if (input.intent === "call_now") {
      console.log("[LANDING_INTAKE] Step 3/3: Initiating outbound call");

      const callResponse = await fetch(
        `${supabaseUrl}/functions/v1/start-interview-call`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            interview_id: interviewSession.id,
          }),
        }
      );

      if (!callResponse.ok) {
        const errorText = await callResponse.text();
        console.error("[LANDING_INTAKE] Failed to initiate call:", errorText);
        throw new Error(`Failed to initiate outbound call: ${errorText}`);
      }

      const callResult = await callResponse.json();
      console.log("[LANDING_INTAKE] ✓ Outbound call initiated:", callResult.call_id);
    } else {
      console.log("[LANDING_INTAKE] Intent is 'schedule_call' - skipping immediate call");
    }

    console.log("[LANDING_INTAKE] ✓✓✓ COMPLETE: Landing intake processed successfully");
    console.log("[LANDING_INTAKE] Candidate ID:", candidateId);
    console.log("[LANDING_INTAKE] Interview ID:", interviewSession.id);
    console.log("[LANDING_INTAKE] Intent:", input.intent);

    return new Response(
      JSON.stringify({
        success: true,
        candidate_id: candidateId,
        interview_id: interviewSession.id,
        intent: input.intent,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[LANDING_INTAKE] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
