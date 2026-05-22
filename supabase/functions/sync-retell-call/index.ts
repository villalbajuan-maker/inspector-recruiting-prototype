import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { interview_id, call_id } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const retellApiKey = Deno.env.get("RETELL_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let callId = call_id;
    let interviewId = interview_id;

    if (!callId && interviewId) {
      const { data: session, error } = await supabase
        .from("interview_session")
        .select("id, execution_context")
        .eq("id", interviewId)
        .maybeSingle();

      if (error || !session) {
        throw new Error("Interview session not found");
      }

      callId = session.execution_context?.call_id;
    }

    if (!callId) {
      throw new Error("Missing call_id");
    }

    if (!interviewId) {
      const { data: session } = await supabase
        .from("interview_session")
        .select("id")
        .eq("execution_context->>call_id", callId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      interviewId = session?.id;
    }

    const retellResponse = await fetch(`https://api.retellai.com/v2/get-call/${callId}`, {
      headers: {
        Authorization: `Bearer ${retellApiKey}`,
      },
    });

    if (!retellResponse.ok) {
      throw new Error(`Retell get-call failed: ${await retellResponse.text()}`);
    }

    const call = await retellResponse.json();
    const transcript = normalizeTranscript(call.transcript || call.transcript_object);

    if (!transcript || transcript.trim().length < 50) {
      return json({
        success: false,
        call_id: callId,
        interview_id: interviewId,
        call_status: call.call_status,
        message: "Retell call found, but transcript is not ready yet.",
      }, 202);
    }

    const webhookResponse = await fetch(`${supabaseUrl}/functions/v1/retell-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        event: "call_analyzed",
        call_id: callId,
        agent_id: call.agent_id,
        start_timestamp: call.start_timestamp,
        end_timestamp: call.end_timestamp,
        transcript,
        call_analysis: call.call_analysis || null,
      }),
    });

    const webhookResult = await webhookResponse.json().catch(() => null);
    if (!webhookResponse.ok) {
      throw new Error(`retell-webhook replay failed: ${JSON.stringify(webhookResult)}`);
    }

    return json({
      success: true,
      call_id: callId,
      interview_id: interviewId,
      webhook: webhookResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[SYNC_RETELL_CALL] Error:", error);
    return json({ success: false, error: message }, 500);
  }
});

function normalizeTranscript(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          const role = record.role || record.speaker || "speaker";
          const content = record.content || record.text || record.words || "";
          return `${role}: ${content}`;
        }
        return String(item);
      })
      .join("\n");
  }
  return String(value);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
