# Portfolio Case Study

## Core Thesis

This project is an example of building an AI-powered product validation system with real architecture, business logic, and operational usability in a very short time frame.

The point of the prototype is not to simulate a product idea. The point is to make the workflow real enough that stakeholders can test it, challenge it, and decide whether it deserves to become a fuller platform.

## What The Prototype Validates

This prototype validates a recruiting workflow for field inspectors that combines:

- a focused landing page
- immediate or scheduled voice interviews
- persisted interview and evaluation data
- a role-shaped hiring intelligence layer
- a WhatsApp-based operator console

The result is a working system that validates both:

- the candidate journey
- the internal operational model

## The Business Question

The core business question was not “Can we build recruiting software?”

It was:

**Can we validate an inspector hiring workflow quickly, with enough realism to prove whether the operating model, interview intelligence, and operator experience actually create value?**

That required validating five things at once:

1. candidate acquisition
2. self-serve interview initiation
3. interview persistence
4. structured role-aware evaluation
5. lightweight operations visibility

## What Was Built

### Candidate-facing layer

- Inspector recruiting landing page
- Guided intake for `call_now` and `schedule_call`
- Real persistence of candidate and interview session data

### Interview execution layer

- Immediate outbound interview calls
- Scheduled interview persistence and dispatch
- Retell-based voice interview execution
- Supabase cron-based promotion of due interviews

### Hiring operations layer

- WhatsApp operator with deterministic menus and list views
- Completed interviews, scheduled interviews, shortlist, best pick, and follow-up flows
- Grounded interview reporting and candidate question answering
- Voice note support for operator interaction

### Hiring intelligence layer

- Transcript extraction
- Inspection-specific structured evaluation
- Geographic coverage logic
- Candidate routing and pipeline state updates
- Architecture prepared for additional hiring tracks and reusable evaluation paths

## Why This Is Commercially Valuable

This kind of prototype reduces uncertainty fast.

Instead of debating features abstractly, a team can validate:

- whether the workflow is useful
- whether the channel makes sense
- whether the AI layer is actually helping
- whether the operational model is believable
- whether the idea deserves a full product investment

That is why this kind of prototype has leverage. It moves the conversation from speculation to evidence.

## What Makes The Architecture Strong

Several decisions matter here.

### Determinism first

The WhatsApp experience does not let the language model invent state.

Facts, lists, routing, and empty states are driven by code and persisted data. The LLM is used only where it adds real value:

- transcription
- synthesis
- comparison
- grounded Q&A

### One system of record

Scheduled interviews, immediate interviews, transcript persistence, structured intelligence, and operator visibility all run on shared persisted state in Supabase.

That keeps the prototype coherent and makes future expansion realistic.

### Domain-shaped intelligence

The inspection path is not evaluated with a generic candidate rubric.

It is evaluated against a strict role question:

**Can this person operate as a neutral inspector under protocol and pressure constraints?**

That shift from generic AI output to role-shaped business logic is one of the most important qualities of the build.

## What We Learned

### 1. AI is more useful when constrained by workflow logic

The strongest pattern was not “LLM everywhere.”

The strongest pattern was deterministic workflow plus peripheral intelligence. That made the system more reliable, more honest, and easier to operate.

### 2. A dashboard is not always the first operational surface you need

For this workflow, WhatsApp proved to be a strong first operational surface. It reduced friction and kept the prototype closer to how real people already work.

### 3. Product validation happens faster when the prototype is built like a system

The value did not come from visuals alone. It came from combining:

- intake
- execution
- persistence
- intelligence
- operational visibility

That is what made the prototype commercially credible.

### 4. Hiring intelligence should be role-shaped, not generic

The inspection path worked because evaluation was designed around a specific role constraint. That pattern is far more valuable than generic candidate summarization.

## What Comes Next

The natural future of this system is deeper hiring intelligence.

### Multi-stage interview design

- first-screen interviews
- qualification interviews
- final-stage readiness interviews
- decision-support interviews before hiring

### Pressure-based interview models

- stress interviews for high-pressure roles
- escalation handling scenarios
- boundary-testing interview logic
- pressure-response evaluation

### Multi-track recruiting intelligence

- inspection
- trades
- sales
- management
- additional role families with their own prompt and evaluation logic

### Cross-stage candidate memory

- compare candidates across multiple interviews
- identify contradictions across stages
- detect consistency, trainability, and pressure behavior over time

This is the path from a vertical prototype to a broader hiring intelligence platform.

## Why This Matters For My Build Style

This repository represents the kind of prototype work I care about:

- fast enough to validate ideas in days, not months
- real enough to be tested by actual stakeholders
- structured enough to grow into a serious product
- shaped by business logic, not only interface polish

It is a strong example of the ability to build AI-powered product validation systems with architecture and business logic in very little time.
