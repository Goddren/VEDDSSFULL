// Idempotent boot-time migration adding the columns needed for real copy-trade
// execution and for paper-mode copying to actually mirror into the copier's
// own fx_paper_trades account. Same ADD COLUMN IF NOT EXISTS pattern used by
// every other ensure-*.ts file this session.

import { pool } from '../db';

const DDL = `
ALTER TABLE "copy_relationships" ADD COLUMN IF NOT EXISTS "copier_connection_id" integer;
ALTER TABLE "copy_trade_logs" ADD COLUMN IF NOT EXISTS "copier_fx_trade_id" integer;
ALTER TABLE "copy_trade_logs" ADD COLUMN IF NOT EXISTS "broker_order_id" text;
ALTER TABLE "copy_trade_logs" ADD COLUMN IF NOT EXISTS "execution_status" text DEFAULT 'pending';
ALTER TABLE "copy_trade_logs" ADD COLUMN IF NOT EXISTS "execution_error" text;
`;

export async function ensureCopyTradingExecutionColumns(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Copy trading execution columns ensured (copier_connection_id, copier_fx_trade_id, broker_order_id, execution_status, execution_error).');
  } catch (err: any) {
    console.error('[startup] ensureCopyTradingExecutionColumns failed (non-fatal):', err?.message ?? err);
  }
}
