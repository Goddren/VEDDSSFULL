import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, AlertTriangle, CheckCircle2, Eye, Lock, Database,
  Users, Zap, ClipboardList, RefreshCw, FileText, ChevronRight,
  Activity, Cpu, Globe, BookOpen, Search, Download, X, Check
} from "lucide-react";

// ─── Static data ──────────────────────────────────────────────────────────────

const GUARDRAILS = [
  { id: 1, name: "Bias Mitigation Filter", status: "active", description: "Screens all AI outputs for demographic, racial, and economic bias before delivery.", category: "fairness", lastChecked: "2 hours ago" },
  { id: 2, name: "Data Minimization Policy", status: "active", description: "Ensures AI models only process data essential for the task; excess PII is stripped.", category: "privacy", lastChecked: "4 hours ago" },
  { id: 3, name: "Human-in-the-Loop Gate", status: "active", description: "Requires human review for high-stakes AI decisions (loans, credit scoring, grant approvals).", category: "oversight", lastChecked: "1 hour ago" },
  { id: 4, name: "Explainability Requirement", status: "active", description: "Every AI recommendation surfaces a plain-language explanation for the user.", category: "transparency", lastChecked: "3 hours ago" },
  { id: 5, name: "Model Drift Detector", status: "warning", description: "Monitors trading model outputs for statistical drift from baseline performance.", category: "reliability", lastChecked: "6 hours ago" },
  { id: 6, name: "Consent Verification Layer", status: "active", description: "Validates user consent before processing personal data for AI model training.", category: "privacy", lastChecked: "1 hour ago" },
  { id: 7, name: "Adversarial Input Filter", status: "active", description: "Detects prompt injection and adversarial inputs designed to manipulate AI behavior.", category: "security", lastChecked: "30 min ago" },
  { id: 8, name: "Output Confidence Gate", status: "active", description: "Suppresses AI outputs with confidence scores below 60%; routes to human review.", category: "reliability", lastChecked: "2 hours ago" },
];

const AUDIT_EVENTS = [
  { id: "AL-4821", timestamp: "2025-06-15 14:32:07", action: "ai_decision", resource: "chart_analysis", user: "User #2847", outcome: "success", risk: "low", detail: "Chart analysis generated for XAUUSD H1. Confidence: 78%." },
  { id: "AL-4820", timestamp: "2025-06-15 14:28:44", action: "bias_check", resource: "curriculum", user: "Admin", outcome: "flagged", risk: "medium", detail: "Curriculum section flagged for review: language may disadvantage non-English primary speakers." },
  { id: "AL-4819", timestamp: "2025-06-15 14:15:22", action: "data_access", resource: "user_data", user: "User #1034", outcome: "success", risk: "low", detail: "User accessed their own trading history and analytics dashboard." },
  { id: "AL-4818", timestamp: "2025-06-15 13:58:11", action: "model_run", resource: "grant_proposal", user: "User #3312", outcome: "success", risk: "low", detail: "AI generated grant proposal draft for NSF AI Workforce grant." },
  { id: "AL-4817", timestamp: "2025-06-15 13:44:05", action: "ethics_review", resource: "ai_outputs", user: "Admin", outcome: "reviewed", risk: "low", detail: "Monthly ethics review completed. 2 low-risk items noted for monitoring." },
  { id: "AL-4816", timestamp: "2025-06-15 13:20:18", action: "policy_update", resource: "data_policy", user: "Admin", outcome: "success", risk: "low", detail: "Data retention policy updated to comply with CCPA 2025 amendments." },
  { id: "AL-4815", timestamp: "2025-06-15 12:55:33", action: "bias_check", resource: "ai_outputs", user: "System", outcome: "success", risk: "low", detail: "Automated bias scan completed. 0 high-risk findings." },
  { id: "AL-4814", timestamp: "2025-06-15 12:30:47", action: "model_run", resource: "chart_analysis", user: "User #0871", outcome: "blocked", risk: "high", detail: "Analysis blocked: adversarial prompt pattern detected in input parameters." },
  { id: "AL-4813", timestamp: "2025-06-15 12:08:55", action: "data_access", resource: "user_data", user: "User #2103", outcome: "success", risk: "low", detail: "Ambassador accessed referral analytics for their downline." },
  { id: "AL-4812", timestamp: "2025-06-15 11:47:22", action: "ai_decision", resource: "curriculum", user: "Admin", outcome: "success", risk: "low", detail: "AI Literacy 101 curriculum auto-generated and saved." },
];

const HITL_QUEUE = [
  { id: "HI-091", type: "High-Stakes Decision", description: "Credit building recommendation for user account with debt-to-income > 85%.", submittedAt: "2 hours ago", priority: "high" },
  { id: "HI-090", type: "Bias Flag Review", description: "Flagged curriculum section in Financial Planning course requires human review.", submittedAt: "4 hours ago", priority: "medium" },
  { id: "HI-089", type: "Model Anomaly", description: "XAUUSD model confidence dropped from 74% to 51% over last 12 hours — possible market regime change.", submittedAt: "6 hours ago", priority: "medium" },
  { id: "HI-088", type: "Data Privacy Request", description: "User #1847 submitted CCPA data deletion request. Requires manual verification before processing.", submittedAt: "1 day ago", priority: "low" },
];

const PRIVACY_CONTROLS = [
  { name: "PII Auto-Redaction", enabled: true, description: "Strips name, SSN, and financial account numbers from AI training data" },
  { name: "Data Retention (90 days)", enabled: true, description: "User interaction logs purged after 90 days unless opted-in to research" },
  { name: "Third-Party Data Sharing", enabled: false, description: "User data shared with analytics partners — currently DISABLED" },
  { name: "Differential Privacy Noise", enabled: true, description: "Statistical noise added to aggregate reporting to protect individual identity" },
  { name: "CCPA Compliance Mode", enabled: true, description: "California Consumer Privacy Act compliance layer active" },
  { name: "Research Opt-In Only", enabled: true, description: "AI model training uses only opt-in anonymized data" },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "#22c55e", warning: "#f59e0b", error: "#ef4444", reviewed: "#6366f1", flagged: "#f59e0b", success: "#22c55e", blocked: "#ef4444", pending: "#94a3b8"
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: colors[status] || "#94a3b8" }} />
    </span>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const styles: Record<string, string> = {
    low: "bg-green-500/15 text-green-400 border-green-500/30",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    high: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${styles[risk] || styles.low}`}>{risk.toUpperCase()}</span>;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const styles: Record<string, string> = {
    success: "bg-green-500/15 text-green-400",
    flagged: "bg-amber-500/15 text-amber-400",
    blocked: "bg-red-500/15 text-red-400",
    reviewed: "bg-blue-500/15 text-blue-400",
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${styles[outcome] || "bg-gray-500/15 text-gray-400"}`}>{outcome}</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AIGovernancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [scanRunning, setScanRunning] = useState(false);
  const [scanResults, setScanResults] = useState<null | { score: number; findings: number; highRisk: number }>(null);
  const [selectedLog, setSelectedLog] = useState<typeof AUDIT_EVENTS[0] | null>(null);
  const [privacyControls, setPrivacyControls] = useState(PRIVACY_CONTROLS);
  const [hitlQueue, setHitlQueue] = useState(HITL_QUEUE);

  if (!user) return <Redirect to="/auth" />;

  const isAdmin = user.isAdmin;

  const activeGuardrails = GUARDRAILS.filter(g => g.status === "active").length;
  const warningGuardrails = GUARDRAILS.filter(g => g.status === "warning").length;

  function runBiasScan() {
    setScanRunning(true);
    setScanResults(null);
    setTimeout(() => {
      setScanRunning(false);
      setScanResults({ score: 94, findings: 2, highRisk: 0 });
      toast({ title: "Bias Scan Complete", description: "2 low-risk findings. No high-risk bias detected." });
    }, 3200);
  }

  function togglePrivacy(idx: number) {
    if (!isAdmin) {
      toast({ title: "Admin Required", description: "Only admins can modify privacy controls.", variant: "destructive" });
      return;
    }
    setPrivacyControls(prev => prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c));
    toast({ title: "Privacy control updated" });
  }

  function resolveHitl(id: string) {
    setHitlQueue(prev => prev.filter(h => h.id !== id));
    toast({ title: "Item resolved", description: `${id} marked as reviewed and closed.` });
  }

  function exportAuditLog() {
    const lines = [
      "VEDD Technologies, LLC — AI Ethics & Governance Audit Log",
      "Generated: " + new Date().toLocaleString(),
      "=".repeat(60),
      "",
      ...AUDIT_EVENTS.map(e =>
        `[${e.timestamp}] ${e.id} | ${e.action.toUpperCase()} | ${e.resource} | ${e.user} | ${e.outcome.toUpperCase()} | Risk: ${e.risk}\n  ${e.detail}`
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "VEDD_Audit_Log.txt"; a.click();
  }

  return (
    <div className="min-h-screen bg-[#080B14] text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <Shield className="w-5 h-5 text-red-400" />
                </div>
                <h1 className="text-2xl font-bold">AI Ethics & Data Governance</h1>
              </div>
              <p className="text-gray-400 text-sm">NSF-aligned responsible AI framework — guardrails, audit trails, bias detection, and privacy enforcement</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-white/10 text-gray-300" onClick={exportAuditLog}>
                <Download className="w-4 h-4 mr-2" /> Export Audit Log
              </Button>
              {isAdmin && (
                <Button size="sm" onClick={runBiasScan} disabled={scanRunning}
                  className="bg-red-600 hover:bg-red-700 text-white">
                  {scanRunning ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                  {scanRunning ? "Scanning…" : "Run Bias Scan"}
                </Button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Stats Bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active Guardrails", value: `${activeGuardrails}/8`, icon: Shield, color: "#22c55e" },
            { label: "Warnings", value: warningGuardrails, icon: AlertTriangle, color: "#f59e0b" },
            { label: "Audit Events (24h)", value: "47", icon: ClipboardList, color: "#6366f1" },
            { label: "HITL Queue", value: hitlQueue.length, icon: Users, color: "#06b6d4" },
          ].map((stat, i) => (
            <Card key={i} className="bg-white/[0.03] border-white/10">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${stat.color}22`, border: `1px solid ${stat.color}44` }}>
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-gray-400">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Scan Results Banner */}
        {scanResults && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 rounded-xl border flex items-center gap-4"
            style={{ background: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.3)" }}>
            <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-green-400 font-semibold">Bias Scan Complete — Ethics Score: {scanResults.score}/100</p>
              <p className="text-sm text-gray-400">{scanResults.findings} low-risk findings detected. {scanResults.highRisk} high-risk items. System is operating within ethical guidelines.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setScanResults(null)}><X className="w-4 h-4" /></Button>
          </motion.div>
        )}

        {/* Main Tabs */}
        <Tabs defaultValue="guardrails">
          <TabsList className="bg-white/[0.05] border border-white/10 mb-6 flex-wrap h-auto gap-1 p-1">
            {["guardrails", "audit-log", "hitl", "privacy", "bias-detection"].map(tab => (
              <TabsTrigger key={tab} value={tab} className="capitalize text-xs data-[state=active]:bg-red-600/80 data-[state=active]:text-white">
                {tab.replace("-", " ")}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Guardrails Tab ─────────────────────────────────────── */}
          <TabsContent value="guardrails">
            <div className="grid md:grid-cols-2 gap-4">
              {GUARDRAILS.map((g, i) => {
                const catColors: Record<string, string> = { fairness: "#6366f1", privacy: "#a855f7", oversight: "#06b6d4", transparency: "#f59e0b", reliability: "#ef4444", security: "#22c55e" };
                const color = catColors[g.category] || "#6366f1";
                return (
                  <motion.div key={g.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="bg-white/[0.03] border-white/10 hover:border-white/20 transition-all">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <StatusDot status={g.status} />
                            <span className="font-semibold text-sm">{g.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge className="text-[10px] capitalize" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>{g.category}</Badge>
                            <Badge className={`text-[10px] ${g.status === "active" ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"}`}>
                              {g.status}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{g.description}</p>
                        <p className="text-[10px] text-gray-600">Last checked: {g.lastChecked}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
            <Card className="bg-white/[0.03] border-white/10 mt-4">
              <CardContent className="p-4">
                <p className="text-xs text-gray-400 leading-relaxed">
                  <span className="text-white font-semibold">VEDD AI Ethics Framework</span> is aligned with NSF Responsible AI principles, NIST AI Risk Management Framework (AI RMF 1.0), and the EU AI Act high-risk category requirements.
                  All guardrails are reviewed quarterly by the VEDD governance committee and documented for grant reporting.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Audit Log Tab ──────────────────────────────────────── */}
          <TabsContent value="audit-log">
            <Card className="bg-white/[0.03] border-white/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Transparent Decision Log</CardTitle>
                  <p className="text-xs text-gray-500">Showing last 10 of 4,821 events</p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10">
                        {["Event ID", "Timestamp", "Action", "Resource", "User", "Outcome", "Risk", ""].map(h => (
                          <th key={h} className="text-left px-4 py-2 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {AUDIT_EVENTS.map((evt, i) => (
                        <tr key={evt.id} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
                          <td className="px-4 py-2 font-mono text-gray-400">{evt.id}</td>
                          <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{evt.timestamp}</td>
                          <td className="px-4 py-2">
                            <span className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono">{evt.action}</span>
                          </td>
                          <td className="px-4 py-2 text-gray-400">{evt.resource}</td>
                          <td className="px-4 py-2 text-gray-400">{evt.user}</td>
                          <td className="px-4 py-2"><OutcomeBadge outcome={evt.outcome} /></td>
                          <td className="px-4 py-2"><RiskBadge risk={evt.risk} /></td>
                          <td className="px-4 py-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-gray-400 hover:text-white" onClick={() => setSelectedLog(evt)}>
                                  <Eye className="w-3 h-3" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="bg-[#0f1525] border-white/10 max-w-lg">
                                <DialogHeader><DialogTitle>Audit Event Detail</DialogTitle></DialogHeader>
                                {selectedLog && (
                                  <div className="space-y-3 text-sm">
                                    <div className="grid grid-cols-2 gap-2">
                                      {[["Event ID", selectedLog.id], ["Timestamp", selectedLog.timestamp], ["Action", selectedLog.action], ["Resource", selectedLog.resource], ["User", selectedLog.user], ["Outcome", selectedLog.outcome]].map(([k, v]) => (
                                        <div key={k}>
                                          <p className="text-xs text-gray-500">{k}</p>
                                          <p className="text-white font-medium">{v}</p>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                      <p className="text-xs text-gray-400">{selectedLog.detail}</p>
                                    </div>
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Human-in-the-Loop Tab ──────────────────────────────── */}
          <TabsContent value="hitl">
            <div className="space-y-4">
              <Card className="bg-white/[0.03] border-white/10">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-400">
                    The <span className="text-white font-semibold">Human-in-the-Loop (HITL) queue</span> catches AI decisions that exceed risk thresholds and routes them to a human reviewer before action is taken.
                    This is a core requirement for NSF Responsible AI grants and NIST AI RMF Govern function compliance.
                  </p>
                </CardContent>
              </Card>
              {hitlQueue.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Queue is clear — no items pending review</p>
                </div>
              ) : (
                hitlQueue.map((item, i) => {
                  const priorityColor = item.priority === "high" ? "#ef4444" : item.priority === "medium" ? "#f59e0b" : "#6366f1";
                  return (
                    <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}>
                      <Card className="bg-white/[0.03] border-white/10">
                        <CardContent className="p-4 flex items-start gap-4">
                          <div className="w-2 h-full min-h-12 rounded-full flex-shrink-0 mt-1" style={{ background: priorityColor, minHeight: 48, width: 3 }} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs text-gray-500">{item.id}</span>
                              <Badge className="text-[10px]" style={{ background: `${priorityColor}22`, color: priorityColor, border: `1px solid ${priorityColor}44` }}>
                                {item.priority} priority
                              </Badge>
                              <span className="text-[10px] text-gray-600">{item.submittedAt}</span>
                            </div>
                            <p className="text-sm font-semibold text-white mb-1">{item.type}</p>
                            <p className="text-xs text-gray-400">{item.description}</p>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-2 flex-shrink-0">
                              <Button size="sm" variant="outline" className="border-white/10 text-xs h-8" onClick={() => resolveHitl(item.id)}>
                                <Check className="w-3 h-3 mr-1" /> Resolve
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* ── Privacy Tab ───────────────────────────────────────── */}
          <TabsContent value="privacy">
            <div className="grid md:grid-cols-2 gap-4">
              {privacyControls.map((ctrl, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="bg-white/[0.03] border-white/10">
                    <CardContent className="p-4 flex items-start gap-4">
                      <button
                        onClick={() => togglePrivacy(i)}
                        className="mt-0.5 w-10 h-6 rounded-full flex-shrink-0 transition-all relative"
                        style={{ background: ctrl.enabled ? "#22c55e" : "rgba(255,255,255,0.1)" }}
                      >
                        <span
                          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                          style={{ left: ctrl.enabled ? "calc(100% - 22px)" : 2 }}
                        />
                      </button>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold">{ctrl.name}</p>
                          <Badge className={`text-[10px] ${ctrl.enabled ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                            {ctrl.enabled ? "ENABLED" : "DISABLED"}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400">{ctrl.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
            <Card className="bg-white/[0.03] border-white/10 mt-4">
              <CardContent className="p-4">
                <p className="text-xs text-gray-400 leading-relaxed">
                  <span className="text-white font-semibold">Data Privacy Framework:</span> VEDD complies with CCPA (California), processes data under explicit consent, and minimizes data collection per GDPR principles. All privacy control changes are logged in the audit trail. Grant reports include privacy compliance attestation.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Bias Detection Tab ────────────────────────────────── */}
          <TabsContent value="bias-detection">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <Card className="bg-white/[0.03] border-white/10">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Bias Detection Scanner</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-gray-400">Scans AI-generated content, curriculum, trading signals, and recommendations for demographic, economic, racial, and gender bias. Powered by VEDD's fairness layer.</p>
                    <div className="space-y-3">
                      {[
                        { label: "Curriculum Content", score: 97, color: "#22c55e" },
                        { label: "AI Trading Signals", score: 94, color: "#22c55e" },
                        { label: "Grant Proposals", score: 91, color: "#22c55e" },
                        { label: "User Recommendations", score: 88, color: "#f59e0b" },
                        { label: "Financial Literacy Content", score: 95, color: "#22c55e" },
                      ].map(item => (
                        <div key={item.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-400">{item.label}</span>
                            <span className="font-semibold" style={{ color: item.color }}>{item.score}/100</span>
                          </div>
                          <Progress value={item.score} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                    <Button className="w-full bg-red-600 hover:bg-red-700" onClick={runBiasScan} disabled={scanRunning || !isAdmin}>
                      {scanRunning ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Scanning…</> : <><Search className="w-4 h-4 mr-2" /> Run Full Bias Scan</>}
                    </Button>
                    {!isAdmin && <p className="text-[10px] text-center text-gray-600">Admin privileges required to run scan</p>}
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-4">
                <Card className="bg-white/[0.03] border-white/10">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Historical Scan Results</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { date: "Jun 15, 2025", score: 94, findings: 2, high: 0 },
                      { date: "Jun 1, 2025", score: 91, findings: 3, high: 0 },
                      { date: "May 15, 2025", score: 88, findings: 5, high: 1 },
                      { date: "May 1, 2025", score: 92, findings: 2, high: 0 },
                      { date: "Apr 15, 2025", score: 89, findings: 4, high: 0 },
                    ].map((scan, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                        <div>
                          <p className="text-sm font-semibold">{scan.date}</p>
                          <p className="text-xs text-gray-400">{scan.findings} findings — {scan.high} high-risk</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold" style={{ color: scan.score >= 90 ? "#22c55e" : "#f59e0b" }}>{scan.score}</p>
                          <p className="text-[10px] text-gray-500">Ethics Score</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="bg-white/[0.03] border-white/10">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-400">
                      <span className="text-white font-semibold">Grant Alignment:</span> Bias detection reports are submitted as part of NSF Responsible AI and NIST AI RMF quarterly compliance packages. All scans are archived for 3 years per federal grant record-keeping requirements.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
