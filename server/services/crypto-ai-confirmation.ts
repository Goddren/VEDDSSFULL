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

    const modelId = client.defaultModel || 'gpt-4o-mini';
    const baseRequest = {
      model: modelId,
      messages: [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: user },
      ],
      response_format: { type: 'json_object' as const },
      temperature: 0.3,
    };

    // Was a flat 400, then 700 -- neither was the real fix. Diagnostic
    // logging (added after 700 still failed) caught the actual shape live:
    // finish_reason=length, contentLength=0, content="" on openai/gpt-4o-mini
    // -- the ENTIRE token budget was consumed before any visible content was
    // produced at all. This model isn't flagged by this codebase's own
    // hasHiddenReasoningOverhead() heuristic (only matches actual reasoning
    // models + gpt-oss/qwen3 by name), so whatever provider/routing is behind
    // this specific call for this account is consuming hidden tokens this
    // heuristic doesn't know about. Rather than pick a bigger static number
    // and hope, detect this EXACT failure shape and retry once with a much
    // larger budget before falling through to the salvage parser.
    let r = await client.chat.completions.create({ ...baseRequest, max_tokens: 700 });
    let content = r.choices?.[0]?.message?.content || '';
    if (!content && r.choices?.[0]?.finish_reason === 'length') {
      console.warn(`[crypto-ai-confirmation] ${opts.symbol}: 700-token budget produced zero content (finish_reason=length) on ${modelId} -- retrying once at 2500.`);
      r = await client.chat.completions.create({ ...baseRequest, max_tokens: 2500 });
      content = r.choices?.[0]?.message?.content || '';
    }
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      try {
        if (!m) throw new Error('no braces found');
        parsed = JSON.parse(m[0]);
      } catch {
        // Diagnostic only. Measured 2026-09-27: raising max_tokens 400->700
        // did NOT stop this -- a failure landed at content position 95, far
        // under even the OLD 400-token (~1600 char) budget, so token-limit
        // exhaustion is not the (whole) cause for at least some of these.
        // finish_reason distinguishes "cut off by the token limit" (length)
        // from "the model considered itself done but produced malformed JSON
        // anyway" (stop) -- two different problems needing different fixes.
        // Logged so the next occurrence gives facts instead of another guess.
        console.warn(
          `[crypto-ai-confirmation] ${opts.symbol}: primary JSON parse failed. ` +
          `finish_reason=${r.choices?.[0]?.finish_reason ?? 'unknown'} model=${client.defaultModel ?? 'unknown'} ` +
          `contentLength=${content.length} content=${JSON.stringify(content)}`
        );
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
