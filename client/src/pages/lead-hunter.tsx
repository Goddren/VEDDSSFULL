import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Target, Play, RefreshCw, ExternalLink, CheckCircle,
  Clock, AlertCircle, Zap, Users, TrendingUp,
} from "lucide-react";

type Lead = {
  id: string;
  date: string;
  platform: string;
  username: string;
  profileUrl?: string;
  postContent?: string;
  postUrl?: string;
  intentScore?: number;
  accountQuality?: number;
  contactOpportunity?: string;
  status?: string;
  suggestedReply?: string;
  autoEngaged?: boolean;
  engagementType?: string;
  headline?: string;
  followerCount?: number;
  createdAt?: string;
};

type HunterRun = {
  id: number;
  date: string;
  status: string;
  totalScraped?: number;
  newLeads?: number;
  highIntent?: number;
  autoEngagedCount?: number;
  platformBreakdown?: string;
  createdAt?: string;
  completedAt?: string;
};

const PLATFORM_COLORS: Record<string, string> = {
  Reddit: '#ff4500',
  'X/Twitter': '#1d9bf0',
  Instagram: '#e1306c',
  LinkedIn: '#0a66c2',
  Facebook: '#1877f2',
};

function intentColor(score: number) {
  if (score >= 7) return '#16a34a';
  if (score >= 4) return '#d97706';
  return '#6b7280';
}

function intentLabel(score: number) {
  if (score >= 7) return 'High';
  if (score >= 4) return 'Medium';
  return 'Low';
}

export default function LeadHunterPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: leads = [], refetch: refetchLeads, isFetching } = useQuery<Lead[]>({
    queryKey: ['/api/lead-hunter/leads'],
    refetchInterval: false,
  });

  const { data: runs = [] } = useQuery<HunterRun[]>({
    queryKey: ['/api/lead-hunter/runs'],
    refetchInterval: 30000,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/lead-hunter/run');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Lead Hunter started', description: 'Check your email digest when it completes (~3–5 min).' });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/lead-hunter/runs'] });
        refetchLeads();
      }, 5000);
    },
    onError: () => toast({ title: 'Error', description: 'Failed to start lead hunter', variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest('PATCH', `/api/lead-hunter/leads/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/lead-hunter/leads'] }),
  });

  const latestRun = runs[0];

  const filtered = leads.filter(l => {
    const s = l.intentScore || 0;
    if (filter === 'high') return s >= 7;
    if (filter === 'medium') return s >= 4 && s < 7;
    if (filter === 'low') return s < 4;
    return true;
  });

  const highCount = leads.filter(l => (l.intentScore || 0) >= 7).length;
  const medCount = leads.filter(l => (l.intentScore || 0) >= 4 && (l.intentScore || 0) < 7).length;
  const autoCount = leads.filter(l => l.autoEngaged).length;

  return (
    <div style={{ minHeight: '100vh', background: '#050508', color: '#e5e7eb', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,#F0D269,#d4a800)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={22} color="#000" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#fff' }}>VEDD Lead Hunter</h1>
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>Daily AI-powered lead hunting across Reddit · X · Instagram · LinkedIn · Facebook</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchLeads()}
              disabled={isFetching}
              style={{ borderColor: '#374151', color: '#9ca3af' }}
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} style={{ marginRight: 6 }} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              style={{ background: 'linear-gradient(135deg,#F0D269,#d4a800)', color: '#000', fontWeight: 700 }}
            >
              <Play size={14} style={{ marginRight: 6 }} />
              {runMutation.isPending ? 'Starting…' : 'Run Now'}
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Leads', value: leads.length, icon: <Users size={18} />, color: '#3b82f6' },
            { label: 'High Intent', value: highCount, icon: <Zap size={18} />, color: '#16a34a' },
            { label: 'Medium Intent', value: medCount, icon: <TrendingUp size={18} />, color: '#d97706' },
            { label: 'Auto-Engaged', value: autoCount, icon: <CheckCircle size={18} />, color: '#F0D269' },
          ].map(s => (
            <div key={s.label} style={{ background: '#0f1420', border: '1px solid #1a1f2e', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: s.color }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          {/* Leads table */}
          <div>
            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['all', 'high', 'medium', 'low'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 20,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 13,
                    background: filter === f ? '#F0D269' : '#1a1f2e',
                    color: filter === f ? '#000' : '#9ca3af',
                    transition: 'all 0.15s',
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f === 'all' ? ` (${leads.length})` : f === 'high' ? ` (${highCount})` : f === 'medium' ? ` (${medCount})` : ''}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                  <Target size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                  <p style={{ margin: 0 }}>No leads yet. Hit <strong style={{ color: '#F0D269' }}>Run Now</strong> to start hunting.</p>
                </div>
              )}
              {filtered.map(lead => {
                const score = lead.intentScore || 0;
                const expanded = expandedId === lead.id;
                return (
                  <div
                    key={lead.id}
                    style={{
                      background: '#0f1420',
                      border: `1px solid ${expanded ? '#F0D269' : '#1a1f2e'}`,
                      borderRadius: 12,
                      padding: '14px 16px',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onClick={() => setExpandedId(expanded ? null : lead.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {/* Platform badge */}
                      <span style={{
                        flexShrink: 0,
                        padding: '3px 10px',
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 700,
                        background: (PLATFORM_COLORS[lead.platform] || '#374151') + '22',
                        color: PLATFORM_COLORS[lead.platform] || '#9ca3af',
                        border: `1px solid ${(PLATFORM_COLORS[lead.platform] || '#374151')}44`,
                      }}>{lead.platform}</span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{lead.username}</span>
                          {lead.autoEngaged && (
                            <span style={{ fontSize: 10, background: '#064e3b', color: '#6ee7b7', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>
                              ✓ {lead.engagementType}
                            </span>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: intentColor(score), background: intentColor(score) + '22', padding: '2px 8px', borderRadius: 10 }}>
                            {intentLabel(score)} · {score}/10
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
                          {(lead.postContent || '').substring(0, expanded ? 300 : 120)}{!expanded && (lead.postContent || '').length > 120 ? '…' : ''}
                        </p>
                      </div>
                    </div>

                    {expanded && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1a1f2e' }}>
                        {lead.contactOpportunity && (
                          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#d1d5db' }}>
                            <span style={{ color: '#F0D269', fontWeight: 700 }}>Opportunity: </span>{lead.contactOpportunity}
                          </p>
                        )}
                        {lead.suggestedReply && (
                          <div style={{ background: '#0a1520', border: '1px solid #1e3a5f', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                            <p style={{ margin: '0 0 4px', fontSize: 11, color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Suggested Reply</p>
                            <p style={{ margin: 0, fontSize: 12, color: '#e5e7eb', lineHeight: 1.6 }}>{lead.suggestedReply}</p>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {lead.postUrl && (
                            <a
                              href={lead.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#60a5fa', textDecoration: 'none' }}
                            >
                              <ExternalLink size={12} /> View post
                            </a>
                          )}
                          {(['New', 'Contacted', 'Converted', 'Not interested'] as const).map(s => (
                            <button
                              key={s}
                              onClick={e => { e.stopPropagation(); statusMutation.mutate({ id: lead.id, status: s }); }}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 8,
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                                background: lead.status === s ? '#1d4ed8' : '#1a1f2e',
                                color: lead.status === s ? '#fff' : '#6b7280',
                              }}
                            >{s}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Latest run */}
            <div style={{ background: '#0f1420', border: '1px solid #1a1f2e', borderRadius: 12, padding: 16 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Runs</h3>
              {runs.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>No runs yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {runs.slice(0, 5).map(run => (
                    <div key={run.id} style={{ background: '#080b14', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>{run.date}</span>
                        <span style={{
                          fontSize: 10,
                          padding: '2px 7px',
                          borderRadius: 10,
                          fontWeight: 700,
                          background: run.status === 'completed' ? '#064e3b' : run.status === 'running' ? '#1e3a5f' : '#4b1010',
                          color: run.status === 'completed' ? '#6ee7b7' : run.status === 'running' ? '#60a5fa' : '#fca5a5',
                        }}>
                          {run.status === 'running' && <span className="animate-pulse">● </span>}
                          {run.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        {run.newLeads ?? 0} new · {run.highIntent ?? 0} high-intent · {run.autoEngagedCount ?? 0} engaged
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Setup checklist */}
            <div style={{ background: '#0f1420', border: '1px solid #1a1f2e', borderRadius: 12, padding: 16 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>API Keys Required</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { key: 'APIFY_API_TOKEN', label: 'Apify (Reddit/IG/LI/FB)', url: 'https://apify.com' },
                  { key: 'TWITTER_BEARER_TOKEN', label: 'Twitter Bearer Token', url: 'https://developer.twitter.com' },
                  { key: 'TWITTER_ACCESS_TOKEN', label: 'Twitter Access Token (auto-engage)', url: 'https://developer.twitter.com' },
                  { key: 'LINKEDIN_ACCESS_TOKEN', label: 'LinkedIn Access Token', url: 'https://www.linkedin.com/developers' },
                ].map(item => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#374151', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#9ca3af', flex: 1 }}>{item.label}</span>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#F0D269', fontSize: 10 }}>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                ))}
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 11, color: '#4b5563', lineHeight: 1.5 }}>
                Add these to your Render environment variables. Missing tokens skip that platform gracefully.
              </p>
            </div>

            {/* Schedule info */}
            <div style={{ background: '#0f1420', border: '1px solid #1a1f2e', borderRadius: 12, padding: 16 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Schedule</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={14} color="#F0D269" />
                <span style={{ fontSize: 13, color: '#d1d5db' }}>Daily at 08:00 UTC</span>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#4b5563' }}>
                Digest emailed to donchismkos@gmail.com after each run.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
