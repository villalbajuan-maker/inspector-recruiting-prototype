import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { interviewId, transcript } = await req.json();

    if (!interviewId) {
      throw new Error("Missing required input: interviewId");
    }

    if (!transcript || !transcript.trim()) {
      throw new Error("Missing required input: transcript");
    }

    const { data: interviewData } = await supabase
      .from("interview_session")
      .select("*")
      .eq("id", interviewId)
      .maybeSingle();

    if (!interviewData) {
      throw new Error("Interview session not found");
    }

    if (interviewData.status === "failed") {
      throw new Error("Cannot complete a failed interview session");
    }

    if (interviewData.status === "awaiting_evaluation" || interviewData.status === "evaluated") {
      throw new Error("Interview already completed");
    }

    const responses = [{
      question: "Full Interview Transcript",
      answer: transcript
    }];

    console.log('Step 1: Extracting structured data from transcript...');
    const extractUrl = `${supabaseUrl}/functions/v1/extract-interview-data`;
    const extractResponse = await fetch(extractUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transcript }),
    });

    if (!extractResponse.ok) {
      const errorText = await extractResponse.text();
      throw new Error(`Data extraction failed: ${errorText}`);
    }

    const extractResult = await extractResponse.json();
    if (!extractResult.success) {
      throw new Error(`Data extraction failed: ${extractResult.error}`);
    }

    const extractedData = extractResult.data;
    console.log('✓ Structured data extracted successfully');

    console.log('Step 2: Writing extracted data to database...');
    const writeUrl = `${supabaseUrl}/functions/v1/write-interview-data`;
    const writeResponse = await fetch(writeUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interview_id: interviewId,
        extracted: extractedData,
        runtime: {
          interview_type: interviewData.interview_type,
          agent_id: interviewData.agent_id,
          role_truth_id: interviewData.role_truth_id,
          role_truth_version: interviewData.role_truth_version,
          interview_controls_snapshot: interviewData.interview_controls_snapshot,
          started_at: interviewData.started_at,
          ended_at: new Date().toISOString(),
        },
      }),
    });

    if (!writeResponse.ok) {
      const errorText = await writeResponse.text();
      throw new Error(`Data write failed: ${errorText}`);
    }

    const writeResult = await writeResponse.json();
    if (!writeResult.success) {
      throw new Error(`Data write failed: ${writeResult.error}`);
    }

    console.log('✓ Step 2/5 complete: Interview data written successfully');

    console.log('Step 3/5: Building B1 intelligence...');
    const b1BuilderUrl = `${supabaseUrl}/functions/v1/b1-builder`;
    const b1BuilderResponse = await fetch(b1BuilderUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interview_id: interviewId,
        transcript: transcript,
        extracted: extractedData,
        execution_context: interviewData.execution_context || {},
      }),
    });

    if (!b1BuilderResponse.ok) {
      const errorText = await b1BuilderResponse.text();
      throw new Error(`B1 builder failed: ${errorText}`);
    }

    const b1BuilderResult = await b1BuilderResponse.json();
    if (!b1BuilderResult.success) {
      throw new Error(`B1 builder failed: ${b1BuilderResult.error}`);
    }

    const b1Intelligence = b1BuilderResult.data;
    console.log('✓ Step 3/5 complete: B1 intelligence generated');

    console.log('Step 4/5: Writing B1 intelligence to database...');
    const b1WriterUrl = `${supabaseUrl}/functions/v1/b1-writer`;
    const b1WriterResponse = await fetch(b1WriterUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interview_id: interviewId,
        b1: b1Intelligence,
      }),
    });

    if (!b1WriterResponse.ok) {
      const errorText = await b1WriterResponse.text();
      throw new Error(`B1 writer failed: ${errorText}`);
    }

    const b1WriterResult = await b1WriterResponse.json();
    if (!b1WriterResult.success) {
      throw new Error(`B1 writer failed: ${b1WriterResult.error}`);
    }

    console.log('✓ Step 4/5 complete: B1 intelligence persisted');

    console.log('Step 5/5: Creating pipeline entry...');
    const { data: pipelineEntry, error: pipelineError } = await supabase
      .from("candidate_pipeline")
      .insert({
        interview_id: interviewId,
        stage: "interview_completed",
        stage_notes: "Auto-created from ElevenLabs interview",
        source: "elevenlabs",
        moved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (pipelineError) {
      throw new Error(`Failed to create pipeline entry: ${pipelineError.message}`);
    }

    console.log('✓ Step 5/5 complete: Pipeline entry created');
    console.log('✓✓✓ COMPLETE: Interview fully processed and visible in Pipeline UI');
    console.log('INTERVIEW_SESSION_SAVED', {
      interview_session_id: interviewId,
      pipeline_id: pipelineEntry.id,
      candidate_name: extractedData.candidate_name || interviewData.candidate_name,
      role_truth_id: interviewData.role_truth_id,
      status: 'awaiting_evaluation',
      transcript_length: transcript.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        interview_id: interviewId,
        pipeline_id: pipelineEntry.id,
        message: "Interview processed, B1 intelligence generated, and added to pipeline",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
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
