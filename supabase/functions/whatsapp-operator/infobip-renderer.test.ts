import {
  actionCommand,
  renderTextWithActions,
  shouldRenderInfobipButtons,
  toInfobipButtons,
} from "../_shared/infobip-renderer.ts";
import type { OperatorState } from "../_shared/hiring-operator-actions.ts";

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const actions: Array<{ id: OperatorState; label: string }> = [
  { id: "scheduled_today", label: "Scheduled" },
  { id: "completed_today", label: "Completed" },
  { id: "shortlist", label: "Shortlist" },
];

Deno.test("renders text action fallback by default", () => {
  const text = renderTextWithActions("Welcome", actions);

  assertEquals(
    text,
    [
      "Welcome",
      "",
      "*Next options:*",
      "• Type *scheduled* for Scheduled",
      "• Type *completed* for Completed",
      "• Type *shortlist* for Shortlist",
    ].join("\n")
  );
});

Deno.test("maps provider-neutral action IDs to stable typed commands", () => {
  assertEquals(actionCommand({ id: "best_pick", label: "Best Pick" }), "best pick");
  assertEquals(actionCommand({ id: "main_menu", label: "Menu" }), "menu");
  assertEquals(actionCommand({ id: "followups", label: "Follow-ups" }), "followups");
});

Deno.test("buttons are enabled by default and can be disabled", () => {
  assertEquals(shouldRenderInfobipButtons(""), true);
  assertEquals(shouldRenderInfobipButtons("text"), false);
  assertEquals(shouldRenderInfobipButtons("buttons"), true);
});

Deno.test("renders Infobip button payloads without changing action IDs", () => {
  assertEquals(toInfobipButtons(actions), [
    { id: "scheduled_today", title: "Scheduled" },
    { id: "completed_today", title: "Completed" },
    { id: "shortlist", title: "Shortlist" },
  ]);
});
