import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  orchestrateHiringOperator,
  type OperatorEvent,
} from "../_shared/hiring-operator-orchestrator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Hiring-Operator-Secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    assertOrchestratorSecret(req);

    const payload = await req.json();
    const event = normalizeEvent(payload);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const response = await orchestrateHiringOperator(event, supabase);

    return json({
      success: true,
      response,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[HIRING_OPERATOR_ORCHESTRATOR] Error:", error);
    return json({ success: false, error: message }, 500);
  }
});

function normalizeEvent(payload: any): OperatorEvent {
  return {
    channel: payload.channel || "api",
    user: {
      phone: payload.user?.phone || payload.phone || null,
    },
    message: {
      type: payload.message?.type || "text",
      text: payload.message?.text ?? payload.text ?? null,
      action: payload.message?.action ?? payload.action ?? null,
    },
    context: {
      tenant: payload.context?.tenant || "retail-ai",
      locale: payload.context?.locale || "en-US",
    },
  };
}

function assertOrchestratorSecret(req: Request) {
  const expectedSecret = Deno.env.get("HIRING_OPERATOR_SECRET");
  if (!expectedSecret) return;

  const receivedSecret =
    req.headers.get("x-hiring-operator-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (receivedSecret !== expectedSecret) {
    throw new Error("Unauthorized orchestrator request");
  }
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
