import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StartCallInput {
  interview_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const input: StartCallInput = await req.json();

    console.log("[START_CALL] Received start call request");
    console.log("[START_CALL] Interview ID:", input.interview_id);

    if (!input.interview_id) {
      return new Response(
        JSON.stringify({ success: false, error: "interview_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─────────────────────────────────────────
    // 1️⃣ Load interview session
    // ─────────────────────────────────────────
    const { data: interviewSession } = await supabase
      .from("interview_session")
      .select(`
        id,
        candidate_id,
        candidate_name,
        candidate_phone,
        status,
        intent,
        scheduled_at,
        intake_source,
        candidate (
          hiring_track (
            track_key
          )
        )
      `)
      .eq("id", input.interview_id)
      .maybeSingle();

    if (!interviewSession) {
      return new Response(
        JSON.stringify({ success: false, error: "Interview session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (interviewSession.status !== "draft") {
      return new Response(
        JSON.stringify({ success: false, error: "Interview session not in draft state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isImmediateCall = interviewSession.intent === "call_now";
    const isDueScheduledCall = interviewSession.intent === "schedule_call" &&
      interviewSession.scheduled_at &&
      new Date(interviewSession.scheduled_at).getTime() <= Date.now() + 2 * 60 * 1000;

    if (!isImmediateCall && !isDueScheduledCall) {
      return new Response(
        JSON.stringify({ success: false, error: "Interview is not ready to call yet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (interviewSession.intake_source !== "landing") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid intake_source" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const candidate = Array.isArray(interviewSession.candidate)
      ? interviewSession.candidate[0]
      : interviewSession.candidate;
    const hiringTrack = Array.isArray(candidate?.hiring_track)
      ? candidate.hiring_track[0]
      : candidate?.hiring_track;

    if (hiringTrack?.track_key !== "inspection") {
      return new Response(
        JSON.stringify({ success: false, error: "Hiring track must be inspection" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!interviewSession.candidate_phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Candidate phone missing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agentId = Deno.env.get("INSPECTION_AGENT_ID");
    if (!agentId) {
      return new Response(
        JSON.stringify({ success: false, error: "INSPECTION_AGENT_ID not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fromNumber = Deno.env.get("RETELL_FROM_NUMBER");
    if (!fromNumber) {
      return new Response(
        JSON.stringify({ success: false, error: "RETELL_FROM_NUMBER not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─────────────────────────────────────────
    // 2️⃣ Retell payload (CRITICAL FIX)
    // ─────────────────────────────────────────
    const retellPayload = {
      from_number: fromNumber,
      to_number: interviewSession.candidate_phone,
      override_agent_id: agentId,

      // ✅ THIS IS THE FIX
      retell_llm_dynamic_variables: {
        full_name: interviewSession.candidate_name,
      },

      metadata: {
        interview_id: interviewSession.id,
        candidate_id: interviewSession.candidate_id,
        hiring_track_key: "inspection",
      },
    };

    console.log("[START_CALL] Retell payload:", retellPayload);

    const retellResponse = await fetch(
      "https://api.retellai.com/v2/create-phone-call",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("RETELL_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(retellPayload),
      }
    );

    if (!retellResponse.ok) {
      const errorText = await retellResponse.text();
      return new Response(
        JSON.stringify({ success: false, error: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const retellResult = await retellResponse.json();

    // ─────────────────────────────────────────
    // 3️⃣ Update interview session
    // ─────────────────────────────────────────
    await supabase
      .from("interview_session")
      .update({
        status: "calling",
        called_at: new Date().toISOString(),
        agent_id: agentId,
        execution_context: {
          call_id: retellResult.call_id,
          retell_agent_id: agentId,
          hiring_track_key: "inspection",
        },
      })
      .eq("id", input.interview_id);

    return new Response(
      JSON.stringify({
        success: true,
        interview_id: input.interview_id,
        call_id: retellResult.call_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[START_CALL] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
