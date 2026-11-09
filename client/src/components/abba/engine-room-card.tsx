// ─── ABBA Engine Room card (Phase B) ────────────────────────────────────────
// ONE read-only snapshot card rendered identically in the floating ABBA
// panel and on the ABBA page: this user's engine states, connected accounts
// with balances + freshness, open positions, and recent closes — all from
// GET /api/abba/engine-room (session user only). Nothing here can start,
// stop, or reconfigure anything; it displays and refreshes, that's all.
// The card is COLLAPSIBLE (collapsed by default on both chat surfaces, with
// a counts summary in the header) and its expanded body scrolls inside a
// bounded max-height — it can never crowd out the chat around it again.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Wallet, Layers, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

type EngineStateKind = 'running' | 'stopped' | 'gated' | 'silent' | 'no_data' | 'unknown';

interface EngineRoomData {
  generatedAt: string;
  engines: Array<{ id: string; name: string; state: EngineStateKind; evidence: string; openPositions: number | null; guardNote?: string }>;
  accounts: Array<{ id: string; provider: string; label: string; accountType: string; currency: string | null; balance: number | null; equity: number | null; status: string; ageSeconds: number | null; note?: string }>;
  openPositions: Array<{ engine: string; symbol: string; side: string; unrealizedPnl: number | null; mode?: string }>;
  recentCloses: Array<{ engine: string; symbol: string; side: string; pnl: number | null }>;
  unknowns: string[];
}

const STATE_STYLE: Record<EngineStateKind, { dot: string; text: string; label: string }> = {
  running: { dot: '#34d399', text: 'text-emerald-300', label: 'RUNNING' },
  stopped: { dot: '#a1a1aa', text: 'text-zinc-400', label: 'STOPPED' },
  gated: { dot: '#fbbf24', text: 'text-amber-300', label: 'GATED' },
  silent: { dot: '#f87171', text: 'text-red-300', label: 'SILENT' },
  no_data: { dot: '#64748b', text: 'text-slate-400', label: 'NO DATA' },
  unknown: { dot: '#64748b', text: 'text-slate-400', label: 'UNKNOWN' },
};

function freshnessLabel(a: EngineRoomData['accounts'][number]): { text: string; cls: string } {
  if (a.status === 'ok') {
    if (a.ageSeconds != null && a.ageSeconds > 75) return { text: `${Math.round(a.ageSeconds / 60)}m old`, cls: 'text-emerald-300 border-emerald-400/30' };
    return { text: 'LIVE', cls: 'text-emerald-300 border-emerald-400/30' };
  }
  if (a.status === 'stale') return { text: 'STALE', cls: 'text-amber-300 border-amber-400/30' };
  if (a.status === 'error') return { text: 'READ FAILED', cls: 'text-red-300 border-red-400/30' };
  return { text: 'BALANCE N/A', cls: 'text-slate-400 border-white/15' };
}

function fmtMoney(v: number | null, currency: string | null): string {
  if (v == null) return '—';
  return `${currency === 'SOL' ? '' : '$'}${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}${currency === 'SOL' ? ' SOL' : ''}`;
}

interface EngineRoomCardProps {
  /** Start expanded? Both chat surfaces keep the card COLLAPSED by default so
      the conversation stays the primary surface; it opens on tap. */
  defaultExpanded?: boolean;
  /** Tailwind max-height for the expanded body's own scroll region — the
      bound that guarantees the card can never consume the layout around it. */
  expandedMaxHeightClass?: string;
}

export function EngineRoomCard({ defaultExpanded = false, expandedMaxHeightClass = 'max-h-[420px]' }: EngineRoomCardProps = {}) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<EngineRoomData>({
    queryKey: ['/api/abba/engine-room'],
    refetchInterval: 60_000,
    retry: false,
  });
  const [expanded, setExpanded] = useState(defaultExpanded);

  // One-line summary for the collapsed header — counts only, computed from
  // the same snapshot the body renders. Falls back to the static subtitle
  // until the first snapshot lands, so the header stays compact while
  // loading and on error.
  const summary = data
    ? `${data.engines.filter((e) => e.state === 'running').length}/${data.engines.length} engines running · ${data.accounts.length} account${data.accounts.length === 1 ? '' : 's'} · ${data.openPositions.length} open`
    : 'your engines · accounts · positions';

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden" data-testid="abba-engine-room">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-2 flex-1 min-w-0 text-left rounded-md px-1 py-0.5 -mx-1 hover:bg-white/5 transition-colors"
          title={expanded ? 'Collapse engine room' : 'Expand engine room'}
          data-testid="button-engine-room-toggle"
        >
          <Activity className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
          <span className="text-[11px] font-bold tracking-wide text-white/90 shrink-0">ENGINE ROOM</span>
          <span className="text-[9px] text-white/40 truncate">{summary}</span>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-white/50 shrink-0 ml-auto" />
            : <ChevronDown className="w-3.5 h-3.5 text-white/50 shrink-0 ml-auto" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); refetch(); }}
          className="p-1 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
          title="Refresh engine room"
          data-testid="button-engine-room-refresh"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className={`${expandedMaxHeightClass} overflow-y-auto`}>
          {isLoading && <div className="px-3 py-3 text-[11px] text-white/50">Reading your engines and accounts…</div>}
          {isError && <div className="px-3 py-3 text-[11px] text-red-300">Engine room unavailable right now — your engines are unaffected.</div>}

          {data && (
        <div className="px-3 py-2 space-y-2.5">
          {/* Engines */}
          <div className="space-y-1">
            {data.engines.map((e) => {
              const st = STATE_STYLE[e.state] || STATE_STYLE.unknown;
              return (
                <div key={e.id} className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: st.dot }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[11px] font-semibold text-white/90">{e.name}</span>
                      <span className={`text-[8.5px] font-bold tracking-wider ${st.text}`}>{st.label}</span>
                      {typeof e.openPositions === 'number' && e.openPositions > 0 && (
                        <span className="text-[9px] text-white/40">{e.openPositions} open</span>
                      )}
                    </div>
                    <div className="text-[9.5px] leading-snug text-white/45 truncate" title={e.evidence}>{e.evidence}</div>
                    {e.guardNote && <div className="text-[9.5px] leading-snug text-amber-300/80">{e.guardNote}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Accounts */}
          {data.accounts.length > 0 && (
            <div className="pt-1.5 border-t border-white/[0.07]">
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet className="w-3 h-3 text-white/40" />
                <span className="text-[9px] font-bold tracking-wider text-white/40">ACCOUNTS</span>
              </div>
              <div className="space-y-1">
                {data.accounts.map((a) => {
                  const f = freshnessLabel(a);
                  return (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="text-[10.5px] text-white/80 truncate flex-1" title={a.note || a.label}>{a.label}</span>
                      <span className="text-[10.5px] font-semibold text-white/90 tabular-nums">{fmtMoney(a.balance, a.currency)}</span>
                      <span className={`text-[7.5px] font-bold px-1 py-px rounded border ${f.cls}`}>{f.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Positions */}
          <div className="pt-1.5 border-t border-white/[0.07]">
            <div className="flex items-center gap-1.5 mb-1">
              <Layers className="w-3 h-3 text-white/40" />
              <span className="text-[9px] font-bold tracking-wider text-white/40">
                OPEN POSITIONS · {data.openPositions.length}
              </span>
            </div>
            {data.openPositions.length === 0 ? (
              <div className="text-[10px] text-white/40">Nothing open right now.</div>
            ) : (
              <div className="space-y-0.5">
                {data.openPositions.slice(0, 6).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10.5px]">
                    <span className="text-white/85 font-medium">{p.symbol}</span>
                    <span className="text-white/40">{p.side} · {p.engine}{p.mode ? ` · ${p.mode}` : ''}</span>
                    {p.unrealizedPnl != null && (
                      <span className={`ml-auto tabular-nums font-semibold ${p.unrealizedPnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        {p.unrealizedPnl >= 0 ? '+' : ''}${p.unrealizedPnl.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
                {data.openPositions.length > 6 && (
                  <div className="text-[9.5px] text-white/35">+{data.openPositions.length - 6} more — ask ABBA for the full list.</div>
                )}
              </div>
            )}
            {data.recentCloses.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {data.recentCloses.slice(0, 3).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-white/50">
                    <span>Closed: {c.symbol} {c.side} · {c.engine}</span>
                    {c.pnl != null && (
                      <span className={`ml-auto tabular-nums ${c.pnl >= 0 ? 'text-emerald-300/80' : 'text-red-300/80'}`}>
                        {c.pnl >= 0 ? '+' : ''}${c.pnl.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
          )}
        </div>
      )}
    </div>
  );
}
