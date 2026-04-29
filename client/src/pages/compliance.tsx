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
  Lock, Shield, AlertTriangle, CheckCircle2, ClipboardList,
  RefreshCw, FileText, Download, Calendar, ChevronRight,
  Activity, Building2, Scale, Eye, BookOpen, Sparkles
} from "lucide-react";

// ─── Static data ──────────────────────────────────────────────────────────────

const CYBER_CONTROLS = [
  { id: "CC-01", name: "Multi-Factor Authentication", status: "compliant", category: "Access Control", framework: "NIST CSF", lastReviewed: "Jun 10" },
  { id: "CC-02", name: "Encrypted Data at Rest (AES-256)", status: "compliant", category: "Data Protection", framework: "NIST CSF", lastReviewed: "Jun 10" },
  { id: "CC-03", name: "TLS 1.3 in Transit", status: "compliant", category: "Data Protection", framework: "SOC 2", lastReviewed: "Jun 8" },
  { id: "CC-04", name: "Penetration Testing (Annual)", status: "scheduled", category: "Vulnerability Mgmt", framework: "NIST CSF", lastReviewed: "Aug 2025" },
  { id: "CC-05", name: "Security Incident Response Plan", status: "compliant", category: "Incident Response", framework: "NIST CSF", lastReviewed: "May 30" },
  { id: "CC-06", name: "Vendor/Third-Party Risk Assessment", status: "in_progress", category: "Supply Chain", framework: "SOC 2", lastReviewed: "In progress" },
  { id: "CC-07", name: "Role-Based Access Control (RBAC)", status: "compliant", category: "Access Control", framework: "NIST CSF", lastReviewed: "Jun 12" },
  { id: "CC-08", name: "System Audit Logging", status: "compliant", category: "Audit", framework: "SOC 2", lastReviewed: "Jun 15" },
  { id: "CC-09", name: "Business Continuity Plan", status: "compliant", category: "Resilience", framework: "NIST CSF", lastReviewed: "Jun 1" },
  { id: "CC-10", name: "Vulnerability Scanning (Monthly)", status: "compliant", category: "Vulnerability Mgmt", framework: "NIST CSF", lastReviewed: "Jun 5" },
];

const RISK_ITEMS = [
  { id: "RM-01", risk: "AI Model Degradation", likelihood: "low", impact: "high", mitigation: "Monthly model performance reviews + automatic confidence threshold alerts.", owner: "Tech Team", status: "mitigated" },
  { id: "RM-02", risk: "Key Person Dependency", likelihood: "medium", impact: "high", mitigation: "Cross-training program for all critical roles. Documentation of all systems.", owner: "Admin", status: "in_progress" },
  { id: "RM-03", risk: "Regulatory Change (FinTech)", likelihood: "medium", impact: "medium", mitigation: "Monthly legal review subscription. Monitoring SEC/CFTC guidance.", owner: "Legal", status: "monitored" },
  { id: "RM-04", risk: "Grant Reporting Non-Compliance", likelihood: "low", impact: "high", mitigation: "Automated impact metric tracking + quarterly report generation. Dedicated grants manager.", owner: "Admin", status: "mitigated" },
  { id: "RM-05", risk: "Data Breach / User PII Exposure", likelihood: "low", impact: "critical", mitigation: "PII minimization policy, encryption at rest/transit, annual penetration test.", owner: "Tech Team", status: "mitigated" },
  { id: "RM-06", risk: "Ambassador Payment Compliance", likelihood: "low", impact: "medium", mitigation: "1099 tracking system, multi-state compliance review annually.", owner: "Finance", status: "monitored" },
];

const POLICY_DOCS = [
  { id: "POL-001", title: "AI Ethics & Responsible AI Policy", version: "v2.1", updated: "Jun 2025", status: "current", category: "AI Governance" },
  { id: "POL-002", title: "Data Privacy & CCPA Compliance Policy", version: "v3.0", updated: "May 2025", status: "current", category: "Privacy" },
  { id: "POL-003", title: "Information Security Policy", version: "v2.0", updated: "Apr 2025", status: "current", category: "Security" },
  { id: "POL-004", title: "Grant Funds Usage & Reporting Policy", version: "v1.5", updated: "Mar 2025", status: "current", category: "Finance" },
  { id: "POL-005", title: "Ambassador Code of Conduct", version: "v4.2", updated: "Jun 2025", status: "current", category: "Operations" },
  { id: "POL-006", title: "Anti-Discrimination & Equal Opportunity Policy", version: "v1.2", updated: "Jan 2025", status: "current", category: "HR/Compliance" },
  { id: "POL-007", title: "Conflict of Interest Policy", version: "v1.0", updated: "Jan 2025", status: "current", category: "Governance" },
  { id: "POL-008", title: "Whistleblower Protection Policy", version: "v1.0", updated: "Feb 2025", status: "current", category: "HR/Compliance" },
];

const REVIEW_CYCLES = [
  { quarter: "Q1 2025", date: "Mar 31, 2025", status: "completed", findings: 3, resolved: 3, reviewer: "Governance Committee" },
  { quarter: "Q2 2025", date: "Jul 15, 2025", status: "scheduled", findings: null, resolved: null, reviewer: "Governance Committee" },
  { quarter: "Q3 2025", date: "Oct 15, 2025", status: "upcoming", findings: null, resolved: null, reviewer: "External Auditor (Scheduled)" },
  { quarter: "Q4 2025", date: "Jan 15, 2026", status: "upcoming", findings: null, resolved: null, reviewer: "Annual Review" },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    compliant:    { bg: "rgba(34,197,94,0.15)",  text: "#22c55e" },
    scheduled:    { bg: "rgba(99,102,241,0.15)", text: "#6366f1" },
    in_progress:  { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
    mitigated:    { bg: "rgba(34,197,94,0.15)",  text: "#22c55e" },
    monitored:    { bg: "rgba(6,182,212,0.15)",  text: "#06b6d4" },
    completed:    { bg: "rgba(34,197,94,0.15)",  text: "#22c55e" },
    current:      { bg: "rgba(34,197,94,0.15)",  text: "#22c55e" },
    upcoming:     { bg: "rgba(148,163,184,0.15)","text": "#94a3b8" },
  };
  const s = styles[status] || styles.monitored;
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize"
      style={{ background: s.bg, color: s.text, borderColor: s.text + "44" }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function RiskMatrix({ likelihood, impact }: { likelihood: string; impact: string }) {
  const score = (["low", "medium", "high", "critical"].indexOf(impact) + 1) *
    (["low", "medium", "high"].indexOf(likelihood) + 1);
  const color = score >= 6 ? "#ef4444" : score >= 4 ? "#f59e0b" : "#22c55e";
  return (
    <div className="flex gap-1 items-center text-[10px]">
      <span style={{ color }}>●</span>
      <span className="text-gray-500 capitalize">{likelihood} likelihood / {impact} impact</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [generatedPolicy, setGeneratedPolicy] = useState("");
  const [selectedPolicyType, setSelectedPolicyType] = useState("AI Ethics & Responsible AI Policy");

  if (!user) return <Redirect to="/auth" />;

  const isAdmin = user.isAdmin;

  const compliantCount = CYBER_CONTROLS.filter(c => c.status === "compliant").length;
  const mitigatedRisks = RISK_ITEMS.filter(r => r.status === "mitigated").length;
  const cyberScore = Math.round((compliantCount / CYBER_CONTROLS.length) * 100);

  function generatePolicy() {
    setGenerating(true);
    setGeneratedPolicy("");
    setTimeout(() => {
      setGenerating(false);
      setGeneratedPolicy(`${selectedPolicyType.toUpperCase()}
VEDD Technologies, LLC
Version: Current | Effective Date: ${new Date().toLocaleDateString()}
=======================================================

1. PURPOSE
----------
This policy establishes VEDD Technologies, LLC's commitment to responsible operations
in accordance with applicable federal, state, and grant compliance requirements.
This policy supports VEDD's eligibility for federal grant programs including those
administered by the NSF, DOL, SBA, EDA, and CDFI Fund.

2. SCOPE
--------
This policy applies to all VEDD employees, contractors, ambassadors, and technology
systems operated by or on behalf of VEDD Technologies, LLC.

3. POLICY STATEMENT
-------------------
VEDD Technologies is committed to operating with the highest standards of integrity,
transparency, and accountability. All operations shall comply with applicable law,
grant award conditions, and the ethical guidelines established by VEDD's governance
committee.

4. RESPONSIBILITIES
-------------------
• Executive Team: Sets policy direction and ensures resource allocation for compliance
• Grant Manager: Monitors compliance with grant-specific requirements and reporting
• Technology Team: Implements technical controls and maintains security standards
• All Staff: Understand and adhere to this policy in daily operations

5. COMPLIANCE & REPORTING
--------------------------
Compliance status is reviewed quarterly by the VEDD Governance Committee.
Non-compliance must be reported immediately to the executive team.
Annual external reviews are conducted and documented for grant reporting.

6. VIOLATIONS
--------------
Violations of this policy may result in disciplinary action, up to and including
termination, and/or notification to relevant grant authorities.

7. POLICY REVIEW
-----------------
This policy is reviewed annually and updated as needed to reflect changes in law,
grant requirements, or organizational needs.

Approved by: VEDD Technologies Governance Committee
Effective: ${new Date().toLocaleDateString()}
Next Review: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}
=======================================================
VEDD Technologies, LLC | veddbuild.com`);
      toast({ title: "Policy Generated", description: "Download or copy to your document management system." });
    }, 2200);
  }

  function downloadPolicy() {
    const blob = new Blob([generatedPolicy], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VEDD_Policy_${selectedPolicyType.replace(/\s+/g, "_")}.txt`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-[#080B14] text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)" }}>
              <Lock className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Compliance & Governance Layer</h1>
              <p className="text-gray-400 text-sm">Cybersecurity posture, risk framework, policy library, and governance review cycles for federal grant readiness</p>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Cyber Controls", value: `${compliantCount}/${CYBER_CONTROLS.length}`, sub: "compliant", icon: Shield, color: "#22c55e" },
            { label: "Cyber Score", value: `${cyberScore}%`, sub: "posture rating", icon: Activity, color: cyberScore >= 80 ? "#22c55e" : "#f59e0b" },
            { label: "Risks Mitigated", value: `${mitigatedRisks}/${RISK_ITEMS.length}`, sub: "risk register", icon: AlertTriangle, color: "#f59e0b" },
            { label: "Policies Current", value: POLICY_DOCS.length, sub: "in library", icon: FileText, color: "#6366f1" },
          ].map((stat, i) => (
            <Card key={i} className="bg-white/[0.03] border-white/10">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${stat.color}22`, border: `1px solid ${stat.color}44` }}>
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
                <div>
                  <p className="text-xl font-bold">{stat.value}</p>
                  <p className="text-[11px] text-gray-400">{stat.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="cybersecurity">
          <TabsList className="bg-white/[0.05] border border-white/10 mb-6 flex-wrap h-auto gap-1 p-1">
            {["cybersecurity", "risk-register", "policy-library", "governance-review", "policy-generator"].map(tab => (
              <TabsTrigger key={tab} value={tab}
                className="capitalize text-xs data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white">
                {tab.replace(/-/g, " ")}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Cybersecurity Tab ─────────────────────────────────── */}
          <TabsContent value="cybersecurity">
            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <Card className="md:col-span-1 bg-white/[0.03] border-white/10 flex items-center justify-center min-h-48">
                <div className="text-center p-6">
                  <div className="relative w-32 h-32 mx-auto mb-4">
                    <svg className="w-32 h-32 -rotate-90">
                      <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                      <circle cx="64" cy="64" r="54" fill="none"
                        stroke={cyberScore >= 80 ? "#22c55e" : "#f59e0b"} strokeWidth="10"
                        strokeDasharray={`${(cyberScore / 100) * 339.3} 339.3`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-3xl font-bold">{cyberScore}%</p>
                      <p className="text-[10px] text-gray-500">CYBER SCORE</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-green-400">Strong Posture</p>
                  <p className="text-xs text-gray-500 mt-1">NIST CSF Aligned</p>
                </div>
              </Card>
              <Card className="md:col-span-2 bg-white/[0.03] border-white/10">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Control Status</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10">
                          {["ID", "Control", "Category", "Framework", "Reviewed", "Status"].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {CYBER_CONTROLS.map((ctrl, i) => (
                          <tr key={ctrl.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                            <td className="px-3 py-2 font-mono text-gray-500">{ctrl.id}</td>
                            <td className="px-3 py-2 text-white font-medium">{ctrl.name}</td>
                            <td className="px-3 py-2 text-gray-400">{ctrl.category}</td>
                            <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-white/10 text-gray-400">{ctrl.framework}</span></td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{ctrl.lastReviewed}</td>
                            <td className="px-3 py-2"><StatusBadge status={ctrl.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-4">
                <p className="text-xs text-gray-400 leading-relaxed">
                  <span className="text-white font-semibold">Federal Grant Cybersecurity Requirement:</span> DOL, NSF, and SBA grants require grantees to maintain a documented cybersecurity posture. VEDD's controls are aligned with the NIST Cybersecurity Framework (CSF 2.0) and SOC 2 Type II principles. The cyber posture module provides the documentation evidence required for grant applications and audits.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Risk Register Tab ─────────────────────────────────── */}
          <TabsContent value="risk-register">
            <div className="space-y-3">
              {RISK_ITEMS.map((risk, i) => (
                <motion.div key={risk.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="bg-white/[0.03] border-white/10">
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <span className="font-mono text-xs text-gray-600 mt-0.5">{risk.id}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold">{risk.risk}</p>
                              <StatusBadge status={risk.status} />
                            </div>
                            <RiskMatrix likelihood={risk.likelihood} impact={risk.impact} />
                            <p className="text-xs text-gray-400 mt-2"><span className="text-gray-500">Mitigation:</span> {risk.mitigation}</p>
                            <p className="text-[11px] text-gray-600 mt-1">Owner: {risk.owner}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
              <Card className="bg-white/[0.03] border-white/10">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-400">
                    <span className="text-white font-semibold">Risk Framework:</span> VEDD's risk register is maintained per COSO ERM principles. Federal grant applications include a risk management section drawn from this register. Risk register is reviewed quarterly by the governance committee.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Policy Library Tab ────────────────────────────────── */}
          <TabsContent value="policy-library">
            <div className="grid md:grid-cols-2 gap-4">
              {POLICY_DOCS.map((pol, i) => (
                <motion.div key={pol.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="bg-white/[0.03] border-white/10 hover:border-white/20 transition-all">
                    <CardContent className="p-4 flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-cyan-500/10 border border-cyan-500/20">
                        <FileText className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-tight">{pol.title}</p>
                          <StatusBadge status={pol.status} />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                          <span>{pol.version}</span>
                          <span>•</span>
                          <span>Updated {pol.updated}</span>
                          <span>•</span>
                          <span className="text-gray-400">{pol.category}</span>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-gray-400 hover:text-white">
                            <Eye className="w-3 h-3 mr-1" /> View
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-gray-400 hover:text-white">
                            <Download className="w-3 h-3 mr-1" /> Download
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* ── Governance Review Tab ─────────────────────────────── */}
          <TabsContent value="governance-review">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <Card className="bg-white/[0.03] border-white/10">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Review Cycle Schedule</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {REVIEW_CYCLES.map((cycle, i) => (
                      <div key={i} className="flex items-start gap-4 p-3 rounded-lg"
                        style={{ background: cycle.status === "scheduled" ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)" }}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5">
                          <Calendar className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold">{cycle.quarter}</p>
                            <StatusBadge status={cycle.status} />
                          </div>
                          <p className="text-xs text-gray-500">{cycle.date}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{cycle.reviewer}</p>
                          {cycle.findings !== null && (
                            <p className="text-xs text-green-400 mt-1">
                              ✓ {cycle.findings} findings — {cycle.resolved} resolved
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-4">
                <Card className="bg-white/[0.03] border-white/10">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Governance Committee</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { role: "CEO / Executive Director", responsibility: "Strategic direction, final approval on policy" },
                      { role: "Chief Technology Officer", responsibility: "Technical controls, AI systems oversight" },
                      { role: "Grants Manager", responsibility: "Grant compliance, reporting, and documentation" },
                      { role: "Community Liaison", responsibility: "Community impact, DEI, and program evaluation" },
                      { role: "External Auditor (Annual)", responsibility: "Independent review of financials and compliance" },
                    ].map((member, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                        <Building2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-white">{member.role}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{member.responsibility}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="bg-white/[0.03] border-cyan-500/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      <span className="text-cyan-300 font-semibold">Grant Compliance Note:</span> Federal grants (DOL, NSF, SBA, EDA) require evidence of governance structure and regular compliance reviews. This documentation is maintained and updated quarterly for grant application and audit purposes.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ── Policy Generator Tab ──────────────────────────────── */}
          <TabsContent value="policy-generator">
            {!isAdmin ? (
              <Card className="bg-white/[0.03] border-white/10">
                <CardContent className="p-8 text-center">
                  <Lock className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                  <p className="text-gray-400">Admin privileges required to generate policy documents.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="bg-white/[0.03] border-white/10">
                  <CardHeader className="pb-3"><CardTitle className="text-sm">Generate Policy Document</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-gray-400">Generate a formal, grant-ready policy document for any of VEDD's compliance areas. Output is pre-formatted for federal grant submissions.</p>
                    <div>
                      <label className="text-xs text-gray-400 mb-2 block">Policy Type</label>
                      <div className="space-y-2">
                        {POLICY_DOCS.map(pol => (
                          <button key={pol.id}
                            onClick={() => setSelectedPolicyType(pol.title)}
                            className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all border"
                            style={{
                              background: selectedPolicyType === pol.title ? "rgba(6,182,212,0.1)" : "rgba(255,255,255,0.03)",
                              borderColor: selectedPolicyType === pol.title ? "rgba(6,182,212,0.4)" : "rgba(255,255,255,0.1)",
                              color: selectedPolicyType === pol.title ? "#06b6d4" : "#9ca3af"
                            }}>
                            {pol.title}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button className="w-full bg-cyan-600 hover:bg-cyan-700" onClick={generatePolicy} disabled={generating}>
                      {generating
                        ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
                        : <><Sparkles className="w-4 h-4 mr-2" /> Generate Policy</>}
                    </Button>
                  </CardContent>
                </Card>
                <div className="space-y-4">
                  {generatedPolicy ? (
                    <Card className="bg-white/[0.03] border-cyan-500/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">Generated Policy</CardTitle>
                          <Button size="sm" onClick={downloadPolicy} className="h-7 text-xs bg-white/10 hover:bg-white/20">
                            <Download className="w-3 h-3 mr-1" /> Download
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Textarea value={generatedPolicy} readOnly className="bg-white/5 border-white/10 font-mono text-xs resize-none h-80" />
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="bg-white/[0.03] border-white/10 h-full flex items-center justify-center min-h-60">
                      <div className="text-center text-gray-600">
                        <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Select a policy type and generate</p>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
