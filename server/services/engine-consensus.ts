// Shared durable Dual-Vote Consensus feed for the Options and Crypto.com
// engines (see server/services/ensure-engine-consensus-table.ts). Each
// engine's own scanner still keeps its in-memory global.*EngineConsensus
// cache for same-process fast reads, but now also mirrors every decision
// here so a restart doesn't blank the panel until the next scan cycle.

import { pool } from '../db';

export interface ConsensusLogEntry {
  symbol: string;
  strategy: string;
  quantVerdict: string;
  quantScore: number;
  aiVerdict: string;
  aiConfidence: number;
  aiReasoning: string;
  consensus: string;
  tradeAllowed: boolean;
}

/** Upsert the latest consensus decision for one symbol. Non-fatal on failure. */
export async function recordEngineConsensus(userId: number, engine: 'options' | 'cryptocom', entry: ConsensusLogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO engine_consensus_log
         (user_id, engine, symbol, strategy, quant_verdict, quant_score, ai_verdict, ai_confidence, ai_reasoning, consensus, trade_allowed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (user_id, engine, symbol) DO UPDATE SET
         strategy = $4, quant_verdict = $5, quant_score = $6, ai_verdict = $7,
         ai_confidence = $8, ai_reasoning = $9, consensus = $10, trade_allowed = $11, updated_at = now()`,
      [userId, engine, entry.symbol, entry.strategy, entry.quantVerdict, entry.quantScore,
       entry.aiVerdict, entry.aiConfidence, entry.aiReasoning, entry.consensus, entry.tradeAllowed]
    );
  } catch (err: any) {
    console.error(`[engine-consensus] Failed to record consensus for ${engine}/${entry.symbol} (non-fatal):`, err?.message ?? err);
  }
}

/** Most-recent decision per symbol, newest first — durable fallback for the in-memory cache. */
export async function getEngineConsensusForUser(userId: number, engine: 'options' | 'cryptocom'): Promise<Array<ConsensusLogEntry & { timestamp: string }>> {
  try {
    const { rows } = await pool.query(
      `SELECT symbol, strategy, quant_verdict, quant_score, ai_verdict, ai_confidence, ai_reasoning, consensus, trade_allowed, updated_at
       FROM engine_consensus_log WHERE user_id = $1 AND engine = $2 ORDER BY updated_at DESC LIMIT 20`,
      [userId, engine]
    );
    return rows.map((r: any) => ({
      symbol: r.symbol, strategy: r.strategy, quantVerdict: r.quant_verdict, quantScore: r.quant_score,
      aiVerdict: r.ai_verdict, aiConfidence: r.ai_confidence, aiReasoning: r.ai_reasoning,
      consensus: r.consensus, tradeAllowed: r.trade_allowed, timestamp: new Date(r.updated_at).toISOString(),
    }));
  } catch (err: any) {
    console.error(`[engine-consensus] Failed to read consensus for ${engine} (non-fatal):`, err?.message ?? err);
    return [];
  }
}
