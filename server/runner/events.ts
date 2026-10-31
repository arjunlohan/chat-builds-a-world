import type { FeedLine } from "../rounds/types.js";
export interface Usage { input: number | null; output: number | null; total: number | null }
export function readableEvent(event: unknown): { kind: FeedLine["kind"]; text: string } | null {
  const e = event as { type?: string; item?: { type?: string; text?: string; changes?: { path?: string }[]; plan?: { step?: string; status?: string }[]; items?: { text?: string; completed?: boolean }[]; command?: string; exit_code?: number } };
  if (e?.type === "turn.started") return { kind: "plan", text: "Planning the approved module." };
  if (e?.type === "item.completed" && e.item?.type === "agent_message") return { kind: "plan", text: /^[{[]/.test(e.item.text?.trim() ?? "") ? "Module summary received; independent checks follow." : String(e.item.text ?? "").replace(/\s+/g, " ").slice(0, 140) };
  if (e?.item?.type === "todo_list") return { kind: "plan", text: (e.item.items?.map(item => `${item.completed ? "Done" : "Next"}: ${item.text ?? "step"}`).join(" · ") ?? "Plan updated.").slice(0, 140) };
  if (e?.item?.type === "plan_update" || e?.item?.type === "plan") return { kind: "plan", text: (e.item.plan?.map(p => p.step).join(" · ") ?? "Module plan updated.").slice(0, 140) };
  if (e?.type === "item.completed" && e.item?.type === "file_change") {
    const paths = e.item.changes?.map(c => typeof c.path === "string" ? /(?:^|\/)(world\/modules\/[\w/-]+\.ts)$/.exec(c.path.replace(/\\/g, "/"))?.[1] : undefined).filter((p): p is string => !!p) ?? [];
    return { kind: "edit", text: paths.length ? `Edited ${paths.join(", ")}`.slice(0, 140) : "File edits ready for path checks." };
  }
  if (e?.type === "item.completed" && e.item?.type === "command_execution") return { kind: "check", text: e.item.exit_code === 0 ? "Builder command completed; independent checks follow." : "Builder command failed; checking the candidate." };
  return null;
}
