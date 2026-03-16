import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Key, CheckCircle2, XCircle, Loader2, Trash2, Shield, 
  ArrowLeft, Plus, RefreshCw, Zap, Cpu, Sparkles, DollarSign
} from "lucide-react";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AI_PROVIDERS = [
  { 
    id: 'openai', 
    name: 'OpenAI', 
    description: 'GPT-4o, GPT-4, GPT-3.5 models',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    color: 'from-green-500 to-emerald-600',
    icon: '🤖'
  },
  { 
    id: 'anthropic', 
    name: 'Anthropic', 
    description: 'Claude 3.5, Claude 3 models',
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    color: 'from-orange-500 to-amber-600',
    icon: '🧠'
  },
  { 
    id: 'google', 
    name: 'Google AI', 
    description: 'Gemini Pro, Gemini Ultra models',
    placeholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    color: 'from-blue-500 to-cyan-600',
    icon: '💎'
  },
  { 
    id: 'groq', 
    name: 'Groq', 
    description: 'Ultra-fast inference with Llama, Mixtral',
    placeholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
    color: 'from-purple-500 to-violet-600',
    icon: '⚡'
  },
  { 
    id: 'mistral', 
    name: 'Mistral AI', 
    description: 'Mistral Large, Medium, Small models',
    placeholder: '',
    docsUrl: 'https://console.mistral.ai/api-keys/',
    color: 'from-red-500 to-pink-600',
    icon: '🌊'
  },
];

interface UserApiKey {
  id: number;
  provider: string;
  hasKey: boolean;
  label: string | null;
  isActive: boolean;
  isValid: boolean;
  lastValidated: string | null;
  lastUsed: string | null;
  usageCount: number;
  createdAt: string;
}

export default function AiApiKeysPage() {
  const { toast } = useToast();
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [validatingProvider, setValidatingProvider] = useState<string | null>(null);

  const { data: savedKeys = [], isLoading } = useQuery<UserApiKey[]>({
    queryKey: ['/api/user-api-keys'],
  });

  const saveKeyMutation = useMutation({
    mutationFn: async ({ provider, apiKey, label }: { provider: string; apiKey: string; label: string }) => {
      const res = await apiRequest('POST', '/api/user-api-keys', { provider, apiKey, label });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys/active-source'] });
      setAddingProvider(null);
      setNewKeyValue('');
      setNewKeyLabel('');
      toast({ title: "API Key Saved", description: "Your key has been saved. Click Validate to test it." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save API key", variant: "destructive" });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async (provider: string) => {
      setValidatingProvider(provider);
      const res = await apiRequest('POST', '/api/user-api-keys/validate', { provider });
      return res.json();
    },
    onSuccess: (data) => {
      setValidatingProvider(null);
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys/active-source'] });
      if (data.valid) {
        toast({ title: "Key Validated", description: `Your ${data.provider} key is working correctly.` });
      } else {
        toast({ title: "Key Invalid", description: `Your ${data.provider} key could not be validated. Please check it.`, variant: "destructive" });
      }
    },
    onError: (err: any) => {
      setValidatingProvider(null);
      toast({ title: "Validation Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ provider, isActive }: { provider: string; isActive: boolean }) => {
      const res = await apiRequest('POST', '/api/user-api-keys/toggle', { provider, isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys/active-source'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await apiRequest('DELETE', `/api/user-api-keys/${provider}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys/active-source'] });
      toast({ title: "Key Removed", description: "API key has been deleted." });
    },
  });

  const { data: aiCostModeData, isLoading: aiCostModeLoading } = useQuery<{ mode: string }>({
    queryKey: ['/api/user/ai-cost-mode'],
  });

  const aiCostMode = aiCostModeData?.mode || 'full';

  const setAiCostModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      const res = await apiRequest('PATCH', '/api/user/ai-cost-mode', { mode });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/ai-cost-mode'] });
      toast({
        title: data.mode === 'economy' ? "Economy Mode Enabled" : "Full Power Mode Enabled",
        description: data.mode === 'economy'
          ? "All AI features now route to Groq free models."
          : "All AI features now use your highest-priority saved key.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update AI cost mode", variant: "destructive" });
    },
  });

  const { data: modelPref, isLoading: modelLoading } = useQuery<{ model: string; availableModels: { id: string; name: string; description: string; tier: string; provider: string }[] }>({
    queryKey: ['/api/ai-model-preference'],
  });

  const setModelMutation = useMutation({
    mutationFn: async (model: string) => {
      const res = await apiRequest('POST', '/api/ai-model-preference', { model });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-model-preference'] });
      toast({ title: "AI Agent Updated", description: `Chart analysis and AI Second Opinion will now use ${data.modelName || data.model}.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update model", variant: "destructive" });
    },
  });

  const { data: activeSource } = useQuery<{ source: 'own' | 'platform'; provider: string | null }>({
    queryKey: ['/api/user-api-keys/active-source'],
  });

  const savedProviders = new Set(savedKeys.map(k => k.provider));
  const availableProviders = AI_PROVIDERS.filter(p => !savedProviders.has(p.id));

  const getProviderInfo = (id: string) => AI_PROVIDERS.find(p => p.id === id);

  const isOwn = activeSource?.source === 'own';
  const activeProviderName = activeSource?.provider
    ? (AI_PROVIDERS.find(p => p.id === activeSource.provider)?.name || activeSource.provider)
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/profile">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Profile
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
              <Key className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold">AI Provider Keys</h1>
          </div>
          <p className="text-muted-foreground mt-2">
            Connect your own AI API keys to use your preferred providers for chart analysis. 
            When your key is active, the platform routes AI requests through your account instead of using platform credits.
          </p>
          <div className="flex items-center gap-2 mt-3 text-sm text-amber-600 dark:text-amber-400">
            <Shield className="h-4 w-4" />
            <span>Keys are stored securely and never shared. You can add up to 5 providers.</span>
          </div>
        </div>

        {activeSource && (
          <Card className={`mb-6 border-2 ${isOwn ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-emerald-500/5' : 'border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-cyan-500/5'}`}>
            <CardContent className="py-4 flex items-center gap-4 flex-wrap">
              <div className={`p-2.5 rounded-lg ${isOwn ? 'bg-green-500/20' : 'bg-blue-500/20'}`}>
                {isOwn ? <Key className="h-5 w-5 text-green-400" /> : <Cpu className="h-5 w-5 text-blue-400" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  Current AI Source: {isOwn ? (
                    <span className="text-green-400">Your {activeProviderName} Key</span>
                  ) : (
                    <span className="text-blue-400">Platform OpenAI</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isOwn
                    ? 'All AI features route through your own API key — no platform usage limits.'
                    : 'AI requests use the shared platform key. Add your own key for unlimited personal usage.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Platform AI Cost Mode */}
        <Card className="mb-6 border-2 border-primary/30 bg-gradient-to-br from-background to-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Platform AI Cost Mode
              </CardTitle>
              {aiCostMode === 'economy' && (
                <Badge className="bg-green-500/20 text-green-400 border border-green-500/40 text-xs font-semibold px-2 py-0.5">
                  COST REDUCED
                </Badge>
              )}
            </div>
            <CardDescription>
              Controls which AI model powers <strong>every</strong> feature on the platform — chart analysis, EA generator, news sentiment, weekly strategy, social posts, and more.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aiCostModeLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <Button
                    variant={aiCostMode === 'full' ? 'default' : 'outline'}
                    className={`flex-1 h-16 flex-col gap-1 ${aiCostMode === 'full' ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => setAiCostModeMutation.mutate('full')}
                    disabled={setAiCostModeMutation.isPending}
                  >
                    <Sparkles className="h-5 w-5" />
                    <span className="font-semibold">Full Power</span>
                  </Button>
                  <Button
                    variant={aiCostMode === 'economy' ? 'default' : 'outline'}
                    className={`flex-1 h-16 flex-col gap-1 ${aiCostMode === 'economy' ? 'bg-green-600 hover:bg-green-700 text-white border-0' : 'border-green-600/40 hover:border-green-500'}`}
                    onClick={() => setAiCostModeMutation.mutate('economy')}
                    disabled={setAiCostModeMutation.isPending}
                  >
                    <Zap className="h-5 w-5" />
                    <span className="font-semibold">Economy</span>
                  </Button>
                </div>
                {aiCostMode === 'economy' ? (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 space-y-2 text-sm">
                    <p className="font-semibold text-green-400 flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Economy mode — all AI routes to Groq free models</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-muted-foreground text-xs">
                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Text AI → Groq Llama 3.3-70b (free)</div>
                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Chart Vision → Groq Llama 4 Scout Vision (free)</div>
                    </div>
                    <p className="text-muted-foreground/60 text-xs pt-1">Note: SS AI Engine and Sol Scanner have their own AI mode settings independent of this toggle.</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Maximum accuracy — all AI requests use your highest-priority saved key (or platform OpenAI key as fallback).
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Cpu className="h-5 w-5 text-primary" />
              AI Agent for Chart Analysis & Second Opinion
            </CardTitle>
            <CardDescription>
              Choose which AI model powers your chart analysis and trade confirmations. Non-OpenAI models require your own API key connected below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {modelLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex flex-col gap-4">
                <Select
                  value={modelPref?.model || 'gpt-4o'}
                  onValueChange={(value) => setModelMutation.mutate(value)}
                  disabled={setModelMutation.isPending}
                >
                  <SelectTrigger className="w-full sm:w-[340px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const models = modelPref?.availableModels || [];
                      const providers = ['openai', 'anthropic', 'google', 'groq', 'mistral'];
                      const providerLabels: Record<string, string> = {
                        openai: '🤖 OpenAI', anthropic: '🧠 Anthropic', google: '💎 Google AI',
                        groq: '⚡ Groq', mistral: '🌊 Mistral AI'
                      };
                      return providers.map((prov, idx) => {
                        const provModels = models.filter((m: any) => m.provider === prov);
                        if (provModels.length === 0) return null;
                        const needsKey = prov !== 'openai';
                        const hasKey = savedKeys.some(k => k.provider === prov && k.isActive);
                        return (
                          <SelectGroup key={prov}>
                            {idx > 0 && <SelectSeparator />}
                            <SelectLabel className="flex items-center justify-between text-xs">
                              <span>{providerLabels[prov] || prov}</span>
                              {needsKey && !hasKey && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 text-yellow-600 border-yellow-600">Key Required</Badge>
                              )}
                              {needsKey && hasKey && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 text-green-600 border-green-600">Connected</Badge>
                              )}
                            </SelectLabel>
                            {provModels.map((m: any) => (
                              <SelectItem key={m.id} value={m.id}>
                                <div className="flex items-center gap-2">
                                  {m.tier === 'premium' ? (
                                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                  ) : (
                                    <DollarSign className="h-3.5 w-3.5 text-green-500" />
                                  )}
                                  <span>{m.name}</span>
                                  <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0">
                                    {m.tier === 'premium' ? 'Premium' : 'Budget'}
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      });
                    })()}
                  </SelectContent>
                </Select>
                {(() => {
                  const selected = (modelPref?.availableModels || []).find((m: any) => m.id === modelPref?.model);
                  if (!selected) return null;
                  const needsKey = (selected as any).provider !== 'openai';
                  const hasKey = savedKeys.some(k => k.provider === (selected as any).provider && k.isActive);
                  return (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <span className="flex items-center gap-1">
                        {selected.tier === 'premium' ? (
                          <><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Premium — {selected.description}</>
                        ) : (
                          <><DollarSign className="h-3.5 w-3.5 text-green-500" /> Budget — {selected.description}</>
                        )}
                      </span>
                      {needsKey && !hasKey && (
                        <p className="text-xs text-yellow-600 flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          Add your {AI_PROVIDERS.find(p => p.id === (selected as any).provider)?.name} API key below to use this model
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {savedKeys.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Your Connected Providers ({savedKeys.length}/5)
                </h2>
                {savedKeys.map((key) => {
                  const provider = getProviderInfo(key.provider);
                  if (!provider) return null;
                  return (
                    <Card key={key.id} className={`border ${key.isActive ? 'border-primary/30' : 'border-muted opacity-60'}`}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`text-2xl p-2 rounded-lg bg-gradient-to-br ${provider.color} flex items-center justify-center`}>
                              <span className="text-xl">{provider.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold">{provider.name}</h3>
                                {key.isValid ? (
                                  <Badge variant="outline" className="text-green-600 border-green-600">
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Valid
                                  </Badge>
                                ) : key.lastValidated ? (
                                  <Badge variant="outline" className="text-red-600 border-red-600">
                                    <XCircle className="h-3 w-3 mr-1" /> Invalid
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                                    Not Validated
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-0.5">{provider.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Key className="h-3 w-3" />
                                  {key.hasKey ? 'Key configured' : 'No key set'}
                                </span>
                                {key.usageCount > 0 && <span>Used {key.usageCount} times</span>}
                                {key.lastUsed && <span>Last used: {new Date(key.lastUsed).toLocaleDateString()}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch 
                              checked={key.isActive}
                              onCheckedChange={(checked) => toggleMutation.mutate({ provider: key.provider, isActive: checked })}
                            />
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => validateMutation.mutate(key.provider)}
                              disabled={validatingProvider === key.provider}
                            >
                              {validatingProvider === key.provider ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Remove your ${provider.name} API key?`)) {
                                  deleteMutation.mutate(key.provider);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {availableProviders.length > 0 && savedKeys.length < 5 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Add AI Provider</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableProviders.map((provider) => (
                    <Card 
                      key={provider.id} 
                      className={`cursor-pointer transition-all hover:border-primary/50 ${addingProvider === provider.id ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => {
                        setAddingProvider(addingProvider === provider.id ? null : provider.id);
                        setNewKeyValue('');
                        setNewKeyLabel('');
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`text-xl p-2 rounded-lg bg-gradient-to-br ${provider.color}`}>
                            {provider.icon}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium">{provider.name}</h3>
                            <p className="text-xs text-muted-foreground">{provider.description}</p>
                          </div>
                          <Plus className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {addingProvider && (
              <Card className="border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span>{getProviderInfo(addingProvider)?.icon}</span>
                    Add {getProviderInfo(addingProvider)?.name} Key
                  </CardTitle>
                  <CardDescription>
                    Get your API key from{' '}
                    <a 
                      href={getProviderInfo(addingProvider)?.docsUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-primary underline"
                    >
                      {getProviderInfo(addingProvider)?.name}'s dashboard
                    </a>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">API Key</label>
                    <Input
                      type="password"
                      placeholder={getProviderInfo(addingProvider)?.placeholder || 'Enter your API key'}
                      value={newKeyValue}
                      onChange={(e) => setNewKeyValue(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Label (optional)</label>
                    <Input
                      placeholder="e.g., Personal, Work, Trading Bot"
                      value={newKeyLabel}
                      onChange={(e) => setNewKeyLabel(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        saveKeyMutation.mutate({
                          provider: addingProvider,
                          apiKey: newKeyValue,
                          label: newKeyLabel || getProviderInfo(addingProvider)?.name || addingProvider,
                        });
                      }}
                      disabled={!newKeyValue.trim() || saveKeyMutation.isPending}
                    >
                      {saveKeyMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                      ) : (
                        <><Key className="h-4 w-4 mr-2" /> Save Key</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => { setAddingProvider(null); setNewKeyValue(''); setNewKeyLabel(''); }}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-muted/50 border-dashed">
              <CardContent className="p-5">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  How It Works
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li>When you add your own AI key and set it as active, all chart analysis and AI features will use your key.</li>
                  <li>If your key is disabled or invalid, the platform falls back to its built-in AI credits.</li>
                  <li>OpenAI keys are used for chart analysis. Choose GPT-4o (best accuracy) or GPT-4o Mini (budget-friendly) using the model selector above.</li>
                  <li>You can switch between providers at any time using the toggle.</li>
                  <li>Usage is tracked so you can monitor how often each key is being used.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
