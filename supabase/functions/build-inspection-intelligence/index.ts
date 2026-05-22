import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INSPECTION_EVALUATION_PROMPT = `You are an Inspector Candidate Evaluator for SignalOS Inspection Track.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY OBJECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Evaluate whether this candidate can operate as a NEUTRAL INSPECTOR - not an executor, not a salesperson, not a recommender.

The role requires someone who:
- Documents objective observations WITHOUT bias
- Operates within strict protocol boundaries
- Resists homeowner pressure to provide opinions or recommendations
- Can be trained on standardized inspection protocols
- Understands they are NOT there to fix, sell, or advise

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVALUATION DIMENSIONS (5 CRITICAL AREAS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1) NEUTRALITY (Role Understanding)
   - Does candidate understand they observe but do NOT recommend?
   - Do they show restraint or tendency to give advice/opinions?
   - Can they separate documentation from judgment?
   - RED FLAG: "I'd tell them what needs fixing" or "I'd recommend..."
   - POSITIVE: "I document what I see" or "I follow the protocol"

2) LANGUAGE BOUNDARIES
   - Can they avoid technical jargon with homeowners?
   - Do they explain in plain language without oversimplifying?
   - Can they redirect questions they shouldn't answer?
   - RED FLAG: Over-technical explanations or dumbing down
   - POSITIVE: Clear, neutral language; "That's for the report"

3) HOMEOWNER PRESSURE HANDLING
   - How do they respond when asked "Is this bad?" or "What should I do?"
   - Can they deflect without offending?
   - Do they maintain boundaries under pressure?
   - RED FLAG: Gives in to pressure or provides opinions
   - POSITIVE: Firm but polite boundaries; refers to protocol

4) OPERATIONAL DISCIPLINE
   - Do they show attention to detail and process adherence?
   - Can they follow checklists and protocols reliably?
   - Do they understand documentation requirements?
   - RED FLAG: Shortcuts, "I know what I'm doing" attitude
   - POSITIVE: Process-oriented, detail-focused, systematic

5) TRAINABILITY
   - Are they coachable and open to standardized methods?
   - Do they ask clarifying questions?
   - Can they set aside prior trade experience to follow new protocols?
   - RED FLAG: "I've been doing this for years my way"
   - POSITIVE: "How do you want me to document this?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (MANDATORY JSON ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "intelligence_version": "1.0",
  "track_key": "inspection",
  "generated_at": "<ISO timestamp>",
  "candidate_summary": {
    "name": "<string>",
    "contact": {
      "email": "<string | null>",
      "phone": "<string | null>"
    },
    "location": {
      "base_zip": "<string | null>",
      "travel_limit": "<string | null>",
      "service_areas": "<array | null>"
    },
    "work_profile": {
      "role_function": "<string | null>",
      "background": "<string describing relevant experience>",
      "inspection_experience": "<boolean | null>",
      "related_trades": "<array of related skills | null>"
    }
  },
  "signal_indicators": {
    "overall_result": "pass" | "review" | "reject",
    "overall_notes": "<summary of evaluation>",
    "neutrality": {
      "score": <0-100>,
      "assessment": "strong" | "acceptable" | "concerning" | "disqualifying",
      "notes": "<specific observations>",
      "flags": ["<red flags if any>"]
    },
    "language_boundaries": {
      "score": <0-100>,
      "assessment": "strong" | "acceptable" | "concerning" | "disqualifying",
      "notes": "<specific observations>",
      "flags": ["<red flags if any>"]
    },
    "pressure_handling": {
      "score": <0-100>,
      "assessment": "strong" | "acceptable" | "concerning" | "disqualifying",
      "notes": "<specific observations>",
      "flags": ["<red flags if any>"]
    },
    "operational_discipline": {
      "score": <0-100>,
      "assessment": "strong" | "acceptable" | "concerning" | "disqualifying",
      "notes": "<specific observations>",
      "flags": ["<red flags if any>"]
    },
    "trainability": {
      "score": <0-100>,
      "assessment": "strong" | "acceptable" | "concerning" | "disqualifying",
      "notes": "<specific observations>",
      "flags": ["<red flags if any>"]
    }
  },
  "operational_interest": {
    "immediate_hire_potential": "high" | "medium" | "low",
    "next_steps": ["<array of required actions>"],
    "red_flags": ["<array of concerns>"],
    "positive_signals": ["<array of strengths>"],
    "notes": "<overall hiring recommendation>"
  },
  "audit_trail": {
    "interview_id": "<string>",
    "call_id": "<string>",
    "candidate_id": "<string>",
    "hiring_track_id": "<string>",
    "source": "retell"
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DECISION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

overall_result = "reject" IF:
  - ANY dimension has "disqualifying" assessment
  - Neutrality score < 40
  - Multiple dimensions score < 50

overall_result = "review" IF:
  - One dimension is "concerning" but not disqualifying
  - Neutrality score 40-60 (borderline)
  - Shows potential but needs verification

overall_result = "pass" IF:
  - All dimensions are "acceptable" or better
  - Neutrality score >= 70
  - No disqualifying red flags
  - Shows clear understanding of neutral inspector role

CRITICAL: Be STRICT on neutrality. This is the make-or-break dimension. Someone who can't stay neutral will create liability issues.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Output JSON ONLY
- No markdown, no comments, no extra text
- Base evaluation STRICTLY on transcript evidence
- When in doubt, choose "review" over "pass"`;

interface CoverageZone {
  id: string;
  zone_name: string;
  zip_codes: string[];
  geo_centroid?: { lat: number; lng: number };
}

interface ReachableZone {
  zone_id: string;
  zone_name: string;
  match_type: "full" | "partial";
}

interface GeographicReach {
  engine_version: string;
  inputs: {
    base_zip: string | null;
    travel_limit_text: string | null;
    calculated_radius_miles: number | null;
  };
  reachable_zones: ReachableZone[];
  coverage_assessment: {
    full_count: number;
    partial_count: number;
    uncovered: boolean;
  };
  notes: string;
}

function parseTravelLimit(travelLimitText: string | null): number | null {
  if (!travelLimitText || typeof travelLimitText !== 'string') {
    return null;
  }

  const normalized = travelLimitText.toLowerCase().trim();

  if (normalized.includes('hour and a half') || normalized.includes('1.5 hour')) {
    return 90;
  }

  if (normalized.includes('two hour') || normalized.includes('2 hour')) {
    return 120;
  }

  const oneHourPatterns = [
    /^1\s*hour$/,
    /^one\s*hour$/,
    /^an\s*hour$/,
    /^about\s*(?:an?|1)\s*hour$/,
    /^around\s*(?:an?|1)\s*hour$/,
  ];

  for (const pattern of oneHourPatterns) {
    if (pattern.test(normalized)) {
      return 60;
    }
  }

  const minutesMatch = normalized.match(/(\d+)\s*(?:minute|min)/);
  if (minutesMatch) {
    return parseInt(minutesMatch[1], 10);
  }

  console.log(`[GEO_INSPECTION] Unable to parse travel_limit: "${travelLimitText}"`);
  return null;
}

function calculateRadiusMiles(minutes: number | null): number | null {
  if (minutes === null || minutes <= 0) {
    return null;
  }

  return Math.floor((minutes / 60) * 50);
}

function getZipCentroid(zip: string): { lat: number; lng: number } | null {
  const zipCentroids: Record<string, { lat: number; lng: number }> = {
    '90001': { lat: 33.9731, lng: -118.2479 },
    '90002': { lat: 33.9500, lng: -118.2400 },
    '90003': { lat: 33.9642, lng: -118.2728 },
    '90004': { lat: 34.0766, lng: -118.3089 },
    '90005': { lat: 34.0580, lng: -118.3006 },
    '90006': { lat: 34.0480, lng: -118.2928 },
    '90007': { lat: 34.0283, lng: -118.2823 },
    '90008': { lat: 33.9871, lng: -118.3348 },
    '90011': { lat: 34.0072, lng: -118.2581 },
    '90012': { lat: 34.0631, lng: -118.2378 },
    '90013': { lat: 34.0444, lng: -118.2467 },
    '90014': { lat: 34.0422, lng: -118.2528 },
    '90015': { lat: 34.0394, lng: -118.2656 },
    '90016': { lat: 34.0322, lng: -118.3522 },
    '90017': { lat: 34.0533, lng: -118.2656 },
    '90018': { lat: 34.0217, lng: -118.3100 },
    '90019': { lat: 34.0450, lng: -118.3344 },
    '90020': { lat: 34.0656, lng: -118.3089 },
    '90021': { lat: 34.0350, lng: -118.2389 },
    '90022': { lat: 34.0244, lng: -118.1556 },
    '90023': { lat: 34.0217, lng: -118.2078 },
    '90024': { lat: 34.0633, lng: -118.4456 },
    '90025': { lat: 34.0400, lng: -118.4467 },
    '90026': { lat: 34.0778, lng: -118.2656 },
    '90027': { lat: 34.1078, lng: -118.2928 },
    '90028': { lat: 34.1017, lng: -118.3267 },
    '90029': { lat: 34.0900, lng: -118.2889 },
    '90031': { lat: 34.0850, lng: -118.2106 },
    '90032': { lat: 34.0722, lng: -118.1861 },
    '90033': { lat: 34.0483, lng: -118.2083 },
    '90034': { lat: 34.0267, lng: -118.4017 },
    '90035': { lat: 34.0494, lng: -118.3778 },
    '90036': { lat: 34.0594, lng: -118.3500 },
    '90037': { lat: 34.0050, lng: -118.2889 },
    '90038': { lat: 34.0867, lng: -118.3328 },
    '90039': { lat: 34.1217, lng: -118.2456 },
    '90040': { lat: 33.9939, lng: -118.1678 },
    '90041': { lat: 34.1383, lng: -118.2022 },
    '90042': { lat: 34.1139, lng: -118.1978 },
    '90043': { lat: 33.9883, lng: -118.3306 },
    '90044': { lat: 33.9506, lng: -118.2883 },
    '90045': { lat: 33.9583, lng: -118.3906 },
    '90046': { lat: 34.1111, lng: -118.3617 },
    '90047': { lat: 33.9550, lng: -118.3089 },
    '90048': { lat: 34.0728, lng: -118.3644 },
    '90049': { lat: 34.0583, lng: -118.4856 },
    '90056': { lat: 33.9883, lng: -118.3744 },
    '90057': { lat: 34.0656, lng: -118.2772 },
    '90058': { lat: 33.9800, lng: -118.2328 },
    '90059': { lat: 33.9322, lng: -118.2522 },
    '90061': { lat: 33.9272, lng: -118.2722 },
    '90062': { lat: 33.9800, lng: -118.3061 },
    '90063': { lat: 34.0533, lng: -118.1817 },
    '90064': { lat: 34.0350, lng: -118.4289 },
    '90065': { lat: 34.1078, lng: -118.2306 },
    '90066': { lat: 33.9928, lng: -118.4272 },
    '90067': { lat: 34.0578, lng: -118.4178 },
    '90068': { lat: 34.1156, lng: -118.3344 },
    '90069': { lat: 34.0922, lng: -118.3839 },
    '90071': { lat: 34.0528, lng: -118.2542 },
    '90077': { lat: 34.0917, lng: -118.4472 },
    '90089': { lat: 34.0200, lng: -118.2878 },
    '90094': { lat: 33.9700, lng: -118.4178 },
    '90095': { lat: 34.0689, lng: -118.4453 },
  };

  return zipCentroids[zip] || null;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function computeGeographicReach(
  baseZip: string | null,
  travelLimitText: string | null,
  coverageZones: CoverageZone[]
): GeographicReach {
  console.log(`[GEO_INSPECTION] Computing geographic reach for baseZip: ${baseZip}, travel: ${travelLimitText}`);

  const minutes = parseTravelLimit(travelLimitText);
  const radiusMiles = calculateRadiusMiles(minutes);

  console.log(`[GEO_INSPECTION] Parsed: ${minutes} minutes → ${radiusMiles} miles`);

  const reachableZones: ReachableZone[] = [];
  let fullCount = 0;
  let partialCount = 0;

  if (!baseZip) {
    console.log(`[GEO_INSPECTION] No base ZIP provided, cannot compute reach`);
    return {
      engine_version: "1.0",
      inputs: {
        base_zip: null,
        travel_limit_text: travelLimitText,
        calculated_radius_miles: radiusMiles,
      },
      reachable_zones: [],
      coverage_assessment: {
        full_count: 0,
        partial_count: 0,
        uncovered: true,
      },
      notes: "No base ZIP provided. Cannot compute geographic reach.",
    };
  }

  const baseCoords = getZipCentroid(baseZip);

  for (const zone of coverageZones) {
    if (zone.zip_codes.includes(baseZip)) {
      reachableZones.push({
        zone_id: zone.id,
        zone_name: zone.zone_name,
        match_type: "full",
      });
      fullCount++;
      console.log(`[GEO_INSPECTION] FULL match: ${zone.zone_name} (contains base ZIP)`);
      continue;
    }

    if (radiusMiles !== null && radiusMiles > 0 && baseCoords) {
      let withinRadius = false;

      for (const zoneZip of zone.zip_codes) {
        const zoneCoords = getZipCentroid(zoneZip);
        if (zoneCoords) {
          const distance = calculateDistance(
            baseCoords.lat,
            baseCoords.lng,
            zoneCoords.lat,
            zoneCoords.lng
          );

          if (distance <= radiusMiles) {
            withinRadius = true;
            break;
          }
        }
      }

      if (withinRadius) {
        reachableZones.push({
          zone_id: zone.id,
          zone_name: zone.zone_name,
          match_type: "partial",
        });
        partialCount++;
        console.log(`[GEO_INSPECTION] PARTIAL match: ${zone.zone_name} (within ${radiusMiles} mile radius)`);
      }
    }
  }

  const uncovered = fullCount === 0 && partialCount === 0;

  console.log(`[GEO_INSPECTION] Results: ${fullCount} full, ${partialCount} partial, uncovered: ${uncovered}`);

  return {
    engine_version: "1.0",
    inputs: {
      base_zip: baseZip,
      travel_limit_text: travelLimitText,
      calculated_radius_miles: radiusMiles,
    },
    reachable_zones: reachableZones,
    coverage_assessment: {
      full_count: fullCount,
      partial_count: partialCount,
      uncovered: uncovered,
    },
    notes: radiusMiles
      ? `Conservative radius-based reach. No assumptions beyond stated travel limit of ${minutes} minutes (${radiusMiles} miles).`
      : "Base location identified, but no travel limit specified. Only matching exact ZIP inclusion.",
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
    const { interview_id, candidate_id, hiring_track_id, transcript, extracted, execution_context } = await req.json();

    if (!interview_id || !transcript || !extracted) {
      throw new Error("Missing required inputs: interview_id, transcript, extracted");
    }

    console.log("[INSPECTION] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[INSPECTION] Building Inspection Intelligence");
    console.log("[INSPECTION] interview_id:", interview_id);
    console.log("[INSPECTION] candidate_id:", candidate_id);
    console.log("[INSPECTION] hiring_track_id:", hiring_track_id);
    console.log("[INSPECTION] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[INSPECTION] STEP 1: Loading coverage zones (inspection_extended profile)");
    const { data: coverageZones, error: zonesError } = await supabase
      .from('coverage_zones')
      .select('id, zone_name, zip_codes')
      .eq('is_active', true);

    if (zonesError) {
      console.error("[INSPECTION] Failed to load coverage zones:", zonesError);
      throw new Error(`Failed to load coverage zones: ${zonesError.message}`);
    }

    console.log(`[INSPECTION] Loaded ${coverageZones?.length || 0} active coverage zones`);

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is required for Inspection builder");
    }

    console.log("[INSPECTION] STEP 2: Evaluating candidate on 5 inspection dimensions");

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: INSPECTION_EVALUATION_PROMPT,
          },
          {
            role: "user",
            content: `Evaluate this Inspector candidate:\n\nINTERVIEW_ID: ${interview_id}\n\nTRANSCRIPT:\n${transcript}\n\nEXTRACTED DATA:\n${JSON.stringify(extracted, null, 2)}\n\nEXECUTION CONTEXT:\n${JSON.stringify(execution_context, null, 2)}`,
          },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const openaiResult = await openaiResponse.json();
    const responseText = openaiResult.choices[0].message.content;

    const inspectionIntelligence = JSON.parse(responseText);

    console.log("[INSPECTION] STEP 3: Computing geographic reach");

    const baseZip = extracted.service_area_snapshot?.base_location || null;
    const travelLimit = extracted.service_area_snapshot?.travel_limit || null;

    const geographicReach = computeGeographicReach(
      baseZip,
      travelLimit,
      coverageZones || []
    );

    inspectionIntelligence.geographic_match = geographicReach;
    inspectionIntelligence.coverage_assessment = geographicReach.coverage_assessment;

    console.log("[INSPECTION] ✓ Inspection Intelligence built successfully");
    console.log("[INSPECTION] Overall result:", inspectionIntelligence.signal_indicators?.overall_result);
    console.log("[INSPECTION] Coverage:", JSON.stringify(geographicReach.coverage_assessment, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
        data: inspectionIntelligence,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[INSPECTION] Builder error:", error);
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
