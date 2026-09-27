// ─────────────────────────────────────────────────────────────────────────────
// Crypto-native AI second opinion for the Dual-Vote Consensus gate.
//
// WHY THIS EXISTS: the crypto engine used to reuse getAiVisionConfirmation() —
// the FX SS AI Engine's confirmation function — verbatim for crypto pairs, on
// the assumption that a text-serialized candle/indicator prompt "drops in
// cleanly" for any asset class. Measured 2026-09-27 against ~800 live crypto
// confirmations: quant strategy scores of 78-100 (CONFIRM) were paired with AI
// confidence of 25-35 and a "Confluence Grade D" verdict on nearly every one,
// with reasoning text built entirely around FX/ICT concepts — order blocks,
// liquidity sweeps, discount/premium zones, an "ICT macro window" tied to
// London/NY session timing. None of that describes a 24/7 perpetuals market,
// so the grader wasn't making a crypto-specific judgment; it was applying an
// FX pattern vocabulary to a chart that doesn't have those patterns and
// grading the absence as "weak" almost every time. Net effect: 0 real crypto
// trades over 24h+ despite the quant scanner finding plenty of 80+ setups.
//
// This function is the crypto-appropriate replacement: same underlying model
// selection/failover (getUniversalAIClientForUser, already proven in the
// existing lite fallback below in cryptocom-scanner.ts), but a prompt built
// around what actually matters for a perpetual — trend strength, momentum,
// volume/order-flow confirmation, recent structure — and explicitly told NOT
// to reach for FX-only concepts that don't apply here.
// ─────────────────────────────────────────────────────────────────────────────

import { coerceConfidence, noteConfidenceSample, getUniversalAIClientForUser } from '../openai';
import type { CandleData } from '../indicators';

export interface CryptoAiConfirmation {
  confirmed: boolean;
  aiDirection: 'BUY' | 'SELL' | 'NEUTRAL';
  aiConfidence: number;
  reasoning: string;
  modelUsed?: string;
  /** True when the provider call itself failed (budget/auth/rate-limit/network/
   *  unparseable JSON), distinct from the model genuinely reviewing and
   *  rejecting the setup. Same distinction fixed on the FX side 2026-09-23 —
   *  an outage must never be read as "the AI said skip". */
  aiError?: boolean;
  aiErrorStatus?: number | null;
}

export async function getCryptoAiConfirmation(opts: {
  userId: number;
  symbol: string;
  strategy: string;
  direction: 'BUY' | 'SELL';
  price: number;
  quantScore: number;
  quantReasoning: string;
  indicators: any;
  candles: CandleData[];
}): Promise<CryptoAiConfirmation> {
  try {
    const client: any = await getUniversalAIClientForUser(opts.userId);

    const recent = opts.candles.slice(-20);
    const candleSummary = recent
      .map((c) => {
        const tNum = Number(c.t);
        const t = Number.isFinite(tNum) && tNum > 0 ? new Date(tNum * 1000).toISOString().slice(11, 16) : '?';
        return `${t} O:${c.o} H:${c.h} L:${c.l} C:${c.c} V:${Math.round(c.v ?? 0)}`;
      })
      .join('\n');

    const ind = opts.indicators || {};
    const indicatorSummary = [
      `RSI: ${ind.rsi ?? 'n/a'}`,
      `ADX: ${ind.adx ?? 'n/a'}  +DI: ${ind.plusDI ?? 'n/a'}  -DI: ${ind.minusDI ?? 'n/a'}`,
      `MACD histogram: ${ind.macdHistogram ?? ind.macd?.histogram ?? 'n/a'}`,
      `Trend: ${ind.trend ?? 'n/a'}`,
      `Relative volume: ${ind.relativeVolume ?? 'n/a'}`,
      `Volume trend: ${ind.volumeTrend ?? 'n/a'}`,
    ].join('\n  ');

    const system =
      'You are a disciplined crypto perpetual futures trader giving a second, ' +
      'independent opinion on a signal a technical scanner already produced. ' +
      'Judge this on trend strength, momentum, volume/order-flow confirmation, ' +
      'and recent price structure. This is a 24/7 market with no session close ' +
      'or reopen -- do NOT reach for forex/ICT concepts like order blocks, ' +
      'liquidity sweeps, discount/premium zones, or session/macro-window timing; ' +
      'none of that describes how crypto perpetuals actually trade, and grading ' +
      'a setup down for lacking FX-specific structure it was never going to have ' +
      'is not a real assessment. Respond ONLY with JSON: ' +
      '{"confirmed": boolean, "direction": "BUY"|"SELL"|"NEUTRAL", "confidence": number (0-100), "reasoning": string}.';

    const user = `SYMBOL: ${opts.symbol}
PROPOSED: ${opts.direction} @ ${opts.price}
SCANNER STRATEGY: ${opts.strategy} (score ${opts.quantScore}/100)
SCANNER REASONING: ${opts.quantReasoning}

INDICATORS:
  ${indicatorSummary}

RECENT CANDLES (oldest to most recent):
${candleSummary}

Would you independently confirm this ${opts.direction} setup on its own merits as a crypto perpetual trade?`;

    const r = await client.chat.completions.create({
      model: client.defaultModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      // Was 400 -- measured live 2026-09-27: 4 of 7 calls came back with
      // "Unterminated string in JSON" at position ~110-150, i.e. the model
      // filled its confirmed/direction/confidence fields (which come first in
      // the requested shape) and got cut off mid-"reasoning" string before it
      // could close the JSON object. Raised for headroom; the salvage parse
      // below is the real fix -- it recovers the short fields even when
      // "reasoning" still gets cut off.
      max_tokens: 700,
      temperature: 0.3,
    });

    const content = r.choices?.[0]?.message?.content || '';
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      try {
        if (!m) throw new Error('no braces found');
        parsed = JSON.parse(m[0]);
      } catch {
        // Truncated mid-string (max_tokens cut the response off before the
        // model closed its own JSON). confirmed/direction/confidence are
        // short fixed-shape fields that normally arrive intact even when the
        // long free-text "reasoning" field gets cut off after them -- salvage
        // those three directly rather than discarding a usable verdict.
        const confirmedM = content.match(/"confirmed"\s*:\s*(true|false)/i);
        const directionM = content.match(/"direction"\s*:\s*"(BUY|SELL|NEUTRAL)"/i);
        const confidenceM = content.match(/"confidence"\s*:\s*(-?\d+(?:\.\d+)?)/i);
        // Reasoning's closing quote is what's missing, so its regex takes
        // everything after the opening quote to end-of-string as a best effort.
        const reasoningM = content.match(/"reasoning"\s*:\s*"([\s\S]*)$/i);
        if (!confirmedM && !directionM && !confidenceM) {
          throw new Error(`AI returned no parseable JSON (truncated, ${content.length} chars)`);
        }
        parsed = {
          confirmed: confirmedM ? confirmedM[1].toLowerCase() === 'true' : false,
          direction: directionM ? directionM[1].toUpperCase() : 'NEUTRAL',
          confidence: confidenceM ? Number(confidenceM[1]) : 0,
          reasoning: reasoningM
            ? reasoningM[1].replace(/\\"/g, '"').trim() + ' [reasoning cut off — response truncated]'
            : '[response truncated before reasoning was written]',
        };
      }
    }

    const confidence = coerceConfidence(parsed.confidence);
    noteConfidenceSample(confidence);
    const direction: 'BUY' | 'SELL' | 'NEUTRAL' = ['BUY', 'SELL', 'NEUTRAL'].includes(parsed.direction)
      ? parsed.direction
      : 'NEUTRAL';

    return {
      confirmed: !!parsed.confirmed,
      aiDirection: direction,
      aiConfidence: confidence,
      reasoning: String(parsed.reasoning || 'no reasoning returned'),
      modelUsed: client.defaultModel,
    };
  } catch (err: any) {
    const statusCode = err?.status || err?.statusCode || err?.response?.status;
    return {
      confirmed: false,
      aiDirection: 'NEUTRAL',
      aiConfidence: 0,
      reasoning: `Crypto AI confirmation error: ${err?.message ?? err}`,
      aiError: true,
      aiErrorStatus: typeof statusCode === 'number' ? statusCode : null,
    };
  }
}
