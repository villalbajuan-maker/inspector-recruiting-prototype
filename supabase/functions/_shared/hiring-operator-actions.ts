export type OperatorState =
  | "main_menu"
  | "scheduled_today"
  | "completed_today"
  | "previous_interviews"
  | "shortlist"
  | "followups"
  | "best_pick"
  | "compare"
  | "summary"
  | "risks"
  | "phone"
  | "interview_result"
  | "candidate_question";

export function normalizeOperatorAction(value: unknown): OperatorState | null {
  const normalized = normalizeCommandText(String(value || "").trim());
  const actions = new Map<string, OperatorState>([
    ["scheduled_today", "scheduled_today"],
    ["scheduled", "scheduled_today"],
    ["schedule", "scheduled_today"],
    ["completed_today", "completed_today"],
    ["completed", "completed_today"],
    ["complete", "completed_today"],
    ["completet", "completed_today"],
    ["completed interviews", "completed_today"],
    ["shortlist", "shortlist"],
    ["candidate insights", "shortlist"],
    ["best_pick", "best_pick"],
    ["best pick", "best_pick"],
    ["best", "best_pick"],
    ["first pick", "best_pick"],
    ["summary", "summary"],
    ["summarize", "summary"],
    ["risks", "risks"],
    ["red flags", "risks"],
    ["phone", "phone"],
    ["phone number", "phone"],
    ["compare", "compare"],
    ["followups", "followups"],
    ["follow ups", "followups"],
    ["follow-ups", "followups"],
    ["main_menu", "main_menu"],
    ["menu", "main_menu"],
    ["previous_interviews", "previous_interviews"],
    ["previous", "previous_interviews"],
  ]);

  return actions.get(normalized) || null;
}

function normalizeCommandText(value: string): string {
  return normalizeText(value)
    .replace(/[*`]/g, "")
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
