import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Brain, Cpu, Zap, Shield, GitBranch,
  Layers, CheckCircle2, AlertTriangle, Loader2, Save, RotateCcw,
  Network
} from "lucide-react";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROUTING_MODES = [
  {
    id: 'single',
    name: 'Single Model',
    description: 'Use one AI model for all trading decisions',
    icon: Cpu,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
  },
  {
    id: 'fallback',
    name: 'Fallback Chain',
    description: 'Try primary model first, fall back to alternates on failure',
    icon: GitBranch,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/30',
  },
  {
    id: 'ensemble',
    name: 'Ensemble Consensus',
    description: 'Multiple models vote on trades, only consensus signals execute',
    icon: Network,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/30',
  },
  {
    id: 'strategy_split',
    name: 'Strategy Split',
    description: 'Assign different AI models to different trading strategies',
    icon: Layers,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/30',
  },
];

const STRATEGIES = [
  { id: 'scalping', name: 'Scalping', description: 'Quick in-and-out trades', category: 'HFT' },
  { id: 'momentum', name: 'Momentum Surfing', description: 'Ride strong price moves', category: 'HFT' },
  { id: 'session_breakout', name: 'Session Breakout', description: 'Trade key session opens', category: 'HFT' },
  { id: 'sniper', name: 'Sniper Mode', description: 'High-confidence precision entries', category: 'HFT' },
  { id: 'compound', name: 'Compound Growth', description: 'Aggressive compounding on wins', category: 'HFT' },
  { id: 'chart_pattern', name: 'Chart Patterns', description: 'Head & shoulders, double tops, triangles, flags, wedges', category: 'Classic' },
  { id: 'ict_order_blocks', name: 'ICT Order Blocks', description: 'Trade institutional supply/demand zones', category: 'ICT' },
  { id: 'ict_fvg', name: 'ICT Fair Value Gaps', description: 'Exploit price imbalance fills', category: 'ICT' },
  { id: 'ict_liquidity_sweep', name: 'ICT Liquidity Sweeps', description: 'Trade reversals after stop hunts', category: 'ICT' },
  { id: 'ict_bos', name: 'ICT Break of Structure', description: 'BOS/CHOCH trend shifts', category: 'ICT' },
  { id: 'ict_ote', name: 'ICT Optimal Trade Entry', description: 'Precision Fibonacci OTE zone entries', category: 'ICT' },
];

export default function AiTradingModels() {
  const { toast } = useToast();
  const [routingMode, setRoutingMode] = useState('single');
  const [primaryModelId, setPrimaryModelId] = useState('openai-gpt4o');
  const [ensembleModelIds, setEnsembleModelIds] = useState<string[]>([]);
  const [strategyAssignments, setStrategyAssignments] = useState<Record<string, string>>({});
  const [fallbackOrder, setFallbackOrder] = useState<string[]>([]);
  const [ensembleMinAgreement, setEnsembleMinAgreement] = useState(60);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: modelsData, isLoading } = useQuery<any>({
    queryKey: ['/api/ai-trading-models'],
  });

  const { data: configData } = useQuery<any>({
    queryKey: ['/api/ai-trading-models/config'],
    refetchOnMount: true,
  });

  const saveMutation = useMutation({
    mutationFn: async (config: any) => {
      const res = await apiRequest('POST', '/api/ai-trading-models/config', config);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-trading-models'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-trading-models/config'] });
      toast({ title: "Configuration Saved", description: "Your AI model routing has been updated." });
      setHasChanges(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const configLoaded = useRef(false);
  useEffect(() => {
    if (configData && !configLoaded.current) {
      configLoaded.current = true;
      setRoutingMode(configData.routingMode || 'single');
      setPrimaryModelId(configData.primaryModelId || 'openai-gpt4o');
      setEnsembleModelIds(configData.ensembleModelIds || []);
      setStrategyAssignments(configData.strategyAssignments || {});
      setFallbackOrder(configData.fallbackOrder || []);
      setEnsembleMinAgreement(configData.ensembleMinAgreement || 60);
    }
  }, [configData]);

  const models = modelsData?.models || [];
  const availableModels = models.filter((m: any) => m.available);

  const toggleEnsembleModel = (modelId: string) => {
    setHasChanges(true);
    setEnsembleModelIds(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  const handleSave = () => {
    saveMutation.mutate({
      routingMode,
      primaryModelId,
      ensembleModelIds,
      strategyAssignments,
      fallbackOrder: fallbackOrder.length > 0 ? fallbackOrder : availableModels.map((m: any) => m.id),
      ensembleMinAgreement,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/vedd-ss-ai">
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Brain className="h-7 w-7 text-purple-400" />
              Multi-Model AI Trading
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Configure how multiple AI models work together for your trading decisions
            </p>
          </div>
          {hasChanges && (
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setHasChanges(false); queryClient.invalidateQueries({ queryKey: ['/api/ai-trading-models/config'] }); }}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reset
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save Changes
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {ROUTING_MODES.map(mode => (
            <Card
              key={mode.id}
              className={`cursor-pointer transition-all border ${
                routingMode === mode.id
                  ? mode.bgColor + ' ring-2 ring-offset-0 ring-' + mode.color.replace('text-', '')
                  : 'bg-gray-900/50 border-gray-800 hover:border-gray-700'
              }`}
              onClick={() => { setRoutingMode(mode.id); setHasChanges(true); }}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <mode.icon className={`h-6 w-6 mt-0.5 ${routingMode === mode.id ? mode.color : 'text-gray-500'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold ${routingMode === mode.id ? 'text-white' : 'text-gray-300'}`}>
                        {mode.name}
                      </h3>
                      {routingMode === mode.id && (
                        <CheckCircle2 className={`h-4 w-4 ${mode.color}`} />
                      )}
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">{mode.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {routingMode === 'single' && (
          <Card className="bg-gray-900/50 border-gray-800 mb-6">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Cpu className="h-5 w-5 text-blue-400" /> Primary Model
              </CardTitle>
              <CardDescription>Select the AI model to use for all trading analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={primaryModelId} onValueChange={(v) => { setPrimaryModelId(v); setHasChanges(true); }}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m: any) => (
                    <SelectItem key={m.id} value={m.id} disabled={!m.available}>
                      <div className="flex items-center gap-2">
                        <span>{m.name}</span>
                        {!m.available && <Badge variant="outline" className="text-xs">No API Key</Badge>}
                        {m.available && <Badge className="bg-green-600/20 text-green-400 text-xs">Ready</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {routingMode === 'fallback' && (
          <Card className="bg-gray-900/50 border-gray-800 mb-6">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-amber-400" /> Fallback Chain
              </CardTitle>
              <CardDescription>Models are tried in order - if one fails, the next one is used</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {availableModels.map((m: any, idx: number) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                  <div className="text-amber-400 font-bold text-lg w-8 text-center">{idx + 1}</div>
                  <div className="flex-1">
                    <div className="text-white font-medium">{m.name}</div>
                    <div className="text-xs text-gray-400">{m.provider}</div>
                  </div>
                  <Badge className="bg-green-600/20 text-green-400">Ready</Badge>
                </div>
              ))}
              {availableModels.length === 0 && (
                <div className="text-center py-6 text-gray-400">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
                  <p>No models available. Add API keys in the <Link href="/ai-api-keys" className="text-purple-400 underline">AI API Keys</Link> page.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {routingMode === 'ensemble' && (
          <>
            <Card className="bg-gray-900/50 border-gray-800 mb-6">
              <CardHeader>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <Network className="h-5 w-5 text-purple-400" /> Ensemble Models
                </CardTitle>
                <CardDescription>Select which models vote on trading decisions. Only signals with enough agreement will execute.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {models.map((m: any) => (
                  <div key={m.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    ensembleModelIds.includes(m.id)
                      ? 'bg-purple-900/20 border-purple-500/40'
                      : 'bg-gray-800/50 border-gray-700'
                  } ${!m.available ? 'opacity-50' : 'cursor-pointer'}`}
                  onClick={() => m.available && toggleEnsembleModel(m.id)}>
                    <Switch
                      checked={ensembleModelIds.includes(m.id)}
                      disabled={!m.available}
                      onCheckedChange={() => m.available && toggleEnsembleModel(m.id)}
                    />
                    <div className="flex-1">
                      <div className="text-white font-medium">{m.name}</div>
                      <div className="text-xs text-gray-400">{m.description || m.provider}</div>
                    </div>
                    {!m.available ? (
                      <Badge variant="outline" className="text-xs text-gray-500">No API Key</Badge>
                    ) : (
                      <Badge className="bg-green-600/20 text-green-400 text-xs">Available</Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-gray-900/50 border-gray-800 mb-6">
              <CardHeader>
                <CardTitle className="text-white text-lg">Minimum Agreement Threshold</CardTitle>
                <CardDescription>What percentage of models must agree before a trade signal is executed?</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300">Agreement: {ensembleMinAgreement}%</Label>
                    <Badge className={`${ensembleMinAgreement >= 80 ? 'bg-green-600/20 text-green-400' : ensembleMinAgreement >= 60 ? 'bg-amber-600/20 text-amber-400' : 'bg-red-600/20 text-red-400'}`}>
                      {ensembleMinAgreement >= 80 ? 'Conservative' : ensembleMinAgreement >= 60 ? 'Moderate' : 'Aggressive'}
                    </Badge>
                  </div>
                  <Slider
                    value={[ensembleMinAgreement]}
                    onValueChange={([v]) => { setEnsembleMinAgreement(v); setHasChanges(true); }}
                    min={40}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>40% (Aggressive)</span>
                    <span>100% (Unanimous)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {routingMode === 'strategy_split' && (
          <Card className="bg-gray-900/50 border-gray-800 mb-6">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-emerald-400" /> Strategy Model Assignments
              </CardTitle>
              <CardDescription>Assign a specific AI model to each trading strategy for specialized analysis</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {['HFT', 'Classic', 'ICT'].map(category => (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className={category === 'ICT' ? 'bg-cyan-600/20 text-cyan-400' : category === 'Classic' ? 'bg-violet-600/20 text-violet-400' : 'bg-orange-600/20 text-orange-400'}>
                      {category}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {category === 'ICT' ? 'Inner Circle Trader Strategies' : category === 'Classic' ? 'Classic Chart Pattern Strategies' : 'High-Frequency Trading Strategies'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {STRATEGIES.filter(s => s.category === category).map(strategy => (
                      <div key={strategy.id} className="flex items-center gap-4 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                        <div className="flex-1">
                          <div className="text-white font-medium">{strategy.name}</div>
                          <div className="text-xs text-gray-400">{strategy.description}</div>
                        </div>
                        <Select
                          value={strategyAssignments[strategy.id] || 'openai-gpt4o'}
                          onValueChange={(v) => {
                            setStrategyAssignments(prev => ({ ...prev, [strategy.id]: v }));
                            setHasChanges(true);
                          }}
                        >
                          <SelectTrigger className="w-48 bg-gray-800 border-gray-700 text-white text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map((m: any) => (
                              <SelectItem key={m.id} value={m.id} disabled={!m.available}>
                                {m.name} {!m.available && '(No Key)'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="bg-gray-800/30 border-gray-700/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-400 mt-0.5" />
              <div>
                <h4 className="text-white font-medium text-sm">How Multi-Model Trading Works</h4>
                <ul className="text-xs text-gray-400 mt-2 space-y-1.5">
                  <li><strong className="text-blue-400">Single:</strong> One AI model handles all analysis. Simple and cost-effective.</li>
                  <li><strong className="text-amber-400">Fallback:</strong> If the primary model is slow or fails, the next model in chain takes over automatically.</li>
                  <li><strong className="text-purple-400">Ensemble:</strong> Multiple models analyze the same data independently. Only trades where enough models agree will execute - reducing false signals.</li>
                  <li><strong className="text-emerald-400">Strategy Split:</strong> Different models specialize in different strategies. GPT-4o for scalping, Claude for momentum, etc.</li>
                </ul>
                <p className="text-xs text-gray-500 mt-3">
                  Add more AI provider API keys in the <Link href="/ai-api-keys" className="text-purple-400 underline">AI API Keys</Link> page to unlock more models.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
