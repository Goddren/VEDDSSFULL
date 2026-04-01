/**
 * Confirmation Learning Service
 *
 * Reads the ai_confirmation_outcomes table and finds patterns in what
 * conditions led to winning trades vs losing trades. The results are
 * injected directly into the 2nd confirmation AI prompt so it self-calibrates
 * over time based on real trade history — not just static rules.
 *
 * What it learns:
 *  - Which confluence grades (A+/A/B/C) win most often
 *  - Which sessions (London/NY/Asian) are most profitable
 *  - Whether ICT macro alignment improves win rate
 *  - Which ADX ranges work best (trend strength sweet spot)
 *  - Which RSI zones at entry produce best outcomes
 *  - Whether SMC verdict CONFIRM actually improves accuracy
 *  - BUY vs SELL directional accuracy
 *  - Whether rejecting low-confidence signals was the right call
 *
 * Cache: 1 hour (recomputed hourly to pick up new closed trades)
 */

import { db } from '../db';
import { aiConfirmationOutcomes } from '../../shared/schema';
import { eq, and, gte, sql, inArray } from 'drizzle-orm';

const LEARNING_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const learningCache = new Map<number, { insights: string; ts: number }>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function winRate(wins: number, total: number): number {
  return total === 0 ? 0 : wins / total;
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function rateLabel(wr: number): string {
  if (wr >= 0.65) return '✅ STRONG';
  if (wr >= 0.52) return '🟡 MODERATE';
  return '🔴 WEAK';
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getLearnedInsights(userId: number, symbol?: string): Promise<string> {
  const cacheKey = userId;
  const cached = learningCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < LEARNING_CACHE_TTL) {
    return cached.insights;
  }

  try {
    // Pull last 200 completed outcomes (WIN/LOSS/BREAKEVEN only — skip PENDING)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // last 90 days
    const rows = await db
      .select()
      .from(aiConfirmationOutcomes)
      .where(
        and(
          eq(aiConfirmationOutcomes.userId, userId),
          gte(aiConfirmationOutcomes.confirmedAt, since),
          sql`${aiConfirmationOutcomes.tradeOutcome} IN ('WIN','LOSS','BREAKEVEN')`
        )
      )
      .limit(300);

    if (rows.length < 10) {
      // Not enough data yet — return encouragement note
      const pending = await db
        .select({ count: sql<number>`count(*)` })
        .from(aiConfirmationOutcomes)
        .where(
          and(
            eq(aiConfirmationOutcomes.userId, userId),
            eq(aiConfirmationOutcomes.tradeOutcome, 'PENDING')
          )
        );
      const pendingCount = pending[0]?.count || 0;
      return `\n📊 LEARNING SYSTEM: Building knowledge base (${rows.length} completed trades recorded, ${pendingCount} pending). After 10+ completed trades, personalized accuracy insights will appear here to guide your decisions.\n`;
    }

    const wins = rows.filter(r => r.tradeOutcome === 'WIN');
    const losses = rows.filter(r => r.tradeOutcome === 'LOSS');
    const total = rows.length;
    const overallWR = winRate(wins.length, total);

    const lines: string[] = [
      ``,
      `═══════════ LEARNED ACCURACY INSIGHTS (${total} confirmed trades) ═══════════`,
      `Overall confirmation win rate: ${pct(overallWR)} — ${rateLabel(overallWR)}`,
      ``,
    ];

    // ── Confluence grade performance ──────────────────────────────────────────
    const gradeGroups: Record<string, { wins: number; total: number }> = {};
    for (const r of rows) {
      if (!r.confluenceGrade) continue;
      if (!gradeGroups[r.confluenceGrade]) gradeGroups[r.confluenceGrade] = { wins: 0, total: 0 };
      gradeGroups[r.confluenceGrade].total++;
      if (r.tradeOutcome === 'WIN') gradeGroups[r.confluenceGrade].wins++;
    }
    const gradeOrder = ['A+', 'A', 'B', 'C', 'D'];
    const gradeLines = gradeOrder
      .filter(g => gradeGroups[g] && gradeGroups[g].total >= 3)
      .map(g => {
        const wr = winRate(gradeGroups[g].wins, gradeGroups[g].total);
        return `  Grade ${g}: ${pct(wr)} WR (${gradeGroups[g].total} trades) ${rateLabel(wr)}`;
      });
    if (gradeLines.length > 0) {
      lines.push('CONFLUENCE GRADE → WIN RATE (your historical data):');
      lines.push(...gradeLines);

      // Find minimum profitable grade
      const profitableGrades = gradeOrder.filter(g =>
        gradeGroups[g] && gradeGroups[g].total >= 3 &&
        winRate(gradeGroups[g].wins, gradeGroups[g].total) >= 0.52
      );
      const minGrade = profitableGrades[profitableGrades.length - 1];
      if (minGrade) {
        lines.push(`  ⭐ CALIBRATION: Your profitable confluence threshold is Grade ${minGrade} or better — be extra cautious below this.`);
      }
      lines.push('');
    }

    // ── Session performance ───────────────────────────────────────────────────
    const sessionGroups: Record<string, { wins: number; total: number }> = {};
    for (const r of rows) {
      if (!r.session) continue;
      if (!sessionGroups[r.session]) sessionGroups[r.session] = { wins: 0, total: 0 };
      sessionGroups[r.session].total++;
      if (r.tradeOutcome === 'WIN') sessionGroups[r.session].wins++;
    }
    const sessionLines = Object.entries(sessionGroups)
      .filter(([, g]) => g.total >= 3)
      .sort(([, a], [, b]) => winRate(b.wins, b.total) - winRate(a.wins, a.total))
      .map(([sess, g]) => {
        const wr = winRate(g.wins, g.total);
        return `  ${sess}: ${pct(wr)} WR (${g.total} trades) ${rateLabel(wr)}`;
      });
    if (sessionLines.length > 0) {
      lines.push('SESSION → WIN RATE:');
      lines.push(...sessionLines);
      const bestSess = Object.entries(sessionGroups)
        .filter(([, g]) => g.total >= 3)
        .sort(([, a], [, b]) => winRate(b.wins, b.total) - winRate(a.wins, a.total))[0];
      const worstSess = Object.entries(sessionGroups)
        .filter(([, g]) => g.total >= 3)
        .sort(([, a], [, b]) => winRate(a.wins, a.total) - winRate(b.wins, b.total))[0];
      if (bestSess) lines.push(`  ⭐ Best session: ${bestSess[0]} — prioritize ${bestSess[0]} setups`);
      if (worstSess && winRate(worstSess[1].wins, worstSess[1].total) < 0.45) {
        lines.push(`  ⚠ Worst session: ${worstSess[0]} (${pct(winRate(worstSess[1].wins, worstSess[1].total))}) — be very selective during ${worstSess[0]}`);
      }
      lines.push('');
    }

    // ── Direction performance ─────────────────────────────────────────────────
    const buyTrades = rows.filter(r => r.direction === 'BUY');
    const sellTrades = rows.filter(r => r.direction === 'SELL');
    const buyWR = winRate(buyTrades.filter(r => r.tradeOutcome === 'WIN').length, buyTrades.length);
    const sellWR = winRate(sellTrades.filter(r => r.tradeOutcome === 'WIN').length, sellTrades.length);
    if (buyTrades.length >= 5 && sellTrades.length >= 5) {
      lines.push('DIRECTION → WIN RATE:');
      lines.push(`  BUY:  ${pct(buyWR)} WR (${buyTrades.length} trades) ${rateLabel(buyWR)}`);
      lines.push(`  SELL: ${pct(sellWR)} WR (${sellTrades.length} trades) ${rateLabel(sellWR)}`);
      if (Math.abs(buyWR - sellWR) > 0.1) {
        const strongDir = buyWR > sellWR ? 'BUY' : 'SELL';
        const weakDir = buyWR > sellWR ? 'SELL' : 'BUY';
        lines.push(`  ⭐ CALIBRATION: ${strongDir} trades historically outperform ${weakDir} — apply higher confluence requirement for ${weakDir} signals`);
      }
      lines.push('');
    }

    // ── ICT macro alignment effect ────────────────────────────────────────────
    const ictAligned = rows.filter(r => r.ictMacroValid === true);
    const ictNotAligned = rows.filter(r => r.ictMacroValid === false);
    if (ictAligned.length >= 5 && ictNotAligned.length >= 5) {
      const ictAlignedWR = winRate(ictAligned.filter(r => r.tradeOutcome === 'WIN').length, ictAligned.length);
      const ictNotAlignedWR = winRate(ictNotAligned.filter(r => r.tradeOutcome === 'WIN').length, ictNotAligned.length);
      lines.push('ICT MACRO ALIGNMENT → WIN RATE:');
      lines.push(`  During ICT macro window:     ${pct(ictAlignedWR)} WR (${ictAligned.length} trades)`);
      lines.push(`  Outside ICT macro window:    ${pct(ictNotAlignedWR)} WR (${ictNotAligned.length} trades)`);
      if (ictAlignedWR > ictNotAlignedWR + 0.08) {
        lines.push(`  ⭐ CALIBRATION: ICT macro timing adds +${pct(ictAlignedWR - ictNotAlignedWR)} WR — strongly prefer ICT macro window entries`);
      }
      lines.push('');
    }

    // ── SMC verdict effect ────────────────────────────────────────────────────
    const smcConfirm = rows.filter(r => r.smcVerdict === 'CONFIRM');
    const smcPass = rows.filter(r => r.smcVerdict === 'PASS' || r.smcVerdict === 'REQUIRE_BETTER_PRICE');
    if (smcConfirm.length >= 5 && smcPass.length >= 5) {
      const smcConfirmWR = winRate(smcConfirm.filter(r => r.tradeOutcome === 'WIN').length, smcConfirm.length);
      const smcPassWR = winRate(smcPass.filter(r => r.tradeOutcome === 'WIN').length, smcPass.length);
      lines.push('SMC VERDICT → WIN RATE:');
      lines.push(`  SMC CONFIRM:  ${pct(smcConfirmWR)} WR (${smcConfirm.length} trades)`);
      lines.push(`  SMC PASS/RBP: ${pct(smcPassWR)} WR (${smcPass.length} trades)`);
      if (smcConfirmWR > smcPassWR + 0.08) {
        lines.push(`  ⭐ CALIBRATION: SMC CONFIRM status adds +${pct(smcConfirmWR - smcPassWR)} WR — require SMC CONFIRM for marginal setups`);
      }
      lines.push('');
    }

    // ── ADX range analysis ────────────────────────────────────────────────────
    const adxBuckets: Record<string, { wins: number; total: number }> = {
      'Weak (<20)': { wins: 0, total: 0 },
      'Moderate (20-29)': { wins: 0, total: 0 },
      'Strong (30-39)': { wins: 0, total: 0 },
      'Very Strong (40+)': { wins: 0, total: 0 },
    };
    for (const r of rows) {
      if (r.adxValue === null || r.adxValue === undefined) continue;
      const bucket =
        r.adxValue < 20 ? 'Weak (<20)' :
        r.adxValue < 30 ? 'Moderate (20-29)' :
        r.adxValue < 40 ? 'Strong (30-39)' : 'Very Strong (40+)';
      adxBuckets[bucket].total++;
      if (r.tradeOutcome === 'WIN') adxBuckets[bucket].wins++;
    }
    const adxLines = Object.entries(adxBuckets)
      .filter(([, g]) => g.total >= 3)
      .map(([range, g]) => {
        const wr = winRate(g.wins, g.total);
        return `  ADX ${range}: ${pct(wr)} WR (${g.total} trades) ${rateLabel(wr)}`;
      });
    if (adxLines.length >= 2) {
      lines.push('ADX STRENGTH → WIN RATE:');
      lines.push(...adxLines);
      // Find best ADX range
      const bestAdx = Object.entries(adxBuckets)
        .filter(([, g]) => g.total >= 3)
        .sort(([, a], [, b]) => winRate(b.wins, b.total) - winRate(a.wins, a.total))[0];
      if (bestAdx) lines.push(`  ⭐ CALIBRATION: Best results at ADX ${bestAdx[0]}`);
      lines.push('');
    }

    // ── Rejection quality check ───────────────────────────────────────────────
    const rejectedRows = rows.filter(r => r.aiDecision === 'REJECTED');
    if (rejectedRows.length >= 5) {
      // Rejections that would have been wins (missed opportunities)
      const missedWins = rejectedRows.filter(r => r.tradeOutcome === 'WIN').length;
      const avoidedLosses = rejectedRows.filter(r => r.tradeOutcome === 'LOSS').length;
      const rejectionAccuracy = avoidedLosses / Math.max(1, rejectedRows.length);
      lines.push(`REJECTION QUALITY (${rejectedRows.length} rejected signals):`);
      lines.push(`  Correctly avoided losses: ${avoidedLosses} (${pct(rejectionAccuracy)} of rejections were right)`);
      lines.push(`  Missed wins by rejecting: ${missedWins}`);
      if (rejectionAccuracy > 0.6) {
        lines.push(`  ✅ Your rejection filter is well-calibrated — trust the REJECT decisions`);
      } else if (rejectionAccuracy < 0.4) {
        lines.push(`  ⚠ Rejection filter too aggressive — you're missing good trades. Consider lowering the confidence threshold slightly.`);
      }
      lines.push('');
    }

    // ── Symbol-specific insight (if provided) ────────────────────────────────
    if (symbol) {
      const symRows = rows.filter(r => r.symbol.toUpperCase() === symbol.toUpperCase());
      if (symRows.length >= 5) {
        const symWins = symRows.filter(r => r.tradeOutcome === 'WIN').length;
        const symWR = winRate(symWins, symRows.length);
        lines.push(`${symbol} SPECIFIC (${symRows.length} trades): ${pct(symWR)} WR ${rateLabel(symWR)}`);
        if (symWR < 0.45) {
          lines.push(`  ⚠ ${symbol} is underperforming — apply STRICTER rules: require Grade A or better confluence`);
        } else if (symWR > 0.60) {
          lines.push(`  ✅ ${symbol} is performing well — system is well-calibrated for this pair`);
        }
        lines.push('');
      }
    }

    // Per-trade-source win rate analysis
    const sourceGroups: Record<string, { wins: number; total: number; pips: number }> = {};
    for (const row of rows) {
      const src = (row as any).tradeSource ?? 'ai_confirmation';
      if (!sourceGroups[src]) sourceGroups[src] = { wins: 0, total: 0, pips: 0 };
      sourceGroups[src].total++;
      if (row.tradeOutcome === 'WIN') sourceGroups[src].wins++;
      if (row.actualPips) sourceGroups[src].pips += row.actualPips;
    }
    const sourceLines: string[] = [];
    for (const [src, data] of Object.entries(sourceGroups)) {
      if (data.total >= 3) {
        const wr = Math.round((data.wins / data.total) * 100);
        const ap = Math.round(data.pips / data.total);
        const srcLabel = src === 'breakout' ? 'Breakout Trades' : src === 'ea_only' ? 'EA-Only Trades' : src === 'manual_mt5' ? 'Manual Trades' : 'AI-Confirmed Trades';
        sourceLines.push(`${srcLabel}: ${wr}% win rate (${data.total} trades, avg ${ap} pips)`);
      }
    }
    if (sourceLines.length > 0) {
      lines.push(`TRADE SOURCE PERFORMANCE:`);
      lines.push(...sourceLines);
      lines.push('');
    }

    lines.push(`CALIBRATION INSTRUCTION: Use these learned patterns as HARD evidence. If a condition`);
    lines.push(`has a weak historical win rate (🔴 WEAK), require significantly stronger evidence`);
    lines.push(`elsewhere before confirming. If a condition shows ✅ STRONG, weight it heavily`);
    lines.push(`in favor of confirmation. This data comes from YOUR actual trade history.`);
    lines.push(`═══════════════════════════════════════════════════════════`);

    const insights = lines.join('\n');
    learningCache.set(cacheKey, { insights, ts: Date.now() });
    return insights;

  } catch (err) {
    console.error('[ConfirmationLearning] Error computing insights:', err);
    return '';
  }
}

export function clearLearningCache(userId: number): void {
  learningCache.delete(userId);
}

export async function getWinningStrategyPatterns(userId: number): Promise<string> {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await db.select()
      .from(aiConfirmationOutcomes)
      .where(
        and(
          eq(aiConfirmationOutcomes.userId, userId),
          gte(aiConfirmationOutcomes.confirmedAt, ninetyDaysAgo),
          inArray(aiConfirmationOutcomes.tradeOutcome, ['WIN', 'LOSS', 'BREAKEVEN'])
        )
      )
      .limit(300);

    // Group by symbol + tradeSource + confluenceGrade + session
    const groups: Record<string, { wins: number; total: number; pips: number; symbol: string; source: string; grade: string; session: string }> = {};
    for (const row of rows) {
      const key = `${row.symbol}|${(row as any).tradeSource ?? 'ai_confirmation'}|${row.confluenceGrade ?? 'N/A'}|${row.session ?? 'Unknown'}`;
      if (!groups[key]) groups[key] = { wins: 0, total: 0, pips: 0, symbol: row.symbol, source: (row as any).tradeSource ?? 'ai_confirmation', grade: row.confluenceGrade ?? 'N/A', session: row.session ?? 'Unknown' };
      groups[key].total++;
      if (row.tradeOutcome === 'WIN') groups[key].wins++;
      if (row.actualPips) groups[key].pips += row.actualPips;
    }

    const patterns = Object.values(groups)
      .filter(g => g.total >= 3 && (g.wins / g.total) >= 0.6) // 60%+ win rate, min 3 trades
      .sort((a, b) => (b.wins / b.total) - (a.wins / a.total))
      .slice(0, 5);

    if (patterns.length === 0) return 'No significant winning patterns identified yet (need 3+ trades per pattern).';

    return patterns.map(p => {
      const wr = Math.round((p.wins / p.total) * 100);
      const ap = Math.round(p.pips / p.total);
      return `• ${p.symbol} Grade ${p.grade} during ${p.session} (${p.source}): ${wr}% win rate across ${p.total} trades, avg ${ap} pips`;
    }).join('\n');
  } catch (err) {
    return 'Pattern analysis unavailable.';
  }
}
