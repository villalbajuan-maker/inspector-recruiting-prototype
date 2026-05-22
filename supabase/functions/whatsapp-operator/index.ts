import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  orchestrateHiringOperator,
  type OperatorAction,
} from "../_shared/hiring-operator-orchestrator-real-scheduled.ts";
import {
  normalizeInfobipInbound,
} from "../_shared/infobip-normalizer.ts";
import {
  renderTextWithActions,
  shouldRenderInfobipButtons,
  toInfobipButtons,
} from "../_shared/infobip-renderer.ts";
import {
  formatVoiceTranscriptionFallback,
  transcribeVoiceNote,
} from "../_shared/voice-transcriber.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Infobip-Webhook-Secret",
};

const OPENAI_TRANSCRIBE_MODEL = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";

interface InboundMessage {
  from: string;
  to: string | null;
  senderOverride: string | null;
  text: string;
  action: string | null;
  messageKind: "button" | "text" | "audio" | "unknown";
  messageId: string | null;
  mediaUrl: string | null;
  rawShape: unknown;
  shouldIgnore: boolean;
  actionRendering: "text" | "buttons" | null;
  raw: any;
  dryRun: boolean;
}

interface OutboundResult {
  requestedRendering: "text" | "buttons";
  sentRendering: "text" | "buttons" | "none";
  status: "sent" | "fallback_sent" | "skipped" | "failed";
  error: string | null;
  providerStatus?: string | null;
  providerMessageId?: string | null;
  providerResponse?: unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    assertWebhookSecret(req);

    const inbound = await parseInboundMessage(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!inbound.from) {
      if (inbound.shouldIgnore) {
        console.info("[WHATSAPP_OPERATOR] ignored inbound without sender", {
          messageKind: inbound.messageKind,
          messageId: inbound.messageId,
          rawShape: inbound.rawShape,
        });

        await logInboundEvent(supabase, inbound, {
          status: "ignored",
          error: "No actionable WhatsApp message content or sender found",
        });

        return json({
          success: true,
          ignored: true,
          reason: "No actionable WhatsApp message content or sender found",
          messageKind: inbound.messageKind,
          dryRun: inbound.dryRun,
        });
      }

      return json({ success: false, error: "No sender found in inbound payload" }, 400);
    }

    if (inbound.shouldIgnore || (!inbound.text && !inbound.action && inbound.messageKind === "unknown")) {
      console.info("[WHATSAPP_OPERATOR] ignored inbound", {
        messageKind: inbound.messageKind,
        action: inbound.action,
        textPreview: inbound.text.slice(0, 40),
        messageId: inbound.messageId,
        rawShape: inbound.rawShape,
      });

      await logInboundEvent(supabase, inbound, {
        status: "ignored",
        error: "No actionable WhatsApp message content found",
      });

      return json({
        success: true,
        ignored: true,
        reason: "No actionable WhatsApp message content found",
        messageKind: inbound.messageKind,
        dryRun: inbound.dryRun,
      });
    }

    if (!inbound.text && inbound.messageKind === "audio") {
      try {
        inbound.text = await transcribeInboundAudio(inbound.mediaUrl);
        inbound.messageKind = inbound.text ? "audio" : inbound.messageKind;
      } catch (error) {
        if (inbound.messageKind === "audio") {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[WHATSAPP_OPERATOR] Voice transcription failed:", {
            message,
            messageId: inbound.messageId,
            rawShape: inbound.rawShape,
          });

          const reply = formatVoiceTranscriptionFallback();
          await logInboundEvent(supabase, inbound, {
            status: "transcription_failed",
            transcriptionFailed: true,
            error: message,
          });

          if (!inbound.dryRun) {
            await sendInfobipText(inbound.from, reply, inbound.senderOverride || inbound.to);
          }

          return json({
            success: true,
            transcriptionFailed: true,
            messageKind: inbound.messageKind,
            reply,
            dryRun: inbound.dryRun,
          });
        }

        throw error;
      }
    }

    const response = await orchestrateHiringOperator(
      {
        channel: "whatsapp",
        user: { phone: inbound.from },
        message: {
          type: inbound.messageKind,
          text: inbound.text,
          action: inbound.action,
        },
        context: {
          tenant: "retail-ai",
          locale: "en-US",
        },
      },
      supabase
    );

    console.info("[WHATSAPP_OPERATOR] inbound", {
      messageKind: inbound.messageKind,
      intent: response.debug.intent,
      action: inbound.action,
      textPreview: inbound.text.slice(0, 40),
      messageId: inbound.messageId,
      rawShape: inbound.rawShape,
    });

    await logInboundEvent(supabase, inbound, {
      status: "processed",
      intent: response.debug.intent,
    });

    if (!inbound.dryRun) {
      const outbound = await sendInfobipReply(
        inbound.from,
        response.text,
        response.actions,
        inbound.senderOverride || inbound.to,
        inbound.actionRendering
      );

      await logOutboundEvent(supabase, inbound, response.actions, outbound);
    }

    return json({
      success: true,
      state: response.state,
      intent: response.debug.intent,
      messageKind: inbound.messageKind,
      to: inbound.from,
      reply: response.text,
      outboundPreview: renderTextWithActions(response.text, response.actions),
      actions: response.actions,
      actionRendering: inbound.actionRendering || "default",
      dryRun: inbound.dryRun,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[WHATSAPP_OPERATOR] Error:", error);
    return json({ success: false, error: message }, 500);
  }
});

async function logInboundEvent(
  supabase: any,
  inbound: InboundMessage,
  event: {
    status: "processed" | "ignored" | "transcription_failed";
    intent?: string | null;
    transcriptionFailed?: boolean;
    error?: string | null;
  }
) {
  const { error } = await supabase
    .from("hiring_operator_inbound_events")
    .insert({
      channel: "whatsapp",
      user_key: inbound.from || null,
      message_id: inbound.messageId,
      message_kind: inbound.messageKind,
      intent: event.intent || null,
      status: event.status,
      text_preview: inbound.text ? inbound.text.slice(0, 120) : null,
      action: inbound.action,
      transcription_failed: event.transcriptionFailed || false,
      error: event.error || null,
      raw_shape: inbound.rawShape,
    });

  if (error) {
    console.warn("[WHATSAPP_OPERATOR] Failed to persist inbound event:", error.message);
  }
}

async function logOutboundEvent(
  supabase: any,
  inbound: InboundMessage,
  actions: OperatorAction[],
  outbound: OutboundResult
) {
  const { error } = await supabase
    .from("hiring_operator_outbound_events")
    .insert({
      channel: "whatsapp",
      user_key: inbound.from || null,
      message_id: inbound.messageId,
      requested_rendering: outbound.requestedRendering,
      sent_rendering: outbound.sentRendering,
      status: outbound.status,
      action_ids: actions.map((action) => action.id),
      error: outbound.error,
      provider_status: outbound.providerStatus || null,
      provider_message_id: outbound.providerMessageId || null,
      provider_response: outbound.providerResponse || null,
    });

  if (error) {
    console.warn("[WHATSAPP_OPERATOR] Failed to persist outbound event:", error.message);
  }
}

function assertWebhookSecret(req: Request) {
  const expectedSecret = Deno.env.get("INFOBIP_WEBHOOK_SECRET");
  if (!expectedSecret) return;

  const receivedSecret =
    req.headers.get("x-infobip-webhook-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (receivedSecret !== expectedSecret) {
    throw new Error("Unauthorized webhook request");
  }
}

async function parseInboundMessage(req: Request): Promise<InboundMessage> {
  const url = new URL(req.url);
  const payload = await req.json();
  const inbound = normalizeInfobipInbound(payload);

  return {
    from: inbound.from || "",
    to: inbound.to,
    senderOverride:
      normalizeWhatsAppNumber(
        url.searchParams.get("sender") ||
          req.headers.get("x-infobip-sender") ||
          payload.senderOverride ||
          payload.sender
      ) || null,
    text: inbound.text,
    action: inbound.action,
    messageKind: messageKindFromInbound(inbound.kind),
    messageId: inbound.messageId,
    mediaUrl: inbound.mediaUrl,
    rawShape: inbound.rawShape,
    shouldIgnore: inbound.kind === "status_callback" || inbound.kind === "unsupported",
    actionRendering: actionRenderingOverride(url.searchParams.get("render")),
    raw: payload,
    dryRun: url.searchParams.get("dry_run") === "1",
  };
}

function actionRenderingOverride(value: string | null): InboundMessage["actionRendering"] {
  if (value === "buttons") return "buttons";
  if (value === "text") return "text";
  return null;
}

function messageKindFromInbound(kind: string): InboundMessage["messageKind"] {
  if (kind === "user_button") return "button";
  if (kind === "user_text") return "text";
  if (kind === "user_voice") return "audio";
  return "unknown";
}

async function transcribeInboundAudio(mediaUrl: string | null): Promise<string> {
  return await transcribeVoiceNote({
    mediaUrl,
    infobipHeaders: infobipAuthHeaders(),
    openaiApiKey: Deno.env.get("OPENAI_API_KEY"),
    model: OPENAI_TRANSCRIBE_MODEL,
  });
}

async function sendInfobipReply(
  to: string,
  text: string,
  actions: OperatorAction[],
  senderOverride?: string | null,
  actionRendering?: "text" | "buttons" | null
): Promise<OutboundResult> {
  const requestedRendering = shouldRenderInfobipButtons(actionRendering || undefined) ? "buttons" : "text";

  if (!actions.length || !shouldRenderInfobipButtons(actionRendering || undefined)) {
    const providerResponse = await sendInfobipText(to, renderTextWithActions(text, actions), senderOverride);
    return {
      requestedRendering,
      sentRendering: "text",
      status: actions.length ? "sent" : "sent",
      error: null,
      providerStatus: providerResponse?.status?.name || null,
      providerMessageId: providerResponse?.messageId || null,
      providerResponse,
    };
  }

  try {
    const providerResponse = await sendInfobipButtons(
      to,
      text,
      toInfobipButtons(actions),
      senderOverride
    );
    return {
      requestedRendering,
      sentRendering: "buttons",
      status: "sent",
      error: null,
      providerStatus: providerResponse?.status?.name || null,
      providerMessageId: providerResponse?.messageId || null,
      providerResponse,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[WHATSAPP_OPERATOR] Button send failed, falling back to text:", message);
    try {
      const providerResponse = await sendInfobipText(
        to,
        renderTextWithActions(text, actions),
        senderOverride
      );
      return {
        requestedRendering,
        sentRendering: "text",
        status: "fallback_sent",
        error: message,
        providerStatus: providerResponse?.status?.name || null,
        providerMessageId: providerResponse?.messageId || null,
        providerResponse,
      };
    } catch (fallbackError) {
      return {
        requestedRendering,
        sentRendering: "none",
        status: "failed",
        error: `${message}; fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      };
    }
  }
}

async function sendInfobipText(to: string, text: string, senderOverride?: string | null) {
  const baseUrl = Deno.env.get("INFOBIP_BASE_URL");
  const sender = senderOverride || Deno.env.get("INFOBIP_WHATSAPP_SENDER");
  const apiKey = Deno.env.get("INFOBIP_API_KEY");
  if (!baseUrl || !sender || !apiKey) return null;

  const response = await fetch(`${normalizeInfobipBaseUrl(baseUrl)}/whatsapp/1/message/text`, {
    method: "POST",
    headers: {
      ...infobipAuthHeaders(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: sender,
      to,
      content: { text },
    }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Infobip send failed: ${JSON.stringify(result) || await response.text()}`);
  return result;
}

async function sendInfobipButtons(
  to: string,
  text: string,
  buttons: Array<{ id: string; title: string }>,
  senderOverride?: string | null
) {
  const baseUrl = Deno.env.get("INFOBIP_BASE_URL");
  const sender = senderOverride || Deno.env.get("INFOBIP_WHATSAPP_SENDER");
  const apiKey = Deno.env.get("INFOBIP_API_KEY");
  if (!baseUrl || !sender || !apiKey) return null;

  const response = await fetch(`${normalizeInfobipBaseUrl(baseUrl)}/whatsapp/1/message/interactive/buttons`, {
    method: "POST",
    headers: {
      ...infobipAuthHeaders(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: sender,
      to,
      content: {
        body: { text: truncate(text, 1000) },
        action: {
          buttons: buttons.map((button) => ({
            type: "REPLY",
            id: button.id,
            title: button.title,
          })),
        },
      },
      callbackData: "whatsapp-operator",
    }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Infobip button send failed: ${JSON.stringify(result) || await response.text()}`);
  return result;
}

function normalizeWhatsAppNumber(value: unknown): string {
  if (!value) return "";
  return String(value).replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeInfobipBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function infobipAuthHeaders() {
  const apiKey = Deno.env.get("INFOBIP_API_KEY");
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `App ${apiKey}`;
  return headers;
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}\n[message truncated]` : value;
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
