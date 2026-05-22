import {
  normalizeOperatorAction,
  type OperatorState,
} from "./hiring-operator-actions.ts";

const OPENAI_TEXT_MODEL = Deno.env.get("OPENAI_TEXT_MODEL") || "gpt-4.1-mini";

export { normalizeOperatorAction };
export type { OperatorState };

export interface OperatorAction {
  id: OperatorState;
  label: string;
}

export interface OperatorEvent {
  channel: "whatsapp" | "api";
  user: {
    phone?: string | null;
  };
  message: {
    type: "text" | "button" | "audio" | "unknown";
    text?: string | null;
    action?: string | null;
  };
  context?: {
    tenant?: string;
    locale?: string;
  };
}

export interface OperatorResponse {
  state: OperatorState;
  text: string;
  actions: OperatorAction[];
  debug: {
    intent: OperatorState;
    source: "action" | "text" | "fallback";
  };
}

interface ConversationState {
  selected_interview_id: string | null;
  last_state: OperatorState | null;
  last_interview_ids: string[];
}

interface InterviewSummary {
  id: string;
  candidate_name: string | null;
  candidate_phone: string | null;
  candidate_email: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  scheduled_at: string | null;
  created_at: string | null;
  transcript: string | null;
  interview_intelligence_b1: any;
}

export async function orchestrateHiringOperator(
  event: OperatorEvent,
  supabase: any
): Promise<OperatorResponse> {
  const intent = detectIntent(event);
  const state = await getConversationState(supabase, event);
  let text: string;
  let nextInterviewIds: string[] | null = null;
  let selectedInterviewId = state.selected_interview_id;

  if (intent === "main_menu") {
    text = await formatMainMenu(supabase);
  } else if (intent === "scheduled_today") {
    const interviews = await getScheduledInterviews(supabase);
    text = formatScheduled(interviews);
    nextInterviewIds = interviews.map((interview) => interview.id);
  } else if (intent === "completed_today") {
    const interviews = await getCompletedInterviews(supabase, "recent");
    text = formatCompletedInterviews(interviews, "recent");
    nextInterviewIds = interviews.map((interview) => interview.id);
  } else if (intent === "previous_interviews") {
    const interviews = await getCompletedInterviews(supabase, "previous");
    text = formatCompletedInterviews(interviews, "previous");
    nextInterviewIds = interviews.map((interview) => interview.id);
  } else if (intent === "shortlist") {
    const interviews = await getCompletedInterviews(supabase, "recent");
    const shortlist = buildShortlist(interviews).slice(0, 5);
    text = formatShortlistFromRanked(shortlist);
    nextInterviewIds = shortlist.map((interview) => interview.id);
  } else if (intent === "followups") {
    const interviews = await getCompletedInterviews(supabase, "recent");
    text = formatFollowUps(interviews);
    nextInterviewIds = interviews.map((interview) => interview.id);
  } else if (intent === "best_pick") {
    const interviews = await getCompletedInterviews(supabase, "recent");
    const shortlist = buildShortlist(interviews);
    const best = shortlist[0] || null;
    text = best ? formatBestPick(best) : formatNoBestPick();
    selectedInterviewId = best?.id || selectedInterviewId;
    nextInterviewIds = shortlist.slice(0, 5).map((interview) => interview.id);
  } else if (intent === "compare") {
    const interviews = await getRecentInterviews(supabase);
    const pair = findComparisonPair(event.message.text || "", interviews, state.last_interview_ids);
    text = pair ? await formatCandidateComparison(pair[0], pair[1]) : formatCompareInstructions();
    nextInterviewIds = state.last_interview_ids.length ? state.last_interview_ids : null;
  } else if (intent === "summary" || intent === "risks" || intent === "phone") {
    const interviews = await getRecentInterviews(supabase);
    const messageText = event.message.text || "";
    const interview =
      findRequestedInterview(messageText, interviews, state.last_interview_ids) ||
      (state.selected_interview_id
        ? interviews.find((candidate) => candidate.id === state.selected_interview_id)
        : null);

    if (interview) {
      selectedInterviewId = interview.id;
      text = intent === "phone"
        ? formatCandidatePhone(interview)
        : intent === "risks"
          ? await formatCandidateRisks(interview)
          : await formatInterviewResult(interview);
    } else {
      text = formatSelectionRequired(interviews.filter(isCompletedInterview));
      nextInterviewIds = interviews.filter(isCompletedInterview).slice(0, 5).map((candidate) => candidate.id);
    }
  } else {
    const interviews = await getRecentInterviews(supabase);
    const messageText = event.message.text || "";
    const interview =
      findRequestedInterview(messageText, interviews, state.last_interview_ids) ||
      (state.selected_interview_id
        ? interviews.find((candidate) => candidate.id === state.selected_interview_id)
        : null);

    if (interview) {
      selectedInterviewId = interview.id;
      text = isSelectionOnly(messageText, interview) || isReportRequest(messageText)
        ? await formatInterviewResult(interview)
        : await answerCandidateQuestion(messageText, interview);
    } else {
      text = formatSelectionRequired(interviews.filter(isCompletedInterview));
      nextInterviewIds = interviews.filter(isCompletedInterview).slice(0, 5).map((candidate) => candidate.id);
    }
  }

  await saveConversationState(supabase, event, {
    selectedInterviewId,
    lastState: intent,
    lastInterviewIds: nextInterviewIds,
  });

  return {
    state: intent,
    text,
    actions: actionsForState(intent),
    debug: {
      intent,
      source: event.message.action ? "action" : event.message.text ? "text" : "fallback",
    },
  };
}

async function getConversationState(supabase: any, event: OperatorEvent): Promise<ConversationState> {
  const key = conversationUserKey(event);
  const { data, error } = await supabase
    .from("hiring_operator_conversation_state")
    .select("selected_interview_id,last_state,last_interview_ids")
    .eq("channel", event.channel)
    .eq("user_key", key)
    .maybeSingle();

  if (error) {
    console.warn("[HIRING_OPERATOR_ORCHESTRATOR] Failed to load conversation state:", error.message);
  }

  return {
    selected_interview_id: data?.selected_interview_id || null,
    last_state: data?.last_state || null,
    last_interview_ids: Array.isArray(data?.last_interview_ids) ? data.last_interview_ids : [],
  };
}

async function saveConversationState(
  supabase: any,
  event: OperatorEvent,
  update: {
    selectedInterviewId: string | null;
    lastState: OperatorState;
    lastInterviewIds: string[] | null;
  }
) {
  const key = conversationUserKey(event);
  const payload: Record<string, unknown> = {
    channel: event.channel,
    user_key: key,
    selected_interview_id: update.selectedInterviewId,
    last_state: update.lastState,
    updated_at: new Date().toISOString(),
  };

  if (update.lastInterviewIds) {
    payload.last_interview_ids = update.lastInterviewIds;
  }

  const { error } = await supabase
    .from("hiring_operator_conversation_state")
    .upsert(payload, { onConflict: "channel,user_key" });

  if (error) {
    throw new Error(`Failed to save conversation state: ${error.message}`);
  }
}

function conversationUserKey(event: OperatorEvent) {
  return event.user.phone || "anonymous";
}

function detectIntent(event: OperatorEvent): OperatorState {
  const action = normalizeOperatorAction(event.message.action);
  if (action) return action;

  const text = normalizeCommandText(event.message.text || "");
  const textAction = normalizeOperatorAction(text);
  if (textAction) return textAction;

  if (!text) return "main_menu";
  if (/\b(previous_interviews|previous|past|older|recent|history)\b/.test(text)) return "previous_interviews";
  if (/\b(compare|versus| vs | vs\. )\b/.test(text)) return "compare";
  if (/\b(best pick|first pick|top pick|who would you pick|who should we pick|which candidate would you pick first)\b/.test(text)) return "best_pick";
  if (/\b(phone|phone number|contact number|call him|call her|contact info)\b/.test(text)) return "phone";
  if (/\b(risks|red flags|concerns|weaknesses|what worries you|what should we watch)\b/.test(text)) return "risks";
  if (/\b(summary|summarize|overview|recap|brief|report)\b/.test(text)) return "summary";
  if (/\b(followups|follow ups|follow-up|follow up|next steps|next_steps|to do|todo|verify queue|verification queue)\b/.test(text)) return "followups";
  if (/\b(shortlist|candidate insights|insights|top candidates|best candidates|strongest candidates|ready to hire|who should we hire|hiring shortlist)\b/.test(text)) return "shortlist";
  if (/\b(completed_today|completed|complete|completet|done|finished|processed)\b/.test(text)) return "completed_today";
  if (/\b(today|scheduled|schedule|interviews|refresh)\b/.test(text)) return "scheduled_today";
  if (/\b(view result|interview_result|result|results|rating|evaluation|approved|rejected|decision|score)\b/.test(text)) return "interview_result";
  if (/^(hi|hello|start|begin|menu|main menu|home|back|return)$/.test(text)) return "main_menu";

  return "candidate_question";
}

function actionsForState(state: OperatorState): OperatorAction[] {
  if (state === "main_menu") {
    return [
      { id: "scheduled_today", label: "Scheduled" },
      { id: "completed_today", label: "Completed" },
      { id: "shortlist", label: "Shortlist" },
    ];
  }

  if (state === "scheduled_today") {
    return [
      { id: "completed_today", label: "Completed" },
      { id: "shortlist", label: "Shortlist" },
      { id: "main_menu", label: "Menu" },
    ];
  }

  if (state === "completed_today") {
    return [
      { id: "shortlist", label: "Shortlist" },
      { id: "best_pick", label: "Best Pick" },
      { id: "compare", label: "Compare" },
    ];
  }

  if (state === "shortlist") {
    return [
      { id: "best_pick", label: "Best Pick" },
      { id: "compare", label: "Compare" },
      { id: "followups", label: "Follow-ups" },
    ];
  }

  if (state === "best_pick") {
    return [
      { id: "summary", label: "Summary" },
      { id: "risks", label: "Risks" },
      { id: "phone", label: "Phone" },
    ];
  }

  if (state === "summary" || state === "risks" || state === "phone" || state === "interview_result" || state === "candidate_question") {
    return [
      { id: "summary", label: "Summary" },
      { id: "risks", label: "Risks" },
      { id: "phone", label: "Phone" },
    ];
  }

  if (state === "compare") {
    return [
      { id: "best_pick", label: "Best Pick" },
      { id: "shortlist", label: "Shortlist" },
      { id: "main_menu", label: "Menu" },
    ];
  }

  if (state === "followups") {
    return [
      { id: "best_pick", label: "Best Pick" },
      { id: "shortlist", label: "Shortlist" },
      { id: "main_menu", label: "Menu" },
    ];
  }

  return [
    { id: "completed_today", label: "Completed" },
    { id: "shortlist", label: "Shortlist" },
    { id: "main_menu", label: "Menu" },
  ];
}

async function formatMainMenu(supabase: any) {
  const completed = await getCompletedInterviews(supabase, "recent");
  const scheduled = await getScheduledInterviews(supabase);
  const scheduledCount = scheduled.length;
  const completedCount = completed.length;
  const shortlistCount = buildShortlist(completed).length;

  return [
    "*Welcome to Hiring OS.*",
    "",
    `📅 *Scheduled:* ${scheduledCount}`,
    `✅ *Completed:* ${completedCount}`,
    `*Priority candidates:* ${shortlistCount}`,
    "",
    "You can review interviews, inspect the shortlist, and manage follow-ups directly from WhatsApp.",
    "",
    "🎙️ You can type or send a voice note.",
    "",
    "*Try asking:*",
    "• Who is the strongest candidate?",
    "• What should we verify before hiring [candidate name]?",
    "• What is [candidate name]'s phone number?",
  ].join("\n");
}

async function getRecentInterviews(supabase: any): Promise<InterviewSummary[]> {
  const { data, error } = await supabase
    .from("interview_session")
    .select("id,candidate_name,candidate_phone,candidate_email,status,started_at,ended_at,scheduled_at,created_at,transcript,interview_intelligence_b1")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Failed to load recent interviews: ${error.message}`);
  return data || [];
}

async function getCompletedInterviews(
  supabase: any,
  range: "today" | "previous" | "recent"
): Promise<InterviewSummary[]> {
  let query = supabase
    .from("interview_session")
    .select("id,candidate_name,candidate_phone,candidate_email,status,started_at,ended_at,scheduled_at,created_at,transcript,interview_intelligence_b1")
    .or("transcript.not.is.null,interview_intelligence_b1.not.is.null,status.eq.awaiting_evaluation,status.eq.evaluated")
    .order("ended_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (range === "today") {
    const { start, end } = getBogotaDayRange();
    query = query.gte("ended_at", start).lt("ended_at", end);
  } else if (range === "previous") {
    const { start } = getBogotaDayRange();
    query = query.lt("ended_at", start);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load completed interviews: ${error.message}`);
  return data || [];
}

async function getScheduledInterviews(supabase: any): Promise<InterviewSummary[]> {
  const { data, error } = await supabase
    .from("interview_session")
    .select("id,candidate_name,candidate_phone,candidate_email,status,started_at,ended_at,scheduled_at,created_at,transcript,interview_intelligence_b1")
    .eq("status", "draft")
    .eq("intent", "schedule_call")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (error) throw new Error(`Failed to load scheduled interviews: ${error.message}`);
  return data || [];
}

function formatScheduled(interviews: InterviewSummary[]) {
  if (!interviews.length) {
    return [
      "📅 *No interviews are scheduled right now.*",
      "",
      "When candidates schedule from the landing page, they will appear here with date, time, and contact details.",
      "",
      formatTryAsking(["Show completed interviews", "Who is on the shortlist?"]),
    ].join("\n");
  }

  return [
    "📅 *Scheduled interviews*",
    "",
    ...formatScheduledGroups(interviews),
    "",
    formatTryAsking(["Show completed interviews", "Who is on the shortlist?"]),
  ].join("\n");
}

function formatScheduledGroups(interviews: InterviewSummary[]) {
  const groups = new Map<string, InterviewSummary[]>();
  for (const interview of interviews) {
    const label = formatDateLabel(interview.scheduled_at || interview.created_at);
    groups.set(label, [...(groups.get(label) || []), interview]);
  }

  let counter = 1;
  const lines: string[] = [];
  for (const [label, group] of groups) {
    lines.push(label);
    for (const interview of group) {
      lines.push(`${counter}. *${displayName(interview)}*`);
      lines.push(`   🕒 ${formatTime(interview.scheduled_at || interview.created_at)}`);
      lines.push(`   Phone: ${displayPhone(interview)}`);
      lines.push(`   Status: ${displayScheduledStatus(interview)}`);
      counter += 1;
    }
    lines.push("");
  }

  return lines.slice(0, -1);
}

function formatCompletedInterviews(interviews: InterviewSummary[], rangeLabel: "today" | "previous" | "recent") {
  const title = rangeLabel === "today"
    ? "Completed interviews from today:"
    : rangeLabel === "previous"
      ? "Previous completed interviews:"
      : "Completed interviews available:";

  if (!interviews.length) {
    return [
      "No completed interviews are available yet.",
      "",
      formatTryAsking(["Show scheduled interviews", "Open the shortlist"]),
    ].join("\n");
  }

  return [
    `✅ *${title.replace(/:$/, "")}*`,
    "",
    ...interviews.map((interview, index) => [
      `${index + 1}. *${displayName(interview)}*`,
      `   Phone: ${displayPhone(interview)}`,
      `   🕒 Completed: ${formatDateTime(interview.ended_at || interview.created_at)}`,
      `   Result: *${displayResult(interview)}*`,
      `   Next: ${displayPrimaryNextStep(interview)}`,
    ].join("\n")),
    "",
    "Reply with the candidate name, phone last 4, or item number to view the report.",
    formatTryAsking(["Summarize [candidate name]'s interview", "Who is the strongest candidate?", "What follow-ups are pending?"]),
  ].join("\n");
}

function formatShortlist(interviews: InterviewSummary[]) {
  const shortlist = buildShortlist(interviews).slice(0, 5);
  return formatShortlistFromRanked(shortlist);
}

function formatShortlistFromRanked(shortlist: InterviewSummary[]) {
  if (!shortlist.length) {
    return [
      "No candidates are ready for the shortlist yet.",
      "",
      formatTryAsking(["Show completed interviews", "What follow-ups are pending?"]),
    ].join("\n");
  }

  return [
    "✅ *Hiring shortlist*",
    "",
    ...shortlist.map((interview, index) => [
      `${index + 1}. *${displayName(interview)}* — *${displayResult(interview)}*`,
      `   ✅ Why: ${displayPrimaryPositiveSignal(interview)}`,
      `   Next: ${displayPrimaryNextStep(interview)}`,
    ].join("\n")),
    "",
    "Reply with a candidate name to inspect the full interview report.",
    formatTryAsking(["Why is candidate 1 ranked first?", "Compare candidate 1 and candidate 2", "What is [candidate name]'s phone number?"]),
  ].join("\n");
}

function formatBestPick(interview: InterviewSummary) {
  return [
    `✅ *Best pick right now: ${displayName(interview)}*`,
    "",
    "*Why this candidate leads:*",
    `• ${displayPrimaryPositiveSignal(interview)}`,
    `• Result: *${displayResult(interview)}*`,
    "",
    "*Before hiring, verify:*",
    `• ${displayPrimaryNextStep(interview)}`,
    "",
    "*Try asking:*",
    "• Why is this the best pick?",
    "• What should I verify first?",
    "• What is [candidate name]'s phone number?",
  ].join("\n");
}

function formatNoBestPick() {
  return [
    "No best pick is available yet.",
    "",
    "I need at least one completed interview with enough positive signal to rank candidates.",
    "",
    formatTryAsking(["Show completed interviews", "Open the shortlist"]),
  ].join("\n");
}

function formatCandidatePhone(interview: InterviewSummary) {
  return [
    `*${displayName(interview)}*`,
    "",
    `Phone: *${displayPhone(interview)}*`,
    "",
    displayPhone(interview) === "Not available"
      ? "No phone number is available in the interview record."
      : "Use this number to follow up directly with the candidate.",
    "",
    formatTryAsking(["Summarize this interview", "What are the risks?", "What should we verify next?"]),
  ].join("\n");
}

async function formatCandidateRisks(interview: InterviewSummary): Promise<string> {
  return openAIText([
    {
      role: "system",
      content: [
        "You are an interview risk analyst inside Hiring OS on WhatsApp.",
        "Write in polished, concise English only.",
        "Answer only from the transcript and structured intelligence. Do not invent data.",
        "Focus on risks, red flags, missing information, and verification steps.",
        "Use WhatsApp-friendly typography with *bold labels* and short bullets.",
        "Use emojis sparingly and only from this set when useful: ⚠️, ✅, 🕒, 📅, 🎙️.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Analyze risks for this selected interview.\n\nInterview:\n${JSON.stringify(compactInterview(interview, true), null, 2)}`,
    },
  ]);
}

async function formatCandidateComparison(first: InterviewSummary, second: InterviewSummary): Promise<string> {
  return openAIText([
    {
      role: "system",
      content: [
        "You are a hiring comparison analyst inside Hiring OS on WhatsApp.",
        "Write in polished, concise English only.",
        "Compare only the two provided candidates using structured intelligence and transcripts.",
        "Do not invent data. If a dimension is missing, say so.",
        "Pick a best fit only if the evidence supports it; otherwise say the decision depends on verification.",
        "Use WhatsApp-friendly typography with *bold labels* and short bullets.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Compare these two candidates and recommend next steps.\n\nCandidate A:\n${JSON.stringify(compactInterview(first, true), null, 2)}\n\nCandidate B:\n${JSON.stringify(compactInterview(second, true), null, 2)}`,
    },
  ]);
}

function formatCompareInstructions() {
  return [
    "*Compare candidates*",
    "",
    "Send two candidates or item numbers to compare.",
    "",
    "*Examples:*",
    "• Compare candidate 1 and candidate 2",
    "• Compare [candidate name] and [candidate name]",
    "",
    "I will compare only candidates that appear in the current completed list or shortlist.",
  ].join("\n");
}

function formatFollowUps(interviews: InterviewSummary[]) {
  const items = buildFollowUpItems(interviews).slice(0, 8);
  if (!items.length) {
    return [
      "No follow-up actions are available yet.",
      "",
      formatTryAsking(["Show completed interviews", "Open the shortlist"]),
    ].join("\n");
  }

  return [
    "⚠️ *Follow-up queue*",
    "",
    ...items.map((item, index) => `${index + 1}. *${item.action}*\n   Candidates: ${item.candidates.join(", ")}`),
    "",
    "Ask about any candidate by name for the full interview context.",
    formatTryAsking(["What should we verify before hiring [candidate name]?", "Which candidates need rate confirmation?"]),
  ].join("\n");
}

function formatSelectionRequired(interviews: InterviewSummary[]) {
  if (!interviews.length) {
    return [
      "No completed interviews are available to inspect yet.",
      "",
      formatTryAsking(["Show completed interviews", "Open the shortlist"]),
    ].join("\n");
  }

  return [
    "Please select an interview first.",
    "",
    ...interviews.slice(0, 5).map((interview, index) => [
      `${index + 1}. *${displayName(interview)}*`,
      `   Phone: ${displayPhone(interview)}`,
      `   🕒 Completed: ${formatDateTime(interview.ended_at || interview.created_at)}`,
      `   Result: *${displayResult(interview)}*`,
      `   Next: ${displayPrimaryNextStep(interview)}`,
    ].join("\n")),
    "",
    "Reply with the candidate name, phone last 4, or item number to view the report.",
    formatTryAsking(["Summarize candidate 1", "What are the red flags?", "What is the phone number?"]),
  ].join("\n");
}

async function formatInterviewResult(interview: InterviewSummary): Promise<string> {
  return openAIText([
    {
      role: "system",
      content: [
        "You are an interview operator inside Hiring OS on WhatsApp.",
        "Write in polished, concise English only.",
        "Use WhatsApp-friendly typography: bold important labels with *label*, use short bullet points, and keep paragraphs short.",
        "Use emojis sparingly and only from this set when useful: 📅 for date/schedule, 🕒 for time, ✅ for positive/completed, ⚠️ for risk/red flag, 🎙️ for voice notes.",
        "Do not invent data. If evidence is missing, say so plainly.",
        "End with a short '*Try asking:*' section with 2-3 useful follow-up questions.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Show the report for this selected interview. Include candidate name, phone, interview date/time, overall result, summary notes, positive signals, risks/red flags, and suggested next step.\n\nInterview:\n${JSON.stringify(compactInterview(interview), null, 2)}`,
    },
  ]);
}

async function answerCandidateQuestion(question: string, interview: InterviewSummary): Promise<string> {
  return openAIText([
    {
      role: "system",
      content: [
        "You are an interview analyst inside Hiring OS on WhatsApp.",
        "Write in polished, concise English only.",
        "Answer only from the transcript and structured intelligence. If evidence is missing, say so.",
        "Use WhatsApp-friendly typography: bold high-signal labels with *label* and use short bullets for lists.",
        "Use emojis sparingly and only from this set when useful: 📅, 🕒, ✅, ⚠️, 🎙️.",
        "When helpful, end with one short next question the operator could ask.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Operator question: ${question}\n\nInterview and evidence:\n${JSON.stringify(compactInterview(interview, true), null, 2)}`,
    },
  ]);
}

function findRequestedInterview(message: string, interviews: InterviewSummary[], lastInterviewIds: string[] = []) {
  const normalized = normalizeText(message);
  const phoneDigits = message.replace(/\D/g, "");
  const numberMatch = normalized.match(/\b(?:number|#)?\s*([1-9]|10)\b/);
  if (numberMatch) {
    const index = Number(numberMatch[1]) - 1;
    const scopedId = lastInterviewIds[index];
    if (scopedId) {
      const scopedInterview = interviews.find((interview) => interview.id === scopedId);
      if (scopedInterview) return scopedInterview;
    }
    if (interviews[index]) return interviews[index];
  }

  return interviews.find((interview) => {
    const name = normalizeText(interview.candidate_name || "");
    const phone = (interview.candidate_phone || "").replace(/\D/g, "");
    const id = interview.id.toLowerCase();
    return (
      (name && normalized.includes(name.split(" ")[0])) ||
      (phoneDigits.length >= 4 && phone.endsWith(phoneDigits.slice(-4))) ||
      normalized.includes(id.slice(0, 8))
    );
  });
}

function findComparisonPair(message: string, interviews: InterviewSummary[], lastInterviewIds: string[] = []): [InterviewSummary, InterviewSummary] | null {
  const normalized = normalizeText(message);
  const numberMatches = [...normalized.matchAll(/\b([1-9]|10)\b/g)].map((match) => Number(match[1]));
  const found: InterviewSummary[] = [];

  for (const itemNumber of numberMatches) {
    const scopedId = lastInterviewIds[itemNumber - 1];
    const interview = scopedId
      ? interviews.find((candidate) => candidate.id === scopedId)
      : interviews[itemNumber - 1];
    if (interview && !found.some((candidate) => candidate.id === interview.id)) {
      found.push(interview);
    }
  }

  if (found.length >= 2) return [found[0], found[1]];

  for (const interview of interviews) {
    const name = normalizeText(interview.candidate_name || "");
    const parts = name.split(/\s+/).filter((part) => part.length > 2);
    if (
      name &&
      (normalized.includes(name) || parts.some((part) => normalized.includes(part))) &&
      !found.some((candidate) => candidate.id === interview.id)
    ) {
      found.push(interview);
    }
    if (found.length >= 2) return [found[0], found[1]];
  }

  return null;
}

function isReportRequest(message: string) {
  const normalized = normalizeText(message);
  return /\b(summary|summarize|report|result|results|evaluation|overview|recap|interview)\b/.test(normalized);
}

function isSelectionOnly(message: string, interview: InterviewSummary) {
  const normalized = normalizeText(message).trim();
  const digits = message.replace(/\D/g, "");
  const name = normalizeText(displayName(interview));
  const firstName = name.split(" ")[0];
  const phone = displayPhone(interview).replace(/\D/g, "");

  return Boolean(
    /^\d{1,2}$/.test(normalized) ||
      (digits.length >= 4 && phone.endsWith(digits.slice(-4)) && digits.length <= 6) ||
      normalized === firstName ||
      normalized === name ||
      normalized === interview.id.slice(0, 8).toLowerCase()
  );
}

function isCompletedInterview(interview: InterviewSummary) {
  return Boolean(
    interview.transcript ||
      interview.interview_intelligence_b1 ||
      interview.status === "awaiting_evaluation" ||
      interview.status === "evaluated"
  );
}

function compactInterview(interview: InterviewSummary, includeTranscript = false) {
  const b1 = interview.interview_intelligence_b1 || {};
  return {
    id: interview.id,
    candidate_name: displayName(interview),
    candidate_phone: displayPhone(interview),
    candidate_email: interview.candidate_email || b1.candidate_summary?.contact?.email || null,
    status: interview.status,
    scheduled_at: interview.scheduled_at,
    created_at: interview.created_at,
    ended_at: interview.ended_at,
    result: displayResult(interview),
    result_notes: b1.signal_indicators?.overall_notes || b1.operational_interest?.notes || null,
    signals: b1.signal_indicators || null,
    operational_interest: b1.operational_interest || null,
    coverage_assessment: b1.coverage_assessment || null,
    transcript: includeTranscript ? truncate(interview.transcript || "", 12000) : undefined,
  };
}

function displayName(interview: InterviewSummary) {
  const b1 = interview.interview_intelligence_b1 || {};
  return interview.candidate_name || b1.candidate_summary?.name || "Unknown candidate";
}

function displayPhone(interview: InterviewSummary) {
  const b1 = interview.interview_intelligence_b1 || {};
  return interview.candidate_phone || b1.candidate_summary?.contact?.phone || "Not available";
}

function displayResult(interview: InterviewSummary) {
  const b1 = interview.interview_intelligence_b1 || {};
  const explicitResult = b1.signal_indicators?.overall_result;
  if (explicitResult) return titleCase(String(explicitResult));

  const fitQuality = b1.operational_interest?.fit_quality;
  if (fitQuality) return `${titleCase(String(fitQuality))} fit`;

  const hirePotential = b1.operational_interest?.immediate_hire_potential;
  if (hirePotential) return `${titleCase(String(hirePotential))} hire potential`;

  return "Interview completed";
}

function displayScheduledStatus(interview: InterviewSummary) {
  if (isPastScheduledInterview(interview)) return "Due now";
  if (isTomorrow(interview.scheduled_at)) return "Scheduled for tomorrow";
  return "Scheduled";
}

function isPastScheduledInterview(interview: InterviewSummary) {
  if (!interview.scheduled_at) return false;
  return new Date(interview.scheduled_at).getTime() <= Date.now();
}

function isTomorrow(value: string | null) {
  if (!value) return false;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const scheduledDay = formatter.format(new Date(value));
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return scheduledDay === formatter.format(tomorrow);
}

function displayPrimaryPositiveSignal(interview: InterviewSummary) {
  const b1 = interview.interview_intelligence_b1 || {};
  const signals = toStringArray(b1.operational_interest?.positive_signals);
  if (signals.length) return signals[0];

  const notes = b1.operational_interest?.notes || b1.signal_indicators?.overall_notes;
  if (notes) return truncateSentence(String(notes), 130);

  return "Completed interview with usable candidate intelligence.";
}

function displayPrimaryNextStep(interview: InterviewSummary) {
  const b1 = interview.interview_intelligence_b1 || {};
  const nextSteps = [
    ...toStringArray(b1.operational_interest?.next_steps_required),
    ...toStringArray(b1.operational_interest?.next_steps),
  ];
  if (nextSteps.length) return nextSteps[0];

  const redFlags = toStringArray(b1.operational_interest?.red_flags);
  if (redFlags.length) return `Review: ${redFlags[0]}`;

  return "Review report and confirm hiring decision.";
}

function buildShortlist(interviews: InterviewSummary[]) {
  return interviews
    .filter(isCompletedInterview)
    .filter((interview) => scoreInterview(interview) >= 55)
    .sort((a, b) => scoreInterview(b) - scoreInterview(a));
}

function scoreInterview(interview: InterviewSummary) {
  const b1 = interview.interview_intelligence_b1 || {};
  const explicitResult = normalizeText(String(b1.signal_indicators?.overall_result || ""));
  const fitQuality = normalizeText(String(b1.operational_interest?.fit_quality || ""));
  const hirePotential = normalizeText(String(b1.operational_interest?.immediate_hire_potential || ""));
  const redFlags = toStringArray(b1.operational_interest?.red_flags);
  const positiveSignals = toStringArray(b1.operational_interest?.positive_signals);

  let score = 50;
  if (explicitResult === "approve" || explicitResult === "approved") score += 35;
  if (explicitResult === "review") score += 10;
  if (explicitResult === "reject" || explicitResult === "rejected") score -= 40;
  if (fitQuality === "strong") score += 35;
  if (fitQuality === "moderate") score += 18;
  if (fitQuality === "weak" || fitQuality === "low") score -= 20;
  if (hirePotential === "high") score += 18;
  if (hirePotential === "medium") score += 8;
  if (hirePotential === "low") score -= 18;
  score += Math.min(positiveSignals.length * 4, 12);
  score -= Math.min(redFlags.length * 10, 25);

  return Math.max(0, Math.min(100, score));
}

function buildFollowUpItems(interviews: InterviewSummary[]) {
  const groups = new Map<string, Set<string>>();
  for (const interview of interviews.filter(isCompletedInterview)) {
    const name = displayName(interview);
    for (const step of getFollowUpSteps(interview)) {
      const action = normalizeAction(step);
      if (!action) continue;
      if (!groups.has(action)) groups.set(action, new Set());
      groups.get(action)!.add(name);
    }
  }

  return [...groups.entries()]
    .map(([action, candidates]) => ({ action, candidates: [...candidates] }))
    .sort((a, b) => b.candidates.length - a.candidates.length || a.action.localeCompare(b.action));
}

function getFollowUpSteps(interview: InterviewSummary) {
  const b1 = interview.interview_intelligence_b1 || {};
  const steps = [
    ...toStringArray(b1.operational_interest?.next_steps_required),
    ...toStringArray(b1.operational_interest?.next_steps),
  ];
  if (steps.length) return steps;

  const redFlags = toStringArray(b1.operational_interest?.red_flags);
  return redFlags.map((flag) => `Review ${flag}`);
}

function formatTryAsking(examples: string[]) {
  return [
    "*Try asking:*",
    ...examples.slice(0, 3).map((example) => `• ${example}`),
    "🎙️ You can also send a voice note.",
  ].join("\n");
}

function getBogotaDayRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const date = `${year}-${month}-${day}`;
  const start = new Date(`${date}T00:00:00-05:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function openAIText(messages: Array<{ role: string; content: string }>): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_TEXT_MODEL,
      input: messages,
      max_output_tokens: 700,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI text response failed: ${await response.text()}`);
  }

  const result = await response.json();
  return extractOpenAIText(result).trim();
}

function extractOpenAIText(result: any): string {
  if (result.output_text) return result.output_text;
  return (result.output || [])
    .flatMap((item: any) => item.content || [])
    .map((content: any) => content.text || "")
    .filter(Boolean)
    .join("\n");
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeCommandText(value: string): string {
  return normalizeText(value)
    .replace(/[*`]/g, "")
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAction(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
}

function truncateSentence(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDateLabel(value: string | null) {
  if (!value) return "Unscheduled";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTime(value: string | null) {
  if (!value) return "Not available";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}\n[transcript truncated]` : value;
}
