import { normalizeOperatorAction } from "./hiring-operator-actions.ts";

export type InfobipInboundKind =
  | "user_text"
  | "user_voice"
  | "user_button"
  | "status_callback"
  | "unsupported";

export interface InfobipPayloadShape {
  rootKeys: string[];
  messageKeys: string[];
  messageType: string | null;
  nestedMessageKeys: string[];
  contentKeys: string[];
  statusName: string | null;
  hasResults: boolean;
}

export interface NormalizedInfobipInbound {
  kind: InfobipInboundKind;
  from: string | null;
  to: string | null;
  messageId: string | null;
  text: string;
  action: string | null;
  mediaUrl: string | null;
  rawShape: InfobipPayloadShape;
  ignoreReason: string | null;
}

export function normalizeInfobipInbound(payload: any): NormalizedInfobipInbound {
  const envelope = getInboundMessageEnvelope(payload);
  const action = extractKnownCommand(envelope);
  const text = String(action || extractPlainText(envelope) || "").trim();
  const mediaUrl = findInfobipMediaUrl(payload);
  const rawShape = summarizePayloadShape(payload, envelope);
  const base = {
    from: extractFrom(payload, envelope),
    to: extractTo(payload, envelope),
    messageId: envelope.messageId || envelope.id || payload.messageId || null,
    text,
    action,
    mediaUrl,
    rawShape,
  };

  if (action) {
    return { kind: "user_button", ...base, ignoreReason: null };
  }

  if (text) {
    return { kind: "user_text", ...base, ignoreReason: null };
  }

  if (mediaUrl) {
    return { kind: "user_voice", ...base, ignoreReason: null };
  }

  if (isStatusCallback(payload, envelope)) {
    return { kind: "status_callback", ...base, ignoreReason: "Infobip status callback" };
  }

  return { kind: "unsupported", ...base, ignoreReason: "No actionable WhatsApp message content found" };
}

export function findInfobipMediaUrl(payload: any): string | null {
  const envelope = getInboundMessageEnvelope(payload);
  const nestedMessage = envelope?.message || {};
  const content = envelope?.content || nestedMessage?.content || {};
  const audio = envelope?.audio || nestedMessage?.audio || content?.audio || {};
  const voice = envelope?.voice || nestedMessage?.voice || content?.voice || {};
  const media = envelope?.media || nestedMessage?.media || content?.media || {};
  const attachment = envelope?.attachment || nestedMessage?.attachment || content?.attachment || {};

  return (
    envelope.url ||
    envelope.mediaUrl ||
    envelope.downloadUrl ||
    envelope.fileUrl ||
    nestedMessage.url ||
    nestedMessage.mediaUrl ||
    nestedMessage.downloadUrl ||
    nestedMessage.fileUrl ||
    content.url ||
    content.mediaUrl ||
    content.downloadUrl ||
    content.fileUrl ||
    audio.url ||
    audio.mediaUrl ||
    audio.downloadUrl ||
    voice.url ||
    voice.mediaUrl ||
    voice.downloadUrl ||
    media.url ||
    media.mediaUrl ||
    media.downloadUrl ||
    attachment.url ||
    attachment.mediaUrl ||
    attachment.downloadUrl ||
    findVoiceOrAudioUrlByShape(envelope) ||
    null
  );
}

function getInboundMessageEnvelope(payload: any) {
  return (
    payload.message ||
    payload.results?.[0] ||
    payload.messages?.[0] ||
    payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
    payload
  );
}

function extractFrom(payload: any, envelope: any) {
  return normalizeWhatsAppNumber(
    envelope.from ||
      envelope.sender ||
      envelope.contact?.waId ||
      envelope.contact?.phoneNumber ||
      envelope.contacts?.[0]?.waId ||
      envelope.contacts?.[0]?.phoneNumber ||
      payload.from
  ) || null;
}

function extractTo(payload: any, envelope: any) {
  return normalizeWhatsAppNumber(envelope.to || envelope.destination || payload.to) || null;
}

function extractPlainText(envelope: any) {
  return String(
    (typeof envelope.text === "string" ? envelope.text : null) ||
      envelope.text?.body ||
      envelope.body ||
      envelope.button ||
      envelope.buttonText ||
      envelope.buttonPayload ||
      envelope.keyword ||
      envelope.message?.text ||
      envelope.message?.title ||
      envelope.message?.payload ||
      envelope.message?.id ||
      envelope.message?.body ||
      envelope.message?.body?.text ||
      envelope.message?.button ||
      envelope.message?.button?.text ||
      envelope.message?.button?.title ||
      envelope.message?.button?.payload ||
      envelope.message?.buttonText ||
      envelope.message?.buttonPayload ||
      envelope.message?.keyword ||
      envelope.message?.interactive?.button_reply?.title ||
      envelope.message?.interactive?.buttonReply?.title ||
      envelope.message?.interactive?.list_reply?.title ||
      envelope.message?.interactive?.listReply?.title ||
      envelope.message?.reply?.title ||
      envelope.message?.reply?.text ||
      envelope.message?.content?.text ||
      envelope.message?.content?.body?.text ||
      envelope.message?.content?.button?.text ||
      envelope.message?.content?.button?.title ||
      envelope.message?.content?.button?.payload ||
      envelope.content?.text ||
      envelope.content?.body?.text ||
      envelope.content?.button?.text ||
      envelope.content?.button?.title ||
      envelope.content?.button?.payload ||
      envelope.interactive?.button_reply?.title ||
      envelope.interactive?.buttonReply?.title ||
      envelope.interactive?.list_reply?.title ||
      envelope.interactive?.listReply?.title ||
      envelope.reply?.title ||
      envelope.reply?.text ||
      envelope.button?.text ||
      envelope.button?.title ||
      envelope.button?.payload ||
      ""
  ).trim();
}

function extractKnownCommand(envelope: any): string | null {
  const messageType = String(envelope?.message?.type || envelope?.type || "").toUpperCase();
  const isInfobipInteractiveReply = ["INTERACTIVE_BUTTON_REPLY", "INTERACTIVE_LIST_REPLY"].includes(messageType);
  const candidates = [
    envelope.payload,
    envelope.postbackData,
    envelope.postback,
    envelope.buttonPayload,
    envelope.buttonText,
    envelope.keyword,
    envelope.button,
    envelope.button?.title,
    envelope.button?.text,
    envelope.button?.payload,
    envelope.button?.id,
    envelope.message?.interactive?.button_reply?.title,
    envelope.message?.interactive?.button_reply?.payload,
    envelope.message?.interactive?.button_reply?.id,
    envelope.message?.interactive?.buttonReply?.title,
    envelope.message?.interactive?.buttonReply?.payload,
    envelope.message?.interactive?.buttonReply?.id,
    envelope.message?.interactive?.list_reply?.title,
    envelope.message?.interactive?.list_reply?.payload,
    envelope.message?.interactive?.list_reply?.id,
    envelope.message?.interactive?.listReply?.title,
    envelope.message?.interactive?.listReply?.payload,
    envelope.message?.interactive?.listReply?.id,
    envelope.message?.reply?.title,
    envelope.message?.reply?.payload,
    envelope.message?.reply?.postbackData,
    envelope.message?.reply?.id,
    envelope.message?.button,
    envelope.message?.button?.title,
    envelope.message?.button?.text,
    envelope.message?.button?.payload,
    envelope.message?.button?.id,
    envelope.message?.buttonPayload,
    envelope.message?.buttonText,
    ...(isInfobipInteractiveReply
      ? [
          envelope.message?.title,
          envelope.message?.payload,
          envelope.message?.id,
        ]
      : []),
    envelope.message?.postbackData,
    envelope.message?.keyword,
    envelope.interactive?.button_reply?.title,
    envelope.interactive?.button_reply?.payload,
    envelope.interactive?.button_reply?.id,
    envelope.interactive?.buttonReply?.title,
    envelope.interactive?.buttonReply?.payload,
    envelope.interactive?.buttonReply?.id,
    envelope.interactive?.list_reply?.title,
    envelope.interactive?.list_reply?.payload,
    envelope.interactive?.list_reply?.id,
    envelope.interactive?.listReply?.title,
    envelope.interactive?.listReply?.payload,
    envelope.interactive?.listReply?.id,
    envelope.reply?.title,
    envelope.reply?.payload,
    envelope.reply?.postbackData,
    envelope.reply?.id,
    envelope.content?.button?.title,
    envelope.content?.button?.text,
    envelope.content?.button?.payload,
    envelope.content?.button?.id,
    envelope.content?.buttonPayload,
    envelope.content?.buttonText,
    envelope.content?.payload,
    envelope.content?.postbackData,
    envelope.content?.buttonId,
  ];

  for (const candidate of candidates) {
    const action = normalizeOperatorAction(candidate);
    if (action) return action;
  }

  return null;
}

function isStatusCallback(payload: any, envelope: any) {
  return Boolean(
    envelope.status ||
      envelope.statusId ||
      envelope.statusName ||
      envelope.doneAt ||
      envelope.sentAt ||
      envelope.error ||
      envelope.price ||
      envelope.messageCount ||
      payload.status ||
      payload.results?.[0]?.status ||
      payload.results?.[0]?.doneAt ||
      payload.results?.[0]?.sentAt ||
      payload.results?.[0]?.messageCount
  );
}

function summarizePayloadShape(payload: any, envelope: any): InfobipPayloadShape {
  return {
    rootKeys: Object.keys(payload || {}).slice(0, 20),
    messageKeys: Object.keys(envelope || {}).slice(0, 20),
    messageType: envelope?.message?.type || envelope?.type || null,
    nestedMessageKeys: Object.keys(envelope?.message || {}).slice(0, 20),
    contentKeys: Object.keys(envelope?.content || envelope?.message?.content || {}).slice(0, 20),
    statusName: envelope?.status?.name || envelope?.statusName || payload?.results?.[0]?.status?.name || null,
    hasResults: Array.isArray(payload?.results),
  };
}

function findVoiceOrAudioUrlByShape(value: any): string | null {
  const type = String(value?.message?.type || value?.type || "").toUpperCase();
  if (!["AUDIO", "VOICE"].includes(type)) return null;

  return findFirstUrl(value);
}

function findFirstUrl(value: any, depth = 0): string | null {
  if (!value || depth > 5) return null;

  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? value : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findFirstUrl(item, depth + 1);
      if (url) return url;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  for (const key of ["url", "mediaUrl", "downloadUrl", "fileUrl", "href"]) {
    const url = findFirstUrl(value[key], depth + 1);
    if (url) return url;
  }

  for (const item of Object.values(value)) {
    const url = findFirstUrl(item, depth + 1);
    if (url) return url;
  }

  return null;
}

function normalizeWhatsAppNumber(value: unknown): string {
  if (!value) return "";
  return String(value).replace(/^whatsapp:/i, "").replace(/\D/g, "");
}
