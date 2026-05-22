import { normalizeInfobipInbound } from "../_shared/infobip-normalizer.ts";

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function fixture(name: string) {
  const text = await Deno.readTextFile(new URL(`./__fixtures__/${name}`, import.meta.url));
  return JSON.parse(text);
}

Deno.test("normalizes inbound hello text", async () => {
  const inbound = normalizeInfobipInbound(await fixture("infobip-text-hello.json"));

  assertEquals(inbound.kind, "user_text");
  assertEquals(inbound.from, "573009990001");
  assertEquals(inbound.to, "19540000000");
  assertEquals(inbound.text, "hello");
  assertEquals(inbound.action, null);
  assertEquals(inbound.mediaUrl, null);
});

Deno.test("normalizes inbound completed text", async () => {
  const inbound = normalizeInfobipInbound(await fixture("infobip-text-completed.json"));

  assertEquals(inbound.kind, "user_text");
  assertEquals(inbound.text, "completed");
});

Deno.test("normalizes a verified button reply into an action", async () => {
  const inbound = normalizeInfobipInbound(await fixture("infobip-button-reply-id-title.json"));

  assertEquals(inbound.kind, "user_button");
  assertEquals(inbound.action, "completed_today");
  assertEquals(inbound.text, "completed_today");
});

Deno.test("normalizes real Infobip interactive button reply into an action", async () => {
  const inbound = normalizeInfobipInbound(await fixture("infobip-real-button-completed-shape.json"));

  assertEquals(inbound.kind, "user_button");
  assertEquals(inbound.from, "573192509637");
  assertEquals(inbound.to, "19540000000");
  assertEquals(inbound.action, "completed_today");
  assertEquals(inbound.text, "completed_today");
  assertEquals(inbound.rawShape.messageType, "INTERACTIVE_BUTTON_REPLY");
});

Deno.test("classifies delivery callbacks as status callbacks", async () => {
  const inbound = normalizeInfobipInbound(await fixture("infobip-status-delivered.json"));

  assertEquals(inbound.kind, "status_callback");
  assertEquals(inbound.ignoreReason, "Infobip status callback");
  assertEquals(inbound.text, "");
});

Deno.test("classifies empty button callbacks as unsupported", async () => {
  const inbound = normalizeInfobipInbound(await fixture("infobip-button-empty-callback.json"));

  assertEquals(inbound.kind, "unsupported");
  assertEquals(inbound.text, "");
  assertEquals(inbound.action, null);
});

Deno.test("extracts voice media URL from nested message", async () => {
  const inbound = normalizeInfobipInbound(await fixture("infobip-voice-message-url.json"));

  assertEquals(inbound.kind, "user_voice");
  assertEquals(inbound.mediaUrl, "https://media.example.test/audio/voice-note.ogg");
});

Deno.test("extracts voice media URL from mediaUrl field", async () => {
  const inbound = normalizeInfobipInbound(await fixture("infobip-voice-media-url.json"));

  assertEquals(inbound.kind, "user_voice");
  assertEquals(inbound.mediaUrl, "https://media.example.test/audio/voice-media.ogg");
});

Deno.test("extracts audio URL from nested content audio", async () => {
  const inbound = normalizeInfobipInbound(await fixture("infobip-audio-content-url.json"));

  assertEquals(inbound.kind, "user_voice");
  assertEquals(inbound.mediaUrl, "https://media.example.test/audio/audio-note.m4a");
});

Deno.test("extracts audio URL from real Infobip audio payload shape", async () => {
  const inbound = normalizeInfobipInbound(await fixture("infobip-real-audio-completed-shape.json"));

  assertEquals(inbound.kind, "user_voice");
  assertEquals(inbound.from, "573192509637");
  assertEquals(inbound.mediaUrl, "https://media.example.test/audio/real-audio.ogg");
  assertEquals(inbound.rawShape.messageType, "AUDIO");
});
