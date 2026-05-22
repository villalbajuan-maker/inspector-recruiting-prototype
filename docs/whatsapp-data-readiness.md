# WhatsApp Data Readiness

## Source Of Truth

Completed interviews shown in WhatsApp come from `public.interview_session`.

The current WhatsApp MVP reads:
- `candidate_name`
- `candidate_phone`
- `candidate_email`
- `status`
- `created_at`
- `started_at`
- `ended_at`
- `scheduled_at`
- `transcript`
- `interview_intelligence_b1`

Scheduled interviews are currently mocked in the `whatsapp-operator` Edge Function for demo purposes.

## Current Data Snapshot

As of May 22, 2026, the table has 8 completed interview records.

- 8 / 8 have `candidate_name`
- 7 / 8 have `candidate_phone`
- 8 / 8 have `ended_at`
- 8 / 8 have `transcript`
- 8 / 8 have `interview_intelligence_b1`

This means the table has enough real data for the WhatsApp demo.

## Data Shape Notes

There are two versions of `interview_intelligence_b1` in the table.

Newer records, such as Carlos Franco, include:
- `signal_indicators.overall_result`
- `signal_indicators.overall_notes`
- `operational_interest.immediate_hire_potential`
- `operational_interest.positive_signals`
- `operational_interest.red_flags`
- `operational_interest.next_steps`

Older records include useful commercial data but not `signal_indicators.overall_result`.
For those records, the best visible fields are:
- `operational_interest.fit_quality`
- `operational_interest.immediate_hire_potential`
- `operational_interest.notes`
- `operational_interest.positive_signals`
- `operational_interest.red_flags`
- `operational_interest.next_steps_required`

WhatsApp should support both shapes before we consider database backfill.

## Demo Hygiene

One completed record is a test-style record:
- Candidate: `Donald Trump`
- Missing phone number
- Result: `reject`
- Notes indicate the candidate was not interested.

This is real table data, but it is not ideal for a client-facing demo. We should decide explicitly whether to:
- leave it visible as honest test data,
- exclude records missing phone numbers from WhatsApp lists,
- or mark/archive this record outside the demo path.

## Recommendation

Do not create fake completed interviews.

For the demo, the cleanest path is:
1. Keep scheduled interviews mocked.
2. Keep completed interviews sourced only from `interview_session`.
3. Update WhatsApp display logic to read both old and new intelligence JSON shapes.
4. Optionally apply a small data-hygiene rule or DB update for the test-style `Donald Trump` record.

## Optional Backfill

A database backfill is optional, not required.

If we choose to normalize the old records, backfill only derived fields inside `interview_intelligence_b1.signal_indicators`, using existing data:
- `overall_result`: derived from `operational_interest.fit_quality` or `immediate_hire_potential`
- `overall_notes`: copied from `operational_interest.notes`

This should be treated as normalization, not invention.
