import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Redirect } from 'wouter';
import {
  Building2, CheckCircle2, Circle, ExternalLink, ChevronRight,
  Loader2, Sparkles, DollarSign, CreditCard, Landmark, FileText,
  ArrowLeft, BarChart3, Briefcase, Globe, Award,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface BizProfile {
  id: number;
  userId: number;
  businessName: string | null;
  businessIdea: string;
  entityType: string;
  state: string;
  status: string;
  aiDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AiData {
  suggestedNames: string[];
  description: string;
  entityRecommendation: { type: string; reason: string };
  fundingMatches: { name: string; type: string; reason: string }[];
}

interface NameCheck {
  id: number;
  nameChecked: string;
  available: boolean;
  source: string;
}

interface CreditTask {
  id: number;
  taskName: string;
  taskType: string;
  provider: string | null;
  url: string | null;
  status: string;
  dueDate: string | null;
  notes: string | null;
  completedAt: string | null;
}

interface FundingMatch {
  id: number;
  funderName: string;
  funderType: string;
  matchScore: number;
  amountRange: string | null;
  applyUrl: string | null;
  notes: string | null;
}

interface ProfileData {
  profile: BizProfile | null;
  nameChecks?: NameCheck[];
  formationLinks?: { provider: string; redirectUrl: string }[];
  bankLinks?: { provider: string; referralUrl: string }[];
  creditTasks?: CreditTask[];
  fundingMatches?: FundingMatch[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const STATE_NAMES: Record<string,string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};

const WIZARD_STEPS = ['Idea', 'Names', 'Formation', 'Banking', 'Credit Plan', 'Funding'];

const STATUS_STEP: Record<string, number> = {
  draft: 0, name_check: 1, formation: 2, ein_pending: 2,
  banking: 3, credit_building: 4, funded: 5,
};

const FUNDER_COLORS: Record<string, string> = {
  grant:          'bg-green-900/40 text-green-300 border-green-600/40',
  cdfi:           'bg-blue-900/40 text-blue-300 border-blue-600/40',
  sponsor:        'bg-purple-900/40 text-purple-300 border-purple-600/40',
  microloan:      'bg-amber-900/40 text-amber-300 border-amber-600/40',
  revenue_share:  'bg-teal-900/40 text-teal-300 border-teal-600/40',
};

const TASK_TYPE_COLORS: Record<string, string> = {
  duns_registration: 'bg-indigo-900/40 text-indigo-300',
  credit_monitoring: 'bg-blue-900/40 text-blue-300',
  net30:             'bg-amber-900/40 text-amber-300',
  trade_line:        'bg-green-900/40 text-green-300',
};

// ── Progress Bar ──────────────────────────────────────────────────────────────
function WizardProgress({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        {WIZARD_STEPS.map((label, i) => (
          <div key={label} className="flex flex-col items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1 transition-all
              ${i < step  ? 'bg-yellow-500 text-black'  : ''}
              ${i === step ? 'bg-yellow-400 text-black ring-2 ring-yellow-300/50' : ''}
              ${i > step  ? 'bg-white/10 text-white/40' : ''}
            `}>
              {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-[10px] font-medium text-center hidden sm:block
              ${i === step ? 'text-yellow-400' : i < step ? 'text-yellow-500/70' : 'text-white/30'}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="relative h-1.5 bg-white/10 rounded-full">
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-500"
          style={{ width: `${(step / (WIZARD_STEPS.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    draft: 'Draft', name_check: 'Naming', formation: 'Forming',
    ein_pending: 'EIN Pending', banking: 'Banking', credit_building: 'Credit Building', funded: 'Funded ✓',
  };
  return (
    <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs">
      {labels[status] || status}
    </Badge>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BizBuilderPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep]             = useState(0);
  const [aiData, setAiData]         = useState<AiData | null>(null);
  const [checkedNames, setChecked]  = useState<Record<string, boolean>>({});

  // Form state — Step 1
  const [idea, setIdea]             = useState('');
  const [entityType, setEntityType] = useState('llc');
  const [state, setState]           = useState('TX');

  if (!user) return <Redirect to="/auth" />;

  // ── Load existing profile on mount ────────────────────────────────────────
  const { data: profileData, isLoading: profileLoading } = useQuery<ProfileData>({
    queryKey: ['biz-profile'],
    queryFn:  () => apiRequest('GET', '/api/biz-builder/my-profile').then(r => r.json()),
  });

  // Restore wizard position from profile status
  useEffect(() => {
    if (profileData?.profile) {
      const s = STATUS_STEP[profileData.profile.status] ?? 0;
      setStep(s);
    }
  }, [profileData?.profile?.status]);

  const profile      = profileData?.profile ?? null;
  const nameChecks   = profileData?.nameChecks ?? [];
  const creditTasks  = profileData?.creditTasks ?? [];
  const fundingMatches = profileData?.fundingMatches ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/biz-builder/create', { businessIdea: idea, entityType, state }).then(r => r.json()),
    onSuccess: (data) => {
      setAiData(data.aiData);
      qc.invalidateQueries({ queryKey: ['biz-profile'] });
      setStep(1);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const nameCheckMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest('POST', `/api/biz-builder/${profile!.id}/name-check`, { name }).then(r => r.json()),
    onSuccess: (data) => {
      setChecked(prev => ({ ...prev, [data.name]: true }));
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const formationMutation = useMutation({
    mutationFn: (provider: string) =>
      apiRequest('POST', `/api/biz-builder/${profile!.id}/select-formation`, { provider }).then(r => r.json()),
    onSuccess: (data) => {
      window.open(data.redirectUrl, '_blank');
      qc.invalidateQueries({ queryKey: ['biz-profile'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const bankMutation = useMutation({
    mutationFn: (provider: string) =>
      apiRequest('POST', `/api/biz-builder/${profile!.id}/select-bank`, { provider }).then(r => r.json()),
    onSuccess: (data) => {
      window.open(data.referralUrl, '_blank');
      qc.invalidateQueries({ queryKey: ['biz-profile'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const creditTasksMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/biz-builder/${profile!.id}/generate-credit-tasks`, {}).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-profile'] });
      toast({ title: '90-Day Plan Generated!', description: 'Your credit building roadmap is ready.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const fundingMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/biz-builder/${profile!.id}/generate-funding-matches`, {}).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-profile'] });
      toast({ title: 'Funding Matches Found!', description: 'Top opportunities matched to your business.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleTaskMutation = useMutation({
    mutationFn: (taskId: number) =>
      apiRequest('PATCH', `/api/biz-builder/tasks/${taskId}/complete`, {}).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz-profile'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── Suggested names — from aiData (fresh) or name checks (restored) ────────
  const suggestedNames: string[] = aiData?.suggestedNames ??
    (nameChecks.length ? nameChecks.map(n => n.nameChecked) : []);

  // ── Task grouping helpers ─────────────────────────────────────────────────
  function groupTasksByWeek(tasks: CreditTask[]) {
    const groups: Record<string, CreditTask[]> = {};
    tasks.forEach(t => {
      if (!t.dueDate) { (groups['Later'] ??= []).push(t); return; }
      const d = new Date(t.dueDate);
      const now = new Date();
      const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
      const label = diffDays <= 7   ? 'Week 1'
                  : diffDays <= 14  ? 'Week 2'
                  : diffDays <= 21  ? 'Week 3'
                  : diffDays <= 60  ? 'Month 2'
                  : 'Month 3';
      (groups[label] ??= []).push(t);
    });
    return groups;
  }

  const completedCount = creditTasks.filter(t => t.status === 'complete').length;

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-6 h-6 text-yellow-400" />
              <h1 className="text-2xl font-bold text-white">Business Credit Builder</h1>
            </div>
            <p className="text-sm text-white/50">Form your LLC, open banking, build business credit, find funding — step by step.</p>
          </div>
          {profile && <StatusBadge status={profile.status} />}
        </div>

        {/* Progress */}
        <WizardProgress step={step} />

        {/* ── Step 1: Your Idea ─────────────────────────────────────────────── */}
        {step === 0 && (
          <Card className="bg-white/5 border-white/10 p-6">
            <h2 className="text-lg font-bold text-white mb-1">Describe Your Business</h2>
            <p className="text-sm text-white/50 mb-5">Tell us your idea and we'll generate names, an entity recommendation, and a launch roadmap.</p>

            <label className="block text-xs font-semibold text-white/60 mb-1 uppercase tracking-wider">Business Idea</label>
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/30 resize-none mb-4 focus:outline-none focus:border-yellow-500/50"
              rows={4}
              placeholder="e.g. An online store selling handmade candles with subscription boxes shipped monthly..."
              value={idea}
              onChange={e => setIdea(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1 uppercase tracking-wider">Entity Type</label>
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                  value={entityType}
                  onChange={e => setEntityType(e.target.value)}
                >
                  <option value="llc">LLC (Recommended)</option>
                  <option value="s_corp">S-Corp</option>
                  <option value="c_corp">C-Corp</option>
                  <option value="sole_prop">Sole Proprietorship</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1 uppercase tracking-wider">State</label>
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                  value={state}
                  onChange={e => setState(e.target.value)}
                >
                  {US_STATES.map(s => (
                    <option key={s} value={s}>{STATE_NAMES[s]} ({s})</option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 text-sm"
              disabled={!idea.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating Your Business Plan…</>
                : <><Sparkles className="w-4 h-4 mr-2" />Generate My Business Plan →</>}
            </Button>
          </Card>
        )}

        {/* ── Step 2: Names ─────────────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">AI-Generated Name Suggestions</h2>
              <button onClick={() => setStep(0)} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            </div>

            {aiData?.description && (
              <Card className="bg-yellow-500/5 border-yellow-500/20 p-4 mb-5">
                <p className="text-sm text-white/70 leading-relaxed">{aiData.description}</p>
                {aiData.entityRecommendation && (
                  <div className="mt-3 text-xs text-yellow-400/80">
                    <span className="font-semibold">Recommended entity:</span> {aiData.entityRecommendation.type} — {aiData.entityRecommendation.reason}
                  </div>
                )}
              </Card>
            )}

            <div className="space-y-3 mb-6">
              {(suggestedNames.length ? suggestedNames : ['Loading names…']).map((name, i) => {
                const isChecked = checkedNames[name];
                return (
                  <Card key={i} className="bg-white/5 border-white/10 p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-white text-sm">{name}</div>
                      {isChecked && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-green-400">
                          <CheckCircle2 className="w-3 h-3" /> Appears Available
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!isChecked && profile && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs border-white/20 text-white/60 hover:text-white hover:border-white/40"
                          disabled={nameCheckMutation.isPending}
                          onClick={() => nameCheckMutation.mutate(name)}
                        >
                          {nameCheckMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Check'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
                        onClick={() => setStep(2)}
                      >
                        Use This →
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Button
              className="w-full bg-white/10 hover:bg-white/15 text-white font-semibold text-sm py-3"
              onClick={() => setStep(2)}
            >
              I've chosen my name — continue to Formation →
            </Button>
          </div>
        )}

        {/* ── Step 3: Formation ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white">Form Your Business</h2>
              <button onClick={() => setStep(1)} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            </div>
            <p className="text-sm text-white/50 mb-5">Choose a formation provider and start your LLC or corporation.</p>

            <div className="grid sm:grid-cols-3 gap-4 mb-4">
              {[
                {
                  key: 'stripe_atlas', name: 'Stripe Atlas', price: '$500 flat',
                  entity: 'Delaware C-Corp or LLC', time: '1–2 weeks',
                  best: 'VC-backed startups', icon: '⚡',
                },
                {
                  key: 'incfile', name: 'Incfile', price: 'Free + state fees',
                  entity: 'All 50 states', time: '1–3 weeks',
                  best: 'Solo founders', icon: '📄',
                },
                {
                  key: 'zenbusiness', name: 'ZenBusiness', price: '$49 + state fees',
                  entity: 'All 50 states', time: '1–2 weeks',
                  best: 'Small teams', icon: '🧘',
                },
              ].map(p => (
                <Card key={p.key} className="bg-white/5 border-white/10 p-4 flex flex-col gap-3 hover:border-yellow-500/30 transition-colors">
                  <div className="text-2xl">{p.icon}</div>
                  <div>
                    <div className="font-bold text-white text-sm">{p.name}</div>
                    <div className="text-yellow-400 font-semibold text-xs mt-0.5">{p.price}</div>
                  </div>
                  <div className="text-xs text-white/50 space-y-0.5">
                    <div>{p.entity}</div>
                    <div>{p.time}</div>
                    <div className="text-white/40">Best for: {p.best}</div>
                  </div>
                  <Button
                    size="sm"
                    className="mt-auto bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs w-full"
                    disabled={!profile || formationMutation.isPending}
                    onClick={() => formationMutation.mutate(p.key)}
                  >
                    {formationMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Start Formation →'}
                  </Button>
                </Card>
              ))}
            </div>

            <p className="text-xs text-white/40 mb-5 text-center">
              Your EIN (tax ID) will be obtained as part of your formation package — no separate IRS filing needed.
            </p>

            <Button
              className="w-full bg-white/10 hover:bg-white/15 text-white font-semibold text-sm py-3"
              onClick={() => setStep(3)}
            >
              I've started my formation → Continue to Banking
            </Button>
          </div>
        )}

        {/* ── Step 4: Banking ───────────────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white">Open a Business Bank Account</h2>
              <button onClick={() => setStep(2)} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            </div>
            <p className="text-sm text-white/50 mb-5">A dedicated business account is required for all credit building steps.</p>

            <div className="grid sm:grid-cols-3 gap-4 mb-5">
              {[
                {
                  key: 'mercury', name: 'Mercury', icon: '🌊',
                  fee: 'No fees', features: 'Built for startups · FDIC insured',
                  best: 'Best overall for tech companies',
                },
                {
                  key: 'relay', name: 'Relay', icon: '📡',
                  fee: 'No fees', features: '20 accounts + 50 cards · FDIC insured',
                  best: 'Best for cash flow management',
                },
                {
                  key: 'found', name: 'Found', icon: '💼',
                  fee: 'No fees', features: 'Built-in bookkeeping · FDIC insured',
                  best: 'Best for solopreneurs & freelancers',
                },
              ].map(b => (
                <Card key={b.key} className="bg-white/5 border-white/10 p-4 flex flex-col gap-3 hover:border-yellow-500/30 transition-colors">
                  <div className="text-2xl">{b.icon}</div>
                  <div>
                    <div className="font-bold text-white text-sm">{b.name}</div>
                    <div className="text-green-400 font-semibold text-xs mt-0.5">{b.fee}</div>
                  </div>
                  <div className="text-xs text-white/50 space-y-0.5">
                    <div>{b.features}</div>
                    <div className="text-white/40">{b.best}</div>
                  </div>
                  <Button
                    size="sm"
                    className="mt-auto bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs w-full"
                    disabled={!profile || bankMutation.isPending}
                    onClick={() => bankMutation.mutate(b.key)}
                  >
                    {bankMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Open Account →'}
                  </Button>
                </Card>
              ))}
            </div>

            <Button
              className="w-full bg-white/10 hover:bg-white/15 text-white font-semibold text-sm py-3"
              onClick={() => setStep(4)}
            >
              I've opened my account → Continue to Credit Plan
            </Button>
          </div>
        )}

        {/* ── Step 5: Credit Plan ───────────────────────────────────────────── */}
        {step === 4 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white">Your 90-Day Credit Building Plan</h2>
              <button onClick={() => setStep(3)} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            </div>
            <p className="text-sm text-white/50 mb-5">Following this plan builds a fundable business credit profile in 90 days.</p>

            {creditTasks.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-10 h-10 text-yellow-400/50 mx-auto mb-4" />
                <p className="text-white/50 text-sm mb-5">No credit plan generated yet. Click below to build your personalized 90-day roadmap.</p>
                <Button
                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-8"
                  disabled={!profile || creditTasksMutation.isPending}
                  onClick={() => creditTasksMutation.mutate()}
                >
                  {creditTasksMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating Plan…</>
                    : <><Sparkles className="w-4 h-4 mr-2" />Generate My Credit Plan</>}
                </Button>
              </div>
            ) : (
              <>
                {/* Progress bar */}
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-5">
                  <div className="flex justify-between text-xs text-white/60 mb-2">
                    <span>Progress</span>
                    <span className="font-semibold text-yellow-400">{completedCount}/{creditTasks.length} complete</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all"
                      style={{ width: `${(completedCount / creditTasks.length) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Tasks by week */}
                {Object.entries(groupTasksByWeek(creditTasks)).map(([group, tasks]) => (
                  <div key={group} className="mb-5">
                    <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">{group}</h3>
                    <div className="space-y-2">
                      {tasks.map(task => {
                        const done = task.status === 'complete';
                        return (
                          <div
                            key={task.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                              done ? 'bg-yellow-500/5 border-yellow-500/20 opacity-60' : 'bg-white/5 border-white/10'
                            }`}
                          >
                            <button
                              className="mt-0.5 shrink-0"
                              onClick={() => toggleTaskMutation.mutate(task.id)}
                            >
                              {done
                                ? <CheckCircle2 className="w-5 h-5 text-yellow-400" />
                                : <Circle className="w-5 h-5 text-white/30 hover:text-white/60" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-medium ${done ? 'line-through text-white/40' : 'text-white'}`}>
                                {task.taskName}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {task.taskType && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${TASK_TYPE_COLORS[task.taskType] || 'bg-white/10 text-white/50'}`}>
                                    {task.taskType.replace('_', ' ')}
                                  </span>
                                )}
                                {task.provider && <span className="text-xs text-white/40">{task.provider}</span>}
                                {task.dueDate && <span className="text-xs text-white/30">Due {task.dueDate}</span>}
                              </div>
                              {task.notes && <p className="text-xs text-white/40 mt-1 leading-relaxed">{task.notes}</p>}
                            </div>
                            {task.url && (
                              <a
                                href={task.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-white/30 hover:text-yellow-400 transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {creditTasks.length > 0 && (
              <Button
                className="w-full mt-4 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm py-3"
                onClick={() => setStep(5)}
              >
                Continue to Funding Matches →
              </Button>
            )}
          </div>
        )}

        {/* ── Step 6: Funding ───────────────────────────────────────────────── */}
        {step === 5 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white">Your Funding Opportunities</h2>
              <button onClick={() => setStep(4)} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            </div>
            <p className="text-sm text-white/50 mb-5">Matched based on your business type, location, and idea.</p>

            {fundingMatches.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="w-10 h-10 text-yellow-400/50 mx-auto mb-4" />
                <p className="text-white/50 text-sm mb-5">Find grants, CDFIs, microloans, and sponsors matched to your exact business.</p>
                <Button
                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-8"
                  disabled={!profile || fundingMutation.isPending}
                  onClick={() => fundingMutation.mutate()}
                >
                  {fundingMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Matching…</>
                    : <><Sparkles className="w-4 h-4 mr-2" />Find My Funding</>}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {fundingMatches.map(match => (
                  <Card key={match.id} className="bg-white/5 border-white/10 p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="font-bold text-white text-sm">{match.funderName}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${FUNDER_COLORS[match.funderType] || 'bg-white/10 text-white/50 border-white/10'}`}>
                            {match.funderType.replace('_', ' ')}
                          </span>
                          {match.amountRange && (
                            <span className="text-xs text-white/50">{match.amountRange}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-white/40 mb-1">Match</div>
                        <div className="text-lg font-black text-yellow-400">{match.matchScore}%</div>
                      </div>
                    </div>

                    {/* Match score bar */}
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full"
                        style={{ width: `${match.matchScore}%` }}
                      />
                    </div>

                    {match.notes && <p className="text-xs text-white/50 leading-relaxed mb-3">{match.notes}</p>}

                    {match.applyUrl && match.applyUrl !== '#' && (
                      <a
                        href={match.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-yellow-400 hover:text-yellow-300 transition-colors"
                      >
                        Apply Now <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </Card>
                ))}

                <Card className="bg-yellow-500/5 border-yellow-500/20 p-4 text-center">
                  <Award className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                  <div className="font-bold text-white text-sm mb-1">You're Funded-Ready 🎉</div>
                  <div className="text-xs text-white/50">Complete your credit building plan above to maximize your approval odds.</div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Step nav dots for mobile quick-jump */}
        <div className="flex justify-center gap-2 mt-8">
          {WIZARD_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => profile || i === 0 ? setStep(i) : null}
              className={`w-2 h-2 rounded-full transition-all ${
                i === step ? 'bg-yellow-400 w-4' : i < step ? 'bg-yellow-500/50' : 'bg-white/20'
              }`}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
