import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ShadowLiveToggleRow, type ShadowBarItem } from "@/components/shadow-live-toggle";
import { strategyLabel } from "@/components/kalshi-strategy-labels";

// ── Kalshi stock perps — "Arm for live" (2026-11-15) ────────────────────────
// HONEST BY CONSTRUCTION: this section does NOT offer a "Live" toggle. It
// offers ARMING: mark the strategies you want first in line, watch each
// one's progress toward the promotion bar, and see the readiness checklist
// exactly as it stands. Arming places no trades by itself. The live lane
// (a separate module) reads these arms and can trade ONLY an armed
// strategy that clears the bar — and it re-verifies the bar, the account's
// margin state, and its own gates every cycle. The checklist's margin and
// live-path lines come from that lane's live report, not from copy here.

type KalshiBarT = { trades: number; meanNetPct: number | null; avgR: number | null; winRate: number | null; maxDrawdownPct: number; losingWeek: boolean; meetsBar: boolean; missing: string[] };
type KalshiArmStrategyT = { strategy: string; armed: boolean; updatedAt: string | null; bar: KalshiBarT };
type KalshiArmingT = { enabled: boolean; readiness: { marginStatus: string; livePathBuilt: boolean }; strategies: KalshiArmStrategyT[] };

export function KalshiPerpArmingSection() {
  const qc = useQueryClient();
  const { data } = useQuery<KalshiArmingT>({
    queryKey: ["/api/engine/kalshi-perp-arming"],
    refetchInterval: 60000,
  });
  const [flipError, setFlipError] = useState<string | null>(null);
  const flip = useMutation({
    mutationFn: async (v: { strategy: string; armed: boolean }) => apiRequest("POST", "/api/engine/kalshi-perp-arming", v),
    onSuccess: () => { setFlipError(null); qc.invalidateQueries({ queryKey: ["/api/engine/kalshi-perp-arming"] }); },
    onError: (err: any) => {
      let message = "That didn't go through. The list refreshes automatically.";
      try {
        const body = JSON.parse(String(err?.message ?? "").replace(/^\d+: /, ""));
        if (body?.error) message = body.error;
      } catch { /* keep the generic line */ }
      setFlipError(message);
      qc.invalidateQueries({ queryKey: ["/api/engine/kalshi-perp-arming"] });
    },
  });
  if (!data) return null;
  const barItems = (bar: KalshiBarT): ShadowBarItem[] => [
    { label: "Trades", display: `${bar.trades}/50`, met: bar.trades >= 50 },
    { label: "Avg R", display: bar.avgR == null ? "—" : `${bar.avgR >= 0 ? "+" : ""}${bar.avgR.toFixed(2)}R`, met: bar.avgR != null && bar.avgR >= 0.2 },
    { label: "Win rate", display: bar.winRate == null ? "—" : `${Math.round(bar.winRate * 100)}%`, met: bar.winRate != null && bar.winRate >= 0.4 },
    { label: "Last 2 weeks", display: bar.losingWeek ? "a losing week" : "no losing week", met: !bar.losingWeek },
    { label: "Drawdown", display: `${bar.maxDrawdownPct.toFixed(1)}%`, met: bar.maxDrawdownPct <= 10 },
  ];
  const armedCount = data.strategies.filter((s) => s.armed).length;
  const readyCount = data.strategies.filter((s) => s.bar.meetsBar).length;
  return (
    <div className="mt-3" data-testid="kalshi-perp-arming">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-300">Arm for live</h3>
        <span className="min-w-0 break-words text-[9px] text-gray-500">arming is not trading — read the checklist</span>
      </div>
      <div className="rounded-lg border border-amber-400/25 bg-amber-500/[0.06] px-2.5 py-2">
        <p className="text-[10px] leading-snug text-amber-200/90 break-words">
          <b>Arming does not place trades.</b> Arming records which proven strategies you want first in line. The live
          lane trades real money only for an armed strategy that has cleared the promotion bar, and it re-checks the
          bar, the margin state, and its own gates every cycle before any order.
        </p>
        <div className="mt-1.5 space-y-0.5 text-[10px] tabular-nums">
          <div className="flex flex-wrap gap-x-2">
            <span className={readyCount > 0 ? "text-emerald-300" : "text-gray-400"}>{readyCount > 0 ? "✓" : "✗"} Promotion bar</span>
            <span className="text-gray-400">{readyCount} of {data.strategies.length} strategies have cleared it so far{armedCount > 0 ? ` · ${armedCount} armed` : ""}</span>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <span className={data.readiness.marginStatus === "enabled" ? "text-emerald-300" : "text-gray-400"}>{data.readiness.marginStatus === "enabled" ? "✓" : "✗"} Kalshi margin</span>
            <span className="text-gray-400">{data.readiness.marginStatus === "enabled"
              ? "enabled — Kalshi verified it on the live report just now"
              : data.readiness.marginStatus === "disabled"
                ? "not enabled on this account — Kalshi answered no, so the live lane places nothing"
                : "status unknown — the live report couldn't verify it just now, so the lane treats it as not enabled"}</span>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <span className={data.readiness.livePathBuilt ? "text-emerald-300" : "text-gray-400"}>{data.readiness.livePathBuilt ? "✓" : "✗"} Live execution path</span>
            <span className="text-gray-400">{data.readiness.livePathBuilt ? "connected — the live lane reads these arms and re-checks every gate each cycle" : "not verified — the live lane's report couldn't be read just now"}</span>
          </div>
        </div>
      </div>
      {!data.enabled && (
        <div className="mt-1.5 text-[10px] text-amber-300 rounded bg-amber-500/10 border border-amber-400/20 px-2 py-1.5 break-words">
          Arming is switched off right now (kill switch KALSHI_PERP_ARM=off). The toggles below are disabled; what's already armed stays recorded.
        </div>
      )}
      {data.strategies.length ? (
        <div className="mt-1.5 space-y-1">
          {data.strategies.map((s) => (
            <ShadowLiveToggleRow
              key={s.strategy}
              name={strategyLabel(s.strategy)}
              nameDetail={s.strategy}
              on={s.armed}
              onText="ARMED"
              offText="NOT ARMED"
              disabled={!data.enabled}
              flipping={flip.isPending && flip.variables?.strategy === s.strategy}
              barItems={barItems(s.bar)}
              note={s.armed
                ? `Armed${s.updatedAt ? ` ${new Date(s.updatedAt).toLocaleDateString()}` : ""} — first in line for the live lane${s.bar.meetsBar ? ", and it has cleared the bar — the lane may trade it while every gate passes" : ", once it clears the bar"}.`
                : s.bar.meetsBar
                  ? "Cleared the promotion bar — arm it to put it first in line for live."
                  : `Still proving itself: ${s.bar.missing.join(" · ")}.`}
              onFlip={(next) => flip.mutate({ strategy: s.strategy, armed: next })}
            />
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-[10px] text-gray-500">No strategies have shadow activity yet — toggles appear here as the lane trades.</p>
      )}
      {flipError && <div className="text-[10px] text-red-300 mt-1 break-words">{flipError}</div>}
      <p className="mt-1.5 break-words text-[9px] leading-relaxed text-gray-600">
        Promotion bar, per strategy over its full shadow record: 50+ closed trades (net of funding and costs) · average +0.20R or better · 40%+ wins · no losing week in the last two · drawdown ≤ 10%.
      </p>
    </div>
  );
}
