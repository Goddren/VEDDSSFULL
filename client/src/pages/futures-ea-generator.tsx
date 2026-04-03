import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download, Code2, Settings, ChevronDown, ChevronUp, Zap,
  ShieldCheck, TrendingUp, Activity, Info, BarChart3, AlertTriangle
} from "lucide-react";

const SYMBOL_OPTIONS = [
  { value: 'NQ',  label: 'NQ — Nasdaq-100 E-Mini',        mini: false },
  { value: 'MNQ', label: 'MNQ — Nasdaq-100 Micro',        mini: true  },
  { value: 'ES',  label: 'ES — S&P 500 E-Mini',           mini: false },
  { value: 'MES', label: 'MES — S&P 500 Micro',           mini: true  },
  { value: 'YM',  label: 'YM — Dow Jones E-Mini',         mini: false },
  { value: 'MYM', label: 'MYM — Dow Jones Micro',         mini: true  },
  { value: 'RTY', label: 'RTY — Russell 2000 E-Mini',     mini: false },
  { value: 'M2K', label: 'M2K — Russell 2000 Micro',      mini: true  },
  { value: 'GC',  label: 'GC — Gold Futures',             mini: false },
  { value: 'MGC', label: 'MGC — Gold Micro',              mini: true  },
  { value: 'CL',  label: 'CL — Crude Oil',                mini: false },
  { value: 'MCL', label: 'MCL — Crude Oil Micro',         mini: true  },
];

const STRATEGY_TYPES = [
  { value: 'day_trading',    label: 'Day Trading',         desc: 'Open/close within session, balanced indicators' },
  { value: 'scalping',       label: 'Scalping',            desc: 'Fast in/out, tight ATR multiplier (1.0×)' },
  { value: 'swing_trading',  label: 'Swing Trading',       desc: 'Multi-day holds, wider ATR (2.5×), higher R:R' },
  { value: 'news_breakout',  label: 'News Breakout',       desc: 'Session open momentum, ADX filter ≥ 25' },
];

const PROP_FIRM_PRESETS = [
  { value: 'none',               label: 'None — Personal Account' },
  { value: 'TOPSTEP',            label: 'Topstep' },
  { value: 'APEX',               label: 'Apex Trader Funding' },
  { value: 'BULENOX',            label: 'Bulenox' },
  { value: 'EARN2TRADE',         label: 'Earn2Trade' },
  { value: 'TAKEPROFITTRADER',   label: 'Take Profit Trader' },
];

const ACCOUNT_SIZES = [10000, 25000, 50000, 100000, 150000, 250000, 300000];

const DAILY_LOSS_DEFAULTS: Record<string, Record<number, number>> = {
  TOPSTEP:          { 10000: 500,  25000: 1000, 50000: 2000, 100000: 3000 },
  APEX:             { 10000: 500,  25000: 1500, 50000: 2500, 100000: 3500 },
  BULENOX:          { 10000: 500,  25000: 1250, 50000: 2500, 100000: 3000 },
  EARN2TRADE:       { 10000: 500,  25000: 1250, 50000: 2500, 100000: 2500 },
  TAKEPROFITTRADER: { 10000: 500,  25000: 1500, 50000: 2500, 100000: 3500 },
};

function getDailyLossDefault(preset: string, size: number): number {
  if (!preset || !DAILY_LOSS_DEFAULTS[preset]) return 1500;
  const sizeMap = DAILY_LOSS_DEFAULTS[preset];
  if (sizeMap[size]) return sizeMap[size];
  // Return closest
  const keys = Object.keys(sizeMap).map(Number).sort((a, b) => a - b);
  for (const k of keys) if (k >= size) return sizeMap[k];
  return sizeMap[keys[keys.length - 1]];
}

export default function FuturesEaGenerator() {
  const { toast } = useToast();

  const [symbol, setSymbol]               = useState('NQ');
  const [strategyType, setStrategyType]   = useState('day_trading');
  const [contracts, setContracts]         = useState(1);
  const [propFirmPreset, setPropFirmPreset] = useState('none');
  const [accountSize, setAccountSize]     = useState(50000);
  const [dailyLossLimit, setDailyLossLimit] = useState(1500);
  const [atrMultiplier, setAtrMultiplier] = useState(1.5);
  const [rrRatio, setRrRatio]             = useState(2.0);
  const [useTrailingStop, setUseTrailingStop] = useState(false);
  const [trailingStopTicks, setTrailingStopTicks] = useState(20);
  const [exitOnSessionClose, setExitOnSessionClose] = useState(false);
  const [bidirectional, setBidirectional] = useState(true);
  const [strategyName, setStrategyName]   = useState('');
  const [maxContractsPerTrade, setMaxContractsPerTrade] = useState(5);

  const [showAdvanced, setShowAdvanced]   = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  // Fetch instrument details
  const { data: instrumentsData } = useQuery<{ instruments: any[] }>({
    queryKey: ['/api/futures/instruments'],
  });

  const selectedInstrument = instrumentsData?.instruments?.find(
    (i: any) => i.symbol === symbol
  );

  // When prop firm changes, auto-fill daily loss limit
  function handlePropFirmChange(preset: string) {
    setPropFirmPreset(preset);
    setExitOnSessionClose(preset === 'TOPSTEP');
    setDailyLossLimit(getDailyLossDefault(preset === 'none' ? '' : preset, accountSize));
  }

  function handleAccountSizeChange(size: number) {
    setAccountSize(size);
    if (propFirmPreset && propFirmPreset !== 'none')
      setDailyLossLimit(getDailyLossDefault(propFirmPreset, size));
  }

  // Generate and download NinjaScript
  const generateMutation = useMutation({
    mutationFn: async () => {
      const config = {
        strategyName: strategyName || `VEDD_${symbol}_Strategy`,
        strategyType,
        contracts,
        useTrailingStop,
        trailingStopTicks,
        propFirmPreset: (propFirmPreset && propFirmPreset !== 'none') ? propFirmPreset : undefined,
        dailyLossLimitDollars: dailyLossLimit,
        maxContractsPerTrade,
        atrMultiplier,
        rrRatio,
        exitOnSessionClose,
        bidirectional,
      };

      const res = await apiRequest('POST', '/api/futures/generate-ninjatrader', {
        symbol,
        analyses: [],
        config,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }

      return res.text();
    },
    onSuccess: (code) => {
      setGeneratedCode(code);
      // Trigger download
      const safeName = (strategyName || `VEDD_${symbol}_Strategy`).replace(/[^a-zA-Z0-9_]/g, '_');
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.cs`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: 'NinjaScript Downloaded', description: `${safeName}.cs saved to your downloads folder.` });
    },
    onError: (err: any) => {
      toast({ title: 'Generation Failed', description: err.message, variant: 'destructive' });
    },
  });

  const instrInfo = selectedInstrument;

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      {/* Header */}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800 px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Futures EA Generator</h1>
              <p className="text-gray-400 text-sm">Generate NinjaTrader 8 NinjaScript strategies from VEDD AI</p>
            </div>
            <Badge className="ml-auto bg-purple-500/20 text-purple-300 border-purple-500/30">NinjaTrader 8</Badge>
          </div>
          <p className="text-gray-500 text-xs mt-3 max-w-2xl">
            Configure your strategy parameters and download a production-ready C# NinjaScript file.
            Import directly into NinjaTrader 8 via Tools → Edit NinjaScript → Strategy.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-8 space-y-6">
        {/* Instrument + Strategy Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                Futures Instrument
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {SYMBOL_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value} className="text-white hover:bg-gray-700">
                      <span className="font-mono font-bold mr-2 text-purple-300">{s.value}</span>
                      <span className="text-gray-400 text-sm">{s.label.split(' — ')[1]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {instrInfo && (
                <div className="bg-gray-800/50 rounded-lg p-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className="text-gray-500 mb-0.5">Tick Value</div>
                    <div className="text-green-400 font-bold">${instrInfo.tickValue}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 mb-0.5">Tick Size</div>
                    <div className="text-white font-bold">{instrInfo.tickSize}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 mb-0.5">Point Val</div>
                    <div className="text-amber-400 font-bold">${instrInfo.pointValue}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Strategy Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {STRATEGY_TYPES.map(st => (
                  <button
                    key={st.value}
                    onClick={() => setStrategyType(st.value)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all text-sm ${
                      strategyType === st.value
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                        : 'bg-gray-800/60 border-gray-700/50 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <div className="font-semibold">{st.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">{st.desc}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Prop Firm + Risk Settings */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Prop Firm Rules &amp; Risk
            </CardTitle>
            <CardDescription className="text-gray-500 text-xs">
              Select your prop firm to auto-fill daily loss limits. Rules will be embedded as circuit breakers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Prop Firm Preset</label>
                <Select value={propFirmPreset} onValueChange={handlePropFirmChange}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm">
                    <SelectValue placeholder="None — Personal" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {PROP_FIRM_PRESETS.map(p => (
                      <SelectItem key={p.value} value={p.value} className="text-white hover:bg-gray-700 text-sm">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {propFirmPreset && (
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Account Size</label>
                  <Select value={String(accountSize)} onValueChange={v => handleAccountSizeChange(Number(v))}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {ACCOUNT_SIZES.map(s => (
                        <SelectItem key={s} value={String(s)} className="text-white hover:bg-gray-700 text-sm">
                          ${s.toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Daily Loss Limit ($)</label>
                <Input
                  type="number"
                  value={dailyLossLimit}
                  onChange={e => setDailyLossLimit(Number(e.target.value))}
                  className="bg-gray-800 border-gray-700 text-white text-sm"
                  min={0}
                />
                <p className="text-xs text-gray-600 mt-1">Strategy halts trading when this is hit</p>
              </div>
            </div>

            {propFirmPreset && propFirmPreset !== 'none' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  {propFirmPreset} rules active
                </Badge>
                {exitOnSessionClose && (
                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">
                    Exit on session close enabled
                  </Badge>
                )}
                <Badge className="bg-gray-700/50 text-gray-400 border-gray-700 text-xs">
                  ${dailyLossLimit.toLocaleString()} daily limit embedded
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Core Trade Parameters */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              Trade Parameters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Contracts Per Trade</label>
                <Input
                  type="number"
                  value={contracts}
                  onChange={e => setContracts(Math.max(1, Number(e.target.value)))}
                  className="bg-gray-800 border-gray-700 text-white text-sm"
                  min={1}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">ATR Stop Multiplier</label>
                <Input
                  type="number"
                  step={0.5}
                  value={atrMultiplier}
                  onChange={e => setAtrMultiplier(Number(e.target.value))}
                  className="bg-gray-800 border-gray-700 text-white text-sm"
                  min={0.5}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Risk:Reward Ratio</label>
                <Input
                  type="number"
                  step={0.5}
                  value={rrRatio}
                  onChange={e => setRrRatio(Number(e.target.value))}
                  className="bg-gray-800 border-gray-700 text-white text-sm"
                  min={1.0}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Max Contracts</label>
                <Input
                  type="number"
                  value={maxContractsPerTrade}
                  onChange={e => setMaxContractsPerTrade(Math.max(1, Number(e.target.value)))}
                  className="bg-gray-800 border-gray-700 text-white text-sm"
                  min={1}
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => setBidirectional(!bidirectional)}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
                  bidirectional
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    : 'bg-gray-800/60 border-gray-700/40 text-gray-500'
                }`}
              >
                <span className="text-xs font-medium">Both Long &amp; Short</span>
                <div className={`w-8 h-4 rounded-full transition-colors ${bidirectional ? 'bg-blue-500' : 'bg-gray-700'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${bidirectional ? 'translate-x-4.5' : 'translate-x-0.5'} ml-0.5`} />
                </div>
              </button>

              <button
                onClick={() => setUseTrailingStop(!useTrailingStop)}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
                  useTrailingStop
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-gray-800/60 border-gray-700/40 text-gray-500'
                }`}
              >
                <span className="text-xs font-medium">Trailing Stop</span>
                <div className={`w-8 h-4 rounded-full transition-colors ${useTrailingStop ? 'bg-amber-500' : 'bg-gray-700'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${useTrailingStop ? 'translate-x-4.5' : 'translate-x-0.5'} ml-0.5`} />
                </div>
              </button>

              <button
                onClick={() => setExitOnSessionClose(!exitOnSessionClose)}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
                  exitOnSessionClose
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-gray-800/60 border-gray-700/40 text-gray-500'
                }`}
              >
                <span className="text-xs font-medium">Exit on Session Close</span>
                <div className={`w-8 h-4 rounded-full transition-colors ${exitOnSessionClose ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${exitOnSessionClose ? 'translate-x-4.5' : 'translate-x-0.5'} ml-0.5`} />
                </div>
              </button>
            </div>

            {useTrailingStop && (
              <div className="mt-3 max-w-xs">
                <label className="text-xs text-gray-500 mb-1.5 block">Trailing Stop (Ticks)</label>
                <Input
                  type="number"
                  value={trailingStopTicks}
                  onChange={e => setTrailingStopTicks(Math.max(1, Number(e.target.value)))}
                  className="bg-gray-800 border-gray-700 text-white text-sm"
                  min={1}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Advanced: Strategy Name */}
        <Card className="bg-gray-900 border-gray-800">
          <button
            className="w-full px-5 py-4 flex items-center justify-between text-left"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-400 font-medium">Advanced Settings</span>
            </div>
            {showAdvanced ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
          </button>
          {showAdvanced && (
            <CardContent className="pt-0">
              <div className="max-w-sm">
                <label className="text-xs text-gray-500 mb-1.5 block">Strategy Class Name (optional)</label>
                <Input
                  type="text"
                  placeholder={`VEDD_${symbol}_Strategy`}
                  value={strategyName}
                  onChange={e => setStrategyName(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white text-sm"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Used as the NinjaScript class name. Only letters, numbers, underscores.
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Summary + Generate Button */}
        <Card className="bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border border-purple-500/30">
          <CardContent className="p-5">
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold text-white">Generation Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  <div className="text-gray-500">Symbol</div>
                  <div className="text-white font-mono font-bold">{symbol}</div>
                  <div className="text-gray-500">Strategy</div>
                  <div className="text-gray-300">{STRATEGY_TYPES.find(s => s.value === strategyType)?.label}</div>
                  <div className="text-gray-500">Contracts</div>
                  <div className="text-gray-300">{contracts} × {instrInfo ? `$${(contracts * instrInfo.tickValue * 10).toLocaleString()} risk/move` : ''}</div>
                  <div className="text-gray-500">ATR Stop / R:R</div>
                  <div className="text-gray-300">{atrMultiplier}× / {rrRatio}:1</div>
                  <div className="text-gray-500">Daily Limit</div>
                  <div className="text-red-400 font-semibold">${dailyLossLimit.toLocaleString()}</div>
                  <div className="text-gray-500">Prop Firm</div>
                  <div className="text-emerald-400">{propFirmPreset || 'None'}</div>
                </div>
              </div>

              <div className="md:self-center">
                <Button
                  size="lg"
                  disabled={generateMutation.isPending}
                  onClick={() => generateMutation.mutate()}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/40 w-full md:w-auto px-8"
                >
                  {generateMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Download .cs File
                    </>
                  )}
                </Button>
                <p className="text-xs text-gray-500 mt-1.5 text-center">NinjaScript C# file</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Code Preview */}
        {generatedCode && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-green-400" />
                  Generated NinjaScript Preview
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedCode);
                    toast({ title: 'Copied', description: 'NinjaScript code copied to clipboard' });
                  }}
                  className="border-gray-700 text-gray-400 hover:text-white text-xs h-7"
                >
                  Copy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-950 rounded-lg p-4 text-xs text-green-300 font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre leading-relaxed">
                {generatedCode.slice(0, 4000)}{generatedCode.length > 4000 ? '\n\n// ... (truncated — full file was downloaded)' : ''}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Installation Guide */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-400" />
              NinjaTrader 8 Installation Guide
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {[
                { n: 1, title: 'Open NinjaTrader 8', detail: 'Launch NT8 and ensure you are connected to your data feed.' },
                { n: 2, title: 'Go to Tools → Edit NinjaScript → Strategy', detail: 'This opens the NinjaScript editor.' },
                { n: 3, title: `Create a new strategy named "${strategyName || `VEDD_${symbol}_Strategy`}"`, detail: 'Click New, enter the class name exactly as shown above.' },
                { n: 4, title: 'Paste the downloaded code', detail: 'Delete the default template and paste the full .cs file contents.' },
                { n: 5, title: 'Compile with F5', detail: 'Fix any compilation errors (usually namespace or using issues). The strategy should compile clean.' },
                { n: 6, title: 'Attach to chart', detail: `Right-click your ${symbol} chart → Strategies → add ${strategyName || `VEDD_${symbol}_Strategy`}. Set parameters in the dialog.` },
              ].map(step => (
                <li key={step.n} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 text-xs flex items-center justify-center font-bold border border-purple-500/30">
                    {step.n}
                  </span>
                  <div>
                    <div className="text-white text-xs font-semibold">{step.title}</div>
                    <div className="text-gray-500 text-xs">{step.detail}</div>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-5 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-300/80">
                <strong className="text-amber-300">Risk Warning:</strong> Always test on NinjaTrader Simulation mode first.
                The daily loss limit is a safety circuit breaker — it does <strong>not</strong> guarantee you won't hit prop firm drawdown rules.
                Monitor your account in Tradovate alongside NinjaTrader's built-in P&amp;L tracker.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
