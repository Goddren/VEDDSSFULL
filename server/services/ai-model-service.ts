import OpenAI from "openai";

export interface AIModelProvider {
  id: string;
  name: string;
  provider: string;
  model: string;
  strengths: string[];
  bestFor: string[];
}

export const AVAILABLE_TRADING_MODELS: AIModelProvider[] = [
  {
    id: 'openai-gpt4o',
    name: 'GPT-4o',
    provider: 'openai',
    model: 'gpt-4o',
    strengths: ['Fast reasoning', 'Strong at JSON output', 'Good pattern recognition'],
    bestFor: ['scalping', 'momentum', 'session_breakout', 'sniper', 'compound'],
  },
  {
    id: 'openai-gpt4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    strengths: ['Very fast', 'Cost efficient', 'Good for quick decisions'],
    bestFor: ['scalping', 'momentum'],
  },
  {
    id: 'anthropic-claude-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    strengths: ['Deep analytical reasoning', 'Risk assessment', 'Pattern complexity'],
    bestFor: ['sniper', 'momentum', 'session_breakout'],
  },
  {
    id: 'anthropic-claude-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    strengths: ['Fast response', 'Concise analysis', 'Cost efficient'],
    bestFor: ['scalping', 'compound'],
  },
  {
    id: 'google-gemini-pro',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    model: 'gemini-2.0-flash',
    strengths: ['Multi-modal analysis', 'Strong at data synthesis', 'Good at numerical reasoning'],
    bestFor: ['session_breakout', 'momentum', 'sniper'],
  },
  {
    id: 'groq-llama',
    name: 'LLaMA 3.3 70B (Groq)',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    strengths: ['Extremely fast inference', 'Good for rapid decisions'],
    bestFor: ['scalping', 'compound'],
  },
  {
    id: 'mistral-large',
    name: 'Mistral Large',
    provider: 'mistral',
    model: 'mistral-large-latest',
    strengths: ['Strong reasoning', 'Good at financial analysis'],
    bestFor: ['sniper', 'momentum'],
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    model: 'deepseek-chat',
    strengths: ['Strong analytical capability', 'Cost-effective', 'Good at complex reasoning'],
    bestFor: ['sniper', 'momentum', 'session_breakout'],
  },
];

export type RoutingMode = 'single' | 'ensemble' | 'fallback' | 'strategy_split';

export interface ModelRoutingConfig {
  mode: RoutingMode;
  primaryModelId: string;
  ensembleModelIds: string[];
  strategyAssignments: Record<string, string>;
  fallbackOrder: string[];
  ensembleMinAgreement: number;
  enabled: boolean;
}

export const DEFAULT_ROUTING_CONFIG: ModelRoutingConfig = {
  mode: 'single',
  primaryModelId: 'openai-gpt4o',
  ensembleModelIds: [],
  strategyAssignments: {},
  fallbackOrder: ['openai-gpt4o', 'openai-gpt4o-mini'],
  ensembleMinAgreement: 60,
  enabled: true,
};

export interface TradeDecisionFromModel {
  action: string;
  strategy: string;
  symbol: string;
  direction: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  confidence: number;
  reason: string;
  confluences: string[];
  holdTime: string;
  urgency: string;
  modelId: string;
  modelName: string;
}

export interface EnsembleResult {
  decisions: TradeDecisionFromModel[];
  consensusDecisions: TradeDecisionFromModel[];
  modelVotes: Record<string, { action: string; direction: string; confidence: number; modelName: string }>;
  agreementPercent: number;
  mode: RoutingMode;
}

async function callProvider(
  provider: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string | null,
  openaiInstance?: any
): Promise<string> {
  switch (provider) {
    case 'openai': {
      const client = openaiInstance || new OpenAI({ apiKey: apiKey || undefined });
      const supportsJson = model.startsWith('gpt');
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        ...(supportsJson ? { response_format: { type: 'json_object' } } : {}),
        max_tokens: 4000,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content || '';
    }

    case 'anthropic': {
      if (!apiKey) throw new Error('Anthropic API key required');
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model,
        max_tokens: 4000,
        system: systemPrompt + ' Always return valid JSON with no markdown formatting.',
        messages: [{ role: 'user', content: userPrompt }],
      });
      const block = response.content[0];
      return block.type === 'text' ? block.text : '';
    }

    case 'google': {
      if (!apiKey) throw new Error('Google AI API key required');
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model,
        systemInstruction: systemPrompt,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4000 },
      });
      const result = await genModel.generateContent(userPrompt);
      return result.response.text();
    }

    case 'groq': {
      if (!apiKey) throw new Error('Groq API key required');
      const Groq = (await import('groq-sdk')).default;
      const client = new Groq({ apiKey });
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content || '';
    }

    case 'mistral': {
      if (!apiKey) throw new Error('Mistral API key required');
      const { Mistral } = await import('@mistralai/mistralai');
      const client = new Mistral({ apiKey });
      const response = await client.chat.complete({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        responseFormat: { type: 'json_object' },
        maxTokens: 4000,
        temperature: 0.3,
      });
      const choice = response.choices?.[0];
      return typeof choice?.message?.content === 'string' ? choice.message.content : '';
    }

    case 'deepseek': {
      if (!apiKey) throw new Error('DeepSeek API key required');
      const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content || '';
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

function parseTradeResponse(content: string): any {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function buildEnsembleConsensus(
  allDecisions: TradeDecisionFromModel[][],
  minAgreementPercent: number
): TradeDecisionFromModel[] {
  const symbolVotes: Record<string, {
    directions: Record<string, number>;
    actions: Record<string, number>;
    decisions: TradeDecisionFromModel[];
    totalModels: number;
  }> = {};

  for (const modelDecisions of allDecisions) {
    for (const decision of modelDecisions) {
      const key = decision.symbol;
      if (!symbolVotes[key]) {
        symbolVotes[key] = { directions: {}, actions: {}, decisions: [], totalModels: allDecisions.length };
      }
      const dir = decision.direction?.toUpperCase() || 'NONE';
      const act = decision.action?.toUpperCase() || 'NO_ACTION';
      symbolVotes[key].directions[dir] = (symbolVotes[key].directions[dir] || 0) + 1;
      symbolVotes[key].actions[act] = (symbolVotes[key].actions[act] || 0) + 1;
      symbolVotes[key].decisions.push(decision);
    }
  }

  const consensusDecisions: TradeDecisionFromModel[] = [];

  for (const [symbol, votes] of Object.entries(symbolVotes)) {
    const totalModels = votes.totalModels;

    const topDirection = Object.entries(votes.directions).sort((a, b) => b[1] - a[1])[0];
    const topAction = Object.entries(votes.actions).sort((a, b) => b[1] - a[1])[0];

    if (!topDirection || !topAction) continue;

    const agreementPercent = (topDirection[1] / totalModels) * 100;

    if (agreementPercent < minAgreementPercent) {
      console.log(`[Ensemble] ${symbol}: No consensus (${agreementPercent}% < ${minAgreementPercent}% threshold) - ${JSON.stringify(votes.directions)}`);
      continue;
    }

    const agreedDecisions = votes.decisions.filter(
      d => d.direction?.toUpperCase() === topDirection[0] && d.action?.toUpperCase() === topAction[0]
    );

    if (agreedDecisions.length === 0) continue;

    const avgConfidence = Math.round(agreedDecisions.reduce((sum, d) => sum + (d.confidence || 0), 0) / agreedDecisions.length);
    const bestDecision = agreedDecisions.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];

    consensusDecisions.push({
      ...bestDecision,
      confidence: avgConfidence,
      reason: `[ENSEMBLE CONSENSUS ${agreementPercent.toFixed(0)}%] ${agreedDecisions.length}/${totalModels} models agree. ${bestDecision.reason}`,
      modelName: `Ensemble (${agreedDecisions.map(d => d.modelName).join(', ')})`,
      modelId: 'ensemble',
    });
  }

  return consensusDecisions;
}

export async function runMultiModelAnalysis(
  userId: number,
  systemPrompt: string,
  userPrompt: string,
  routingConfig: ModelRoutingConfig,
  openaiInstance?: any,
): Promise<EnsembleResult> {
  const { storage } = await import('../storage');

  async function getApiKeyForModel(modelDef: AIModelProvider): Promise<string | null> {
    if (modelDef.provider === 'openai') return null;
    try {
      const userKey = await storage.getActiveUserApiKey(userId, modelDef.provider);
      return userKey?.apiKey || null;
    } catch {
      return null;
    }
  }

  async function callModel(modelId: string): Promise<TradeDecisionFromModel[]> {
    const modelDef = AVAILABLE_TRADING_MODELS.find(m => m.id === modelId);
    if (!modelDef) throw new Error(`Unknown model: ${modelId}`);

    const apiKey = await getApiKeyForModel(modelDef);
    if (modelDef.provider !== 'openai' && !apiKey) {
      throw new Error(`No API key for ${modelDef.provider}. Add your ${modelDef.name} API key in settings.`);
    }

    console.log(`[Multi-Model] Calling ${modelDef.name} (${modelDef.provider}/${modelDef.model})...`);
    const startTime = Date.now();

    const content = await callProvider(
      modelDef.provider,
      modelDef.model,
      systemPrompt,
      userPrompt,
      apiKey,
      modelDef.provider === 'openai' ? openaiInstance : undefined
    );

    const elapsed = Date.now() - startTime;
    console.log(`[Multi-Model] ${modelDef.name} responded in ${elapsed}ms`);

    const parsed = parseTradeResponse(content);
    if (!parsed) throw new Error(`Failed to parse JSON from ${modelDef.name}`);

    const decisions = parsed.decisions || parsed.trades || [];
    return decisions.map((d: any) => ({
      ...d,
      modelId: modelDef.id,
      modelName: modelDef.name,
    }));
  }

  const result: EnsembleResult = {
    decisions: [],
    consensusDecisions: [],
    modelVotes: {},
    agreementPercent: 100,
    mode: routingConfig.mode,
  };

  try {
    switch (routingConfig.mode) {
      case 'single': {
        const decisions = await callModel(routingConfig.primaryModelId);
        result.decisions = decisions;
        result.consensusDecisions = decisions;
        break;
      }

      case 'fallback': {
        const order = routingConfig.fallbackOrder.length > 0
          ? routingConfig.fallbackOrder
          : [routingConfig.primaryModelId, 'openai-gpt4o-mini'];

        for (const modelId of order) {
          try {
            const decisions = await callModel(modelId);
            result.decisions = decisions;
            result.consensusDecisions = decisions;
            console.log(`[Multi-Model] Fallback: ${modelId} succeeded`);
            break;
          } catch (err: any) {
            console.log(`[Multi-Model] Fallback: ${modelId} failed: ${err.message}, trying next...`);
          }
        }
        break;
      }

      case 'ensemble': {
        const modelIds = routingConfig.ensembleModelIds.length > 0
          ? routingConfig.ensembleModelIds
          : [routingConfig.primaryModelId];

        const promises = modelIds.map(id =>
          callModel(id).catch(err => {
            console.log(`[Ensemble] ${id} failed: ${err.message}`);
            return [] as TradeDecisionFromModel[];
          })
        );

        const allResults = await Promise.all(promises);
        const allDecisions = allResults.flat();
        result.decisions = allDecisions;

        for (const dec of allDecisions) {
          const key = `${dec.symbol}_${dec.modelId}`;
          result.modelVotes[key] = {
            action: dec.action,
            direction: dec.direction,
            confidence: dec.confidence,
            modelName: dec.modelName,
          };
        }

        const validResults = allResults.filter(r => r.length > 0);
        if (validResults.length > 1) {
          result.consensusDecisions = buildEnsembleConsensus(validResults, routingConfig.ensembleMinAgreement);
          const totalSymbols = new Set(allDecisions.map(d => d.symbol)).size;
          result.agreementPercent = totalSymbols > 0
            ? Math.round((result.consensusDecisions.length / totalSymbols) * 100)
            : 0;
        } else {
          result.consensusDecisions = allDecisions;
        }
        break;
      }

      case 'strategy_split': {
        const strategySets = new Map<string, string>();
        for (const [strategy, modelId] of Object.entries(routingConfig.strategyAssignments)) {
          strategySets.set(strategy, modelId);
        }

        const uniqueModels = new Set(strategySets.values());
        if (uniqueModels.size === 0) {
          uniqueModels.add(routingConfig.primaryModelId);
        }

        const promises = Array.from(uniqueModels).map(async (modelId) => {
          try {
            const decisions = await callModel(modelId);
            const assignedStrategies = Array.from(strategySets.entries())
              .filter(([_, mid]) => mid === modelId)
              .map(([strat]) => strat);

            return decisions.filter(d => {
              if (assignedStrategies.length === 0) return true;
              return assignedStrategies.includes(d.strategy);
            });
          } catch (err: any) {
            console.log(`[Strategy Split] ${modelId} failed: ${err.message}`);
            return [];
          }
        });

        const allResults = await Promise.all(promises);
        result.decisions = allResults.flat();
        result.consensusDecisions = result.decisions;
        break;
      }
    }
  } catch (err: any) {
    console.error(`[Multi-Model] Fatal error in ${routingConfig.mode} mode:`, err.message);
  }

  return result;
}
