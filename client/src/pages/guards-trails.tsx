import { ShieldCheck } from "lucide-react";
import { InfoExplainer } from "@/components/info-explainer";
import {
  EngineSafeguardsPanel,
  GuardFireRatesPanel,
  PromotedRulesPanel,
  SkippedTradesPanel,
  TrailStudyPanel,
} from "@/components/engine-safeguards-panel";

// Engine Guards & Trails (Nov 12, 2026): the guard and trail panels used to
// live stacked on the Weekly Strategy page under the engine controls, where
// they crowded everything else out. They have their own page now, written in
// plain language: what the protections did, which trades they turned away,
// the evidence behind each guard, and the trail study — with promote/retire
// exactly as before (same components, same endpoints, same flows).
export default function GuardsTrailsPage() {
  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 space-y-3" data-testid="guards-trails-page">
      <div className="flex flex-wrap items-start gap-x-2.5 px-1">
        <span className="shrink-0 inline-flex items-center justify-center rounded-lg w-8 h-8 bg-emerald-500/15 text-emerald-300" aria-hidden="true">
          <ShieldCheck className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-gray-100 leading-tight">Engine Guards &amp; Trails</h1>
          <p className="text-[11px] leading-snug text-gray-400 mt-1">
            <b className="text-gray-200">Guards</b> are the safety checks watching every trade your engines try to take — they can cap a size,
            hold a stop where it belongs, or turn a trade away when the evidence says it is a bad one.{" "}
            <b className="text-gray-200">Trails</b> are trailing stops: they follow a winning trade as it runs and lock in a floor
            underneath it, so a winner cannot round-trip into a loss. On this page you can see what the guards actually did, read the
            evidence behind each one, and — when a pattern has proven itself — turn it into a real guard, or retire one that no
            longer earns its place.
          </p>
        </div>
        <InfoExplainer title="Engine Guards & Trails" accent="border-l-emerald-300/60">
          <p>Nothing on this page is an error report. A busy page on a wild day means the protections were working while the market moved.</p>
          <p><b>Start with the receipts:</b> Engine safeguards shows every protection that acted, newest first. Guard fire rates counts how often each one stepped in and — the important part — what the trades they blocked <i>would have done</i>, scored later against real prices.</p>
          <p><b>Proven lessons</b> are patterns your engines found while practicing in shadow mode. Only a pattern with hard proof behind it can become a real guard, and only when you tap the button — one at a time, reversible anytime.</p>
          <p><b>The trail study</b> measures giveback — how much of a winning trade's peak was handed back before it closed — so you can see which trailing style fits which pair or strategy, and freeze or tighten the proven ones as trail guards.</p>
        </InfoExplainer>
      </div>

      <EngineSafeguardsPanel />
      <GuardFireRatesPanel />
      <SkippedTradesPanel />
      <PromotedRulesPanel />
      <TrailStudyPanel />
    </div>
  );
}
