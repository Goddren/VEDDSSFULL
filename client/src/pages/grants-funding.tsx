import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GrantCard } from "@/components/grants/grant-card";
import { GrantScanButton } from "@/components/grants/grant-scan-button";
import { ProposalEditor } from "@/components/grants/proposal-editor";
import { ProposalPreview } from "@/components/grants/proposal-preview";
import { ApplicationStatusBadge, ApplicationStatusPipeline } from "@/components/grants/application-status-badge";
import {
  DollarSign, Award, FileText, Users, TrendingUp, AlertTriangle,
  ChevronLeft, Trash2, Send, RotateCcw, Trophy, Layers, LayoutGrid,
  X, Heart, ChevronRight, SkipForward, Star, Globe, Calendar
} from "lucide-react";
import { TokenomicsBanner } from '@/components/vedd-rewards/tokenomics-banner';
import { Redirect } from "wouter";

/* ─── Tinder-style swipe card ──────────────────────────────────── */
const SWIPE_THRESHOLD = 100;

const grantTypeConfig: Record<string, { label: string; color: string }> = {
  business_fintech: { label: "Fintech", color: "bg-purple-600/30 text-purple-200 border-purple-500/50" },
  community_dev:    { label: "Community", color: "bg-green-600/30 text-green-200 border-green-500/50" },
  ambassador_education: { label: "Education", color: "bg-blue-600/30 text-blue-200 border-blue-500/50" },
  international:    { label: "International", color: "bg-orange-600/30 text-orange-200 border-orange-500/50" },
  ai_focused:       { label: "AI/Tech", color: "bg-cyan-600/30 text-cyan-200 border-cyan-500/50" },
};

interface Grant {
  id: number;
  title: string;
  funder: string;
  description: string;
  grantType: string;
  fundingAmount: string | null;
  deadline: string | null;
  targetAudience: string | null;
  geographicScope: string | null;
  applicationUrl: string | null;
  relevanceScore: number | null;
  isVerified: boolean | null;
  isFeatured: boolean | null;
  aiScanNotes: string | null;
  eligibilityCriteria: string[] | null;
}

function SwipeGrantCard({
  grant,
  onSwipeLeft,
  onSwipeRight,
  isTop,
  stackIndex,
}: {
  grant: Grant;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  isTop: boolean;
  stackIndex: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);
  const [offset, setOffset] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);

  const typeConfig = grantTypeConfig[grant.grantType] || { label: grant.grantType, color: "bg-gray-600/30 text-gray-200 border-gray-500/50" };
  const score = grant.relevanceScore || 0;
  const deadlineDate = grant.deadline ? new Date(grant.deadline) : null;
  const isExpired = deadlineDate && deadlineDate < new Date();

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isTop) return;
    isDragging.current = true;
    startX.current = e.clientX;
    cardRef.current?.setPointerCapture(e.pointerId);
  }, [isTop]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !isTop) return;
    currentX.current = e.clientX - startX.current;
    setOffset(currentX.current);
    setDirection(currentX.current > 20 ? 'right' : currentX.current < -20 ? 'left' : null);
  }, [isTop]);

  const onPointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (currentX.current > SWIPE_THRESHOLD) {
      onSwipeRight();
    } else if (currentX.current < -SWIPE_THRESHOLD) {
      onSwipeLeft();
    } else {
      setOffset(0);
      setDirection(null);
    }
    currentX.current = 0;
  }, [onSwipeLeft, onSwipeRight]);

  const rotation = offset / 18;
  const scale = isTop ? 1 : Math.max(0.92, 1 - stackIndex * 0.04);
  const translateY = isTop ? 0 : stackIndex * 10;
  const opacity = isTop ? 1 : Math.max(0.5, 1 - stackIndex * 0.2);

  return (
    <div
      ref={cardRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        width: '100%',
        transform: isTop
          ? `translateX(${offset}px) rotate(${rotation}deg)`
          : `scale(${scale}) translateY(${translateY}px)`,
        opacity,
        transition: isDragging.current ? 'none' : 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.35s',
        cursor: isTop ? 'grab' : 'default',
        zIndex: 10 - stackIndex,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <Card className={`bg-gray-900 border ${grant.isFeatured ? 'border-yellow-500/40' : isExpired ? 'border-red-700/40' : 'border-gray-700/50'} p-5 relative overflow-hidden shadow-xl`}>
        {/* Swipe overlays */}
        {isTop && direction === 'right' && (
          <div className="absolute inset-0 bg-green-500/15 border-2 border-green-500/60 rounded-lg flex items-center justify-center pointer-events-none z-20" style={{ opacity: Math.min(1, Math.abs(offset) / SWIPE_THRESHOLD) }}>
            <div className="bg-green-500 text-white font-bold text-2xl px-6 py-2 rounded-xl rotate-[-15deg] border-4 border-white shadow-lg">APPLY ✓</div>
          </div>
        )}
        {isTop && direction === 'left' && (
          <div className="absolute inset-0 bg-red-500/15 border-2 border-red-500/60 rounded-lg flex items-center justify-center pointer-events-none z-20" style={{ opacity: Math.min(1, Math.abs(offset) / SWIPE_THRESHOLD) }}>
            <div className="bg-red-500 text-white font-bold text-2xl px-6 py-2 rounded-xl rotate-[15deg] border-4 border-white shadow-lg">SKIP ✗</div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            {isExpired && <p className="text-[10px] text-red-400 font-semibold uppercase mb-1">⚠ Deadline Passed</p>}
            {grant.isFeatured && !isExpired && <p className="text-[10px] text-yellow-400 font-semibold uppercase mb-1">⭐ Featured</p>}
            <h3 className="text-base font-bold text-white leading-snug">{grant.title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{grant.funder}</p>
          </div>
          <Badge className={`text-[10px] border shrink-0 ${typeConfig.color}`}>{typeConfig.label}</Badge>
        </div>

        <p className="text-xs text-gray-300 mb-4 leading-relaxed line-clamp-3">{grant.description}</p>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {grant.fundingAmount && (
            <div className="bg-green-900/20 border border-green-800/40 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 mb-0.5">Funding</p>
              <p className="text-sm font-bold text-green-300">{grant.fundingAmount}</p>
            </div>
          )}
          {deadlineDate && (
            <div className={`rounded-lg p-2 text-center border ${isExpired ? 'bg-red-900/20 border-red-800/40' : 'bg-blue-900/20 border-blue-800/40'}`}>
              <p className="text-[10px] text-gray-400 mb-0.5">Deadline</p>
              <p className={`text-sm font-semibold ${isExpired ? 'text-red-300 line-through' : 'text-blue-300'}`}>
                {deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
              </p>
            </div>
          )}
          {score > 0 && (
            <div className="bg-gray-800/50 border border-gray-700/40 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 mb-0.5">Match</p>
              <p className={`text-sm font-bold ${score >= 85 ? 'text-green-400' : score >= 70 ? 'text-yellow-400' : 'text-gray-400'}`}>{score}%</p>
            </div>
          )}
          {grant.geographicScope && (
            <div className="bg-gray-800/50 border border-gray-700/40 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 mb-0.5">Region</p>
              <p className="text-sm font-semibold text-gray-200 truncate">{grant.geographicScope}</p>
            </div>
          )}
        </div>

        {grant.aiScanNotes && (
          <p className="text-[11px] text-gray-500 italic mb-4 line-clamp-2">💡 {grant.aiScanNotes}</p>
        )}

        {/* Swipe hint */}
        {isTop && (
          <div className="flex items-center justify-between text-[10px] text-gray-600">
            <span className="flex items-center gap-1"><X className="w-3 h-3 text-red-500" /> Swipe left to skip</span>
            <span className="flex items-center gap-1">Swipe right to apply <Heart className="w-3 h-3 text-green-500" /></span>
          </div>
        )}
      </Card>
    </div>
  );
}

function GrantSwiper({
  grants,
  appliedGrantIds,
  onApply,
  onSkip,
}: {
  grants: Grant[];
  appliedGrantIds: Set<number>;
  onApply: (grant: Grant) => void;
  onSkip: (grantId: number) => void;
}) {
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [applyAnim, setApplyAnim] = useState<number | null>(null);
  const [skipAnim, setSkipAnim] = useState<number | null>(null);
  const [swipeCount, setSwipeCount] = useState(0);

  const remaining = grants.filter(g => !skipped.has(g.id));
  const stack = remaining.slice(0, 3);

  const handleSwipeLeft = useCallback((grantId: number) => {
    setSkipAnim(grantId);
    setTimeout(() => {
      setSkipped(prev => new Set([...prev, grantId]));
      onSkip(grantId);
      setSkipAnim(null);
      setSwipeCount(c => c + 1);
    }, 320);
  }, [onSkip]);

  const handleSwipeRight = useCallback((grant: Grant) => {
    setApplyAnim(grant.id);
    setTimeout(() => {
      setSkipped(prev => new Set([...prev, grant.id]));
      onApply(grant);
      setApplyAnim(null);
      setSwipeCount(c => c + 1);
    }, 320);
  }, [onApply]);

  const handleReset = () => { setSkipped(new Set()); setSwipeCount(0); };

  if (remaining.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h3 className="text-lg font-bold text-white mb-2">You've reviewed all grants!</h3>
        <p className="text-sm text-gray-400 mb-6">You went through {swipeCount} grant{swipeCount !== 1 ? 's' : ''}.</p>
        <Button onClick={handleReset} className="bg-green-600 hover:bg-green-500 text-white gap-2">
          <RotateCcw className="w-4 h-4" /> Start Over
        </Button>
      </div>
    );
  }

  const topGrant = stack[0];

  return (
    <div className="flex flex-col items-center">
      {/* Progress */}
      <div className="flex items-center gap-3 mb-6 text-xs text-gray-400">
        <span>{remaining.length} remaining</span>
        <div className="w-32 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${((grants.length - remaining.length) / grants.length) * 100}%` }}
          />
        </div>
        <span>{grants.length - remaining.length} reviewed</span>
      </div>

      {/* Card stack */}
      <div className="relative w-full max-w-md" style={{ height: 460 }}>
        {stack.map((grant, i) => (
          <SwipeGrantCard
            key={grant.id}
            grant={grant}
            isTop={i === 0}
            stackIndex={i}
            onSwipeLeft={() => handleSwipeLeft(grant.id)}
            onSwipeRight={() => handleSwipeRight(grant)}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-6 mt-6">
        <button
          onClick={() => topGrant && handleSwipeLeft(topGrant.id)}
          className="w-14 h-14 rounded-full bg-red-900/40 border-2 border-red-600/60 flex items-center justify-center hover:bg-red-700/50 hover:scale-110 transition-all shadow-lg"
        >
          <X className="w-6 h-6 text-red-400" />
        </button>
        <button
          onClick={() => { setSkipped(new Set([...skipped, topGrant?.id ?? -1])); setSwipeCount(c => c + 1); }}
          className="w-10 h-10 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center hover:bg-gray-700 transition-all"
          title="Skip"
        >
          <SkipForward className="w-4 h-4 text-gray-400" />
        </button>
        <button
          onClick={() => topGrant && handleSwipeRight(topGrant)}
          className="w-14 h-14 rounded-full bg-green-900/40 border-2 border-green-600/60 flex items-center justify-center hover:bg-green-700/50 hover:scale-110 transition-all shadow-lg"
        >
          <Heart className="w-6 h-6 text-green-400" />
        </button>
      </div>

      <p className="text-[10px] text-gray-600 mt-4">Tap ✗ to skip · Tap ♡ to apply · Or swipe the card</p>
    </div>
  );
}

interface GrantApplication {
  id: number;
  userId: number;
  grantId: number;
  status: string;
  proposalMode: string;
  proposalContent: string | null;
  proposalSections: Record<string, string> | null;
  proposalVersion: number | null;
  submittedAt: string | null;
  awardedAt: string | null;
  awardedAmount: string | null;
  applicationNotes: string | null;
  grant: Grant;
  user?: { id: number; username: string; fullName: string | null };
}

interface DashboardStats {
  totalGrants: number;
  myApplications: number;
  awarded: number;
  inProgress: number;
  totalFundingAwarded: string;
}

export default function GrantsFundingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("grants");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedApplication, setSelectedApplication] = useState<GrantApplication | null>(null);

  const hasAccess = !!(user && (user.isAmbassador || user.isAdmin));
  const [swipeMode, setSwipeMode] = useState(false);

  // Persist dismissed grant IDs in localStorage
  const DISMISS_KEY = `vedd_dismissed_grants_${user?.id}`;
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const dismissGrant = useCallback((grantId: number) => {
    setDismissedIds(prev => {
      const next = new Set([...prev, grantId]);
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
      return next;
    });
    toast({ title: "Grant dismissed", description: "It won't appear in your list. Refresh to restore all grants." });
  }, [DISMISS_KEY, toast]);

  const restoreDismissed = useCallback(() => {
    setDismissedIds(new Set());
    localStorage.removeItem(DISMISS_KEY);
    toast({ title: "All dismissed grants restored" });
  }, [DISMISS_KEY, toast]);

  const { data: grants = [], refetch: refetchGrants } = useQuery<Grant[]>({
    queryKey: ["/api/grants", typeFilter],
    enabled: hasAccess,
    queryFn: async () => {
      const url = typeFilter === "all" ? "/api/grants" : `/api/grants?grantType=${typeFilter}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const { data: applications = [], refetch: refetchApps } = useQuery<GrantApplication[]>({
    queryKey: ["/api/grants/applications"],
    enabled: hasAccess,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/grants/applications");
      return res.json();
    },
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/grants/dashboard"],
    enabled: hasAccess,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/grants/dashboard");
      return res.json();
    },
  });

  const startApplicationMutation = useMutation({
    mutationFn: async (grantId: number) => { const res = await apiRequest("POST", `/api/grants/${grantId}/apply`, { proposalMode: 'auto' }); return res.json(); },
    onSuccess: (newApp: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/grants/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grants/dashboard"] });
      setSelectedApplication(newApp);
      setActiveTab("workspace");
      toast({ title: "Application started", description: "Your draft application has been created." });
    },
    onError: () => toast({ title: "Failed to start application", variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ appId, status }: { appId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/grants/applications/${appId}`, { status }); return res.json(); },
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/grants/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grants/dashboard"] });
      setSelectedApplication(prev => prev ? { ...prev, ...updated } : null);
      toast({ title: "Status updated" });
    },
  });

  const deleteApplicationMutation = useMutation({
    mutationFn: async (appId: number) => { const res = await apiRequest("DELETE", `/api/grants/applications/${appId}`); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grants/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grants/dashboard"] });
      setSelectedApplication(null);
      setActiveTab("applications");
      toast({ title: "Application deleted" });
    },
  });

  // Redirects AFTER all hooks
  if (!user) return <Redirect to="/auth" />;
  if (!user.isAmbassador && !user.isAdmin) return <Redirect to="/dashboard" />;

  const handleApplyToGrant = (grant: Grant) => {
    const existing = applications.find(a => a.grantId === grant.id);
    if (existing) {
      setSelectedApplication(existing);
      setActiveTab("workspace");
    } else {
      startApplicationMutation.mutate(grant.id);
    }
  };

  const handleProposalGenerated = (content: string, sections?: Record<string, string>) => {
    if (selectedApplication) {
      const updated = { ...selectedApplication, proposalContent: content };
      if (sections) updated.proposalSections = { ...(selectedApplication.proposalSections || {}), ...sections };
      setSelectedApplication(updated);
    }
    queryClient.invalidateQueries({ queryKey: ["/api/grants/applications"] });
  };

  const appliedGrantIds = new Set(applications.map(a => a.grantId));
  const visibleGrants = grants.filter(g => !dismissedIds.has(g.id));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <TokenomicsBanner
          variant="compact"
          rewards={[
            { label: 'Grant awarded milestone', amount: '100 VEDD', color: 'text-emerald-400' },
            { label: 'Proposal submitted', amount: '10 VEDD' },
            { label: 'Total supply', amount: '1B VEDD on Solana' },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-green-400" />
              Grants & Funding
            </h1>
            <p className="text-sm text-gray-400 mt-1">Discover, apply, and track funding opportunities for VEDD</p>
          </div>
          <GrantScanButton
            onScanComplete={() => { refetchGrants(); refetchApps(); }}
            isAdmin={!!user.isAdmin}
          />
        </div>

        {/* AI Disclaimer */}
        <div className="flex items-start gap-2 bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 mb-5">
          <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-200/80">
            Grants identified by AI based on known programs from training data. Verify current deadlines, eligibility, and status directly with funders before applying. Grant availability may have changed.
          </p>
        </div>

        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { icon: <DollarSign className="w-4 h-4 text-green-400" />, label: "Available Grants", value: stats.totalGrants },
              { icon: <FileText className="w-4 h-4 text-blue-400" />, label: "My Applications", value: stats.myApplications },
              { icon: <TrendingUp className="w-4 h-4 text-yellow-400" />, label: "In Progress", value: stats.inProgress },
              { icon: <Trophy className="w-4 h-4 text-orange-400" />, label: "Awarded", value: stats.awarded },
            ].map(s => (
              <Card key={s.label} className="bg-gray-900/60 border-gray-700/50 p-3">
                <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</span></div>
                <div className="text-2xl font-bold text-white">{s.value}</div>
              </Card>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-gray-900 border border-gray-700 mb-5">
            <TabsTrigger value="grants" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-gray-400">
              Grants <Badge className="ml-1.5 text-[10px] bg-gray-700 text-gray-300">{grants.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="applications" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-gray-400">
              Applications <Badge className="ml-1.5 text-[10px] bg-gray-700 text-gray-300">{applications.length}</Badge>
            </TabsTrigger>
            {selectedApplication && (
              <TabsTrigger value="workspace" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400">
                Proposal Workspace
              </TabsTrigger>
            )}
            {user.isAdmin && (
              <TabsTrigger value="ceo-dashboard" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-400">
                CEO Dashboard
              </TabsTrigger>
            )}
          </TabsList>

          {/* GRANTS TAB */}
          <TabsContent value="grants">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44 bg-gray-900 border-gray-700 text-white text-xs h-8">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="business_fintech">Business / Fintech</SelectItem>
                  <SelectItem value="community_dev">Community Development</SelectItem>
                  <SelectItem value="ambassador_education">Ambassador / Education</SelectItem>
                  <SelectItem value="international">International</SelectItem>
                  <SelectItem value="ai_focused">AI / Technology</SelectItem>
                </SelectContent>
              </Select>

              {/* View mode toggle */}
              <div className="flex items-center bg-gray-900 border border-gray-700 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setSwipeMode(false)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${!swipeMode ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Grid
                </button>
                <button
                  onClick={() => setSwipeMode(true)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${swipeMode ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <Layers className="w-3.5 h-3.5" /> Swipe
                </button>
              </div>

              <span className="text-xs text-gray-500 ml-auto">
                {visibleGrants.length} shown
                {dismissedIds.size > 0 && (
                  <button onClick={restoreDismissed} className="ml-2 text-blue-400 hover:text-blue-300 underline">
                    restore {dismissedIds.size} dismissed
                  </button>
                )}
              </span>
            </div>

            {visibleGrants.length === 0 && grants.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium mb-1">No grants found</p>
                <p className="text-xs mb-4">Click "Scan for Grants" to discover funding opportunities</p>
              </div>
            ) : visibleGrants.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-sm font-medium mb-2">All grants dismissed</p>
                <button onClick={restoreDismissed} className="text-xs text-blue-400 hover:text-blue-300 underline">Restore all</button>
              </div>
            ) : swipeMode ? (
              <GrantSwiper
                grants={visibleGrants}
                appliedGrantIds={appliedGrantIds}
                onApply={handleApplyToGrant}
                onSkip={() => {}}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleGrants.map(grant => (
                  <GrantCard
                    key={grant.id}
                    grant={grant}
                    hasApplied={appliedGrantIds.has(grant.id)}
                    onApply={handleApplyToGrant}
                    onDismiss={dismissGrant}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* APPLICATIONS TAB */}
          <TabsContent value="applications">
            {applications.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium mb-1">No applications yet</p>
                <p className="text-xs">Browse grants and click "Start Application" to begin</p>
              </div>
            ) : (
              <div className="space-y-3">
                {applications.map(app => (
                  <Card
                    key={app.id}
                    className="bg-gray-900/60 border-gray-700/50 p-4 cursor-pointer hover:border-green-500/40 transition-all"
                    onClick={() => { setSelectedApplication(app); setActiveTab("workspace"); }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-white truncate">{app.grant.title}</h3>
                          {user.isAdmin && app.user && (
                            <Badge className="text-[10px] bg-purple-600/20 text-purple-300 border-purple-500/40 shrink-0">
                              {app.user.fullName || app.user.username}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{app.grant.funder}</p>
                        <div className="flex items-center gap-2">
                          <ApplicationStatusBadge status={app.status || 'draft'} />
                          {app.grant.fundingAmount && (
                            <span className="text-xs text-green-400">{app.grant.fundingAmount}</span>
                          )}
                          {app.proposalContent && (
                            <span className="text-[10px] text-gray-500">Proposal written</span>
                          )}
                        </div>
                        <ApplicationStatusPipeline status={app.status || 'draft'} />
                      </div>
                      <div className="text-[10px] text-gray-500 shrink-0 mt-0.5">
                        {new Date(app.submittedAt || '').toLocaleDateString() !== 'Invalid Date'
                          ? new Date(app.submittedAt || '').toLocaleDateString()
                          : 'Draft'
                        }
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* PROPOSAL WORKSPACE TAB */}
          {selectedApplication && (
            <TabsContent value="workspace">
              <div className="space-y-4">
                {/* Workspace header */}
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-600 text-gray-300 gap-1 h-8"
                    onClick={() => { setSelectedApplication(null); setActiveTab("applications"); }}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Back
                  </Button>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-white truncate">{selectedApplication.grant.title}</h2>
                    <p className="text-xs text-gray-400">{selectedApplication.grant.funder}</p>
                  </div>
                  <ApplicationStatusBadge status={selectedApplication.status || 'draft'} />
                </div>

                {/* Status actions */}
                <div className="flex flex-wrap items-center gap-2 bg-gray-900/60 border border-gray-700 rounded-lg p-3">
                  <span className="text-xs text-gray-400 mr-1">Update Status:</span>
                  {(['draft','applied','under_review','awarded','rejected'] as const).map(s => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      className={`h-7 text-xs border-gray-600 ${selectedApplication.status === s ? 'bg-green-600/30 border-green-500/60 text-green-200' : 'text-gray-300 hover:text-white'}`}
                      onClick={() => updateStatusMutation.mutate({ appId: selectedApplication.id, status: s })}
                    >
                      {s.replace('_', ' ')}
                    </Button>
                  ))}
                  <div className="ml-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-red-900/60 text-red-400 hover:bg-red-900/30 gap-1"
                      onClick={() => { if (confirm('Delete this application?')) deleteApplicationMutation.mutate(selectedApplication.id); }}
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  </div>
                </div>

                {/* Two-panel layout: Editor + Preview */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">Generate Proposal</h3>
                      <ProposalEditor
                        applicationId={selectedApplication.id}
                        currentMode={selectedApplication.proposalMode || 'auto'}
                        currentContent={selectedApplication.proposalContent}
                        currentSections={selectedApplication.proposalSections}
                        onGenerated={handleProposalGenerated}
                      />
                    </div>

                    {/* Application Notes */}
                    <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
                      <h3 className="text-xs font-semibold text-gray-300 mb-2">Application Notes</h3>
                      <textarea
                        placeholder="Add notes, next steps, or contact information..."
                        defaultValue={selectedApplication.applicationNotes || ''}
                        onBlur={async (e) => {
                          if (e.target.value !== selectedApplication.applicationNotes) {
                            await apiRequest("PATCH", `/api/grants/applications/${selectedApplication.id}`, { applicationNotes: e.target.value });
                            queryClient.invalidateQueries({ queryKey: ["/api/grants/applications"] });
                          }
                        }}
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-gray-200 placeholder-gray-600 resize-none h-24"
                      />
                    </div>
                  </div>

                  <div className="h-[600px]">
                    <ProposalPreview
                      content={selectedApplication.proposalContent || ''}
                      grantTitle={selectedApplication.grant.title}
                      funder={selectedApplication.grant.funder}
                      applicationId={selectedApplication.id}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          )}

          {/* CEO DASHBOARD TAB (admin only) */}
          {user.isAdmin && (
            <TabsContent value="ceo-dashboard">
              <div className="space-y-6">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" /> All Applications — Pipeline Overview
                </h2>

                {/* Status breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {(['draft','applied','under_review','awarded','rejected'] as const).map(status => {
                    const count = applications.filter(a => a.status === status).length;
                    const colors: Record<string, string> = {
                      draft: 'text-gray-400', applied: 'text-blue-400', under_review: 'text-yellow-400',
                      awarded: 'text-green-400', rejected: 'text-red-400'
                    };
                    return (
                      <Card key={status} className="bg-gray-900/60 border-gray-700/50 p-3 text-center">
                        <div className={`text-xl font-bold ${colors[status]}`}>{count}</div>
                        <div className="text-[10px] text-gray-500 capitalize">{status.replace('_', ' ')}</div>
                      </Card>
                    );
                  })}
                </div>

                {/* All applications table */}
                <div className="bg-gray-900/60 border border-gray-700 rounded-lg overflow-hidden">
                  <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-300">All Ambassador Applications</h3>
                    <span className="text-xs text-gray-500">{applications.length} total</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-800/50 text-gray-400">
                          <th className="text-left p-3 font-medium">User</th>
                          <th className="text-left p-3 font-medium">Grant</th>
                          <th className="text-left p-3 font-medium">Funder</th>
                          <th className="text-left p-3 font-medium">Amount</th>
                          <th className="text-left p-3 font-medium">Status</th>
                          <th className="text-left p-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700/50">
                        {applications.map(app => (
                          <tr key={app.id} className="hover:bg-gray-800/30">
                            <td className="p-3 text-gray-300">{app.user?.fullName || app.user?.username || 'Unknown'}</td>
                            <td className="p-3 text-white max-w-48 truncate">{app.grant.title}</td>
                            <td className="p-3 text-gray-400">{app.grant.funder}</td>
                            <td className="p-3 text-green-400">{app.grant.fundingAmount || '—'}</td>
                            <td className="p-3"><ApplicationStatusBadge status={app.status || 'draft'} /></td>
                            <td className="p-3">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] border-gray-600 text-gray-300"
                                onClick={() => { setSelectedApplication(app); setActiveTab("workspace"); }}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
