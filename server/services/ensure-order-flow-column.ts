// Idempotent boot-time migration adding the Options Engine's order-flow
// strategy lookback column. Same ADD COLUMN IF NOT EXISTS pattern used by
// every other ensure-*.ts file this session — the synchronous
// `db:push --force` step in server/index.ts didn't reliably pick up this
// brand-new column, so it's added explicitly here instead.

import { pool } from '../db';

const DDL = `
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "order_flow_lookback_bars" integer NOT NULL DEFAULT 30;
`;

export async function ensureOrderFlowColumn(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Options Engine order-flow column ensured (options_engine_configs.order_flow_lookback_bars).');
  } catch (err: any) {
    console.error('[startup] ensureOrderFlowColumn failed (non-fatal):', err?.message ?? err);
  }
}
