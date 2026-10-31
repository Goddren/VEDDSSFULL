import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

// Host results in the veddbuild.com landing style (pages/landing.tsx palette).
// Data: GET /api/ambassador/host/results (server/services/host-results.ts).

const C = { card: "#151619", line: "rgba(255,255,255,.08)", tx: "#F4F5F6", tx2: "#9BA1A9", tx3: "#5B616B", red: "#FF3B34", gold: "#F5C451", green: "#27D07C" };
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

interface Funnel { visits: number; signups: number; paid: number; signupRate: number | null; paidRate: number | null }
interface HostEvent {
  key: string; title: string; start: string | null; status: string; registered: number; attended: number; rating: number | null; tokens: number;
  signupsAfter: number | null; linkVisits: number | null; attribution: 'link' | 'window'; shareSlug?: string | null;
}
export interface HostResultsData {
  referralCode: string | null;
  funnel: { allTime: Funnel; last30: Funnel };
  profitSplit: { recruits: number; netProfit: number; owedToVedd: number; collected: number; pct: number };
  content: { posted: number; clicks: number };
  credits: number; tokensFromEvents: number;
  events: HostEvent[]; eventWindowHours: number;
}

const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`);
const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function Kicker({ children, color = C.gold }: { children: React.ReactNode; color?: string }) {
  return <div style={{ font: `600 11px ${MONO}`, textTransform: "uppercase", letterSpacing: ".18em", color }}>{children}</div>;
}

function Stat({ label, value, sub, color = C.tx }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div style={{ font: `600 10px ${MONO}`, textTransform: "uppercase", letterSpacing: ".14em", color: C.tx3 }}>{label}</div>
      <div className="mt-1 text-3xl font-extrabold tracking-tight" style={{ color }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: C.tx2 }}>{sub}</div>}
    </div>
  );
}

export function HostResults() {
  const [range, setRange] = useState<"last30" | "allTime">("last30");
  const [copied, setCopied] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<HostResultsData>({ queryKey: ["/api/ambassador/host/results"] });
  if (isLoading) return <div className="rounded-2xl p-6 text-sm" style={{ background: C.card, color: C.tx2 }}>Loading your results…</div>;
  if (error || !data) return <div className="rounded-2xl p-6 text-sm" style={{ background: C.card, color: C.tx2 }}>Results aren't available right now.</div>;
  const f = data.funnel[range];
  const now = Date.now();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <Kicker>Your link</Kicker>
            <h2 className="text-xl font-extrabold tracking-tight" style={{ color: C.tx }}>From visit to member</h2>
          </div>
          <div className="flex rounded-full p-1" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            {(["last30", "allTime"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className="px-3 py-1 rounded-full text-xs font-bold"
                style={{ background: range === r ? "rgba(255,59,52,.14)" : "transparent", color: range === r ? C.red : C.tx2 }}>
                {r === "last30" ? "Last 30 days" : "All time"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Link visits" value={f.visits} />
          <Stat label="Sign-ups" value={f.signups} sub={`${pct(f.signupRate)} of visits`} color={C.gold} />
          <Stat label="Paid members" value={f.paid} sub={`${pct(f.paidRate)} of sign-ups`} color={C.green} />
        </div>
        {f.visits > 0 && f.signups === 0 && (
          <p className="text-xs" style={{ color: C.tx2 }}>
            People are clicking but nobody has signed up yet. Tip: send people to your event page or today's article instead of straight to sign-up, then follow up after.
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Profit-split recruits" value={data.profitSplit.recruits} sub={data.profitSplit.recruits ? `${usd(data.profitSplit.netProfit)} net profit` : "None enrolled yet"} />
        <Stat label={`VEDD ${data.profitSplit.pct}% owed`} value={usd(data.profitSplit.owedToVedd)} sub={`${usd(data.profitSplit.collected)} collected`} color={C.gold} />
        <Stat label="Post link clicks" value={data.content.clicks} sub={`${data.content.posted} posts marked posted`} />
        <Stat label="Rewards" value={data.credits} sub={`credits · ${data.tokensFromEvents} VEDD from events`} />
      </section>

      <section className="space-y-3">
        <div>
          <Kicker>Per event</Kicker>
          <h2 className="text-xl font-extrabold tracking-tight" style={{ color: C.tx }}>What each event produced</h2>
          <p className="text-xs mt-1" style={{ color: C.tx3 }}>Shared events count visits and sign-ups that came through that event's link. Events without a share link count sign-ups through your link within {data.eventWindowHours} hours of the start.</p>
        </div>
        {data.events.length === 0 ? (
          <div className="rounded-2xl p-6 text-sm" style={{ background: C.card, color: C.tx2, border: `1px solid ${C.line}` }}>No events yet. Schedule one from the Upcoming tab.</div>
        ) : (
          <div className="space-y-2">
            {data.events.map((e) => {
              const past = e.start ? new Date(e.start).getTime() < now : false;
              const stale = past && e.status === "scheduled";
              const statusLabel = stale ? "Past · not marked done" : e.status === "completed" ? "Done" : past ? "Past" : "Upcoming";
              const statusColor = stale ? C.gold : e.status === "completed" ? C.green : C.tx2;
              return (
                <div key={e.key} className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold truncate" style={{ color: C.tx }}>{e.title}</div>
                      <div className="text-xs" style={{ color: C.tx3 }}>{e.start ? format(new Date(e.start), "EEE d MMM yyyy · p") : "No date"}</div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full" style={{ color: statusColor, border: `1px solid ${statusColor}55` }}>{statusLabel}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                    {(e.attribution === "link" ? [
                      ["Link visits", e.linkVisits ?? 0],
                      ["Registered", e.registered],
                      ["Sign-ups", e.signupsAfter ?? 0],
                      ["Rating", e.rating ? `${e.rating.toFixed(1)}★` : "–"],
                    ] : [
                      ["Registered", e.registered],
                      ["Attended", e.attended],
                      ["Sign-ups after", e.signupsAfter ?? "–"],
                      ["Rating", e.rating ? `${e.rating.toFixed(1)}★` : "–"],
                    ]).map(([l, v]) => (
                      <div key={l as string}>
                        <div className="text-lg font-extrabold" style={{ color: String(l).startsWith("Sign-ups") && Number(v) > 0 ? C.gold : C.tx }}>{v}</div>
                        <div style={{ font: `600 9px ${MONO}`, textTransform: "uppercase", letterSpacing: ".1em", color: C.tx3 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {e.shareSlug && (
                    <button
                      onClick={() => {
                        const link = `${window.location.origin}/event/${e.shareSlug}?action=register${data.referralCode ? `&ref=${encodeURIComponent(data.referralCode)}` : ""}`;
                        navigator.clipboard.writeText(link).then(() => setCopied(e.key), () => {});
                      }}
                      className="mt-3 w-full rounded-xl py-2 text-xs font-bold"
                      style={{ background: "rgba(255,59,52,.1)", color: C.red, border: "1px solid rgba(255,59,52,.3)" }}>
                      {copied === e.key ? "Tracked link copied" : "Copy tracked event link"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
