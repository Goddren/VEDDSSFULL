// Crypto engine display helpers (fix pack UX, 2026-11-26).
// Pure, dependency-free functions so the check suite can unit-test them
// and every crypto surface renders the same plain words.

// Server reasoning strings carry a debug tag like "[proc:ab12cd] " from
// the process that wrote them. Useful in logs, noise for a human. Strip
// it at render time ONLY — the stored text is never changed.
export function stripProcTags(text: string | null | undefined): string {
  return String(text ?? '').replace(/\[proc:[^\]]*\]\s*/g, '').trim();
}

// Dual-Vote verdict codenames → plain words.
export const VERDICT_PLAIN: Record<string, string> = {
  STRONG_CONFIRM: 'Strong yes',
  STRONG_SKIP: 'Strong no',
  CAUTION: 'Borderline',
  WATCH: 'Watching',
};
export function verdictPlain(code: string | null | undefined): string {
  return VERDICT_PLAIN[String(code ?? '')] ?? String(code ?? '').replace(/_/g, ' ');
}

// The one-line rule behind the Dual-Vote panel.
export const CONSENSUS_EXPLAINER = 'Both the strategy score and the AI must agree before real money moves.';

// True when a reasoning/activity string says the AI layer is out of
// budget (the $2/day pool exhausted, or the provider refusing for
// credits). The status line must say so honestly instead of "hunting".
export function isBudgetExhaustedText(text: string | null | undefined): boolean {
  const t = String(text ?? '');
  return /402/.test(t)
    || /insufficient credits/i.test(t)
    || /budget (used up|exhausted|pool|is exhausted)/i.test(t)
    || /ai budget/i.test(t) && /(used|exhausted|empty|out)/i.test(t);
}

// Slippage is stored in basis points; humans read percent.
// 100 bps → "1%". Trailing zeros trimmed.
export function slippagePctLabel(bps: number): string {
  const pct = (Number(bps) || 0) / 100;
  return `${Number.isInteger(pct) ? pct : Number(pct.toFixed(2))}%`;
}
