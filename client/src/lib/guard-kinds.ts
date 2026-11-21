// guard-kinds.ts — ONE counting definition for guard events, shared by the
// Guards & Trails page and the weekly-strategy summary card.
//
// The guard event store mixes three different series in one per-kind count
// map, and surfaces used to sum them all as "guard actions" — which is how
// the app could show "8,855 guard actions" (mostly AI-call failures) next to
// "0 guard actions" and "no guard activity in two weeks" at the same time.
//   · guard actions   — a guard actually evaluated/acted on a trade setup
//   · AI health       — the guard layer's AI calls failing/truncating; an
//                       infrastructure signal, NOT a guard action
//   · stood down      — the thin-data brain block deliberately skipping a
//                       check; informational, counted separately
export const AI_HEALTH_KINDS = ["ai_call_failed", "ai_reply_truncated"] as const;
export const GUARD_STOOD_DOWN_KINDS = ["brain_block_thin_data"] as const;

export type GuardKindCounts = Record<string, number>;

export function countAiFailures(summary: GuardKindCounts | null | undefined): number {
  if (!summary) return 0;
  return AI_HEALTH_KINDS.reduce((s, k) => s + (summary[k] || 0), 0);
}

export function countStoodDown(summary: GuardKindCounts | null | undefined): number {
  if (!summary) return 0;
  return GUARD_STOOD_DOWN_KINDS.reduce((s, k) => s + (summary[k] || 0), 0);
}

export function countGuardActions(summary: GuardKindCounts | null | undefined): number {
  if (!summary) return 0;
  const excluded = new Set<string>([...AI_HEALTH_KINDS, ...GUARD_STOOD_DOWN_KINDS]);
  return Object.entries(summary).reduce((s, [kind, n]) => s + (excluded.has(kind) ? 0 : n || 0), 0);
}

export function isAiHealthKind(kind: string): boolean {
  return (AI_HEALTH_KINDS as readonly string[]).includes(kind);
}
