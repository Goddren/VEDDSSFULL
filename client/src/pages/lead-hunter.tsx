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
  errorLog?: string;
  createdAt?: string;
  completedAt?: string;
};

type EnvStatus = {
  APIFY_API_TOKEN: boolean;
  TWITTER_BEARER_TOKEN: boolean;
  TWITTER_ACCESS_TOKEN: boolean;
  LINKEDIN_ACCESS_TOKEN: boolean;
  SENDGRID_API_KEY: boolean;
  AI: boolean;
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

  const { data: envStatus } = useQuery<EnvStatus>({
    queryKey: ['/api/lead-hunter/env-check'],
    staleTime: 60000,
  });

  const [diagResult, setDiagResult] = useState<any>(null);

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/lead-hunter/run');
      return res.json();
    },
    onSuccess: (data: any) => {
      const breakdown = data.platformBreakdown
        ? Object.entries(data.platformBreakdown)
            .filter(([, n]) => Number(n) > 0)
            .map(([p, n]) => `${p}: ${n}`)
            .join(' · ')
        : '';
      toast({
        title: `Run complete — ${data.newLeads ?? 0} new leads`,
        description: breakdown || 'No new leads found this run — check the Diagnostic for platform errors.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/lead-hunter/runs'] });
      refetchLeads();
    },
    onError: (error: any) => toast({ title: 'Run failed', description: error.message || 'Failed to run lead hunter', variant: 'destructive' }),
  });

  const diagMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('GET', '/api/lead-hunter/diagnostic');
      return res.json();
    },
    onSuccess: (data) => setDiagResult(data),
    onError: () => toast({ title: 'Diagnostic failed', variant: 'destructive' }),
  });

  // Automated outreach — engages via platform API where creds exist (X like+reply);
  // otherwise copies the ready message to the clipboard and opens the post to paste.
  const outreachMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/lead-hunter/outreach/${id}`);
      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-hunter/leads'] });
      if (data.automated) {
        toast({ title: '✅ Auto-engaged', description: data.reason });
      } else {
        if (data.message) { try { await navigator.clipboard.writeText(data.message); } catch { /* clipboard optional */ } }
        if (data.postUrl) window.open(data.postUrl, '_blank');
        toast({ title: '📋 Message copied — post opened', description: data.reason });
      }
    },
    onError: () => toast({ title: 'Outreach failed', variant: 'destructive' }),
  });

  const bulkOutreachMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/lead-hunter/outreach-run');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-hunter/leads'] });
      toast({ title: `Auto-Outreach: ${data.engaged} engaged`, description: data.message });
    },
    onError: () => toast({ title: 'Auto-outreach failed', variant: 'destructive' }),
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
              variant="outline"
              size="sm"
              onClick={() => diagMutation.mutate()}
              disabled={diagMutation.isPending}
              style={{ borderColor: '#374151', color: '#60a5fa' }}
            >
              <AlertCircle size={14} style={{ marginRight: 6 }} />
              {diagMutation.isPending ? 'Testing…' : 'Diagnose'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkOutreachMutation.mutate()}
              disabled={bulkOutreachMutation.isPending}
              style={{ borderColor: '#F0D26955', color: '#F0D269' }}
            >
              🚀 {bulkOutreachMutation.isPending ? 'Reaching out…' : 'Auto-Outreach'}
            </Button>
            <Button
              size="sm"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              style={{ background: 'linear-gradient(135deg,#F0D269,#d4a800)', color: '#000', fontWeight: 700 }}
            >
              <Play size={14} style={{ marginRight: 6 }} />
              {runMutation.isPending ? 'Scanning… (1–3 min)' : 'Run Now'}
            </Button>
          </div>
        </div>

        {/* Diagnostic result */}
        {diagResult && (
          <div style={{ background: '#0a0f1a', border: '1px solid #1e3a5f', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AlertCircle size={14} color="#60a5fa" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>Diagnostic Results</span>
              <button onClick={() => setDiagResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {Object.entries(diagResult.platforms || {}).map(([platform, info]: [string, any]) => (
                <div key={platform} style={{ background: '#0f1420', borderRadius: 10, padding: '10px 14px', minWidth: 180 }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>{platform.replace('_', ' ')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: info.error ? '#ef4444' : '#10b981' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: info.error ? '#ef4444' : '#10b981' }}>
                      {info.error ? 'Error' : `${info.count} results`}
                    </span>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>HTTP {info.status || '—'}</span>
                  </div>
                  {info.error && <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 4, wordBreak: 'break-word' }}>{info.error}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 20 }}>
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

                    {expanded && (() => {
                      let brief: any = {};
                      try { brief = JSON.parse(lead.contactOpportunity || '{}'); } catch { brief = {}; }
                      return (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1a1f2e' }}>
                        {brief.pain_point && (
                          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#d1d5db' }}>
                            <span style={{ color: '#F0D269', fontWeight: 700 }}>Pain: </span>{brief.pain_point}
                          </p>
                        )}
                        {brief.vedd_feature && (
                          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#d1d5db' }}>
                            <span style={{ color: '#F0D269', fontWeight: 700 }}>Feature: </span>
                            <a href={brief.vedd_url || 'https://veddbuild.com'} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>{brief.vedd_feature}</a>
                          </p>
                        )}
                        {lead.suggestedReply && (
                          <div style={{ background: '#0a1520', border: '1px solid #1e3a5f', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                            <p style={{ margin: '0 0 4px', fontSize: 11, color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>First Message — Relationship First, No Pitch</p>
                            <p style={{ margin: 0, fontSize: 12, color: '#e5e7eb', lineHeight: 1.6 }}>{lead.suggestedReply}</p>
                            <p style={{ margin: '6px 0 0', fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>Genuine compliment/interest only — no VEDD mention. Only bring up VEDD later, if they engage.</p>
                          </div>
                        )}
                        {Array.isArray(brief.talking_points) && brief.talking_points.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <p style={{ margin: '0 0 4px', fontSize: 10, color: '#F0D269', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>If They Reply — Talking Points For Later</p>
                            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#d1d5db' }}>
                              {brief.talking_points.map((pt: string, i: number) => <li key={i} style={{ marginBottom: 3 }}>{pt}</li>)}
                            </ul>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          {/* Automated outreach — API-engages where possible, else copies msg + opens post */}
                          <button
                            onClick={e => { e.stopPropagation(); outreachMutation.mutate(lead.id); }}
                            disabled={outreachMutation.isPending}
                            style={{ padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'linear-gradient(135deg,#F0D269,#d4a800)', color: '#000' }}
                          >
                            🚀 {outreachMutation.isPending ? 'Sending…' : 'Send Outreach'}
                          </button>
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
                      );
                    })()}
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
                <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>No runs yet — click Run Now</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {runs.slice(0, 5).map(run => {
                    let pb: Record<string, number> = {};
                    try { pb = JSON.parse(run.platformBreakdown || '{}'); } catch { pb = {}; }
                    const errors = (run.errorLog || '').split('\n').filter(Boolean);
                    return (
                    <div key={run.id} style={{ background: '#080b14', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>{run.date}</span>
                        <span style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
                          background: run.status === 'completed' ? '#064e3b' : run.status === 'running' ? '#1e3a5f' : '#4b1010',
                          color: run.status === 'completed' ? '#6ee7b7' : run.status === 'running' ? '#60a5fa' : '#fca5a5',
                        }}>
                          {run.status === 'running' && <span className="animate-pulse">● </span>}
                          {run.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                        scraped {run.totalScraped ?? 0} · {run.newLeads ?? 0} new · {run.highIntent ?? 0} high-intent
                      </div>
                      {Object.keys(pb).length > 0 && (
                        <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 4 }}>
                          {Object.entries(pb).map(([p, c]) => `${p}: ${c}`).join(' · ')}
                        </div>
                      )}
                      {errors.length > 0 && (
                        <div style={{ marginTop: 6, background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 6, padding: '6px 8px' }}>
                          {errors.map((e, i) => (
                            <div key={i} style={{ fontSize: 10, color: '#fca5a5', lineHeight: 1.4 }}>⚠ {e}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Live API key status */}
            <div style={{ background: '#0f1420', border: '1px solid #1a1f2e', borderRadius: 12, padding: 16 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>API Key Status</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { key: 'APIFY_API_TOKEN' as keyof EnvStatus, label: 'Apify (Reddit/IG/LI/FB)', url: 'https://apify.com' },
                  { key: 'TWITTER_BEARER_TOKEN' as keyof EnvStatus, label: 'Twitter Bearer Token', url: 'https://developer.twitter.com' },
                  { key: 'TWITTER_ACCESS_TOKEN' as keyof EnvStatus, label: 'Twitter Access (engage)', url: 'https://developer.twitter.com' },
                  { key: 'LINKEDIN_ACCESS_TOKEN' as keyof EnvStatus, label: 'LinkedIn Access Token', url: 'https://www.linkedin.com/developers' },
                  { key: 'SENDGRID_API_KEY' as keyof EnvStatus, label: 'SendGrid (email digest)', url: 'https://sendgrid.com' },
                  { key: 'AI' as keyof EnvStatus, label: 'AI (Groq/OpenAI)', url: '' },
                ].map(item => {
                  const ok = envStatus ? envStatus[item.key] : null;
                  return (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: ok === null ? '#374151' : ok ? '#16a34a' : '#dc2626' }} />
                      <span style={{ fontSize: 11, color: ok === null ? '#6b7280' : ok ? '#d1d5db' : '#fca5a5', flex: 1 }}>{item.label}</span>
                      {ok === false && item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#F0D269', fontSize: 10 }}>
                          <ExternalLink size={10} />
                        </a>
                      )}
                      {ok === true && <span style={{ fontSize: 9, color: '#16a34a', fontWeight: 700 }}>✓</span>}
                      {ok === false && <span style={{ fontSize: 9, color: '#dc2626', fontWeight: 700 }}>✗</span>}
                    </div>
                  );
                })}
              </div>
              {envStatus && !envStatus.APIFY_API_TOKEN && (
                <p style={{ margin: '10px 0 0', fontSize: 11, color: '#dc2626', lineHeight: 1.5 }}>
                  ⚠ APIFY_API_TOKEN missing — no leads can be scraped without it.
                </p>
              )}
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
