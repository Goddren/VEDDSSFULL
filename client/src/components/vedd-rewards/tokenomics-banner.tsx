import { Link } from 'wouter';
import { Coins, TrendingUp, ChevronRight, ExternalLink, Zap } from 'lucide-react';
import { SiSolana } from 'react-icons/si';

/**
 * Compact tokenomics treasury banner — drop this into any service page
 * to show users how that service connects to VEDD token rewards.
 *
 * Props:
 *  - rewards: list of { label, amount, color? } to display for THIS service
 *  - highlight: optional one-liner shown in the coloured band (e.g. "Earn 50 VEDD per item scan")
 *  - variant: 'compact' (single-row strip) | 'card' (small card, default)
 */

interface RewardRow {
  label: string;
  amount: string;
  color?: string; // tailwind text colour class, defaults to text-amber-400
}

interface TokenomicsBannerProps {
  rewards: RewardRow[];
  highlight?: string;
  variant?: 'compact' | 'card';
}

const SUPPLY = '1,000,000,000';
const TICKER = 'VEDD';
const NETWORK = 'Solana (pump.fun)';
const REWARDS_POOL = '50M VEDD (5%)';

export function TokenomicsBanner({ rewards, highlight, variant = 'card' }: TokenomicsBannerProps) {
  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-2xl mb-4"
        style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.07) 0%,rgba(16,185,129,0.05) 100%)', border: '1px solid rgba(245,158,11,0.18)' }}>
        <div className="flex items-center gap-1.5 shrink-0">
          <SiSolana className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-[11px] font-bold text-amber-400">{TICKER}</span>
          <span className="text-[10px] text-gray-500">{NETWORK}</span>
        </div>
        <div className="h-3 w-px bg-white/10 hidden sm:block" />
        {rewards.map((r, i) => (
          <span key={i} className="flex items-center gap-1 text-[11px]">
            <Coins className="h-3 w-3 text-amber-400" />
            <span className={r.color ?? 'text-amber-300'}>{r.amount}</span>
            <span className="text-gray-500">{r.label}</span>
          </span>
        ))}
        <div className="ml-auto">
          <Link href="/vedd-tokenomics">
            <span className="text-[10px] text-amber-400/70 hover:text-amber-400 flex items-center gap-0.5 cursor-pointer">
              Tokenomics <ChevronRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
      </div>
    );
  }

  // card variant
  return (
    <div className="rounded-2xl overflow-hidden mb-5"
      style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.06) 0%,rgba(16,185,129,0.04) 50%,rgba(139,92,246,0.06) 100%)', border: '1px solid rgba(245,158,11,0.15)' }}>
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(245,158,11,0.05)' }}>
        <div className="flex items-center gap-2.5">
          <div className="icon-box-sm" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <Coins className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">VEDD Token Treasury</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <SiSolana className="h-2.5 w-2.5 text-purple-400" />
              <span className="text-[10px] text-gray-500">{NETWORK} · {SUPPLY} supply · Rewards pool: {REWARDS_POOL}</span>
            </div>
          </div>
        </div>
        <Link href="/vedd-tokenomics">
          <button className="flex items-center gap-1 text-[11px] text-amber-400/80 hover:text-amber-400 bg-amber-500/08 hover:bg-amber-500/12 border border-amber-500/20 rounded-xl px-2.5 py-1.5 transition-all">
            Full Tokenomics <ExternalLink className="h-2.5 w-2.5" />
          </button>
        </Link>
      </div>

      {/* Highlight band */}
      {highlight && (
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(16,185,129,0.05)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Zap className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <p className="text-emerald-300 text-xs font-medium">{highlight}</p>
        </div>
      )}

      {/* Reward rows */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Earn VEDD on this page</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {rewards.map((r, i) => (
            <div key={i} className="flex items-center gap-2 bg-white/[0.02] rounded-xl px-3 py-2 border border-white/05">
              <Coins className="h-3 w-3 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className={`text-xs font-bold leading-none ${r.color ?? 'text-amber-400'}`}>{r.amount}</p>
                <p className="text-[10px] text-gray-500 truncate mt-0.5">{r.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 pb-3">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-emerald-400" />
          <span className="text-[10px] text-gray-500">Tokens sent to your Phantom wallet after admin verification</span>
        </div>
        <Link href="/vedd-wallet">
          <span className="text-[10px] text-amber-400/70 hover:text-amber-400 flex items-center gap-0.5 cursor-pointer shrink-0">
            My Wallet <ChevronRight className="h-3 w-3" />
          </span>
        </Link>
      </div>
    </div>
  );
}
