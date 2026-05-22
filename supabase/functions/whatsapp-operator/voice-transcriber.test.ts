import {
  formatVoiceTranscriptionFallback,
  transcribeVoiceNote,
} from "../_shared/voice-transcriber.ts";

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(value: string, expected: string) {
  if (!value.includes(expected)) {
    throw new Error(`Expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`);
  }
}

Deno.test("transcribes a voice note through media download and OpenAI", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url === "https://media.example.test/audio.ogg") {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/ogg" },
      });
    }

    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      return Response.json({ text: "completed" });
    }

    return new Response("not found", { status: 404 });
  };

  const text = await transcribeVoiceNote({
    mediaUrl: "https://media.example.test/audio.ogg",
    infobipHeaders: { Authorization: "App infobip-key" },
    openaiApiKey: "openai-key",
    model: "gpt-4o-mini-transcribe",
    fetchImpl: fetchImpl as typeof fetch,
  });

  assertEquals(text, "completed");
  assertEquals(calls.length, 2);
  assertEquals(calls[0].url, "https://media.example.test/audio.ogg");
  assertEquals((calls[0].init?.headers as Record<string, string>).Authorization, "App infobip-key");
  assertEquals(calls[1].url, "https://api.openai.com/v1/audio/transcriptions");
  assertEquals((calls[1].init?.headers as Record<string, string>).Authorization, "Bearer openai-key");
});

Deno.test("requires media URL", async () => {
  try {
    await transcribeVoiceNote({ mediaUrl: null, openaiApiKey: "openai-key" });
  } catch (error) {
    assertIncludes(error instanceof Error ? error.message : String(error), "No voice media URL");
    return;
  }

  throw new Error("Expected transcribeVoiceNote to throw");
});

Deno.test("requires OpenAI API key", async () => {
  try {
    await transcribeVoiceNote({ mediaUrl: "https://media.example.test/audio.ogg", openaiApiKey: "" });
  } catch (error) {
    assertIncludes(error instanceof Error ? error.message : String(error), "OPENAI_API_KEY");
    return;
  }

  throw new Error("Expected transcribeVoiceNote to throw");
});

Deno.test("surfaces media download failures", async () => {
  const fetchImpl = async () => new Response("media unavailable", { status: 403 });

  try {
    await transcribeVoiceNote({
      mediaUrl: "https://media.example.test/audio.ogg",
      openaiApiKey: "openai-key",
      fetchImpl: fetchImpl as typeof fetch,
    });
  } catch (error) {
    assertIncludes(error instanceof Error ? error.message : String(error), "media unavailable");
    return;
  }

  throw new Error("Expected transcribeVoiceNote to throw");
});

Deno.test("surfaces OpenAI transcription failures", async () => {
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "https://media.example.test/audio.ogg") {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/ogg" },
      });
    }

    return new Response("bad model", { status: 400 });
  };

  try {
    await transcribeVoiceNote({
      mediaUrl: "https://media.example.test/audio.ogg",
      openaiApiKey: "openai-key",
      fetchImpl: fetchImpl as typeof fetch,
    });
  } catch (error) {
    assertIncludes(error instanceof Error ? error.message : String(error), "bad model");
    return;
  }

  throw new Error("Expected transcribeVoiceNote to throw");
});

Deno.test("fallback copy is visible and actionable", () => {
  const fallback = formatVoiceTranscriptionFallback();

  assertIncludes(fallback, "I could not process that voice note yet.");
  assertIncludes(fallback, "*completed*");
  assertIncludes(fallback, "*shortlist*");
});
