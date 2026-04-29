import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  GraduationCap,
  Heart,
  Shield,
  FlaskConical,
  Building2,
  BarChart3,
  Lock,
  TrendingUp,
  Users,
  Award,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Globe,
  Zap,
} from "lucide-react";

// ─── Grant Readiness Score Gauge ─────────────────────────────────────────────

function GrantReadinessGauge({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score), 300);
    return () => clearTimeout(timer);
  }, [score]);

  const radius = 80;
  const stroke = 14;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  // Only draw the top 270° of the circle (135° to 405° → starts bottom-left, ends bottom-right)
  const arc = circumference * 0.75;
  const dashOffset = arc - (animated / 100) * arc;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        width={radius * 2 + stroke}
        height={radius * 2 + stroke}
        viewBox={`0 0 ${radius * 2 + stroke} ${radius * 2 + stroke}`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        {/* Background track */}
        <circle
          cx={radius + stroke / 2}
          cy={radius + stroke / 2}
          r={normalizedRadius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          strokeDasharray={`${arc} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(135 ${radius + stroke / 2} ${radius + stroke / 2})`}
        />
        {/* Animated foreground */}
        <circle
          cx={radius + stroke / 2}
          cy={radius + stroke / 2}
          r={normalizedRadius}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={stroke}
          strokeDasharray={`${arc} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(135 ${radius + stroke / 2} ${radius + stroke / 2})`}
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
        {/* Center text */}
        <text
          x={radius + stroke / 2}
          y={radius + stroke / 2 - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize="28"
          fontWeight="700"
          fontFamily="inherit"
        >
          {animated}%
        </text>
        <text
          x={radius + stroke / 2}
          y={radius + stroke / 2 + 20}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.5)"
          fontSize="11"
          fontFamily="inherit"
        >
          Grant Ready
        </text>
      </svg>
    </div>
  );
}

// ─── Impact Stat Card ─────────────────────────────────────────────────────────

function ImpactCard({
  icon: Icon,
  value,
  label,
  color,
  delay,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center gap-4"
    >
      <div className={`p-3 rounded-xl ${color} bg-opacity-20`}>
        <Icon className={`h-6 w-6 ${color.replace("bg-", "text-")}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-white/50">{label}</p>
      </div>
    </motion.div>
  );
}

// ─── Pillar Card ──────────────────────────────────────────────────────────────

function PillarCard({
  icon: Icon,
  title,
  description,
  features,
  accentColor,
  bgColor,
  link,
  delay,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  features: string[];
  accentColor: string;
  bgColor: string;
  link: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3 hover:border-white/20 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${bgColor}`}>
          <Icon className={`h-5 w-5 ${accentColor}`} />
        </div>
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
          Active
        </Badge>
      </div>
      <div>
        <h3 className="text-white font-semibold text-base">{title}</h3>
        <p className="text-white/50 text-sm mt-0.5">{description}</p>
      </div>
      <ul className="space-y-1.5 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-white/60">
            <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${accentColor.replace("text-", "bg-")}`} />
            {f}
          </li>
        ))}
      </ul>
      <Link href={link}>
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-1 border-white/10 text-white/70 hover:text-white hover:border-white/30 bg-transparent text-xs"
        >
          Open Module
          <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </Link>
    </motion.div>
  );
}

// ─── Grant Brief Dialog Content ───────────────────────────────────────────────

const grantBriefTemplate = `VEDD TECHNOLOGIES, LLC
GRANT BRIEF — WORKFORCE DEVELOPMENT INITIATIVE
Prepared: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

ORGANIZATION OVERVIEW
VEDD Technologies, LLC is an AI-powered workforce development and community finance platform dedicated to closing the digital skills gap in underserved communities. Our seven-pillar ecosystem integrates AI literacy training, ethics governance, community impact measurement, and nonprofit integration to deliver measurable workforce outcomes.

MISSION STATEMENT
To democratize access to AI skills training, financial literacy, and economic opportunity through technology-driven education, ensuring every community participant gains the competencies required for the 21st-century labor market.

PROGRAM HIGHLIGHTS
• 1,247 active program participants across workforce cohorts
• 384 certificates issued to date through our AI Literacy curriculum
• 28 community and employer partners including municipal workforce development boards
• 6 active grant programs currently in reporting phase
• 78% Grant Readiness Score on federal compliance and outcome-tracking systems

WORKFORCE DEVELOPMENT PILLARS
1. Workforce Academy Engine — AI literacy, skills assessments, job readiness
2. Community Impact Layer — Digital equity, youth STEM, financial literacy
3. AI Ethics & Data Governance — Bias detection, privacy enforcement, audit logging
4. Research & Innovation Lab — Algorithm sandbox, wearable AI identity research
5. Nonprofit Integration Hooks — Grant reporting, impact metrics, partnership management
6. Impact Measurement System — Participant progress, skills gain, job placement tracking
7. Compliance & Governance Layer — Cybersecurity posture, risk framework, audit logs

ALIGNMENT WITH FEDERAL PRIORITIES
VEDD Technologies directly addresses workforce transformation priorities outlined in the CHIPS and Science Act, DOL WIOA Title I, NSF INCLUDES, and EDA Tech Hub Program. Our data-driven impact measurement infrastructure ensures full compliance with OMB Uniform Guidance (2 CFR Part 200).

REQUESTED FUNDING USE
• Curriculum development and AI training content: 35%
• Community outreach and participant support services: 30%
• Technology infrastructure and platform development: 20%
• Program evaluation and reporting: 10%
• Administrative and indirect costs: 5%

CONTACT
VEDD Technologies, LLC
Email: chris@madetomaximize.com
Platform: vedd.ai`;

// ─── Main Page ────────────────────────────────────────────────────────────────

const pillars = [
  {
    icon: GraduationCap,
    title: "Workforce Academy Engine",
    description: "AI-powered training and certification for job-ready skills",
    features: [
      "AI literacy curriculum",
      "Skills assessments",
      "Certificate generator",
      "Job readiness builder",
    ],
    accentColor: "text-emerald-400",
    bgColor: "bg-emerald-500/15",
    link: "/workforce-academy",
  },
  {
    icon: Heart,
    title: "Community Impact Layer",
    description: "Digital equity tools built for underserved communities",
    features: [
      "Digital equity tools",
      "Youth STEM mode",
      "Financial literacy coach",
      "Underserved community support",
    ],
    accentColor: "text-rose-400",
    bgColor: "bg-rose-500/15",
    link: "/community-impact",
  },
  {
    icon: Shield,
    title: "AI Ethics & Data Governance",
    description: "Responsible AI with built-in bias detection and audit trails",
    features: [
      "Ethics guardrails",
      "Bias detection scanner",
      "Privacy enforcement",
      "Decision audit logging",
    ],
    accentColor: "text-blue-400",
    bgColor: "bg-blue-500/15",
    link: "/ai-governance",
  },
  {
    icon: FlaskConical,
    title: "Research & Innovation Lab",
    description: "Cutting-edge AI research tools and innovation sandbox",
    features: [
      "Algorithm sandbox",
      "AI research mode",
      "Wearable AI identity research",
      "Innovation report generator",
    ],
    accentColor: "text-purple-400",
    bgColor: "bg-purple-500/15",
    link: "/innovation-lab",
  },
  {
    icon: Building2,
    title: "Nonprofit Integration Hooks",
    description: "Grant-ready reporting and partnership management layer",
    features: [
      "Grant reporting dashboard",
      "Impact metrics tracker",
      "Partnership manager",
      "Program evaluation",
    ],
    accentColor: "text-amber-400",
    bgColor: "bg-amber-500/15",
    link: "/grants",
  },
  {
    icon: BarChart3,
    title: "Impact Measurement System",
    description: "Real-time outcomes tracking across all program participants",
    features: [
      "Participant progress tracking",
      "Skills gain metrics",
      "Job placement tracking",
      "Community outcomes",
    ],
    accentColor: "text-cyan-400",
    bgColor: "bg-cyan-500/15",
    link: "/impact-dashboard",
  },
  {
    icon: Lock,
    title: "Compliance & Governance Layer",
    description: "Federal-grade security, risk management, and policy controls",
    features: [
      "Cybersecurity posture module",
      "Risk management framework",
      "Policy document generator",
      "Audit log system",
    ],
    accentColor: "text-red-400",
    bgColor: "bg-red-500/15",
    link: "/compliance",
  },
];

const grantMatrix = [
  {
    name: "NSF AI Workforce Initiative",
    amount: "$2.5M",
    pillars: ["Workforce Academy", "Research Lab", "Ethics"],
    deadline: "Aug 15, 2026",
    status: "Active",
    statusColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  {
    name: "DOL WIOA Title I",
    amount: "$1.8M",
    pillars: ["Workforce Academy", "Impact Measurement"],
    deadline: "Oct 1, 2026",
    status: "In Review",
    statusColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  {
    name: "SBA Community Advantage",
    amount: "$750K",
    pillars: ["Community Impact", "Nonprofit Hooks"],
    deadline: "Sep 30, 2026",
    status: "Active",
    statusColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  {
    name: "CDFI Program Grant",
    amount: "$1.2M",
    pillars: ["Community Impact", "Compliance"],
    deadline: "Nov 15, 2026",
    status: "Drafting",
    statusColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  {
    name: "EDA Tech Hub Program",
    amount: "$3.0M",
    pillars: ["Research Lab", "Workforce Academy", "Impact"],
    deadline: "Jan 20, 2027",
    status: "Prospecting",
    statusColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  {
    name: "NIH AI Health Equity",
    amount: "$900K",
    pillars: ["Ethics", "Community Impact", "Research Lab"],
    deadline: "Mar 5, 2027",
    status: "Prospecting",
    statusColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
];

const activityFeed = [
  { icon: "🎓", time: "2 min ago", action: "New enrollment in AI Literacy 101 — User #1,247 joined" },
  { icon: "🏆", time: "14 min ago", action: "Certificate issued to User #384 — AI Fundamentals Completion" },
  { icon: "🔍", time: "31 min ago", action: "Bias scan completed — 2 findings flagged in module output" },
  { icon: "🤝", time: "1 hr ago", action: "Partner MOU signed: City of Atlanta Workforce Dev Board" },
  { icon: "📊", time: "2 hr ago", action: "Impact report generated — Q1 2026 cohort outcomes exported" },
  { icon: "🛡️", time: "3 hr ago", action: "Ethics guardrail triggered — decision audit log updated" },
  { icon: "📝", time: "4 hr ago", action: "Grant brief submitted for NSF AI Workforce Initiative" },
  { icon: "🌐", time: "5 hr ago", action: "New community partner onboarded: Atlanta Tech Village" },
  { icon: "⚡", time: "6 hr ago", action: "Skills assessment completed — 12 participants, avg score 84%" },
  { icon: "🔒", time: "8 hr ago", action: "Cybersecurity posture scan completed — 0 critical findings" },
];

export default function VeddEcosystemPage() {
  const { user } = useAuth();
  const [grantBriefOpen, setGrantBriefOpen] = useState(false);

  // Redirect non-admin, non-ambassador users
  if (user && !user.isAdmin && !user.isAmbassador) {
    return <Redirect to="/" />;
  }

  return (
    <div className="bg-gradient-to-br from-[#080B14] to-[#0D1220] min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              <span className="text-amber-400 text-sm font-medium uppercase tracking-widest">
                VEDD Technologies, LLC
              </span>
            </div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              VEDD Workforce Ecosystem
            </h1>
            <p className="text-white/50 text-lg max-w-xl">
              AI-Powered Workforce Development &amp; Community Finance Platform
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-3 py-1">
                <Globe className="h-3.5 w-3.5 mr-1.5" />
                Grant-Ready Platform
              </Badge>
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 px-3 py-1">
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                7 Active Pillars
              </Badge>
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 px-3 py-1">
                <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                Workforce Development
              </Badge>
            </div>
          </div>

          {/* Grant Readiness Gauge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-1 min-w-[200px]"
          >
            <GrantReadinessGauge score={78} />
            <p className="text-white/40 text-xs text-center mt-1">
              Federal Compliance Index
            </p>
          </motion.div>
        </motion.div>

        {/* ── Impact Snapshot Bar ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ImpactCard
            icon={Users}
            value="1,247"
            label="Total Participants"
            color="bg-blue-500"
            delay={0.1}
          />
          <ImpactCard
            icon={Award}
            value="384"
            label="Certificates Issued"
            color="bg-emerald-500"
            delay={0.15}
          />
          <ImpactCard
            icon={Globe}
            value="28"
            label="Community Partners"
            color="bg-purple-500"
            delay={0.2}
          />
          <ImpactCard
            icon={TrendingUp}
            value="6"
            label="Active Grants"
            color="bg-amber-500"
            delay={0.25}
          />
        </div>

        {/* ── 7 Pillar Cards Grid ─────────────────────────────────────────────── */}
        <div>
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-white font-semibold text-xl mb-4"
          >
            Platform Pillars
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pillars.map((pillar, i) => (
              <PillarCard
                key={pillar.title}
                icon={pillar.icon}
                title={pillar.title}
                description={pillar.description}
                features={pillar.features}
                accentColor={pillar.accentColor}
                bgColor={pillar.bgColor}
                link={pillar.link}
                delay={0.1 + i * 0.07}
              />
            ))}
          </div>
        </div>

        {/* ── Grant Alignment Matrix (admin only) ─────────────────────────────── */}
        {user?.isAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            <h2 className="text-white font-semibold text-xl mb-4">
              Grant Alignment Matrix
            </h2>
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-5 py-3.5 text-white/50 font-medium">Grant Name</th>
                      <th className="text-left px-5 py-3.5 text-white/50 font-medium">Amount</th>
                      <th className="text-left px-5 py-3.5 text-white/50 font-medium">Aligned Pillars</th>
                      <th className="text-left px-5 py-3.5 text-white/50 font-medium">Deadline</th>
                      <th className="text-left px-5 py-3.5 text-white/50 font-medium">Status</th>
                      <th className="px-5 py-3.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {grantMatrix.map((grant, i) => (
                      <tr
                        key={grant.name}
                        className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                          i === grantMatrix.length - 1 ? "border-b-0" : ""
                        }`}
                      >
                        <td className="px-5 py-3.5 text-white font-medium">{grant.name}</td>
                        <td className="px-5 py-3.5 text-emerald-400 font-semibold">{grant.amount}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {grant.pillars.map((p) => (
                              <Badge
                                key={p}
                                variant="outline"
                                className="text-xs border-white/15 text-white/60 bg-white/5"
                              >
                                {p}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-white/60">{grant.deadline}</td>
                        <td className="px-5 py-3.5">
                          <Badge className={`text-xs border ${grant.statusColor}`}>
                            {grant.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-white/50 hover:text-white text-xs h-7 px-2"
                          >
                            View Details
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Recent Activity Feed + Quick Actions ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Activity Feed */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.5 }}
            className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-5"
          >
            <h2 className="text-white font-semibold text-base mb-4">Recent Activity</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {activityFeed.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.04 }}
                  className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-b-0"
                >
                  <span className="text-lg leading-none mt-0.5 flex-shrink-0">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/75 text-sm leading-snug">{item.action}</p>
                  </div>
                  <span className="text-white/30 text-xs flex-shrink-0 mt-0.5">{item.time}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3"
          >
            <h2 className="text-white font-semibold text-base">Quick Actions</h2>

            {/* Generate Grant Brief — with Dialog */}
            <Dialog open={grantBriefOpen} onOpenChange={setGrantBriefOpen}>
              <DialogTrigger asChild>
                <Button
                  className="w-full bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white font-semibold border-0"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Grant Brief
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#0D1220] border-white/10 text-white max-w-2xl max-h-[85vh]">
                <DialogHeader>
                  <DialogTitle className="text-white flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-400" />
                    VEDD Grant Brief Template
                  </DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto">
                  <pre className="text-xs text-white/70 whitespace-pre-wrap font-mono bg-white/5 rounded-xl p-4 leading-relaxed border border-white/10">
                    {grantBriefTemplate}
                  </pre>
                  <div className="flex gap-2 mt-4">
                    <Button
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-blue-500 border-0 text-white"
                      onClick={() => {
                        navigator.clipboard.writeText(grantBriefTemplate);
                      }}
                    >
                      Copy to Clipboard
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/20 text-white/70 hover:text-white bg-transparent"
                      onClick={() => setGrantBriefOpen(false)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              className="w-full border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-transparent"
            >
              <Shield className="h-4 w-4 mr-2 text-blue-400" />
              Run Bias Scan
            </Button>

            <Button
              variant="outline"
              className="w-full border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-transparent"
            >
              <BarChart3 className="h-4 w-4 mr-2 text-cyan-400" />
              Export Impact Report
            </Button>

            <Button
              variant="outline"
              className="w-full border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-transparent"
            >
              <Building2 className="h-4 w-4 mr-2 text-amber-400" />
              Add Community Partner
            </Button>

            {/* Platform health mini-stats */}
            <div className="mt-2 pt-4 border-t border-white/10 space-y-2">
              <p className="text-white/40 text-xs uppercase tracking-wider">Platform Health</p>
              {[
                { label: "Uptime", value: "99.9%", color: "text-emerald-400" },
                { label: "Data Compliance", value: "100%", color: "text-blue-400" },
                { label: "Open Incidents", value: "0", color: "text-emerald-400" },
              ].map((stat) => (
                <div key={stat.label} className="flex justify-between items-center">
                  <span className="text-white/50 text-xs">{stat.label}</span>
                  <span className={`text-xs font-semibold ${stat.color}`}>{stat.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── Footer note ─────────────────────────────────────────────────────── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-white/20 text-xs pb-4"
        >
          VEDD Technologies, LLC · AI-Powered Workforce Development Platform · Grant-Ready Infrastructure
        </motion.p>

      </div>
    </div>
  );
}
