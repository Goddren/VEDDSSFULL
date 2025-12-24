import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Webhook, 
  Plus, 
  Trash2, 
  Settings, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ArrowLeft,
  Activity,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Download,
  Key,
  Zap,
  Server
} from "lucide-react";
import { motion } from "framer-motion";

type WebhookConfig = {
  id: number;
  userId: number;
  name: string;
  url: string;
  platform: string;
  isActive: boolean;
  triggerOn: string[];
  signalFormat: string;
  customPayloadTemplate: string | null;
  secretKey: string | null;
  headers: Record<string, string> | null;
  lastTriggeredAt: string | null;
  lastStatus: string | null;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
};

type WebhookLog = {
  id: number;
  webhookId: number;
  userId: number;
  triggerType: string;
  payload: any;
  responseStatus: number | null;
  responseBody: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

type Mt5ApiToken = {
  id: number;
  userId: number;
  token: string;
  name: string;
  isActive: boolean;
  lastUsedAt: string | null;
  signalCount: number;
  createdAt: string;
};

type Mt5SignalLog = {
  id: number;
  tokenId: number;
  userId: number;
  action: string;
  symbol: string;
  direction: string;
  volume: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  ticket: string | null;
  relayedToWebhooks: boolean;
  createdAt: string;
};

const PLATFORM_OPTIONS = [
  { value: 'tradelocker', label: 'TradeLocker' },
  { value: 'tradingview', label: 'TradingView Alerts' },
  { value: 'custom', label: 'Custom Webhook' },
];

const TRIGGER_OPTIONS = [
  { value: 'analysis', label: 'Chart Analysis Complete' },
  { value: 'synthesis', label: 'Multi-Timeframe EA Signal' },
  { value: 'mt5_signal', label: 'MT5 Trade Copier Signal' },
  { value: 'manual', label: 'Manual Trigger' },
];

export default function WebhooksPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookConfig | null>(null);
  const [showSecret, setShowSecret] = useState<Record<number, boolean>>({});
  
  const [newWebhook, setNewWebhook] = useState({
    name: '',
    url: '',
    platform: 'custom',
    triggerOn: ['synthesis'] as string[],
    signalFormat: 'json',
    secretKey: '',
  });

  const { data: webhooks = [], isLoading } = useQuery<WebhookConfig[]>({
    queryKey: ['/api/webhooks'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newWebhook) => {
      const res = await apiRequest('POST', '/api/webhooks', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks'] });
      setIsCreateOpen(false);
      setNewWebhook({
        name: '',
        url: '',
        platform: 'custom',
        triggerOn: ['synthesis'],
        signalFormat: 'json',
        secretKey: '',
      });
      toast({ title: "Webhook created", description: "Your webhook has been configured successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<WebhookConfig> }) => {
      const res = await apiRequest('PATCH', `/api/webhooks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks'] });
      toast({ title: "Webhook updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/webhooks/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks'] });
      setSelectedWebhook(null);
      toast({ title: "Webhook deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/webhooks/${id}/test`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks'] });
      if (data.success) {
        toast({ title: "Test successful", description: "Signal was delivered to the webhook endpoint." });
      } else {
        toast({ title: "Test failed", description: data.message || "The webhook endpoint returned an error.", variant: "destructive" });
      }
    },
    onError: (error) => {
      toast({ title: "Test error", description: error.message, variant: "destructive" });
    }
  });

  const { data: logs = [] } = useQuery<WebhookLog[]>({
    queryKey: ['/api/webhooks', selectedWebhook?.id, 'logs'],
    enabled: !!selectedWebhook,
  });

  // MT5 Trade Copier state
  const [newTokenName, setNewTokenName] = useState('');
  const [showTokenValue, setShowTokenValue] = useState<string | null>(null);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<Mt5ApiToken | null>(null);

  // MT5 queries and mutations
  const { data: mt5Tokens = [] } = useQuery<Mt5ApiToken[]>({
    queryKey: ['/api/mt5-tokens'],
  });

  const { data: mt5Signals = [] } = useQuery<Mt5SignalLog[]>({
    queryKey: ['/api/mt5-signals'],
  });

  const createTokenMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest('POST', '/api/mt5-tokens', { name });
      return res.json() as Promise<Mt5ApiToken>;
    },
    onSuccess: (data: Mt5ApiToken) => {
      queryClient.invalidateQueries({ queryKey: ['/api/mt5-tokens'] });
      setNewlyCreatedToken(data);
      setNewTokenName('');
      toast({ title: "API Token Created", description: "Copy your token now - it won't be shown again!" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteTokenMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/mt5-tokens/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mt5-tokens'] });
      toast({ title: "Token deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleToggleActive = (webhook: WebhookConfig) => {
    updateMutation.mutate({ id: webhook.id, data: { isActive: !webhook.isActive } });
  };

  const handleTriggerChange = (value: string, checked: boolean) => {
    setNewWebhook(prev => ({
      ...prev,
      triggerOn: checked 
        ? [...prev.triggerOn, value]
        : prev.triggerOn.filter(t => t !== value)
    }));
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-8">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Webhook className="w-8 h-8 text-primary" />
              Webhook Signal System
            </h1>
            <p className="text-gray-400 mt-1">
              Send trading signals to TradeLocker, TradingView, or custom endpoints
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-purple-600" data-testid="button-add-webhook">
                <Plus className="w-4 h-4 mr-2" />
                Add Webhook
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-gray-800 border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-white">Create New Webhook</DialogTitle>
                <DialogDescription>
                  Configure a webhook to receive trading signals from VEDD AI
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Webhook Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., TradeLocker Signals"
                    value={newWebhook.name}
                    onChange={(e) => setNewWebhook(prev => ({ ...prev, name: e.target.value }))}
                    className="bg-gray-900 border-gray-700"
                    data-testid="input-webhook-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Webhook URL</Label>
                  <Input
                    id="url"
                    placeholder="https://your-endpoint.com/webhook"
                    value={newWebhook.url}
                    onChange={(e) => setNewWebhook(prev => ({ ...prev, url: e.target.value }))}
                    className="bg-gray-900 border-gray-700"
                    data-testid="input-webhook-url"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={newWebhook.platform} onValueChange={(v) => setNewWebhook(prev => ({ ...prev, platform: v }))}>
                    <SelectTrigger className="bg-gray-900 border-gray-700" data-testid="select-platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Trigger On</Label>
                  <div className="space-y-2">
                    {TRIGGER_OPTIONS.map(opt => (
                      <div key={opt.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`trigger-${opt.value}`}
                          checked={newWebhook.triggerOn.includes(opt.value)}
                          onCheckedChange={(checked) => handleTriggerChange(opt.value, checked as boolean)}
                          data-testid={`checkbox-trigger-${opt.value}`}
                        />
                        <Label htmlFor={`trigger-${opt.value}`} className="font-normal">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secret">Secret Key (Optional)</Label>
                  <Input
                    id="secret"
                    type="password"
                    placeholder="For webhook verification"
                    value={newWebhook.secretKey}
                    onChange={(e) => setNewWebhook(prev => ({ ...prev, secretKey: e.target.value }))}
                    className="bg-gray-900 border-gray-700"
                    data-testid="input-secret-key"
                  />
                  <p className="text-xs text-gray-500">This will be sent as X-Webhook-Secret header</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button 
                  onClick={() => createMutation.mutate(newWebhook)}
                  disabled={!newWebhook.name || !newWebhook.url || newWebhook.triggerOn.length === 0 || createMutation.isPending}
                  data-testid="button-create-webhook"
                >
                  {createMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create Webhook
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : webhooks.length === 0 ? (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="py-16 text-center">
              <Webhook className="w-16 h-16 mx-auto text-gray-600 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Webhooks Configured</h3>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">
                Set up webhooks to automatically send trading signals to TradeLocker, TradingView alerts, or any custom endpoint.
              </p>
              <Button onClick={() => setIsCreateOpen(true)} data-testid="button-add-first-webhook">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Webhook
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {webhooks.map((webhook, index) => (
                <motion.div
                  key={webhook.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card 
                    className={`bg-gray-800/50 border-gray-700 cursor-pointer transition-all ${selectedWebhook?.id === webhook.id ? 'ring-2 ring-primary' : 'hover:border-gray-600'}`}
                    onClick={() => setSelectedWebhook(webhook)}
                    data-testid={`card-webhook-${webhook.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-white">{webhook.name}</h3>
                            {getStatusBadge(webhook.lastStatus)}
                            <Badge variant="outline" className="text-xs">
                              {PLATFORM_OPTIONS.find(p => p.value === webhook.platform)?.label || webhook.platform}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-400 truncate max-w-md">{webhook.url}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Activity className="w-3 h-3" />
                              Triggers: {(webhook.triggerOn as string[]).join(', ')}
                            </span>
                            {webhook.lastTriggeredAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last: {new Date(webhook.lastTriggeredAt).toLocaleDateString()}
                              </span>
                            )}
                            {webhook.failureCount > 0 && (
                              <span className="flex items-center gap-1 text-red-400">
                                <AlertCircle className="w-3 h-3" />
                                {webhook.failureCount} failures
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={webhook.isActive}
                            onCheckedChange={() => handleToggleActive(webhook)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`switch-webhook-active-${webhook.id}`}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); testMutation.mutate(webhook.id); }}
                            disabled={testMutation.isPending}
                            data-testid={`button-test-webhook-${webhook.id}`}
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Test
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            <div className="lg:col-span-1">
              {selectedWebhook ? (
                <Card className="bg-gray-800/50 border-gray-700 sticky top-4">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Webhook Details
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteMutation.mutate(selectedWebhook.id)}
                        disabled={deleteMutation.isPending}
                        data-testid="button-delete-webhook"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="config">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="config">Config</TabsTrigger>
                        <TabsTrigger value="logs">Logs</TabsTrigger>
                      </TabsList>
                      <TabsContent value="config" className="space-y-4 mt-4">
                        <div>
                          <Label className="text-gray-400 text-xs">URL</Label>
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-white truncate flex-1">{selectedWebhook.url}</p>
                            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(selectedWebhook.url)}>
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label className="text-gray-400 text-xs">Platform</Label>
                          <p className="text-sm text-white">
                            {PLATFORM_OPTIONS.find(p => p.value === selectedWebhook.platform)?.label}
                          </p>
                        </div>
                        <div>
                          <Label className="text-gray-400 text-xs">Triggers</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(selectedWebhook.triggerOn as string[]).map(t => (
                              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        </div>
                        {selectedWebhook.secretKey && (
                          <div>
                            <Label className="text-gray-400 text-xs">Secret Key</Label>
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-white font-mono">
                                {showSecret[selectedWebhook.id] ? selectedWebhook.secretKey : '••••••••'}
                              </p>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => setShowSecret(prev => ({ ...prev, [selectedWebhook.id]: !prev[selectedWebhook.id] }))}
                              >
                                {showSecret[selectedWebhook.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="pt-4 border-t border-gray-700">
                          <Label className="text-gray-400 text-xs">Signal Format (JSON)</Label>
                          <pre className="mt-2 p-3 bg-gray-900 rounded-lg text-xs text-gray-300 overflow-x-auto">
{`{
  "type": "synthesis",
  "source": "VEDD AI",
  "timestamp": "2024-01-15T10:30:00Z",
  "signal": {
    "symbol": "EUR/USD",
    "direction": "BUY",
    "confidence": "HIGH",
    "entryPrice": "1.0850",
    "stopLoss": "1.0820",
    "takeProfit": "1.0900"
  }
}`}
                          </pre>
                        </div>
                      </TabsContent>
                      <TabsContent value="logs" className="mt-4">
                        <ScrollArea className="h-[300px]">
                          {logs.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No logs yet</p>
                          ) : (
                            <div className="space-y-2">
                              {logs.map(log => (
                                <div key={log.id} className="p-3 bg-gray-900 rounded-lg">
                                  <div className="flex items-center justify-between mb-1">
                                    <Badge className={log.status === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                                      {log.status}
                                    </Badge>
                                    <span className="text-xs text-gray-500">
                                      {new Date(log.createdAt).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-400">Type: {log.triggerType}</p>
                                  {log.responseStatus && (
                                    <p className="text-xs text-gray-400">HTTP {log.responseStatus}</p>
                                  )}
                                  {log.errorMessage && (
                                    <p className="text-xs text-red-400 mt-1">{log.errorMessage}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardContent className="py-12 text-center">
                    <Settings className="w-12 h-12 mx-auto text-gray-600 mb-4" />
                    <p className="text-gray-400">Select a webhook to view details</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        <Card className="mt-8 bg-gray-800/30 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-lg">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
                  <span className="text-primary font-bold">1</span>
                </div>
                <h4 className="font-semibold text-white mb-2">Configure Webhook</h4>
                <p className="text-sm text-gray-400">Add your TradeLocker, TradingView, or custom webhook URL</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
                  <span className="text-primary font-bold">2</span>
                </div>
                <h4 className="font-semibold text-white mb-2">Analyze Charts</h4>
                <p className="text-sm text-gray-400">Use VEDD AI to analyze charts and generate trading signals</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
                  <span className="text-primary font-bold">3</span>
                </div>
                <h4 className="font-semibold text-white mb-2">Receive Signals</h4>
                <p className="text-sm text-gray-400">Signals are automatically sent to your configured endpoints</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MT5 Trade Copier Section */}
        <Card className="mt-8 bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-700/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white text-xl flex items-center gap-3">
                  <Zap className="w-6 h-6 text-yellow-400" />
                  MT5 Trade Copier
                </CardTitle>
                <CardDescription className="mt-1">
                  Copy trades from MetaTrader 5 directly to TradeLocker and other platforms
                </CardDescription>
              </div>
              <a 
                href="/ea-templates/VEDD_Trade_Copier.mq5" 
                download
                className="inline-flex"
              >
                <Button className="bg-gradient-to-r from-green-600 to-emerald-600" data-testid="button-download-ea">
                  <Download className="w-4 h-4 mr-2" />
                  Download EA
                </Button>
              </a>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* API Token Management */}
            <div className="space-y-4">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <Key className="w-4 h-4" />
                API Tokens
              </h4>
              
              {/* Create new token */}
              <div className="flex gap-2">
                <Input
                  placeholder="Token name (e.g., My MT5 Account)"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  className="bg-gray-900 border-gray-700 flex-1"
                  data-testid="input-token-name"
                />
                <Button
                  onClick={() => createTokenMutation.mutate(newTokenName)}
                  disabled={!newTokenName || createTokenMutation.isPending}
                  data-testid="button-create-token"
                >
                  {createTokenMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>

              {/* Newly created token display */}
              {newlyCreatedToken && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-green-900/30 border border-green-600/50 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-green-400 font-semibold">New Token Created</span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setNewlyCreatedToken(null)}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-yellow-400 text-sm mb-2">Copy this token now - it won't be shown again!</p>
                  <div className="flex items-center gap-2 bg-gray-900 p-2 rounded font-mono text-sm">
                    <code className="flex-1 text-gray-300 break-all">{newlyCreatedToken.token}</code>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => copyToClipboard(newlyCreatedToken.token)}
                      data-testid="button-copy-new-token"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Token list */}
              {mt5Tokens.length > 0 ? (
                <div className="space-y-2">
                  {mt5Tokens.map(token => (
                    <div key={token.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{token.name}</span>
                          {token.isActive ? (
                            <Badge className="bg-green-500/20 text-green-400 text-xs">Active</Badge>
                          ) : (
                            <Badge className="bg-gray-500/20 text-gray-400 text-xs">Inactive</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
                          <span className="font-mono">{token.token}</span>
                          <span>{token.signalCount} signals</span>
                          {token.lastUsedAt && (
                            <span>Last used: {new Date(token.lastUsedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTokenMutation.mutate(token.id)}
                        className="text-red-400 hover:text-red-300"
                        data-testid={`button-delete-token-${token.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  No API tokens yet. Create one to get started.
                </div>
              )}
            </div>

            {/* Setup Instructions */}
            <div className="space-y-4 pt-4 border-t border-gray-700">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <Server className="w-4 h-4" />
                Setup Instructions
              </h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h5 className="text-primary font-semibold mb-2">1. Download & Install EA</h5>
                  <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                    <li>Download the VEDD Trade Copier EA above</li>
                    <li>Open MT5 and go to File &gt; Open Data Folder</li>
                    <li>Navigate to MQL5 &gt; Experts</li>
                    <li>Copy the .mq5 file there and compile</li>
                  </ol>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h5 className="text-primary font-semibold mb-2">2. Configure EA Settings</h5>
                  <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                    <li>Attach EA to any chart</li>
                    <li>Set WebhookURL to: <code className="text-xs bg-gray-900 px-1 rounded">{window.location.origin}/api/mt5-signal</code></li>
                    <li>Paste your API Key from above</li>
                    <li>Enable "Allow WebRequest" in EA options</li>
                  </ol>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg md:col-span-2">
                  <h5 className="text-primary font-semibold mb-2">3. Configure Webhook Destination</h5>
                  <p className="text-sm text-gray-400">
                    Create a webhook above with "MT5 Trade Copier Signal" as a trigger. When you open trades in MT5, 
                    the EA will send signals to VEDD AI, which then relays them to your configured webhooks 
                    (TradeLocker, TradingView alerts, etc.).
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Signals */}
            {mt5Signals.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-gray-700">
                <h4 className="text-white font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Recent Signals
                </h4>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {mt5Signals.slice(0, 10).map(signal => (
                      <div key={signal.id} className="flex items-center justify-between p-2 bg-gray-900/50 rounded text-sm">
                        <div className="flex items-center gap-3">
                          <Badge className={signal.direction === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                            {signal.direction}
                          </Badge>
                          <span className="text-white font-mono">{signal.symbol}</span>
                          <span className="text-gray-400">@ {signal.entryPrice.toFixed(5)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          {signal.relayedToWebhooks && (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          )}
                          <span>{new Date(signal.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
