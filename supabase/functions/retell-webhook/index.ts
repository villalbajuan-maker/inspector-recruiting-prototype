import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  return email.toLowerCase().trim();
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
  return phone;
}

async function resolveAgentToHiringTrack(
  supabase: any,
  agentId: string | null
): Promise<{ hiring_track_id: string; track_key: string } | null> {
  if (!agentId) {
    console.log("[ROUTER] No agent_id provided");
    return null;
  }

  console.log(`[ROUTER] Resolving agent_id: ${agentId} → hiring_track`);

  const agentToTrackMap: Record<string, string> = {
    'TRADES_AGENT_ID': 'trades',
    'INSPECTION_AGENT_ID': 'inspection',
    'SALES_AGENT_ID': 'sales',
    'MANAGEMENT_AGENT_ID': 'management',
  };

  let trackKey: string | null = null;
  for (const [envVar, track] of Object.entries(agentToTrackMap)) {
    const configuredAgentId = Deno.env.get(envVar);
    if (configuredAgentId && configuredAgentId === agentId) {
      trackKey = track;
      break;
    }
  }

  if (!trackKey) {
    console.error(`[ROUTER] No hiring track mapping found for agent_id: ${agentId}`);
    console.error(`[ROUTER] Available environment variables: ${Object.keys(agentToTrackMap).join(', ')}`);
    return null;
  }

  const { data: hiringTrack, error } = await supabase
    .from('hiring_track')
    .select('id, track_key')
    .eq('track_key', trackKey)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !hiringTrack) {
    console.error(`[ROUTER] Failed to resolve hiring_track for track_key: ${trackKey}`, error);
    return null;
  }

  console.log(`[ROUTER] Resolved: agent_id ${agentId} → hiring_track ${hiringTrack.track_key} (${hiringTrack.id})`);
  return {
    hiring_track_id: hiringTrack.id,
    track_key: hiringTrack.track_key,
  };
}

function getIntelligenceBuilderEndpoint(trackKey: string): string {
  const builderMap: Record<string, string> = {
    'trades': 'build-trades-intelligence',
    'inspection': 'build-inspection-intelligence',
    'sales': 'build-sales-intelligence',
    'management': 'build-management-intelligence',
  };

  return builderMap[trackKey] || 'build-trades-intelligence';
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === "number") {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return normalizeTimestamp(numeric);
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  return new Date().toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const payload = await req.json();

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("RETELL WEBHOOK ROUTER");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Event type:", payload.event || payload.event_type);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const eventType = payload.event || payload.event_type;

    const callId =
      payload.call_id ||
      payload.callId ||
      payload.id ||
      payload.call?.id ||
      payload.call?.call_id ||
      payload.data?.call_id ||
      payload.data?.id;

    if (!callId) {
      console.error("[ROUTER] CRITICAL: No call_id found in payload");
      return new Response(
        JSON.stringify({
          success: false,
          error: "No call_id found in webhook payload"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    console.log(`[ROUTER] Processing call_id: ${callId}`);

    if (eventType !== "call_ended" && eventType !== "call_analyzed") {
      console.log(`[ROUTER] Event '${eventType}' is not a completion event, ignoring`);
      return new Response(
        JSON.stringify({ success: true, message: `Event '${eventType}' ignored` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingSession } = await supabase
      .from("interview_session")
      .select("id, candidate_id, status, transcript, execution_context")
      .eq("execution_context->>call_id", callId)
      .maybeSingle();

    if (
      existingSession &&
      (existingSession.status === "awaiting_evaluation" || existingSession.status === "evaluated") &&
      existingSession.transcript
    ) {
      console.log(`[ROUTER] Interview already processed for call_id ${callId}, skipping duplicate`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Interview already processed",
          interview_id: existingSession.id
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingSession) {
      console.log(`[ROUTER] Found existing interview session for call_id ${callId}: ${existingSession.id}`);
    }

    let transcript = "";

    if (typeof payload.transcript === "string") {
      transcript = payload.transcript;
    } else if (Array.isArray(payload.transcript)) {
      transcript = payload.transcript
        .map((item: any) => {
          if (typeof item === "string") return item;
          if (item.content) return `${item.role || "speaker"}: ${item.content}`;
          return JSON.stringify(item);
        })
        .join("\n");
    } else if (payload.call?.transcript) {
      transcript = payload.call.transcript;
    } else if (payload.data?.transcript) {
      transcript = payload.data.transcript;
    }

    console.log(`[ROUTER] Extracted transcript length: ${transcript.length}`);

    if (!transcript || transcript.trim().length < 50) {
      console.error(`[ROUTER] Transcript too short (length: ${transcript.length})`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Transcript is empty or too short",
          transcript_length: transcript.length
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const agentId = payload.agent_id || payload.call?.agent_id || null;
    console.log(`[ROUTER] Agent ID from payload: ${agentId}`);

    const trackResolution = await resolveAgentToHiringTrack(supabase, agentId);

    if (!trackResolution) {
      console.error("[ROUTER] Failed to resolve hiring track");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to resolve hiring track from agent_id",
          agent_id: agentId
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const { hiring_track_id, track_key } = trackResolution;
    console.log(`[ROUTER] Resolved: ${track_key} (${hiring_track_id})`);

    const executionContext = {
      source: "retell",
      call_id: callId,
      retell_agent_id: agentId,
      hiring_track_id: hiring_track_id,
      track_key: track_key,
      call_analysis: payload.call_analysis || null,
      webhook_timestamp: new Date().toISOString(),
    };

    const canonicalJson = JSON.stringify(executionContext, Object.keys(executionContext).sort());
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(canonicalJson)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const executionContextHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    console.log("[ROUTER] STEP 1/5: Calling extract-interview-data");
    const extractResponse = await fetch(
      `${supabaseUrl}/functions/v1/extract-interview-data`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ transcript }),
      }
    );

    if (!extractResponse.ok) {
      const errorText = await extractResponse.text();
      console.error("[ROUTER] extract-interview-data failed:", errorText);
      throw new Error(`extract-interview-data failed: ${errorText}`);
    }

    const extractResult = await extractResponse.json();
    const extracted = extractResult.data;
    console.log("[ROUTER] ✓ STEP 1/5 complete: Data extracted");

    const candidateName = extracted.candidate_name || "Retell Call";
    const candidateEmail = normalizeEmail(extracted.candidate_email);
    const candidatePhone = normalizePhone(extracted.candidate_phone);

    console.log("[ROUTER] STEP 2/5: Creating or finding candidate record");

    let candidateId: string | null = existingSession?.candidate_id || null;

    if (candidateId) {
      console.log("[ROUTER] Reusing candidate from existing interview session:", candidateId);
    }

    if (!candidateId && candidateEmail) {
      const { data: existingCandidate } = await supabase
        .from("candidate")
        .select("id")
        .eq("email", candidateEmail)
        .maybeSingle();

      if (existingCandidate) {
        candidateId = existingCandidate.id;
        console.log("[ROUTER] Found existing candidate by email:", candidateId);
      }
    }

    if (!candidateId && candidatePhone) {
      const { data: existingCandidate } = await supabase
        .from("candidate")
        .select("id")
        .eq("phone", candidatePhone)
        .maybeSingle();

      if (existingCandidate) {
        candidateId = existingCandidate.id;
        console.log("[ROUTER] Found existing candidate by phone:", candidateId);
      }
    }

    if (!candidateId) {
      const { data: newCandidate, error: candidateError } = await supabase
        .from("candidate")
        .insert({
          full_name: candidateName,
          email: candidateEmail,
          phone: candidatePhone,
          source: "retell",
          pipeline_stage: "interview_completed",
          hiring_track_id: hiring_track_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (candidateError) {
        console.error("[ROUTER] Failed to create candidate:", candidateError);
        throw new Error(`Failed to create candidate: ${candidateError.message}`);
      }

      candidateId = newCandidate.id;
      console.log("[ROUTER] ✓ STEP 2/5 complete: New candidate created:", candidateId);
    } else {
      const { error: updateError } = await supabase
        .from("candidate")
        .update({
          pipeline_stage: "interview_completed",
          hiring_track_id: hiring_track_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidateId);

      if (updateError) {
        console.warn("[ROUTER] Failed to update existing candidate:", updateError);
      }
      console.log("[ROUTER] ✓ STEP 2/5 complete: Existing candidate updated:", candidateId);
    }

    console.log("[ROUTER] STEP 3/5: Persisting interview_session record");
    let interviewId: string;

    if (existingSession) {
      const mergedExecutionContext = {
        ...(existingSession.execution_context || {}),
        ...executionContext,
      };

      const { data: updatedSession, error: updateSessionError } = await supabase
        .from("interview_session")
        .update({
          candidate_id: candidateId,
          candidate_name: candidateName,
          candidate_email: candidateEmail,
          candidate_phone: candidatePhone,
          status: "awaiting_evaluation",
          interview_type: "retell",
          transcript: transcript,
          ended_at: normalizeTimestamp(payload.end_timestamp),
          execution_context: mergedExecutionContext,
          execution_context_hash: executionContextHash,
          intake_source: existingSession.execution_context?.source === "landing" ? "landing" : "voice_interview",
        })
        .eq("id", existingSession.id)
        .select()
        .single();

      if (updateSessionError) {
        console.error("[ROUTER] Failed to update interview_session:", updateSessionError);
        throw new Error(`Failed to update interview_session: ${updateSessionError.message}`);
      }

      interviewId = updatedSession.id;
      console.log(`[ROUTER] ✓ STEP 3/5 complete: Interview session updated: ${interviewId}`);
    } else {
      const { data: interviewSession, error: insertError } = await supabase
        .from("interview_session")
        .insert({
        candidate_id: candidateId,
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        candidate_phone: candidatePhone,
        status: "awaiting_evaluation",
        interview_type: "retell",
        transcript: transcript,
        started_at: normalizeTimestamp(payload.start_timestamp),
        ended_at: normalizeTimestamp(payload.end_timestamp),
        execution_context: executionContext,
        execution_context_hash: executionContextHash,
        intake_source: "voice_interview",
        })
        .select()
        .single();

      if (insertError) {
        console.error("[ROUTER] Failed to insert interview_session:", insertError);
        throw new Error(`Failed to insert interview_session: ${insertError.message}`);
      }

      interviewId = interviewSession.id;
      console.log(`[ROUTER] ✓ STEP 3/5 complete: Interview session created: ${interviewId}`);
    }

    const builderEndpoint = getIntelligenceBuilderEndpoint(track_key);
    console.log(`[ROUTER] STEP 4/5: Routing to intelligence builder: ${builderEndpoint}`);

    const builderResponse = await fetch(
      `${supabaseUrl}/functions/v1/${builderEndpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          candidate_id: candidateId,
          interview_id: interviewId,
          hiring_track_id: hiring_track_id,
          transcript: transcript,
          extracted: extracted,
          execution_context: executionContext,
        }),
      }
    );

    if (!builderResponse.ok) {
      const errorText = await builderResponse.text();
      console.error(`[ROUTER] ${builderEndpoint} failed:`, errorText);
      throw new Error(`${builderEndpoint} failed: ${errorText}`);
    }

    const builderResult = await builderResponse.json();
    const intelligence = builderResult.data;
    console.log(`[ROUTER] ✓ STEP 4/5 complete: Intelligence built by ${builderEndpoint}`);

    console.log("[ROUTER] STEP 5/5: Calling write-intelligence");
    const writerResponse = await fetch(
      `${supabaseUrl}/functions/v1/write-intelligence`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          candidate_id: candidateId,
          interview_id: interviewId,
          hiring_track_id: hiring_track_id,
          intelligence: intelligence,
        }),
      }
    );

    if (!writerResponse.ok) {
      const errorText = await writerResponse.text();
      console.error("[ROUTER] write-intelligence failed:", errorText);
      throw new Error(`write-intelligence failed: ${errorText}`);
    }

    const writerResult = await writerResponse.json();
    console.log("[ROUTER] ✓ STEP 5/5 complete: Intelligence written to database");
    console.log(`[ROUTER] ✓✓✓ COMPLETE: Candidate ${candidateId} processed via ${track_key} track`);

    return new Response(
      JSON.stringify({
        success: true,
        candidate_id: candidateId,
        interview_id: interviewId,
        hiring_track: track_key,
        intelligence_id: writerResult.intelligence_id,
        message: "Interview processed successfully",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ROUTER] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
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
