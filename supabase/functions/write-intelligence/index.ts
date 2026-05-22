import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { interview_id, candidate_id, hiring_track_id, intelligence } = await req.json();

    if (!candidate_id || !intelligence) {
      throw new Error("Missing required inputs: candidate_id, intelligence");
    }

    const b1 = intelligence;
    const trackKey = intelligence.track_key || null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[WRITER] Processing intelligence for candidate ${candidate_id}, track: ${trackKey}`);

    console.log("Writing B1 Intelligence for candidate:", candidate_id);

    const { error: deactivateError } = await supabase
      .from("candidate_intelligence")
      .update({ is_active: false })
      .eq("candidate_id", candidate_id)
      .eq("is_active", true);

    if (deactivateError) {
      console.warn("Failed to deactivate previous intelligence:", deactivateError);
    }

    const { data: intelligenceRecord, error: insertError } = await supabase
      .from("candidate_intelligence")
      .insert({
        candidate_id: candidate_id,
        source_type: "interview",
        source_ref_id: interview_id || null,
        intelligence_version: "1.0",
        candidate_summary: b1.candidate_summary || {},
        signal_indicators: b1.signal_indicators || {},
        geographic_match: b1.geographic_match || {},
        operational_interest: b1.operational_interest || {},
        coverage_assessment: b1.coverage_assessment || {},
        generated_at: new Date().toISOString(),
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to insert candidate_intelligence: ${insertError.message}`);
    }

    const extractedName = b1.candidate_summary?.name;
    const extractedEmail = b1.candidate_summary?.contact?.email || null;
    const extractedPhone = b1.candidate_summary?.contact?.phone || null;
    const extractedBaseZip = b1.candidate_summary?.location?.base_location || b1.geographic_match?.base_location_identified || null;

    console.log(`[CANDIDATE_SYNC] Syncing candidate record with B1 intelligence data`);
    console.log(`[CANDIDATE_SYNC] Extracted name: "${extractedName}"`);

    // CRITICAL: Do NOT overwrite primary_trade or secondary_trades
    // These fields are already set by b1-builder-retell with canonical normalized values
    const candidateUpdate: any = {
      email: extractedEmail,
      phone: extractedPhone,
      base_zip: extractedBaseZip,
      updated_at: new Date().toISOString(),
    };

    if (extractedName && extractedName !== "Unknown" && extractedName !== "Retell Call") {
      candidateUpdate.full_name = extractedName;
      console.log(`[CANDIDATE_SYNC] Updating full_name to: "${extractedName}"`);
    } else {
      console.warn(`[CANDIDATE_SYNC] ⚠ Skipping full_name update - extracted name is invalid: "${extractedName}"`);
    }

    const { error: updateCandidateError } = await supabase
      .from("candidate")
      .update(candidateUpdate)
      .eq("id", candidate_id);

    if (updateCandidateError) {
      console.error("[CANDIDATE_SYNC] ✗ FAILED to update candidate record:", updateCandidateError);
    } else {
      console.log("[CANDIDATE_SYNC] ✓ Candidate record synchronized successfully");
    }

    // PIPELINE ROUTING: Track-specific logic
    if (trackKey === "inspection") {
      console.log("[PIPELINE_INSPECTION] Routing inspection candidate");
      const overallResult = b1.signal_indicators?.overall_result;
      const isUncovered = b1.coverage_assessment?.uncovered === true;

      let pipelineStateKey: string | null = null;
      let pipelineStage: string | null = null;

      if (isUncovered) {
        pipelineStateKey = "on_hold";
        pipelineStage = "on_hold";
        console.log("[PIPELINE_INSPECTION] Routing to on_hold: out of coverage");
      } else if (overallResult === "reject") {
        pipelineStateKey = "rejected";
        pipelineStage = "rejected";
        console.log("[PIPELINE_INSPECTION] Routing to rejected: failed evaluation");
      } else if (overallResult === "review") {
        // For inspection, "review" means needs manual review before approval
        pipelineStateKey = "evaluation_in_progress";
        pipelineStage = "evaluation_in_progress";
        console.log("[PIPELINE_INSPECTION] Routing to evaluation_in_progress: requires review");
      } else if (overallResult === "pass") {
        pipelineStateKey = "approved";
        pipelineStage = "approved";
        console.log("[PIPELINE_INSPECTION] Routing to approved: passed evaluation");
      } else {
        // Default fallback
        pipelineStateKey = "interview_completed";
        pipelineStage = "interview_completed";
        console.warn("[PIPELINE_INSPECTION] Unknown overall_result, defaulting to interview_completed");
      }

      const { error: pipelineError } = await supabase
        .from("candidate")
        .update({
          pipeline_state_key: pipelineStateKey,
          pipeline_stage: pipelineStage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate_id);

      if (pipelineError) {
        console.error("[PIPELINE_INSPECTION] Failed to update pipeline:", pipelineError);
      } else {
        console.log(`[PIPELINE_INSPECTION] ✓ Candidate routed to ${pipelineStateKey}`);
      }
    } else {
      // TRADES / OTHER TRACKS: Legacy routing logic (uncovered OR trade_unclassified)
      const isUncovered = b1.coverage_assessment?.uncovered === true;
      const isTradeUnclassified = b1.trade_classification?.trade_unclassified === true;

      if (isUncovered || isTradeUnclassified) {
        const reason = isUncovered && isTradeUnclassified
          ? "out of coverage AND unclassified trade"
          : isUncovered
            ? "out of coverage"
            : "unclassified trade";

        console.log(`[PIPELINE] Candidate routing to Hold: ${reason}`);
        const { error: pipelineError } = await supabase
          .from("candidate")
          .update({
            pipeline_stage: "on_hold",
            updated_at: new Date().toISOString(),
          })
          .eq("id", candidate_id);

        if (pipelineError) {
          console.warn("Failed to update pipeline_stage to on_hold:", pipelineError);
        } else {
          console.log(`[PIPELINE] ✓ Candidate moved to Hold (${reason})`);
        }
      }
    }

    if (interview_id) {
      const sessionName = b1.candidate_summary?.name || "Unknown";
      const sessionEmail = b1.candidate_summary?.contact?.email || null;
      const sessionPhone = b1.candidate_summary?.contact?.phone || null;

      console.log(`[INTERVIEW_SESSION_UPDATE] Attempting to update interview_session ${interview_id}`);
      console.log(`[INTERVIEW_SESSION_UPDATE] Extracted candidate name: "${sessionName}"`);
      console.log(`[INTERVIEW_SESSION_UPDATE] Extracted email: ${sessionEmail}`);
      console.log(`[INTERVIEW_SESSION_UPDATE] Extracted phone: ${sessionPhone}`);

      const { error: updateInterviewError } = await supabase
        .from("interview_session")
        .update({
          interview_intelligence_b1: b1,
          interview_intelligence_b1_version: "1.0",
          interview_intelligence_b1_generated_at: new Date().toISOString(),
          candidate_name: sessionName,
          candidate_email: sessionEmail,
          candidate_phone: sessionPhone,
          work_scope_snapshot: b1.candidate_summary?.work_profile || null,
          service_area_snapshot: b1.candidate_summary?.location || null,
        })
        .eq("id", interview_id);

      if (updateInterviewError) {
        console.error(`[INTERVIEW_SESSION_UPDATE] ✗ FAILED to update interview_session:`, updateInterviewError);
        console.error(`[INTERVIEW_SESSION_UPDATE] This is a CRITICAL BUG - candidate will appear as "Retell Call" in UI`);
      } else {
        console.log(`[INTERVIEW_SESSION_UPDATE] ✓ Successfully updated interview_session`);
        console.log(`[INTERVIEW_SESSION_UPDATE] ✓ Candidate name updated from "Retell Call" to "${sessionName}"`);
      }
    } else {
      console.warn(`[INTERVIEW_SESSION_UPDATE] ⚠ interview_id was not provided, skipping interview_session update`);
      console.warn(`[INTERVIEW_SESSION_UPDATE] This means candidate identity will NOT be synchronized`);
    }

    console.log("B1 Intelligence persisted successfully for candidate:", candidate_id);
    console.log("Intelligence ID:", intelligenceRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        candidate_id: candidate_id,
        intelligence_id: intelligenceRecord.id,
        message: "B1 Intelligence persisted successfully",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("B1 writer error:", error);
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
