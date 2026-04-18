import { useState } from "react";
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
  ChevronLeft, Trash2, Send, RotateCcw, Trophy
} from "lucide-react";
import { TokenomicsBanner } from '@/components/vedd-rewards/tokenomics-banner';
import { Redirect } from "wouter";

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
            <div className="flex items-center gap-3 mb-4">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-48 bg-gray-900 border-gray-700 text-white text-xs h-8">
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
              <span className="text-xs text-gray-500">{grants.length} grant{grants.length !== 1 ? 's' : ''} available</span>
            </div>

            {grants.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium mb-1">No grants found</p>
                <p className="text-xs mb-4">Click "Scan for Grants" to discover funding opportunities</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grants.map(grant => (
                  <GrantCard
                    key={grant.id}
                    grant={grant}
                    hasApplied={appliedGrantIds.has(grant.id)}
                    onApply={handleApplyToGrant}
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
