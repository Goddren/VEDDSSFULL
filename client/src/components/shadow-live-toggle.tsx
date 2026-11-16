import type { ReactNode } from "react";

// ── Shadow → live toggle row (shared) ───────────────────────────────────────
// One reusable toggle + proof-bar progress row for every shadow lane that
// can graduate to live (2026-11-15). A lane panel supplies the strategy
// name, the toggle state, and the bar items (each with its current value
// vs the bar, so a refused flip is never a mystery: the missing pieces are
// on screen before anyone taps). The switch itself is dumb — the SERVER
// re-verifies the bar at flip time; this component only renders state and
// forwards the tap. Future lanes (a pump.fun follower lane, Sol, Studio)
// adopt it by feeding it their own bar items and flip handler.

export interface ShadowBarItem {
  /** Short bar label, e.g. "Trades", "Win rate", "Drawdown". */
  label: string;
  /** Current vs required, e.g. "23/50", "36% (needs ≥ 40%)". */
  display: string;
  met: boolean;
}

export function ShadowLiveToggleRow({
  name,
  nameDetail,
  on,
  onText,
  offText,
  disabled = false,
  barItems,
  note,
  flipping = false,
  onFlip,
}: {
  name: string;
  /** Raw strategy key, shown muted next to the label. */
  nameDetail?: string;
  on: boolean;
  /** State word shown next to the switch when on, e.g. "LIVE" / "ARMED". */
  onText: string;
  /** State word when off, e.g. "SHADOW ONLY" / "NOT ARMED". */
  offText: string;
  disabled?: boolean;
  barItems: ShadowBarItem[];
  note?: ReactNode;
  flipping?: boolean;
  onFlip: (next: boolean) => void;
}) {
  const switchDisabled = disabled || flipping;
  return (
    <div className="rounded-lg bg-black/20 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 break-words text-[10px] font-semibold text-gray-200">
          {name}
          {nameDetail ? <span className="font-normal text-gray-600"> {nameDetail}</span> : null}
        </span>
        <span className={`shrink-0 text-[9px] font-bold tracking-wide ${on ? "text-emerald-300" : "text-gray-500"}`}>
          {on ? onText : offText}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${name} go-live toggle`}
          disabled={switchDisabled}
          onClick={() => { if (!switchDisabled) onFlip(!on); }}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
            on ? "bg-emerald-500" : "bg-gray-600"
          } ${switchDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              on ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      {barItems.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[9px] tabular-nums">
          {barItems.map((b) => (
            <span key={b.label} className={b.met ? "text-emerald-300/90" : "text-gray-500"}>
              {b.met ? "✓" : "✗"} {b.label} {b.display}
            </span>
          ))}
        </div>
      )}
      {note ? <div className="mt-0.5 break-words text-[9px] leading-snug text-gray-500">{note}</div> : null}
    </div>
  );
}
