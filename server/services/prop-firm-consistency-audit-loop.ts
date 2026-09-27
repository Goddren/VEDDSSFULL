// Background "consistency audit agent" — periodically re-checks every
// prop-firm-tagged account's consistency ratio (from the durable ledger,
// immune to restarts) and caches the live result in memory so the
// account-detail Consistency Monitor widget reads instantly instead of
// recomputing on every poll. Gate 0f (server/routes.ts, order-placement time)
// remains the authoritative real-time check for whether a trade is allowed —
// this loop is the "live feed" layer: it surfaces warnings/breaches to the
// console and keeps a fast-read cache the UI and other code can consult.
//
// Originally TradeLocker-only. DXtrade prop-firm accounts already get the
// real-time Gate check at trade time (live-trading-engine.ts), but had no
// ambient monitoring/alert layer here — a breach on a DXtrade account could
// only ever be discovered at the moment a trade was attempted, never ahead
// of it. Added so both platforms get the same standing visibility.
import { storage } from '../storage';
import { pool } from '../db';
import { getConsistencyStatus, ConsistencyResult } from './prop-firm-consistency';

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

function cache(): Record<string, ConsistencyResult & { checkedAt: string }> {
  (global as any).tlConsistencyStatus = (global as any).tlConsistencyStatus || {};
  return (global as any).tlConsistencyStatus;
}

async function auditTradeLocker(): Promise<void> {
  let connections: any[];
  try {
    connections = await storage.getAllPropFirmTradelockerConnections();
  } catch (e: any) {
    console.error('[Consistency Audit] Failed to load prop-firm TradeLocker connections:', e.message);
    return;
  }
  if (!connections.length) return;

  const store = cache();
  for (const conn of connections) {
    try {
      const result = await getConsistencyStatus(conn.id, 'tradelocker', conn.consistencyThresholdPct, conn.consistencyEnabled !== false);
      store[conn.id] = { ...result, checkedAt: new Date().toISOString() };
      if (!result.enabled) continue; // opted out — nothing to audit/log
      if (result.status === 'breached') {
        console.warn(`[Consistency Audit] ${conn.accountId} (${conn.propFirmName || 'prop firm'}) BREACHED: ${result.guidance}`);
      } else if (result.status === 'warning') {
        console.log(`[Consistency Audit] ${conn.accountId}: WARNING — ${result.guidance}`);
      }
    } catch (e: any) {
      console.error(`[Consistency Audit] Failed for TradeLocker connection ${conn.id}:`, e.message);
    }
  }
}

async function auditDxtrade(): Promise<void> {
  let connections: any[];
  try {
    const { rows } = await pool.query(
      `SELECT id, account_code, label, prop_firm_name, consistency_enabled, consistency_threshold_pct
         FROM dxtrade_connections WHERE is_prop_firm_account = true AND is_active = true`
    );
    connections = rows;
  } catch (e: any) {
    console.error('[Consistency Audit] Failed to load prop-firm DXtrade connections:', e.message);
    return;
  }
  if (!connections.length) return;

  const store = cache();
  for (const conn of connections) {
    try {
      const result = await getConsistencyStatus(conn.id, 'dxtrade', conn.consistency_threshold_pct, conn.consistency_enabled === true);
      store[`dx_${conn.id}`] = { ...result, checkedAt: new Date().toISOString() };
      if (!result.enabled) continue; // opted out (or no rule from this firm) — nothing to audit/log
      const label = conn.label || conn.account_code || `dxtrade #${conn.id}`;
      if (result.status === 'breached') {
        console.warn(`[Consistency Audit] ${label} (${conn.prop_firm_name || 'prop firm'}) BREACHED: ${result.guidance}`);
      } else if (result.status === 'warning') {
        console.log(`[Consistency Audit] ${label}: WARNING — ${result.guidance}`);
      }
    } catch (e: any) {
      console.error(`[Consistency Audit] Failed for DXtrade connection ${conn.id}:`, e.message);
    }
  }
}

async function auditOnce(): Promise<void> {
  await auditTradeLocker();
  await auditDxtrade();
}

export function startPropFirmConsistencyAuditLoop(): void {
  console.log(`[Consistency Audit] Background prop-firm consistency audit loop started (${POLL_INTERVAL_MS / 60000}min interval).`);
  setInterval(() => {
    auditOnce().catch(e => console.error('[Consistency Audit] Poll error:', e.message));
  }, POLL_INTERVAL_MS);
  setTimeout(() => {
    auditOnce().catch(e => console.error('[Consistency Audit] Initial poll error:', e.message));
  }, 20_000);
}
