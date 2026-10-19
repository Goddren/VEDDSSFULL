import { useQuery } from "@tanstack/react-query";
import { Fuel } from "lucide-react";

// AI "gas meter": how much AI fuel is left — this month's AI allowance (plan
// cap), today's calls, and for admins the live OpenRouter balance + days left.

export interface AiGasMeterData {
  month: { usedCents: number; capCents: number; pctLeft: number };
  today: { platformCalls: number; dailyCap: number; personalKeyCalls: number };
  hasPersonalKey: boolean;
  pausedForCredits: boolean;
  platform?: {
    openRouter: { totalUsd: number; usedUsd: number; remainingUsd: number; pctLeft: number } | null;
    last24h: { calls: number | null; estUsd: number | null; measuring?: boolean };
    daysLeft: number | null;
    platformDailyCap: number | null;
  };
}

export function useAiGasMeter() {
  return useQuery<AiGasMeterData>({ queryKey: ["/api/ai-credits/meter"], refetchInterval: 60000 });
}

const colorFor = (pct: number) => (pct <= 10 ? "#f87171" : pct <= 30 ? "#fbbf24" : "#34d399");
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Semicircle fuel gauge, E on the left, F on the right. */
function Dial({ pct, size = 120, label }: { pct: number; size?: number; label: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const r = size * 0.4, cx = size / 2, cy = size * 0.52;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from / 100), a1 = Math.PI * (1 - to / 100);
    const x0 = cx + r * Math.cos(a0), y0 = cy - r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy - r * Math.sin(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  const ang = Math.PI * (1 - p / 100);
  const nx = cx + r * 0.85 * Math.cos(ang), ny = cy - r * 0.85 * Math.sin(ang);
  const c = colorFor(p);
  return (
    <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`} role="img" aria-label={`${label}: ${p}% left`}>
      <path d={arc(0, 100)} stroke="#1f2937" strokeWidth={size * 0.08} fill="none" strokeLinecap="round" />
      <path d={arc(0, Math.max(0.5, p))} stroke={c} strokeWidth={size * 0.08} fill="none" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#e5e7eb" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={size * 0.035} fill="#e5e7eb" />
      <text x={cx - r - 2} y={cy + size * 0.1} fontSize={size * 0.09} fill="#6b7280" textAnchor="middle">E</text>
      <text x={cx + r + 2} y={cy + size * 0.1} fontSize={size * 0.09} fill="#6b7280" textAnchor="middle">F</text>
    </svg>
  );
}

/** Full card — dashboard. */
export function AiGasMeter({ className = "" }: { className?: string }) {
  const { data, isLoading } = useAiGasMeter();
  if (isLoading || !data) return null;
  const m = data.month, t = data.today, plat = data.platform;
  const callPct = t.dailyCap > 0 ? Math.min(100, Math.round((t.platformCalls / t.dailyCap) * 100)) : 0;
  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: "rgba(17,24,39,0.55)", border: `1.5px solid ${colorFor(m.pctLeft)}44` }} data-testid="ai-gas-meter">
      <div className="flex items-center gap-2 mb-2">
        <Fuel className="w-4 h-4" style={{ color: colorFor(m.pctLeft) }} />
        <h3 className="text-sm font-bold text-gray-100">AI fuel</h3>
        {data.pausedForCredits && <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">AI paused — out of credits</span>}
        {!data.pausedForCredits && data.hasPersonalKey && <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/25">Own API key connected</span>}
      </div>
      <div className={`grid gap-3 ${plat?.openRouter ? "sm:grid-cols-2" : ""}`}>
        <div className="flex items-center gap-3 min-w-0">
          <Dial pct={m.pctLeft} label="Monthly AI allowance" />
          <div className="min-w-0">
            <p className="text-2xl font-black text-gray-100">{m.pctLeft}%</p>
            <p className="text-[11px] text-gray-400">of this month's AI allowance left</p>
            <p className="text-[10px] text-gray-500 mt-1">{usd(m.usedCents)} of {usd(m.capCents)} used</p>
            <p className="text-[10px] text-gray-500">Today: {t.platformCalls.toLocaleString()} / {t.dailyCap.toLocaleString()} calls ({callPct}%){t.personalKeyCalls ? ` · ${t.personalKeyCalls} on your key` : ""}</p>
          </div>
        </div>
        {plat?.openRouter && (
          <div className="flex items-center gap-3 min-w-0 sm:border-l sm:border-gray-800 sm:pl-3">
            <Dial pct={plat.openRouter.pctLeft} label="Platform credits" />
            <div className="min-w-0">
              <p className="text-2xl font-black text-gray-100">${plat.openRouter.remainingUsd.toFixed(2)}</p>
              <p className="text-[11px] text-gray-400">OpenRouter credit left (admin)</p>
              <p className="text-[10px] text-gray-500 mt-1">24h: {plat.last24h.calls ?? "—"} calls · {plat.last24h.measuring ? "measuring spend…" : `~$${(plat.last24h.estUsd ?? 0).toFixed(2)}/day`}</p>
              <p className="text-[10px] font-semibold" style={{ color: plat.daysLeft != null && plat.daysLeft < 3 ? "#f87171" : "#9ca3af" }}>
                {plat.daysLeft != null ? `≈ ${plat.daysLeft} days at this rate` : "Days left: measuring (needs ~3h of data)"}
              </p>
            </div>
          </div>
        )}
      </div>
      {m.pctLeft <= 10 && !data.hasPersonalKey && (
        <p className="text-[10px] text-amber-300 mt-2">Running low — connect your own AI key in Settings, or upgrade your plan, to keep the AI engines running.</p>
      )}
    </div>
  );
}

/** One-line version — side panel. */
export function AiGasMeterCompact() {
  const { data } = useAiGasMeter();
  if (!data) return null;
  const m = data.month;
  const c = colorFor(m.pctLeft);
  return (
    <div className="w-full text-left px-4 py-3 rounded-2xl mb-2" style={{ background: "rgba(17,24,39,0.55)", border: `1.5px solid ${c}44` }} data-testid="ai-gas-meter-compact">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Fuel className="w-3.5 h-3.5" style={{ color: c }} />
          <span className="text-xs font-bold text-gray-100">AI fuel</span>
        </div>
        <span className="text-xs font-black" style={{ color: c }}>{data.pausedForCredits ? "PAUSED" : `${m.pctLeft}%`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.pctLeft} aria-label="AI fuel left this month">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, m.pctLeft)}%`, background: c }} />
      </div>
      <p className="text-[10px] text-gray-500 mt-1">
        {data.today.platformCalls.toLocaleString()} calls today
        {data.platform?.openRouter ? ` · $${data.platform.openRouter.remainingUsd.toFixed(2)} platform${data.platform.daysLeft != null ? ` (~${data.platform.daysLeft}d)` : ""}` : ""}
      </p>
    </div>
  );
}
