/**
 * Per-account TradeLocker risk-sizing settings.
 *
 * Stored in a JSON sidecar (data/tl_risk_settings.json) keyed by connection id —
 * same pattern as kalshi_credentials.json / polymarket_keys.json, so no DB
 * migration is required. When useRiskPercent is on for an account, the live
 * engine sizes that account's lot from its own balance and the trade's stop
 * distance instead of copying the MT5/reference lot.
 */

import * as fs from 'fs';
import * as path from 'path';

const FILE = path.join(process.cwd(), 'data', 'tl_risk_settings.json');

export interface TLRiskSetting {
  useRiskPercent: boolean; // size by % risk instead of copying the source lot
  riskPercent: number;     // % of account balance to risk per trade (e.g. 1 = 1%)
}

const DEFAULT: TLRiskSetting = { useRiskPercent: false, riskPercent: 1.0 };

function loadAll(): Record<string, TLRiskSetting> {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch { /* ignore */ }
  return {};
}

function saveAll(map: Record<string, TLRiskSetting>): void {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
  } catch { /* ignore */ }
}

export function getTLRisk(connectionId: number): TLRiskSetting {
  const s = loadAll()[String(connectionId)];
  return s ? { ...DEFAULT, ...s } : { ...DEFAULT };
}

export function getAllTLRisk(): Record<string, TLRiskSetting> {
  return loadAll();
}

export function setTLRisk(connectionId: number, patch: Partial<TLRiskSetting>): TLRiskSetting {
  const map = loadAll();
  const cur = map[String(connectionId)] ?? { ...DEFAULT };
  const next: TLRiskSetting = {
    useRiskPercent: patch.useRiskPercent !== undefined ? !!patch.useRiskPercent : cur.useRiskPercent,
    riskPercent:
      patch.riskPercent !== undefined && !isNaN(patch.riskPercent)
        ? Math.max(0.05, Math.min(20, patch.riskPercent)) // clamp 0.05%–20%
        : cur.riskPercent,
  };
  map[String(connectionId)] = next;
  saveAll(map);
  return next;
}

export function deleteTLRisk(connectionId: number): void {
  const map = loadAll();
  delete map[String(connectionId)];
  saveAll(map);
}
