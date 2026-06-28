import React, { useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface VolumeProfileLevel {
  price: number;
  volume: number; // relative 0-100
  type?: 'hvn' | 'lvn' | 'poc' | 'normal';
}

export interface VolumeProfileData {
  poc: number;         // Point of Control price
  vah: number;         // Value Area High
  val: number;         // Value Area Low
  currentPrice?: number;
  levels: VolumeProfileLevel[];
  hvnLevels?: number[]; // High Volume Node prices
  lvnLevels?: number[]; // Low Volume Node prices
  valueAreaVolumePct?: number; // typically 70
}

interface VolumeProfileChartProps {
  data: VolumeProfileData;
  symbol: string;
}

const fmt = (n: number) => n >= 1000 ? n.toFixed(2) : n >= 100 ? n.toFixed(3) : n >= 10 ? n.toFixed(4) : n.toFixed(5);

export function VolumeProfileChart({ data, symbol }: VolumeProfileChartProps) {
  const { poc, vah, val, currentPrice, levels, hvnLevels = [], lvnLevels = [] } = data;

  const sorted = useMemo(() =>
    [...levels].sort((a, b) => b.price - a.price),
    [levels]
  );

  const maxVol = useMemo(() => Math.max(...sorted.map(l => l.volume), 1), [sorted]);

  const priceAbovePOC = currentPrice ? currentPrice > poc : null;

  return (
    <div className="bg-[#0A0A0A] rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#1E1E1E] rounded-lg flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-[#E64A4A]" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Volume Profile</h4>
            <p className="text-[10px] text-gray-500">Price-level liquidity map · {symbol}</p>
          </div>
        </div>
        {currentPrice && (
          <div className="flex items-center gap-1.5 text-xs">
            {priceAbovePOC
              ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
            <span className={priceAbovePOC ? 'text-emerald-400' : 'text-red-400'}>
              {priceAbovePOC ? 'Above POC' : 'Below POC'}
            </span>
          </div>
        )}
      </div>

      {/* Key levels row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'VAH', value: vah, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', desc: 'Value Area High' },
          { label: 'POC', value: poc, color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',   desc: 'Point of Control' },
          { label: 'VAL', value: val, color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',        desc: 'Value Area Low' },
        ].map(k => (
          <div key={k.label} className={`rounded-lg p-3 border ${k.bg} text-center`}>
            <p className="text-[10px] text-gray-500 mb-0.5">{k.label}</p>
            <p className={`text-sm font-bold font-mono ${k.color}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmt(k.value)}
            </p>
            <p className="text-[9px] text-gray-600 mt-0.5">{k.desc}</p>
          </div>
        ))}
      </div>

      {/* Profile bars */}
      <div className="space-y-[2px] max-h-72 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
        {sorted.map((level, i) => {
          const isVah = Math.abs(level.price - vah) / (vah || 1) < 0.001;
          const isPoc = Math.abs(level.price - poc) / (poc || 1) < 0.001;
          const isVal = Math.abs(level.price - val) / (val || 1) < 0.001;
          const isCurrent = currentPrice && Math.abs(level.price - currentPrice) / (currentPrice || 1) < 0.002;
          const isHvn = hvnLevels.some(h => Math.abs(h - level.price) / (h || 1) < 0.001);
          const isLvn = lvnLevels.some(h => Math.abs(h - level.price) / (h || 1) < 0.001);
          const barPct = (level.volume / maxVol) * 100;

          let barColor = 'bg-blue-500/40';
          if (isPoc) barColor = 'bg-amber-400';
          else if (isHvn) barColor = 'bg-emerald-500/60';
          else if (isLvn) barColor = 'bg-slate-600/50';
          else if (level.price >= val && level.price <= vah) barColor = 'bg-blue-500/55';

          return (
            <div key={i} className="flex items-center gap-2 group">
              {/* Price label */}
              <span className={`text-[10px] font-mono w-16 shrink-0 text-right ${
                isPoc ? 'text-amber-400 font-bold' : isVah ? 'text-emerald-400' : isVal ? 'text-red-400' : isCurrent ? 'text-white' : 'text-gray-600'
              }`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(level.price)}
              </span>

              {/* Bar */}
              <div className="flex-1 h-3.5 bg-[#1A1A1A] rounded-sm overflow-hidden relative">
                <div
                  className={`h-full rounded-sm transition-all ${barColor}`}
                  style={{ width: `${barPct}%` }}
                />
                {isCurrent && (
                  <div className="absolute inset-y-0 right-0 w-px bg-white/60" />
                )}
              </div>

              {/* Tags */}
              <div className="w-12 shrink-0 flex gap-1">
                {isPoc && <span className="text-[9px] bg-amber-500/20 text-amber-400 rounded px-1">POC</span>}
                {isVah && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 rounded px-1">VAH</span>}
                {isVal && <span className="text-[9px] bg-red-500/20 text-red-400 rounded px-1">VAL</span>}
                {isHvn && !isPoc && <span className="text-[9px] bg-blue-500/20 text-blue-400 rounded px-1">HVN</span>}
                {isLvn && <span className="text-[9px] bg-slate-500/20 text-slate-400 rounded px-1">LVN</span>}
                {isCurrent && <span className="text-[9px] bg-white/10 text-white rounded px-1">↑</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-[#1E1E1E]">
        {[
          { color: 'bg-amber-400', label: 'POC — highest traded price' },
          { color: 'bg-emerald-500/60', label: 'HVN — strong support/resistance' },
          { color: 'bg-blue-500/55', label: 'Value Area (70% of volume)' },
          { color: 'bg-slate-600/50', label: 'LVN — fast price movement zone' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm shrink-0 ${l.color}`} />
            <span className="text-[10px] text-gray-500">{l.label}</span>
          </div>
        ))}
      </div>

      {/* HVN/LVN callout */}
      {(hvnLevels.length > 0 || lvnLevels.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {hvnLevels.length > 0 && (
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3">
              <p className="text-[10px] text-emerald-400 font-semibold mb-1">Support / Resistance (HVN)</p>
              {hvnLevels.map(h => (
                <p key={h} className="text-xs font-mono text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(h)}</p>
              ))}
            </div>
          )}
          {lvnLevels.length > 0 && (
            <div className="bg-slate-500/5 border border-slate-500/15 rounded-lg p-3">
              <p className="text-[10px] text-slate-400 font-semibold mb-1">Thin Air Zones (LVN)</p>
              {lvnLevels.map(h => (
                <p key={h} className="text-xs font-mono text-gray-400" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(h)}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VolumeProfileChart;
