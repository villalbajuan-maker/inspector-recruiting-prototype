import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeWN6bmNkZHRpeXBuZ3Bpc3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MjY4OTIsImV4cCI6MjA4NDUwMjg5Mn0.-kVHKkCeA3E59pf2Cn0UdRowJ1EihxBZ0OVu8ODMn20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Scheduler-Secret",
};

interface DispatchResult {
  interview_id: string;
  candidate_name: string | null;
  scheduled_at: string | null;
  status: "started" | "failed";
  call_id?: string;
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: "Supabase environment is not configured" }, 500);
    }

    const expectedSecret = Deno.env.get("SCHEDULED_INTERVIEW_DISPATCH_SECRET");
    const providedSecret = req.headers.get("x-scheduler-secret");
    const bearerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const isAuthorized = expectedSecret
      ? providedSecret === expectedSecret
      : bearerToken === serviceRoleKey ||
        bearerToken === PROJECT_ANON_KEY ||
        (anonKey ? bearerToken === anonKey : false);

    if (!isAuthorized) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit || 10), 1), 25);
    const now = new Date().toISOString();
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: interviews, error } = await supabase
      .from("interview_session")
      .select("id,candidate_name,candidate_phone,scheduled_at,status,intent,intake_source")
      .eq("status", "draft")
      .eq("intent", "schedule_call")
      .eq("intake_source", "landing")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(limit);

    if (error) throw new Error(`Failed to load due scheduled interviews: ${error.message}`);

    const results: DispatchResult[] = [];
    for (const interview of interviews || []) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/start-interview-call`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ interview_id: interview.id }),
        });
        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || `start-interview-call returned ${response.status}`);
        }

        results.push({
          interview_id: interview.id,
          candidate_name: interview.candidate_name,
          scheduled_at: interview.scheduled_at,
          status: "started",
          call_id: result.call_id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[DISPATCH_SCHEDULED_INTERVIEWS] Failed to start interview", {
          interview_id: interview.id,
          error: message,
        });
        results.push({
          interview_id: interview.id,
          candidate_name: interview.candidate_name,
          scheduled_at: interview.scheduled_at,
          status: "failed",
          error: message,
        });
      }
    }

    return json({
      success: true,
      due_count: interviews?.length || 0,
      started_count: results.filter((result) => result.status === "started").length,
      failed_count: results.filter((result) => result.status === "failed").length,
      results,
    });
  } catch (error) {
    console.error("[DISPATCH_SCHEDULED_INTERVIEWS] Fatal error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
