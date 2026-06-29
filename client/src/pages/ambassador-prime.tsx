import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Zap, Play, Twitter, Linkedin, Instagram, Calendar,
  BarChart2, CheckCircle, XCircle, Clock, Image, Copy, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface RunSummary {
  id: number;
  runDate: string;
  tweetsPosted: number;
  linkedinPosts: number;
  igCaptionsGenerated: number;
  redditPostsScraped: number;
  emailSent: boolean;
  imageGenerated: boolean;
  dayTheme: string | null;
  createdAt: string;
}

interface ContentItem {
  id: number;
  runDate: string;
  platform: string;
  postType: string | null;
  contentText: string | null;
  postId: string | null;
  status: string | null;
}

interface HookVariation {
  id: number;
  variation: string | null;
  hookText: string | null;
  ctaText: string | null;
}

interface KpiData {
  totalPostsPublished: number;
  referralLinksIncluded: number;
  estimatedReach: number;
  redditInsightsCount: number;
  engagementOpportunities: number;
  moduleTopic: string | null;
}

interface DayContent {
  content: ContentItem[];
  hooks: HookVariation[];
  bonus: { contentType: string; contentText: string }[];
  community: { contentType: string; contentText: string }[];
  insights: { subreddit: string; insight: string }[];
  steps: { stepName: string; status: string; errorMessage: string | null }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button variant="ghost" size="sm" onClick={copy} className="h-6 px-2 text-xs text-slate-400 hover:text-white">
      {copied ? <CheckCircle className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const map: Record<string, { color: string; icon: any }> = {
    twitter:   { color: 'bg-sky-500/20 text-sky-400 border-sky-500/30', icon: Twitter },
    linkedin:  { color: 'bg-blue-600/20 text-blue-400 border-blue-600/30', icon: Linkedin },
    instagram: { color: 'bg-pink-500/20 text-pink-400 border-pink-500/30', icon: Instagram },
  };
  const cfg = map[platform] ?? { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: Zap };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {platform}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === 'posted') return <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1" />;
  if (status === 'failed') return <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1" />;
}

function ContentCard({ item }: { item: ContentItem }) {
  const [expanded, setExpanded] = useState(false);
  const text = item.contentText ?? '';
  const preview = text.slice(0, 120);
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <PlatformBadge platform={item.platform} />
          <span className="text-xs text-slate-500">{item.postType}</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusDot status={item.status ?? 'generated'} />
          <span className="text-xs text-slate-500">{item.status ?? 'generated'}</span>
          <CopyBtn text={text} />
        </div>
      </div>
      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
        {expanded ? text : preview}
        {text.length > 120 && !expanded && '…'}
      </p>
      {text.length > 120 && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-slate-500 hover:text-slate-300 mt-1 flex items-center gap-1">
          {expanded ? <><ChevronUp className="h-3 w-3" />Show less</> : <><ChevronDown className="h-3 w-3" />Show more</>}
        </button>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-center">
      <Icon className={`h-5 w-5 mx-auto mb-2 ${color}`} />
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

// ── Step Log ─────────────────────────────────────────────────────────────────
function StepLog({ steps }: { steps: DayContent['steps'] }) {
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          {s.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />}
          {s.status === 'skipped'   && <Clock        className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />}
          {s.status === 'failed'    && <XCircle      className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
          <div>
            <span className={s.status === 'completed' ? 'text-slate-200' : s.status === 'failed' ? 'text-red-300' : 'text-slate-400'}>{s.stepName}</span>
            {s.errorMessage && <div className="text-xs text-red-400 mt-0.5">{s.errorMessage}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AmbassadorPrimePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  const { data: todayData, isLoading: todayLoading } = useQuery<{
    summary: RunSummary | null;
    content: ContentItem[];
    kpis: KpiData | null;
    date: string;
  }>({ queryKey: ['/api/ambassador-prime/today'] });

  const { data: historyData } = useQuery<{ runs: RunSummary[] }>({ queryKey: ['/api/ambassador-prime/history'] });

  const { data: dayContent, isLoading: dayLoading } = useQuery<DayContent>({
    queryKey: ['/api/ambassador-prime/content', selectedDate],
    queryFn: () => fetch(`/api/ambassador-prime/content/${selectedDate}`).then(r => r.json()),
    enabled: !!selectedDate,
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/ambassador-prime/run'),
    onSuccess: () => {
      toast({ title: 'Ambassador Prime started', description: 'Run triggered — email report coming in ~5 min' });
      setTimeout(() => { qc.invalidateQueries({ queryKey: ['/api/ambassador-prime/today'] }); }, 10000);
    },
    onError: () => toast({ title: 'Error', description: 'Failed to trigger run', variant: 'destructive' }),
  });

  const dayTheme = todayData?.summary?.dayTheme ?? 'Loading…';
  const kpis = todayData?.kpis;
  const content = todayData?.content ?? [];
  const runs = historyData?.runs ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Zap className="h-7 w-7 text-orange-400" />
              <h1 className="text-2xl font-bold text-white">Ambassador Prime</h1>
              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">Daily Growth Engine v4</Badge>
            </div>
            <p className="text-slate-400 text-sm">Fault-tolerant daily content automation for <span className="text-orange-400">veddbuild.com</span></p>
          </div>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
          >
            <Play className="h-4 w-4" />
            {runMutation.isPending ? 'Starting…' : 'Run Now'}
          </Button>
        </div>

        {/* Today theme banner */}
        {todayData?.summary && (
          <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-orange-400 uppercase tracking-wider mb-1">Today's Theme</div>
                <div className="text-xl font-bold text-white">{dayTheme}</div>
              </div>
              <div className="flex items-center gap-3">
                {todayData.summary.emailSent && <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Email Sent</Badge>}
                {todayData.summary.imageGenerated && <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30"><Image className="h-3 w-3 mr-1" />Image</Badge>}
              </div>
            </div>
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <KpiCard icon={Twitter}   label="Tweets Posted"     value={todayData?.summary?.tweetsPosted ?? 0}         color="text-sky-400" />
          <KpiCard icon={Linkedin}  label="LinkedIn Posts"    value={todayData?.summary?.linkedinPosts ?? 0}        color="text-blue-400" />
          <KpiCard icon={Instagram} label="IG Captions"       value={todayData?.summary?.igCaptionsGenerated ?? 0}  color="text-pink-400" />
          <KpiCard icon={BarChart2} label="Reddit Scraped"    value={todayData?.summary?.redditPostsScraped ?? 0}   color="text-orange-400" />
          <KpiCard icon={Zap}       label="Est. Reach"        value={kpis ? `${((kpis.estimatedReach ?? 0)/1000).toFixed(1)}k` : '—'} color="text-yellow-400" />
          <KpiCard icon={CheckCircle} label="Referral Links"  value={kpis?.referralLinksIncluded ?? 0}              color="text-green-400" />
        </div>

        {/* Main tabs */}
        <Tabs defaultValue="today">
          <TabsList className="bg-slate-800 mb-6">
            <TabsTrigger value="today">Today's Content</TabsTrigger>
            <TabsTrigger value="history">Run History</TabsTrigger>
            <TabsTrigger value="browse">Browse by Date</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
          </TabsList>

          {/* Today */}
          <TabsContent value="today">
            {todayLoading ? (
              <div className="text-slate-500 text-center py-12">Loading today's content…</div>
            ) : content.length === 0 ? (
              <div className="text-center py-16">
                <Zap className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                <div className="text-slate-400 text-lg mb-2">No content generated today yet</div>
                <div className="text-slate-600 text-sm mb-6">The engine runs daily at 09:00 UTC. Click "Run Now" to trigger immediately.</div>
                <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} className="bg-orange-500 hover:bg-orange-600">
                  <Play className="h-4 w-4 mr-2" />Run Now
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Content list */}
                <div className="lg:col-span-2 space-y-2">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Generated Content</h3>
                  {content.map(item => <ContentCard key={item.id} item={item} />)}
                </div>
                {/* Sidebar */}
                <div className="space-y-4">
                  {/* Step log */}
                  <Card className="bg-slate-900 border-slate-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-slate-300">Step Log</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dayContent?.steps?.length ? <StepLog steps={dayContent.steps} /> : <div className="text-xs text-slate-600">No step data</div>}
                    </CardContent>
                  </Card>
                  {/* Reddit insights */}
                  {dayContent?.insights?.length ? (
                    <Card className="bg-slate-900 border-slate-700">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-300">Reddit Insights</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {dayContent.insights.map((ins, i) => (
                            <div key={i} className="text-xs text-slate-400 bg-slate-800 rounded p-2">{ins.insight}</div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                  {/* Community prompt */}
                  {dayContent?.community?.[0] && (
                    <Card className="bg-slate-900 border-slate-700">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-300">Community Prompt</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xs text-slate-300 bg-slate-800 rounded p-3 relative">
                          {dayContent.community[0].contentText}
                          <CopyBtn text={dayContent.community[0].contentText} />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {/* Bonus */}
                  {dayContent?.bonus?.[0] && (
                    <Card className="bg-slate-900 border-slate-700">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-300">Bonus Content</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xs text-slate-300 bg-slate-800 rounded p-3">{dayContent.bonus[0].contentText}</div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* History */}
          <TabsContent value="history">
            <div className="space-y-3">
              {runs.length === 0 ? (
                <div className="text-slate-500 text-center py-12">No runs yet</div>
              ) : runs.map(run => (
                <div key={run.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white">{run.dayTheme ?? run.runDate}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{run.runDate}</div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-sky-400 flex items-center gap-1"><Twitter className="h-3 w-3" />{run.tweetsPosted}</span>
                    <span className="text-blue-400 flex items-center gap-1"><Linkedin className="h-3 w-3" />{run.linkedinPosts}</span>
                    <span className="text-pink-400 flex items-center gap-1"><Instagram className="h-3 w-3" />{run.igCaptionsGenerated}</span>
                    <div className="flex items-center gap-1">
                      {run.emailSent ? <CheckCircle className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-slate-600" />}
                      <span className="text-xs text-slate-500">email</span>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setSelectedDate(run.runDate)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Browse by date */}
          <TabsContent value="browse">
            <div className="mb-4 flex items-center gap-3">
              <Calendar className="h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
              />
            </div>
            {dayLoading ? (
              <div className="text-slate-500 text-center py-8">Loading…</div>
            ) : !dayContent?.content?.length ? (
              <div className="text-slate-500 text-center py-8">No content for {selectedDate}</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-2">
                  {dayContent.content.map(item => <ContentCard key={item.id} item={item} />)}
                  {dayContent.hooks.length > 0 && (
                    <Card className="bg-slate-900 border-slate-700 mt-4">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-300">Hook A/B/C Variations</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {dayContent.hooks.map(h => (
                          <div key={h.id} className="mb-2 p-3 bg-slate-800 rounded-lg">
                            <div className="text-xs text-orange-400 font-semibold mb-1">Variation {h.variation}</div>
                            <div className="text-sm text-slate-200 flex items-start justify-between gap-2">
                              <span>{h.hookText}</span>
                              <CopyBtn text={h.hookText ?? ''} />
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
                <div className="space-y-4">
                  {dayContent.steps.length > 0 && (
                    <Card className="bg-slate-900 border-slate-700">
                      <CardHeader className="pb-3"><CardTitle className="text-sm text-slate-300">Step Log</CardTitle></CardHeader>
                      <CardContent><StepLog steps={dayContent.steps} /></CardContent>
                    </Card>
                  )}
                  {dayContent.insights.length > 0 && (
                    <Card className="bg-slate-900 border-slate-700">
                      <CardHeader className="pb-3"><CardTitle className="text-sm text-slate-300">Reddit Insights</CardTitle></CardHeader>
                      <CardContent>
                        {dayContent.insights.map((ins, i) => (
                          <div key={i} className="text-xs text-slate-400 bg-slate-800 rounded p-2 mb-1">{ins.insight}</div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Setup */}
          <TabsContent value="setup">
            <div className="max-w-xl space-y-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Required Environment Variables</h3>
                <div className="space-y-3">
                  {[
                    { key: 'TWITTER_API_KEY', desc: 'Twitter API v2 consumer key (OAuth 1.0a)', required: true },
                    { key: 'TWITTER_API_SECRET', desc: 'Twitter API v2 consumer secret', required: true },
                    { key: 'TWITTER_ACCESS_TOKEN', desc: 'Twitter access token (your account)', required: true },
                    { key: 'TWITTER_ACCESS_TOKEN_SECRET', desc: 'Twitter access token secret', required: true },
                    { key: 'LINKEDIN_ACCESS_TOKEN', desc: 'LinkedIn OAuth 2.0 access token', required: true },
                    { key: 'OPENAI_API_KEY', desc: 'OpenAI key (for DALL-E 3 images + content AI)', required: true },
                    { key: 'APIFY_API_TOKEN', desc: 'Apify token (Reddit scraping)', required: false },
                    { key: 'SENDGRID_API_KEY', desc: 'SendGrid key (daily email report)', required: true },
                  ].map(({ key, desc, required }) => (
                    <div key={key} className="flex items-start gap-3 p-3 bg-slate-800 rounded-lg">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${required ? 'bg-orange-400' : 'bg-slate-500'}`} />
                      <div>
                        <div className="text-sm font-mono text-slate-200">{key}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                      </div>
                      {required && <Badge className="ml-auto bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">Required</Badge>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Schedule</h3>
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Clock className="h-4 w-4 text-orange-400" />
                  Runs automatically at <span className="font-mono text-orange-400">09:00 UTC</span> every day
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Referral link embedded in all posts: <span className="text-orange-400 font-mono break-all">https://veddbuild.com/auth?ref=DONCHISMKOS@GMAIL.COM511</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
