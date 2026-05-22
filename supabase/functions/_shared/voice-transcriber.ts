export interface VoiceTranscriptionOptions {
  mediaUrl: string | null;
  infobipHeaders?: HeadersInit;
  openaiApiKey?: string | null;
  model?: string;
  fetchImpl?: typeof fetch;
}

export async function transcribeVoiceNote(options: VoiceTranscriptionOptions): Promise<string> {
  const mediaUrl = options.mediaUrl?.trim();
  if (!mediaUrl) {
    throw new Error("No voice media URL found in inbound payload");
  }

  const openaiApiKey = options.openaiApiKey?.trim();
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required for voice transcription");
  }

  const fetcher = options.fetchImpl || fetch;
  const mediaResponse = await fetcher(mediaUrl, { headers: options.infobipHeaders || {} });
  if (!mediaResponse.ok) {
    throw new Error(`Failed to download inbound audio: ${await mediaResponse.text()}`);
  }

  const contentType = mediaResponse.headers.get("content-type") || "audio/ogg";
  const audioBlob = new Blob([await mediaResponse.arrayBuffer()], { type: contentType });
  const form = new FormData();
  form.append("model", options.model || "gpt-4o-mini-transcribe");
  form.append("file", audioBlob, `whatsapp-audio.${extensionFromContentType(contentType)}`);

  const transcriptionResponse = await fetcher("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiApiKey}` },
    body: form,
  });

  if (!transcriptionResponse.ok) {
    throw new Error(`OpenAI transcription failed: ${await transcriptionResponse.text()}`);
  }

  const result = await transcriptionResponse.json();
  return String(result.text || "").trim();
}

export function formatVoiceTranscriptionFallback() {
  return [
    "I could not process that voice note yet.",
    "",
    "Please type your request for now, for example:",
    "• *completed*",
    "• *shortlist*",
    "• *summarize candidate 1*",
  ].join("\n");
}

function extensionFromContentType(contentType: string) {
  const normalized = contentType.toLowerCase().split(";")[0].trim();
  const extensions: Record<string, string> = {
    "audio/aac": "aac",
    "audio/amr": "amr",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/wav": "wav",
    "audio/webm": "webm",
  };

  return extensions[normalized] || "ogg";
}
