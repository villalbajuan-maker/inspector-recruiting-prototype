# Hiring Intelligence

This prototype is not only a landing page plus a WhatsApp console. It also contains a track-aware hiring intelligence layer that determines how interviews are interpreted, scored, and turned into structured hiring signals.

## Why This Layer Matters

The most important architectural idea is that interview intelligence is not generic.

The system is designed so that:

- different hiring tracks can map to different interview logic
- different tracks can use different evaluation prompts
- interview execution and interview evaluation can follow different control strategies
- structured intelligence can be persisted in a reusable format for downstream operations

In this repository, the public prototype is focused on the **inspection** hiring track, but the routing model is already prepared for additional paths.

## Current Track Routing Model

`retell-webhook` resolves the active hiring track from the voice agent that handled the interview.

The current routing map is:

- `INSPECTION_AGENT_ID` -> `inspection`
- `TRADES_AGENT_ID` -> `trades`
- `SALES_AGENT_ID` -> `sales`
- `MANAGEMENT_AGENT_ID` -> `management`

This means the architecture is already prepared for multiple recruiting paths, even though the implemented intelligence builder in this prototype is the inspection path.

The webhook then selects a builder endpoint based on `track_key`:

- `build-inspection-intelligence`
- `build-trades-intelligence`
- `build-sales-intelligence`
- `build-management-intelligence`

At the moment, the inspection builder is the implemented production path inside this repo. The others are part of the routing design and extension strategy.

## Two Evaluation Patterns In The Repo

There are two distinct intelligence patterns in the codebase.

### 1. Track-specific intelligence builder

This is the main path currently used by the inspection prototype.

Flow:

1. `retell-webhook` receives a completed call
2. `extract-interview-data` extracts candidate identity and structured fields
3. `build-inspection-intelligence` evaluates the candidate for the inspection track
4. `write-intelligence` persists the structured result

This path produces a track-specific JSON intelligence object that includes:

- `candidate_summary`
- `signal_indicators`
- `operational_interest`
- `geographic_match`
- `coverage_assessment`
- `audit_trail`

### 2. Role-truth evaluation engine

The repo also contains a second evaluation path in `run-evaluation`.

This path evaluates a transcript against a configurable `role_truth` record and optional interview controls such as:

- `focus_areas`
- `pressure_level`
- `followup_style`
- `depth_expectation`

The output is a more general-purpose evaluation record with:

- `executive_summary`
- `system_recommendation`
- `signal_confidence`
- `focus_area_observations`
- `risk_indicators`
- `behavioral_signals`

This is important because it shows the system is not conceptually locked into one interview rubric. It can support a reusable evaluation engine for different role definitions.

## Inspection Track Intelligence

The inspection path is intentionally strict and role-specific.

Its prompt evaluates five critical dimensions:

1. neutrality
2. language boundaries
3. homeowner pressure handling
4. operational discipline
5. trainability

The prompt is built to answer a very specific hiring question:

**Can this candidate operate as a neutral inspector rather than as a fixer, seller, or recommender?**

That distinction is the core of the inspection track. The model is not asked for generic candidate quality. It is asked for evidence tied to role liability, protocol discipline, and trainability.

### Decisioning

The inspection builder returns one of:

- `pass`
- `review`
- `reject`

The decision rules are encoded directly in the prompt and reinforced by the persistence layer:

- disqualifying behavior or major neutrality failures can produce `reject`
- borderline but promising evidence can produce `review`
- consistent evidence across all five dimensions can produce `pass`

## Geographic And Operational Intelligence

The intelligence layer is not limited to transcript interpretation.

For the inspection track, the builder also computes geographic reach by combining:

- extracted base ZIP
- extracted travel limit
- active `coverage_zones`

This produces:

- reachable zones
- full vs partial coverage
- an `uncovered` flag

That matters because hiring value is not only about candidate fit. It is also about whether the candidate can actually serve the operational territory.

## Persistence Model

Structured intelligence is written into two places:

### `candidate_intelligence`

Used as the reusable, active intelligence record for the candidate.

### `interview_session.interview_intelligence_b1`

Used as the session-level snapshot that powers operator visibility and grounded WhatsApp reporting.

This dual-write pattern matters because it supports two different needs:

- candidate-level operational decisioning
- interview-level traceability and reporting

## Pipeline Impact

`write-intelligence` does more than store analysis. It also updates candidate routing.

For the inspection track, the persisted intelligence can move the candidate into states such as:

- `approved`
- `evaluation_in_progress`
- `rejected`
- `on_hold`

This means the intelligence layer is not ornamental. It drives workflow state.

## Prompting Strategy

The repo contains evidence of two prompt strategies:

### Deterministic prompt framing for track-specific judgment

Example: the inspection builder prompt is tightly scoped, highly role-specific, and returns a mandatory JSON shape.

### Configurable prompt framing for role-truth evaluation

Example: `run-evaluation` builds its prompt from:

- role definition
- focus areas
- interview controls
- transcript

This is a strong architectural pattern because it separates:

- interview runtime behavior
- role evaluation logic
- persistence of downstream hiring signals

## What This Adds To The Portfolio Story

This repo demonstrates more than UI assembly and API integration.

It shows the ability to design:

- multi-step operational workflows
- track-aware interview intelligence
- structured prompt-driven evaluation
- workflow state transitions derived from AI outputs
- conversational access to grounded hiring data

That is a more serious product capability than “chat with an LLM.” It is domain-shaped decision support.

## Current Truth

To describe the repo honestly:

- the inspection intelligence path is implemented and active
- the architecture is prepared for multiple hiring tracks
- the role-truth evaluation engine exists as a separate general evaluation path
- the public prototype and WhatsApp demo currently center on the inspection path

That is the right level of ambition to present: real implementation for one vertical path, plus a visible architecture for broader multi-track hiring intelligence.
