import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FocusArea {
  name: string;
  description: string;
  why_it_matters: string;
  expected_depth: 'Surface' | 'Practical' | 'Deep';
}

interface RoleTruth {
  id: string;
  role_name: string;
  role_description: string;
  primary_objective: string;
  focus_areas: FocusArea[];
  pressure_level: string;
  followup_style: string;
  depth_expectation: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing required Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const {
      interview_session_id,
      transcript,
      role_truth_id,
      role_truth_version,
      focus_areas,
      interview_controls_snapshot,
      candidate_name,
      candidate_email,
      candidate_phone,
    } = await req.json();

    if (!interview_session_id || !transcript || !role_truth_id) {
      throw new Error("Missing required inputs: interview_session_id, transcript, or role_truth_id");
    }

    console.log("=== OPERATOR TRIGGERED EVALUATION ===");
    console.log("Interview Session ID:", interview_session_id);

    const { data: sessionData, error: sessionError } = await supabase
      .from('interview_session')
      .select('status')
      .eq('id', interview_session_id)
      .maybeSingle();

    if (sessionError || !sessionData) {
      throw new Error('Interview session not found');
    }

    if (sessionData.status !== 'awaiting_evaluation') {
      throw new Error(`Cannot run evaluation - session status is ${sessionData.status}, expected awaiting_evaluation`);
    }

    const { data: roleTruthData, error: roleTruthError } = await supabase
      .from('role_truth')
      .select('*')
      .eq('id', role_truth_id)
      .maybeSingle();

    if (roleTruthError || !roleTruthData) {
      throw new Error('Role truth not found');
    }

    const roleTruth: RoleTruth = {
      id: roleTruthData.id,
      role_name: roleTruthData.role_name,
      role_description: roleTruthData.role_description,
      primary_objective: roleTruthData.primary_objective,
      focus_areas: focus_areas || roleTruthData.focus_areas || [],
      pressure_level: interview_controls_snapshot?.pressure_level || roleTruthData.pressure_level || 'balanced',
      followup_style: interview_controls_snapshot?.followup_style || roleTruthData.followup_style || 'gentle',
      depth_expectation: interview_controls_snapshot?.depth_expectation || roleTruthData.depth_expectation || 'surface',
    };

    console.log("Starting SignalOS v1 evaluation...");
    const evaluation = await conductEvaluation(roleTruth, transcript, openaiKey);
    console.log("Evaluation complete:", JSON.stringify(evaluation, null, 2));

    console.log("Inserting evaluation into database...");
    const { data: insertedData, error: insertError } = await supabase.from("evaluation").insert({
      interview_id: interview_session_id,
      executive_summary: evaluation.executive_summary,
      system_recommendation: evaluation.system_recommendation,
      signal_confidence: evaluation.signal_confidence,
      focus_area_observations: evaluation.focus_area_observations,
      risk_indicators: evaluation.risk_indicators,
      behavioral_signals: evaluation.behavioral_signals,
    }).select();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw insertError;
    }

    console.log("Evaluation inserted successfully:", insertedData);

    return new Response(
      JSON.stringify({
        success: true,
        evaluation: insertedData[0],
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Evaluation error:", error);
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

async function conductEvaluation(
  roleTruth: RoleTruth,
  transcript: string,
  openaiKey: string | undefined
): Promise<{
  executive_summary: string[];
  system_recommendation: string;
  signal_confidence: string;
  focus_area_observations: any[];
  risk_indicators: string[];
  behavioral_signals: string[];
}> {
  const focusAreasText = roleTruth.focus_areas && Array.isArray(roleTruth.focus_areas)
    ? roleTruth.focus_areas.map((fa, i) =>
        `${i + 1}. ${fa.name}\n   Description: ${fa.description}\n   Why it matters: ${fa.why_it_matters}\n   Expected depth: ${fa.expected_depth}`
      ).join('\n\n')
    : 'No focus areas defined';

  const evaluationPrompt = `You are SignalOS, an interview evaluation system. Your role is to analyze interview transcripts and provide structured, neutral signal extraction.

ROLE TRUTH CONTEXT

Role: ${roleTruth.role_name}
Description: ${roleTruth.role_description}
Interview Objective: ${roleTruth.primary_objective}

FOCUS AREAS TO EXPLORE
${focusAreasText}

INTERVIEW CONTROLS
Pressure Level: ${roleTruth.pressure_level}
Follow-up Style: ${roleTruth.followup_style}
Depth Expectation: ${roleTruth.depth_expectation}

INTERVIEW TRANSCRIPT
${transcript}

YOUR TASK

Analyze this interview against the defined Role Truth and provide structured signal extraction.

EVALUATION STEPS

1. Focus Area Coverage
   For each focus area, determine:
   - Was it explored? (Yes / Partial / Insufficient)
   - Depth reached: (Surface / Practical / Deep)

2. Behavioral Signal Extraction
   Look for:
   - Specificity vs vagueness in answers
   - Consistency across responses
   - Ownership language vs deflection
   - Clarification after probing
   - Evidence of actual experience

3. Risk Indicator Detection
   Identify:
   - Repeated vagueness across multiple topics
   - Contradictions in responses
   - Avoidance of responsibility
   - Failure to reach expected depth despite probing
   - Generic or rehearsed answers

4. Executive Signal Summary
   Generate 3-5 neutral, observational bullets
   - No adjectives like "strong" or "weak"
   - Focus on patterns observed
   - Reference specific focus areas
   - Use neutral, factual language

5. System Recommendation
   Choose ONE of:
   - "Proceed to human interview" (positive signal, minimal risk)
   - "Proceed with caution" (mixed signal, some concerns)
   - "Do not proceed at this stage" (significant concerns detected)

   Be conservative. When in doubt, recommend caution.

6. Signal Confidence
   Assess confidence in your evaluation:
   - "Low" - Limited information, short interview, unclear signals
   - "Medium" - Adequate information, clear patterns in some areas
   - "High" - Comprehensive coverage, strong pattern evidence

OUTPUT FORMAT (JSON)

Return ONLY valid JSON in this exact structure:

{
  "focus_area_observations": [
    {
      "focus_area": "name of focus area",
      "coverage": "Yes / Partial / Insufficient",
      "depth_reached": "Surface / Practical / Deep",
      "observation": "brief neutral observation"
    }
  ],
  "behavioral_signals": [
    "Neutral observation about behavioral pattern",
    "Another neutral observation"
  ],
  "risk_indicators": [
    "Specific risk pattern observed",
    "Another specific risk pattern"
  ],
  "executive_summary": [
    "First neutral bullet point",
    "Second neutral bullet point",
    "Third neutral bullet point"
  ],
  "system_recommendation": "Proceed to human interview | Proceed with caution | Do not proceed at this stage",
  "signal_confidence": "Low | Medium | High"
}

CRITICAL RULES
- Be neutral and observational
- No adjectives like "strong", "weak", "good", "bad"
- Reference specific focus areas in observations
- Be conservative in recommendations
- Return ONLY valid JSON, no other text`;

  if (!openaiKey) {
    return fallbackEvaluation(roleTruth, transcript);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 3000,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are SignalOS, an interview evaluation system that provides neutral, structured signal extraction."
          },
          {
            role: "user",
            content: evaluationPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error:", await response.text());
      return fallbackEvaluation(roleTruth, transcript);
    }

    const result = await response.json();
    const content = result.choices[0].message.content;
    const parsed = JSON.parse(content);

    return {
      executive_summary: parsed.executive_summary || [],
      system_recommendation: parsed.system_recommendation || 'Proceed with caution',
      signal_confidence: parsed.signal_confidence || 'Medium',
      focus_area_observations: parsed.focus_area_observations || [],
      risk_indicators: parsed.risk_indicators || [],
      behavioral_signals: parsed.behavioral_signals || [],
    };
  } catch (error) {
    console.error("LLM evaluation failed:", error);
    return fallbackEvaluation(roleTruth, transcript);
  }
}

function fallbackEvaluation(
  roleTruth: RoleTruth,
  transcript: string
): {
  executive_summary: string[];
  system_recommendation: string;
  signal_confidence: string;
  focus_area_observations: any[];
  risk_indicators: string[];
  behavioral_signals: string[];
} {
  const transcriptLower = transcript.toLowerCase();
  const wordCount = transcript.split(/\s+/).length;

  const vaguenessIndicators = ['kind of', 'sort of', 'basically', 'generally', 'usually', 'maybe', 'probably'];
  const ownershipIndicators = ['i decided', 'i made', 'i took', 'i handled', 'my decision', 'i own'];
  const deflectionIndicators = ['they didnt', 'wasnt my', 'someone else', 'not my fault', 'should have told'];

  let vaguenessCount = 0;
  let ownershipCount = 0;
  let deflectionCount = 0;

  vaguenessIndicators.forEach(kw => {
    const regex = new RegExp(kw, 'gi');
    const matches = transcript.match(regex);
    vaguenessCount += matches ? matches.length : 0;
  });

  ownershipIndicators.forEach(kw => {
    if (transcriptLower.includes(kw)) ownershipCount++;
  });

  deflectionIndicators.forEach(kw => {
    if (transcriptLower.includes(kw)) deflectionCount++;
  });

  const hasSpecifics = wordCount > 300;
  const vaguenessRatio = vaguenessCount / Math.max(wordCount / 100, 1);

  const focusAreaObservations = (roleTruth.focus_areas || []).map(fa => ({
    focus_area: fa.name,
    coverage: hasSpecifics ? 'Partial' : 'Insufficient',
    depth_reached: 'Surface',
    observation: 'Unable to determine coverage depth from automated analysis'
  }));

  const behavioralSignals: string[] = [];
  const riskIndicators: string[] = [];
  const executiveSummary: string[] = [];

  if (ownershipCount > 2) {
    behavioralSignals.push('Candidate uses ownership language in responses');
  }

  if (vaguenessRatio > 3) {
    riskIndicators.push('High frequency of vague qualifiers detected in responses');
    executiveSummary.push('Responses contain elevated levels of non-specific language');
  }

  if (deflectionCount > 1) {
    riskIndicators.push('Deflection language detected when discussing challenges');
    executiveSummary.push('Candidate references external factors when describing outcomes');
  }

  if (!hasSpecifics) {
    riskIndicators.push('Limited detail provided across interview responses');
    executiveSummary.push('Transcript length suggests surface-level engagement');
  }

  if (behavioralSignals.length === 0) {
    behavioralSignals.push('No clear behavioral patterns detected in automated analysis');
  }

  if (executiveSummary.length === 0) {
    executiveSummary.push('Automated analysis unable to extract clear signal patterns');
    executiveSummary.push('Manual review recommended for comprehensive evaluation');
  }

  while (executiveSummary.length < 3) {
    executiveSummary.push('Insufficient data for automated signal extraction');
  }

  let recommendation = 'Proceed with caution';
  let confidence = 'Low';

  if (riskIndicators.length >= 3) {
    recommendation = 'Do not proceed at this stage';
    confidence = 'Medium';
  } else if (riskIndicators.length === 0 && ownershipCount > 2 && hasSpecifics) {
    recommendation = 'Proceed to human interview';
    confidence = 'Medium';
  }

  return {
    executive_summary: executiveSummary.slice(0, 5),
    system_recommendation: recommendation,
    signal_confidence: confidence,
    focus_area_observations: focusAreaObservations,
    risk_indicators: riskIndicators,
    behavioral_signals: behavioralSignals,
  };
}
