import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import {
  Users,
  CheckCircle2,
  Award,
  TrendingUp,
  Briefcase,
  HandshakeIcon,
  Download,
  FileText,
  MapPin,
  BarChart3,
} from "lucide-react";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period =
  | "Q1 2024"
  | "Q2 2024"
  | "Q3 2024"
  | "Q4 2024"
  | "Q1 2025"
  | "Q2 2025";

interface KPI {
  label: string;
  value: string | number;
  delta: string;
  icon: React.ElementType;
  color: string;
}

interface Placement {
  id: string;
  program: string;
  placement: string;
  sector: string;
  date: string;
  wage: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS: Period[] = [
  "Q1 2024",
  "Q2 2024",
  "Q3 2024",
  "Q4 2024",
  "Q1 2025",
  "Q2 2025",
];

const KPIS: KPI[] = [
  { label: "Total Participants", value: 1247, delta: "+18%", icon: Users, color: "#6366f1" },
  { label: "Course Completions", value: 892, delta: "+24%", icon: CheckCircle2, color: "#22c55e" },
  { label: "Certificates Issued", value: 384, delta: "+31%", icon: Award, color: "#f59e0b" },
  { label: "Avg Skills Gain", value: "67%", delta: "+12pts", icon: TrendingUp, color: "#06b6d4" },
  { label: "Job Placements", value: 43, delta: "+8", icon: Briefcase, color: "#a855f7" },
  { label: "Community Partners", value: 28, delta: "+5", icon: HandshakeIcon, color: "#ef4444" },
];

const PARTICIPANT_DATA = [
  { month: "Jan", enrolled: 180, completed: 95, certified: 38 },
  { month: "Feb", enrolled: 215, completed: 124, certified: 51 },
  { month: "Mar", enrolled: 287, completed: 178, certified: 73 },
  { month: "Apr", enrolled: 334, completed: 221, certified: 98 },
  { month: "May", enrolled: 398, completed: 276, certified: 124 },
  { month: "Jun", enrolled: 447, completed: 318, certified: 152 },
];

const SKILLS_DATA = [
  { category: "AI Literacy", prePct: 22, postPct: 79 },
  { category: "Digital Skills", prePct: 35, postPct: 81 },
  { category: "Financial Literacy", prePct: 28, postPct: 74 },
  { category: "Trading Fundamentals", prePct: 18, postPct: 72 },
  { category: "Web3 Basics", prePct: 12, postPct: 68 },
  { category: "STEM", prePct: 31, postPct: 77 },
];

const AGE_DATA = [
  { label: "18–24", pct: 28 },
  { label: "25–34", pct: 35 },
  { label: "35–44", pct: 22 },
  { label: "45+", pct: 15 },
];

const GENDER_DATA = [
  { label: "Female", pct: 54 },
  { label: "Male", pct: 42 },
  { label: "Non-binary", pct: 4 },
];

const INCOME_DATA = [
  { label: "<$30k", pct: 41 },
  { label: "$30–60k", pct: 35 },
  { label: "$60k+", pct: 24 },
];

const GEO_DATA = [
  { state: "Georgia", count: 287 },
  { state: "Texas", count: 198 },
  { state: "Illinois", count: 167 },
  { state: "Florida", count: 142 },
  { state: "New York", count: 134 },
  { state: "California", count: 118 },
  { state: "Ohio", count: 97 },
  { state: "Michigan", count: 84 },
  { state: "North Carolina", count: 76 },
  { state: "Tennessee", count: 64 },
];

const FUNNEL_DATA = [
  { label: "Enrolled in Program", value: 1247, pct: "100%", color: "#6366f1" },
  { label: "Completed Course", value: 892, pct: "72%", color: "#22c55e" },
  { label: "Received Certificate", value: 384, pct: "31%", color: "#f59e0b" },
  { label: "Sought Employment", value: 187, pct: "15%", color: "#06b6d4" },
  { label: "Placed in Job/Gig", value: 43, pct: "3.4%", color: "#a855f7" },
];

const PLACEMENTS: Placement[] = [
  { id: "P-0847", program: "Trading Fundamentals", placement: "Freelance Trader", sector: "Finance", date: "Jun 12", wage: "+$14,200" },
  { id: "P-0831", program: "Digital Skills", placement: "VA/Admin Assistant", sector: "Tech", date: "Jun 8", wage: "+$6,800" },
  { id: "P-0819", program: "Financial Literacy", placement: "Bank Teller", sector: "Banking", date: "May 28", wage: "+$9,100" },
  { id: "P-0802", program: "AI Literacy 101", placement: "Data Entry Analyst", sector: "Tech", date: "May 22", wage: "+$11,400" },
  { id: "P-0794", program: "Job Readiness", placement: "Office Admin", sector: "Healthcare", date: "May 15", wage: "+$7,200" },
];

const DRAFT_REPORT_TEXT = `VEDD WORKFORCE DEVELOPMENT PROGRAM
QUARTERLY IMPACT REPORT — Q2 2025
U.S. Department of Labor Grant Reporting Format

Organization: VEDD Trading AI
Reporting Period: April 1 – June 30, 2025
Submitted By: Program Administration
Contact: admin@veddtradingai.com

─────────────────────────────────────────────────────────
SECTION 1: PARTICIPANT OUTCOMES SUMMARY
─────────────────────────────────────────────────────────

Total Participants Served (Cumulative): 1,247
  - New Enrollments This Quarter: 447
  - Course Completions: 892 (Completion Rate: 72%)
  - Certificates Issued: 384 (31% of enrolled)
  - Average Skills Proficiency Gain: +67 percentage points

─────────────────────────────────────────────────────────
SECTION 2: EMPLOYMENT OUTCOMES
─────────────────────────────────────────────────────────

Participants Seeking Employment: 187 (15% of enrolled)
Job/Gig Placements Achieved: 43 (3.4% placement rate)
Average Annual Wage Increase: $8,400
Community Partners Engaged: 28

─────────────────────────────────────────────────────────
SECTION 3: SKILLS ASSESSMENT DATA
─────────────────────────────────────────────────────────

Pre/Post Assessment Results (Average % Proficiency):
  AI Literacy:           22% → 79%  (+57 pts)
  Digital Skills:        35% → 81%  (+46 pts)
  Financial Literacy:    28% → 74%  (+46 pts)
  Trading Fundamentals:  18% → 72%  (+54 pts)
  Web3 Basics:           12% → 68%  (+56 pts)
  STEM Fundamentals:     31% → 77%  (+46 pts)

─────────────────────────────────────────────────────────
SECTION 4: DEMOGRAPHIC BREAKDOWN
─────────────────────────────────────────────────────────

Age Distribution:
  18–24: 28%  |  25–34: 35%  |  35–44: 22%  |  45+: 15%

Gender Identity:
  Female: 54%  |  Male: 42%  |  Non-binary/Other: 4%

Household Income:
  Under $30,000: 41%  |  $30,000–$60,000: 35%  |  Over $60,000: 24%

Top States by Participation:
  Georgia (287), Texas (198), Illinois (167), Florida (142),
  New York (134), California (118), Ohio (97), Michigan (84),
  North Carolina (76), Tennessee (64)

─────────────────────────────────────────────────────────
SECTION 5: PROGRAM NARRATIVE
─────────────────────────────────────────────────────────

VEDD Trading AI continues to serve underrepresented communities
through its integrated workforce development curriculum. The
Q2 2025 reporting period demonstrated significant growth across
all key performance indicators, with a 24% increase in course
completions and a 31% increase in certificates issued compared
to Q2 2024.

The program maintains strong alignment with DOL workforce
development priorities, focusing on technology literacy,
financial empowerment, and sustainable employment pathways
for low-to-moderate income participants.

─────────────────────────────────────────────────────────
SECTION 6: NEXT QUARTER PROJECTIONS (Q3 2025)
─────────────────────────────────────────────────────────

Projected Enrollments: 520
Projected Completions: 390
Projected Certifications: 175
Projected Job Placements: 58
New Community Partnerships Target: 5

Prepared by VEDD Administration | Generated: Q2 2025
`;

// ─── Helper: Export Function ──────────────────────────────────────────────────

function exportReport() {
  const blob = new Blob([DRAFT_REPORT_TEXT], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "VEDD_Impact_Report_Q2_2025.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ kpi, index }: { kpi: KPI; index: number }) {
  const Icon = kpi.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <Card className="bg-[#0d1117] border-white/10 hover:border-white/20 transition-colors">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <motion.div
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ delay: index * 0.08 + 0.3, duration: 0.5 }}
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${kpi.color}20` }}
            >
              <Icon size={20} style={{ color: kpi.color }} />
            </motion.div>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
              {kpi.delta}
            </Badge>
          </div>
          <div className="text-2xl font-bold text-white mb-1">{kpi.value}</div>
          <div className="text-xs text-white/50">{kpi.label}</div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function DemoBars({
  title,
  data,
  color,
}: {
  title: string;
  data: { label: string; pct: number }[];
  color: string;
}) {
  return (
    <div className="mb-5">
      <div className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
        {title}
      </div>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label}>
            <div className="flex justify-between text-xs text-white/70 mb-1">
              <span>{d.label}</span>
              <span>{d.pct}%</span>
            </div>
            <Progress value={d.pct} className="h-1.5 bg-white/10" style={{ "--progress-color": color } as React.CSSProperties} />
          </div>
        ))}
      </div>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#0d1117",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "#fff",
  },
  labelStyle: { color: "#fff" },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ImpactDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("Q2 2025");
  const [grantMode, setGrantMode] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!user) return <Redirect to="/auth" />;

  function handleExport() {
    exportReport();
    toast({ title: "Report downloaded", description: "VEDD_Impact_Report_Q2_2025.txt saved." });
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(DRAFT_REPORT_TEXT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const grantPrint = grantMode ? "bg-white text-black print:block" : "";

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        grantMode ? "bg-white text-gray-900" : "bg-[#080B14] text-white"
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-8">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
        >
          <div>
            <div className="flex items-center gap-3 mb-1">
              <BarChart3 className={grantMode ? "text-indigo-600" : "text-indigo-400"} size={28} />
              <h1 className={`text-2xl font-bold ${grantMode ? "text-gray-900" : "text-white"}`}>
                Impact Measurement System
              </h1>
            </div>
            <p className={`text-sm ${grantMode ? "text-gray-500" : "text-white/50"}`}>
              Real-time program outcomes tracking for grant reporting
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Grant Reporting Mode toggle */}
            <button
              onClick={() => setGrantMode((v) => !v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                grantMode
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white/5 border-white/15 text-white/70 hover:bg-white/10"
              }`}
            >
              <FileText size={15} />
              Grant Reporting Mode
            </button>

            {/* Export button */}
            <Button
              onClick={handleExport}
              className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2"
            >
              <Download size={15} />
              Export Q2 2025 Report
            </Button>
          </div>
        </motion.div>

        {/* ── Period Selector ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-2"
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                selectedPeriod === p
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : grantMode
                  ? "bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200"
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
              }`}
            >
              {p}
            </button>
          ))}
        </motion.div>

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {KPIS.map((kpi, i) => (
            <KpiCard key={kpi.label} kpi={kpi} index={i} />
          ))}
        </div>

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Participant Growth */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className={grantMode ? "bg-white border-gray-200" : "bg-[#0d1117] border-white/10"}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${grantMode ? "text-gray-800" : "text-white"}`}>
                  <TrendingUp size={16} className="text-indigo-400" />
                  Participant Growth — Jan–Jun 2025
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={PARTICIPANT_DATA} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gEnrolled" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gCertified" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" tick={{ fill: "#ffffff80", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#ffffff80", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#ffffff80" }} />
                    <Area type="monotone" dataKey="enrolled" name="Enrolled" stroke="#6366f1" fill="url(#gEnrolled)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="completed" name="Completed" stroke="#22c55e" fill="url(#gCompleted)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="certified" name="Certified" stroke="#f59e0b" fill="url(#gCertified)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          {/* Skills Gain */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card className={grantMode ? "bg-white border-gray-200" : "bg-[#0d1117] border-white/10"}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${grantMode ? "text-gray-800" : "text-white"}`}>
                  <BarChart3 size={16} className="text-cyan-400" />
                  Skills Gain by Category (Pre vs. Post)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={SKILLS_DATA} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="category" tick={{ fill: "#ffffff80", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#ffffff80", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#ffffff80" }} />
                    <Bar dataKey="prePct" name="Pre-Assessment" fill="#ef444480" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="postPct" name="Post-Assessment" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Demographics Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Panel 1: Demographics */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className={`h-full ${grantMode ? "bg-white border-gray-200" : "bg-[#0d1117] border-white/10"}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${grantMode ? "text-gray-800" : "text-white"}`}>
                  <Users size={15} className="text-indigo-400" />
                  Participant Demographics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DemoBars title="Age" data={AGE_DATA} color="#6366f1" />
                <DemoBars title="Gender" data={GENDER_DATA} color="#22c55e" />
                <DemoBars title="Household Income" data={INCOME_DATA} color="#f59e0b" />
              </CardContent>
            </Card>
          </motion.div>

          {/* Panel 2: Geographic Reach */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <Card className={`h-full ${grantMode ? "bg-white border-gray-200" : "bg-[#0d1117] border-white/10"}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${grantMode ? "text-gray-800" : "text-white"}`}>
                  <MapPin size={15} className="text-green-400" />
                  Geographic Reach
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {GEO_DATA.map((g, i) => {
                    const pct = Math.round((g.count / GEO_DATA[0].count) * 100);
                    return (
                      <div key={g.state}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={grantMode ? "text-gray-700" : "text-white/80"}>
                            <span className="text-white/30 mr-1.5">#{i + 1}</span>
                            {g.state}
                          </span>
                          <span className={grantMode ? "text-gray-500" : "text-white/50"}>{g.count.toLocaleString()}</span>
                        </div>
                        <Progress value={pct} className="h-1.5 bg-white/10" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Panel 3: Employment Funnel */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <Card className={`h-full ${grantMode ? "bg-white border-gray-200" : "bg-[#0d1117] border-white/10"}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${grantMode ? "text-gray-800" : "text-white"}`}>
                  <Briefcase size={15} className="text-purple-400" />
                  Employment Outcomes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {FUNNEL_DATA.map((step, i) => {
                    const widthPct = 100 - i * 14;
                    return (
                      <div key={step.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={grantMode ? "text-gray-700" : "text-white/80"}>{step.label}</span>
                          <span className="font-semibold" style={{ color: step.color }}>
                            {step.value.toLocaleString()}{" "}
                            <span className="text-white/40 font-normal">({step.pct})</span>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${widthPct}%` }}
                            transition={{ delay: 0.5 + i * 0.07, duration: 0.5 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: step.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className={`pt-3 mt-3 border-t ${grantMode ? "border-gray-200" : "border-white/10"}`}>
                    <div className="flex justify-between text-xs">
                      <span className={grantMode ? "text-gray-500" : "text-white/50"}>Average Wage Increase</span>
                      <span className="text-green-400 font-semibold">$8,400 / yr</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Job Placement Tracker ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <Card className={grantMode ? "bg-white border-gray-200" : "bg-[#0d1117] border-white/10"}>
            <CardHeader className="pb-3">
              <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${grantMode ? "text-gray-800" : "text-white"}`}>
                <Briefcase size={15} className="text-purple-400" />
                Recent Job Placements
                <Badge className="ml-2 bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                  Last 5 Placements
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`text-xs uppercase tracking-wider border-b ${grantMode ? "text-gray-400 border-gray-200" : "text-white/40 border-white/10"}`}>
                      <th className="text-left py-2 pr-4 font-medium">ID</th>
                      <th className="text-left py-2 pr-4 font-medium">Program</th>
                      <th className="text-left py-2 pr-4 font-medium">Placement</th>
                      <th className="text-left py-2 pr-4 font-medium">Sector</th>
                      <th className="text-left py-2 pr-4 font-medium">Date</th>
                      <th className="text-right py-2 font-medium">Wage Increase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLACEMENTS.map((p, i) => (
                      <motion.tr
                        key={p.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.55 + i * 0.06 }}
                        className={`border-b last:border-0 ${grantMode ? "border-gray-100" : "border-white/5"}`}
                      >
                        <td className="py-3 pr-4">
                          <code className={`text-xs px-1.5 py-0.5 rounded ${grantMode ? "bg-gray-100 text-gray-600" : "bg-white/10 text-white/70"}`}>
                            {p.id}
                          </code>
                        </td>
                        <td className={`py-3 pr-4 text-xs ${grantMode ? "text-gray-700" : "text-white/80"}`}>{p.program}</td>
                        <td className={`py-3 pr-4 text-xs ${grantMode ? "text-gray-600" : "text-white/60"}`}>{p.placement}</td>
                        <td className="py-3 pr-4">
                          <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs">
                            {p.sector}
                          </Badge>
                        </td>
                        <td className={`py-3 pr-4 text-xs ${grantMode ? "text-gray-500" : "text-white/50"}`}>{p.date}</td>
                        <td className="py-3 text-right text-xs font-semibold text-green-400">{p.wage}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Grant Reporting Periods (admin only) ── */}
        {user.role === "admin" || user.isAdmin ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <Card className={grantMode ? "bg-white border-gray-200" : "bg-[#0d1117] border-white/10"}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${grantMode ? "text-gray-800" : "text-white"}`}>
                  <FileText size={15} className="text-amber-400" />
                  Grant Reporting Periods
                  <Badge className="ml-2 bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">
                    Admin Only
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="space-y-2">
                  {/* Q1 2025 */}
                  <AccordionItem
                    value="q1-2025"
                    className={`rounded-lg border px-4 ${grantMode ? "border-gray-200" : "border-white/10"}`}
                  >
                    <AccordionTrigger className={`text-sm hover:no-underline ${grantMode ? "text-gray-800" : "text-white"}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-base">✅</span>
                        <div className="text-left">
                          <div className="font-medium">Q1 2025 Report</div>
                          <div className={`text-xs ${grantMode ? "text-gray-500" : "text-white/50"}`}>Submitted Mar 31, 2025</div>
                        </div>
                        <Badge className="ml-3 bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                          Submitted
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="py-2 flex gap-2">
                        <Button size="sm" variant="outline" className={grantMode ? "" : "border-white/20 text-white/70 hover:bg-white/10"}>
                          View Report
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Q2 2025 */}
                  <AccordionItem
                    value="q2-2025"
                    className={`rounded-lg border px-4 ${grantMode ? "border-indigo-200 bg-indigo-50" : "border-indigo-500/30 bg-indigo-500/5"}`}
                  >
                    <AccordionTrigger className={`text-sm hover:no-underline ${grantMode ? "text-gray-800" : "text-white"}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-base">🔄</span>
                        <div className="text-left">
                          <div className="font-medium">Q2 2025 Report</div>
                          <div className={`text-xs ${grantMode ? "text-gray-500" : "text-white/50"}`}>Due Jul 15, 2025</div>
                        </div>
                        <Badge className="ml-3 bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs">
                          In Progress
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="py-2 flex flex-wrap gap-2">
                        {/* Generate Draft — opens dialog */}
                        <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5">
                              <FileText size={13} />
                              Generate Draft
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-[#0d1117] border-white/15 max-w-2xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle className="text-white flex items-center gap-2">
                                <FileText size={16} className="text-indigo-400" />
                                Q2 2025 Grant Impact Report (Draft)
                              </DialogTitle>
                            </DialogHeader>
                            <div className="mt-2">
                              <pre className="text-xs text-white/70 bg-white/5 rounded-lg p-4 whitespace-pre-wrap leading-relaxed font-mono overflow-auto max-h-[50vh]">
                                {DRAFT_REPORT_TEXT}
                              </pre>
                              <div className="flex gap-2 mt-4">
                                <Button
                                  onClick={handleCopy}
                                  variant="outline"
                                  size="sm"
                                  className="border-white/20 text-white/70 hover:bg-white/10 gap-1.5"
                                >
                                  {copied ? "✓ Copied!" : "Copy to Clipboard"}
                                </Button>
                                <Button
                                  onClick={handleExport}
                                  size="sm"
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
                                >
                                  <Download size={13} />
                                  Download .txt
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleExport}
                          className={`gap-1.5 ${grantMode ? "" : "border-white/20 text-white/70 hover:bg-white/10"}`}
                        >
                          <Download size={13} />
                          Export Data
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Q3 2025 */}
                  <AccordionItem
                    value="q3-2025"
                    className={`rounded-lg border px-4 ${grantMode ? "border-gray-200" : "border-white/10"}`}
                  >
                    <AccordionTrigger className={`text-sm hover:no-underline ${grantMode ? "text-gray-800" : "text-white"}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-base">⏳</span>
                        <div className="text-left">
                          <div className="font-medium">Q3 2025 Report</div>
                          <div className={`text-xs ${grantMode ? "text-gray-500" : "text-white/50"}`}>Due Oct 15, 2025</div>
                        </div>
                        <Badge className="ml-3 bg-white/10 text-white/50 border-white/10 text-xs">
                          Upcoming
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="py-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className={grantMode ? "" : "border-white/20 text-white/70 hover:bg-white/10"}
                          onClick={() =>
                            toast({
                              title: "Reminder set",
                              description: "You'll be notified before Oct 15, 2025.",
                            })
                          }
                        >
                          Set Reminder
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        {/* ── Footer note ── */}
        <div className={`text-center text-xs pb-4 ${grantMode ? "text-gray-400" : "text-white/25"}`}>
          VEDD Impact Measurement System · {selectedPeriod} · Data refreshed in real-time ·
          Required for DOL, NSF & CDFI quarterly reporting
        </div>
      </div>
    </div>
  );
}
