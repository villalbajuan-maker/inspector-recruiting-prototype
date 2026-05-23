# WhatsApp Operator Refactor Plan

## Why This Refactor Exists

The WhatsApp operator has reached a risky patch-on-patch stage. Text commands, button navigation, voice notes, Infobip delivery callbacks, conversation state, and LLM responses are all being handled in the same edge function path. A fix for one channel behavior can accidentally change another behavior.

The goal of this refactor is to make the system boring, testable, and demo-safe:

- Text commands must keep working.
- Voice notes must be transcribed or fail with a clear user-facing fallback.
- Button/list clicks must either work through a verified Infobip contract or be disabled.
- Delivery/status callbacks must never trigger user replies.
- Conversation state must be explicit and resettable.
- The LLM must never own navigation or facts.

Product-facing behavior remains English-only.

## Current Symptoms

- Infobip button taps can arrive as empty or non-actionable callbacks.
- Empty callbacks previously reached the orchestrator and triggered the main menu.
- Voice notes can be classified as `unknown` if the media URL is not found in the exact payload shape.
- The adapter has broad parsing heuristics, which makes it hard to know which payload field actually drove a decision.
- There is no fixture-based regression suite for real Infobip payloads.
- State can influence candidate selection and comparisons, but test resets are manual.

## Target Architecture

### 1. Infobip Adapter

File target:

- `supabase/functions/whatsapp-operator/index.ts`

Responsibilities:

- Verify webhook secret.
- Classify inbound event as one of:
  - `user_text`
  - `user_voice`
  - `user_button`
  - `status_callback`
  - `unsupported`
- Extract a provider-neutral normalized event.
- Download/transcribe voice media.
- Render provider-neutral orchestrator responses into Infobip outbound messages.
- ACK ignored callbacks without sending user replies.

Non-responsibilities:

- No interview queries.
- No ranking.
- No candidate selection logic.
- No LLM calls except speech transcription.
- No business navigation decisions.

### 2. Payload Normalizer

New shared module target:

- `supabase/functions/_shared/infobip-normalizer.ts`

Responsibilities:

- Convert raw Infobip payloads into a strict shape:

```ts
type NormalizedInfobipInbound =
  | {
      kind: "user_text";
      from: string;
      to: string | null;
      messageId: string | null;
      text: string;
      rawShape: PayloadShape;
    }
  | {
      kind: "user_voice";
      from: string;
      to: string | null;
      messageId: string | null;
      mediaUrl: string;
      rawShape: PayloadShape;
    }
  | {
      kind: "user_button";
      from: string;
      to: string | null;
      messageId: string | null;
      actionId: string | null;
      label: string | null;
      rawShape: PayloadShape;
    }
  | {
      kind: "status_callback" | "unsupported";
      from: string | null;
      to: string | null;
      messageId: string | null;
      rawShape: PayloadShape;
    };
```

Rules:

- Never pass `status_callback` or empty `unsupported` events to the orchestrator.
- Keep `rawShape` in logs for diagnosis, but do not log full transcripts, full payloads, or secrets.
- Prefer explicit known fields over recursive field guessing.
- Recursive URL search is allowed only inside `VOICE` or `AUDIO` payloads.

### 3. Hiring Operator Orchestrator

Current shared module:

- `supabase/functions/_shared/hiring-operator-orchestrator.ts`

Responsibilities:

- Detect intent from normalized text/action.
- Query Supabase.
- Build deterministic lists.
- Maintain conversation state.
- Select candidates deterministically.
- Call LLM only for grounded candidate analysis, comparison, or transcript Q&A.

Non-responsibilities:

- No Infobip payload parsing.
- No Infobip message rendering.
- No speech transcription.
- No callback filtering.

### 4. Renderer

New shared module target:

- `supabase/functions/_shared/infobip-renderer.ts`

Responsibilities:

- Render actions as text commands by default.
- Render interactive buttons only if `INFOBIP_ACTION_RENDERING=buttons`.
- Ensure the text fallback always includes the same action contract.

Default production mode for now:

```text
INFOBIP_ACTION_RENDERING=text
```

Reason:

- Text commands are currently verified end to end.
- Interactive button inbound delivery has not been verified with a real successful payload.

## Interaction Contract

The orchestrator returns actions as provider-neutral IDs:

- `scheduled_today`
- `completed_today`
- `shortlist`
- `best_pick`
- `compare`
- `followups`
- `summary`
- `risks`
- `phone`
- `main_menu`

The renderer maps them to stable typed commands:

- `scheduled_today` -> `scheduled`
- `completed_today` -> `completed`
- `shortlist` -> `shortlist`
- `best_pick` -> `best pick`
- `compare` -> `compare`
- `followups` -> `followups`
- `summary` -> `summary`
- `risks` -> `risks`
- `phone` -> `phone`
- `main_menu` -> `menu`

Every message with actions must include a text fallback, even if buttons are re-enabled later.

## State Contract

State table:

- `public.hiring_operator_conversation_state`

State is allowed to store:

- Current selected interview.
- Last state.
- Last visible interview IDs for numbered selection and comparison.

State must not be required for:

- `hello`
- `menu`
- `scheduled`
- `completed`
- `shortlist`

Reset SQL for clean demos:

```sql
delete from public.hiring_operator_conversation_state
where channel = 'whatsapp';
```

Reset one number:

```sql
delete from public.hiring_operator_conversation_state
where channel = 'whatsapp'
  and user_key = '573001234567';
```

## Voice Contract

Voice note flow:

1. Infobip adapter receives `VOICE` or `AUDIO`.
2. Normalizer extracts a media URL.
3. Adapter downloads media using Infobip auth.
4. Adapter sends media to OpenAI transcription.
5. Transcribed text is sent to the orchestrator as a normal text message.
6. If download or transcription fails, the user receives a clear fallback:

```text
I could not process that voice note yet.

Please type your request for now, for example:
• completed
• shortlist
• summarize candidate 1
```

Voice failures must not be silent.

## Button Contract

Buttons are disabled by default until a real successful Infobip inbound button payload is captured.

To re-enable buttons:

1. Keep production default as `INFOBIP_ACTION_RENDERING=text`.
2. Send a controlled menu with `?render=buttons` to avoid changing global behavior.
3. Tap each button.
4. Confirm `public.hiring_operator_inbound_events` shows:
   - `message_kind = button`
   - non-empty `action`
   - expected `intent`
5. Keep text fallback visible in every message.

If button taps produce empty callbacks, keep buttons disabled.

## Required Fixtures

Create fixtures under:

- `supabase/functions/whatsapp-operator/__fixtures__/`

Minimum fixtures:

- `infobip-text-hello.json`
- `infobip-text-completed.json`
- `infobip-status-delivered.json`
- `infobip-status-seen.json`
- `infobip-voice-message-url.json`
- `infobip-audio-content-url.json`
- `infobip-button-reply-id-title.json`
- `infobip-button-empty-callback.json`

Each fixture must assert:

- normalized kind
- sender
- text/action/media URL extraction
- whether it should call the orchestrator
- expected response behavior

## Required Tests

Add Deno tests:

- `supabase/functions/whatsapp-operator/infobip-normalizer.test.ts`
- `supabase/functions/whatsapp-operator/whatsapp-operator.contract.test.ts`
- `supabase/functions/_shared/hiring-operator-orchestrator.test.ts`

Minimum regression cases:

- `hello` returns main menu.
- `completed` returns completed list.
- `scheduled` returns mocked schedule.
- `shortlist` returns ranked real list.
- status callbacks are ignored.
- empty callbacks are ignored.
- voice payload with URL is classified as voice.
- voice transcription failure returns fallback.
- `completed` still wins if payload context contains old menu text.
- `summary` without candidate asks for selection.
- `summary` after selected candidate returns candidate report.

No deploy should happen unless these tests pass.

## Observability

Logs should include:

- normalized kind
- message ID
- action ID
- text preview
- raw shape
- final intent
- ignored reason, if ignored

Logs should not include:

- full raw payloads
- full transcripts
- API keys
- service role keys
- full candidate intelligence JSON

## Refactor Phases

### Phase 1: Stabilize Contracts

Status: implemented.

- Extract `infobip-normalizer.ts`.
- Extract `infobip-renderer.ts`.
- Keep text action rendering as default.
- Add fixtures from currently observed logs and simulated payloads.
- Add tests for parser and renderer.

Implemented files:

- `supabase/functions/_shared/infobip-normalizer.ts`
- `supabase/functions/_shared/infobip-renderer.ts`
- `supabase/functions/_shared/hiring-operator-actions.ts`
- `supabase/functions/whatsapp-operator/infobip-normalizer.test.ts`
- `supabase/functions/whatsapp-operator/infobip-renderer.test.ts`
- `supabase/functions/whatsapp-operator/__fixtures__/`

Verification:

```sh
deno test --allow-read supabase/functions/whatsapp-operator/infobip-normalizer.test.ts supabase/functions/whatsapp-operator/infobip-renderer.test.ts
```

Current result:

- 10 tests passing.

Exit criteria:

- Text navigation works.
- Status/empty callbacks are ignored.
- Voice payloads are classified correctly.

### Phase 2: Stabilize Voice

Status: implemented and validated with a real Infobip WhatsApp voice note.

- Verify real Infobip voice payload from logs.
- Add the real payload shape as a fixture.
- Confirm media download works with Infobip auth.
- Confirm OpenAI transcription model and secret.
- Add failure tests.

Implemented files:

- `supabase/functions/_shared/voice-transcriber.ts`
- `supabase/functions/whatsapp-operator/voice-transcriber.test.ts`
- Additional voice/audio fixtures under `supabase/functions/whatsapp-operator/__fixtures__/`

Implemented observability:

- `public.hiring_operator_inbound_events`
- Stores normalized inbound kind, user key, message ID, intent, status, text preview, transcription failure, error, and `raw_shape`.
- This table is for debugging contracts only; it must not store full raw payloads, full transcripts, or secrets.

Verification:

```sh
deno test --allow-read supabase/functions/whatsapp-operator/infobip-normalizer.test.ts supabase/functions/whatsapp-operator/infobip-renderer.test.ts supabase/functions/whatsapp-operator/voice-transcriber.test.ts
```

Current result:

- 19 tests passing.
- Voice URL extraction covered for `message.url`, `message.mediaUrl`, and nested `message.content.audio.url`.
- Real Infobip audio payload shape captured as `infobip-real-audio-completed-shape.json`.
- Media download failure produces a visible fallback.
- OpenAI transcription failure produces a visible fallback.
- Status callbacks are ignored before any transcription attempt.

Real-world validation:

- Real voice note sent with the spoken command `Completed`.
- Audit table showed:
  - `message_kind = audio`
  - `status = processed`
  - `intent = completed_today`
  - `text_preview = Completed.`
  - `transcription_failed = false`
- WhatsApp responded with the completed interviews list.

If a future voice note fails:

- If `message_kind = unknown`, copy `raw_shape` into a new fixture and update the normalizer.
- If `status = transcription_failed`, inspect whether the failure is media download, Infobip auth, missing OpenAI key, or OpenAI transcription.

SQL validation:

```sql
select
  created_at,
  user_key,
  message_id,
  message_kind,
  status,
  intent,
  transcription_failed,
  text_preview,
  error,
  raw_shape
from public.hiring_operator_inbound_events
order by created_at desc
limit 20;
```

Exit criteria:

- Voice note `completed` behaves like typed `completed`.
- Failed voice notes produce a clear fallback.

### Phase 3: Revisit Buttons

- Capture a real button tap payload.
- If it contains action ID or label, support it in the normalizer.
- If it remains empty, keep buttons off and use text commands for production.
- Keep text fallback regardless.

Exit criteria:

- Buttons either work with tests or are intentionally disabled.
- No button tap can trigger a menu unless the action is explicitly `menu`.

### Phase 4: Harden Orchestrator

- Add unit tests for deterministic intent routing.
- Add tests for state reset and numbered candidate selection.
- Add tests for `best pick`, `summary`, `risks`, `phone`, and `compare`.
- Move schedule mocks behind a single provider function.

Exit criteria:

- Orchestrator behavior is independent of Infobip payload shape.

### Phase 5: Production Guardrails

- Add a deploy checklist.
- Add `dry_run` contract tests.
- Add a demo reset SQL snippet to the docs.
- Add feature flags:
  - `INFOBIP_ACTION_RENDERING=text|buttons`
  - `WHATSAPP_ENABLE_VOICE=true|false`
  - `WHATSAPP_DEBUG_SHAPE=true|false`

Exit criteria:

- Demo can be reset and verified in less than five minutes.

## Definition of Done

The refactor is done when:

- The adapter is transport-only.
- The normalizer is tested with fixtures.
- The renderer has a tested text fallback.
- The orchestrator has deterministic tests.
- Voice notes are either working or fail visibly.
- Button support is either verified or deliberately disabled.
- Clean demo reset is documented.
- No `unknown` inbound can produce a user-facing menu.

## Immediate Recommendation

Do not keep patching production behavior directly.

Next implementation should start with Phase 1 and should not re-enable Infobip buttons until the real successful inbound button payload is captured and added as a fixture.
