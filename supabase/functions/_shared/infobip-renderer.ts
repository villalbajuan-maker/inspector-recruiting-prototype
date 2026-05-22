import type { OperatorState } from "./hiring-operator-actions.ts";

interface RenderableAction {
  id: OperatorState;
  label: string;
}

export function shouldRenderInfobipButtons(value = Deno.env.get("INFOBIP_ACTION_RENDERING") || "buttons") {
  return (value || "buttons").toLowerCase() === "buttons";
}

export function renderTextWithActions(text: string, actions: RenderableAction[]) {
  if (!actions.length) return text;

  const lines = actions.map((action) => `• Type *${actionCommand(action)}* for ${action.label}`);
  return `${text}\n\n*Next options:*\n${lines.join("\n")}`;
}

export function actionCommand(action: RenderableAction) {
  const commands: Record<string, string> = {
    scheduled_today: "scheduled",
    completed_today: "completed",
    previous_interviews: "previous",
    main_menu: "menu",
    best_pick: "best pick",
  };

  return commands[action.id] || action.id.replace(/_/g, " ");
}

export function toInfobipButtons(actions: RenderableAction[]) {
  return actions.map((action) => ({
    id: action.id,
    title: action.label,
  }));
}
