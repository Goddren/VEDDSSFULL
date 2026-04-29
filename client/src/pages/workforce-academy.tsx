import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  GraduationCap, Brain, Monitor, TrendingUp, DollarSign, Coins, Shield, Briefcase,
  LineChart, Users, Lock, Rocket, Award, BookOpen, CheckCircle2, Clock, Filter,
  Download, Sparkles
} from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Course Data ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; className?: string }>> = {
  Brain, Monitor, TrendingUp, DollarSign, Coins, GraduationCap, Shield,
  Briefcase, LineChart, Users, Lock, Rocket,
};

const COURSES = [
  { id: 1, title: "AI Literacy 101", category: "ai_literacy", difficulty: "beginner", minutes: 45, description: "Understand how AI works, its applications in trading and finance, and responsible use.", grantTags: ["NSF", "DOL"], audience: "all", icon: "Brain", color: "#6366f1", lessons: 6, enrolled: 342 },
  { id: 2, title: "Digital Skills Foundations", category: "digital_skills", difficulty: "beginner", minutes: 60, description: "Core digital literacy: internet safety, productivity tools, financial apps, and data basics.", grantTags: ["DOL", "CDFI"], audience: "community", icon: "Monitor", color: "#06b6d4", lessons: 8, enrolled: 218 },
  { id: 3, title: "Trading Fundamentals", category: "trading_fundamentals", difficulty: "beginner", minutes: 90, description: "Forex/crypto basics, chart reading, risk management, and building a trading mindset.", grantTags: ["SBA"], audience: "all", icon: "TrendingUp", color: "#22c55e", lessons: 12, enrolled: 567 },
  { id: 4, title: "Financial Planning & Literacy", category: "financial_planning", difficulty: "beginner", minutes: 75, description: "Budgeting, credit building, debt elimination, and wealth building strategies.", grantTags: ["CDFI", "DOL"], audience: "community", icon: "DollarSign", color: "#f59e0b", lessons: 10, enrolled: 423 },
  { id: 5, title: "Web3 & Blockchain Basics", category: "web3_basics", difficulty: "intermediate", minutes: 60, description: "Cryptocurrency wallets, NFTs, DeFi, Solana ecosystem, and VEDD token economics.", grantTags: ["NSF", "EDA"], audience: "all", icon: "Coins", color: "#a855f7", lessons: 9, enrolled: 189 },
  { id: 6, title: "STEM for Young Traders", category: "stem", difficulty: "beginner", minutes: 30, description: "Math, data analysis, and logic for youth (ages 13-21) applied to markets and money.", grantTags: ["NSF", "DOL"], audience: "youth", icon: "GraduationCap", color: "#ec4899", lessons: 8, enrolled: 156 },
  { id: 7, title: "AI Ethics in Finance", category: "ai_literacy", difficulty: "intermediate", minutes: 45, description: "Bias, fairness, transparency, and responsible AI deployment in financial services.", grantTags: ["NSF", "NIST"], audience: "all", icon: "Shield", color: "#ef4444", lessons: 6, enrolled: 98 },
  { id: 8, title: "Job Readiness & Portfolio Building", category: "digital_skills", difficulty: "beginner", minutes: 90, description: "Resume building, LinkedIn optimization, freelance finance, and digital portfolio creation.", grantTags: ["DOL", "WIA"], audience: "community", icon: "Briefcase", color: "#06b6d4", lessons: 10, enrolled: 134 },
  { id: 9, title: "Advanced AI Trading Strategies", category: "trading_fundamentals", difficulty: "advanced", minutes: 120, description: "ICT methodology, SMC order blocks, algorithmic signals, and backtesting with AI.", grantTags: ["NSF", "EDA"], audience: "ambassador", icon: "LineChart", color: "#22c55e", lessons: 15, enrolled: 87 },
  { id: 10, title: "Community Finance Leadership", category: "financial_planning", difficulty: "intermediate", minutes: 60, description: "Lead financial wellness workshops, credit co-ops, and community investment clubs.", grantTags: ["CDFI", "USDA"], audience: "ambassador", icon: "Users", color: "#f59e0b", lessons: 8, enrolled: 73 },
  { id: 11, title: "Data Privacy & Cybersecurity", category: "digital_skills", difficulty: "intermediate", minutes: 45, description: "Protect personal data, understand GDPR/CCPA, spot phishing, secure financial accounts.", grantTags: ["NSF", "CISA"], audience: "all", icon: "Lock", color: "#06b6d4", lessons: 7, enrolled: 211 },
  { id: 12, title: "Entrepreneurship & VEDD Business Launch", category: "financial_planning", difficulty: "intermediate", minutes: 90, description: "From idea to launch: business credit, grants, LLC formation, and VEDD ambassador business model.", grantTags: ["SBA", "EDA"], audience: "ambassador", icon: "Rocket", color: "#f59e0b", lessons: 12, enrolled: 95 },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface EnrolledCourse {
  courseId: number;
  progress: number;
  completed: boolean;
  enrolledAt: string;
}

interface CurriculumResult {
  title: string;
  category: string;
  overview: string;
  objectives: string[];
  modules: { title: string; duration: string; topics: string[] }[];
  grantAlignment: string[];
  assessmentStrategy: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function difficultyColor(d: string) {
  if (d === "beginner") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (d === "intermediate") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

function categoryLabel(cat: string) {
  const map: Record<string, string> = {
    ai_literacy: "AI Literacy",
    digital_skills: "Digital Skills",
    trading_fundamentals: "Trading",
    financial_planning: "Financial Planning",
    web3_basics: "Web3",
    stem: "STEM",
  };
  return map[cat] ?? cat;
}

function grantColor(tag: string) {
  const map: Record<string, string> = {
    NSF: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    DOL: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    SBA: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    CDFI: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    EDA: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    NIST: "bg-slate-500/20 text-slate-300 border-slate-500/30",
    WIA: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    USDA: "bg-lime-500/20 text-lime-300 border-lime-500/30",
    CISA: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  };
  return map[tag] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";
}

// ─── CourseCard ───────────────────────────────────────────────────────────────

function CourseCard({
  course,
  onEnroll,
  isEnrolled,
}: {
  course: typeof COURSES[0];
  onEnroll: (id: number) => void;
  isEnrolled: boolean;
}) {
  const IconComp = ICON_MAP[course.icon] ?? BookOpen;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="bg-[#0d1226] border-white/10 hover:border-white/20 transition-all h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div
              className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${course.color}22`, border: `1px solid ${course.color}44` }}
            >
              <IconComp size={20} color={course.color} />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-white text-sm font-semibold leading-tight">{course.title}</CardTitle>
              <div className="flex flex-wrap gap-1 mt-1.5">
                <Badge className="text-[10px] px-1.5 py-0 bg-white/10 text-white/60 border-white/20">
                  {categoryLabel(course.category)}
                </Badge>
                <Badge className={`text-[10px] px-1.5 py-0 border ${difficultyColor(course.difficulty)}`}>
                  {course.difficulty}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex flex-col gap-3 flex-1">
          <p className="text-white/60 text-xs leading-relaxed">{course.description}</p>

          <div className="flex items-center gap-3 text-white/50 text-xs">
            <span className="flex items-center gap-1"><Clock size={11} /> {course.minutes} min</span>
            <span className="flex items-center gap-1"><BookOpen size={11} /> {course.lessons} lessons</span>
            <span className="flex items-center gap-1"><Users size={11} /> {course.enrolled.toLocaleString()}</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {course.grantTags.map(tag => (
              <Badge key={tag} className={`text-[10px] px-1.5 py-0 border ${grantColor(tag)}`}>
                {tag}
              </Badge>
            ))}
          </div>

          <div className="mt-auto pt-2">
            {isEnrolled ? (
              <Button size="sm" variant="outline" className="w-full border-white/20 text-white/60 text-xs" disabled>
                <CheckCircle2 size={12} className="mr-1.5 text-green-400" /> Enrolled
              </Button>
            ) : (
              <Button
                size="sm"
                className="w-full text-xs font-medium"
                style={{ backgroundColor: course.color, color: "#fff" }}
                onClick={() => onEnroll(course.id)}
              >
                Enroll Now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── CourseCatalogTab ─────────────────────────────────────────────────────────

function CourseCatalogTab({
  enrolledCourses,
  onEnroll,
}: {
  enrolledCourses: EnrolledCourse[];
  onEnroll: (id: number) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");

  const CATEGORY_FILTERS = [
    { value: "all", label: "All Courses" },
    { value: "ai_literacy", label: "AI Literacy" },
    { value: "digital_skills", label: "Digital Skills" },
    { value: "trading_fundamentals", label: "Trading" },
    { value: "financial_planning", label: "Financial Planning" },
    { value: "web3_basics", label: "Web3" },
    { value: "stem", label: "STEM" },
    { value: "ambassador", label: "Ambassador Only" },
  ];

  const filtered = COURSES.filter(c => {
    const catMatch =
      categoryFilter === "all"
        ? true
        : categoryFilter === "ambassador"
        ? c.audience === "ambassador"
        : c.category === categoryFilter;
    const diffMatch = difficultyFilter === "all" ? true : c.difficulty === difficultyFilter;
    return catMatch && diffMatch;
  });

  const enrolledIds = new Set(enrolledCourses.map(e => e.courseId));

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-white/50 text-xs font-medium">
          <Filter size={13} /> Filter:
        </div>
        <div className="flex flex-wrap gap-2 flex-1">
          {CATEGORY_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setCategoryFilter(f.value)}
              className={`text-xs px-3 py-1 rounded-full border transition-all ${
                categoryFilter === f.value
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-white/5 border-white/10 text-white/60 hover:border-white/30"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
          <SelectTrigger className="w-36 h-8 text-xs bg-white/5 border-white/10 text-white/70">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent className="bg-[#0d1226] border-white/10">
            <SelectItem value="all" className="text-white/70 text-xs">All Levels</SelectItem>
            <SelectItem value="beginner" className="text-green-400 text-xs">Beginner</SelectItem>
            <SelectItem value="intermediate" className="text-amber-400 text-xs">Intermediate</SelectItem>
            <SelectItem value="advanced" className="text-red-400 text-xs">Advanced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/40">
          <BookOpen size={36} className="mx-auto mb-3 opacity-40" />
          <p>No courses match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(course => (
            <CourseCard
              key={course.id}
              course={course}
              onEnroll={onEnroll}
              isEnrolled={enrolledIds.has(course.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MyProgressTab ────────────────────────────────────────────────────────────

function MyProgressTab({
  enrolledCourses,
  onProgressUpdate,
  onMarkComplete,
}: {
  enrolledCourses: EnrolledCourse[];
  onProgressUpdate: (courseId: number, progress: number) => void;
  onMarkComplete: (courseId: number) => void;
}) {
  const completed = enrolledCourses.filter(e => e.completed).length;
  const certificates = completed;

  if (enrolledCourses.length === 0) {
    return (
      <div className="text-center py-24 text-white/40">
        <GraduationCap size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium text-white/50">No courses enrolled yet</p>
        <p className="text-sm mt-1">Enroll in a course to start tracking your progress</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Enrolled", value: enrolledCourses.length, icon: BookOpen, color: "#6366f1" },
          { label: "Completed", value: completed, icon: CheckCircle2, color: "#22c55e" },
          { label: "Certificates", value: certificates, icon: Award, color: "#f59e0b" },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="bg-[#0d1226] border-white/10 text-center py-4">
              <div className="flex flex-col items-center gap-1">
                <Icon size={20} style={{ color: stat.color }} />
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/50">{stat.label}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Course progress list */}
      <div className="space-y-4">
        {enrolledCourses.map(enrolled => {
          const course = COURSES.find(c => c.id === enrolled.courseId);
          if (!course) return null;
          const IconComp = ICON_MAP[course.icon] ?? BookOpen;

          return (
            <motion.div key={enrolled.courseId} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="bg-[#0d1226] border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center mt-0.5"
                      style={{ backgroundColor: `${course.color}22`, border: `1px solid ${course.color}44` }}
                    >
                      <IconComp size={18} color={course.color} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-white text-sm font-semibold">{course.title}</h3>
                        {enrolled.completed && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] border flex-shrink-0">
                            <CheckCircle2 size={10} className="mr-1" /> Completed
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={enrolled.progress} className="flex-1 h-2" />
                        <span className="text-white/50 text-xs w-10 text-right">{enrolled.progress}%</span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        {!enrolled.completed && (
                          <>
                            <Button
                              size="sm"
                              className="h-7 text-xs px-3"
                              style={{ backgroundColor: course.color }}
                              onClick={() => onProgressUpdate(enrolled.courseId, Math.min(100, enrolled.progress + 20))}
                            >
                              Resume
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-3 border-white/20 text-white/60 hover:text-white"
                              onClick={() => onMarkComplete(enrolled.courseId)}
                            >
                              <CheckCircle2 size={11} className="mr-1" /> Mark Complete
                            </Button>
                          </>
                        )}
                        <span className="text-white/30 text-[11px] ml-auto">
                          Enrolled {enrolled.enrolledAt}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CertificateCard ──────────────────────────────────────────────────────────

function CertificateCard({
  recipientName,
  courseTitle,
  score,
  issueDate,
  certId,
  onDownload,
}: {
  recipientName: string;
  courseTitle: string;
  score: number;
  issueDate: string;
  certId: string;
  onDownload: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
      <Card className="bg-gradient-to-br from-[#0d1226] to-[#111827] border-amber-500/30 overflow-hidden relative">
        {/* Decorative border accent */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500" />
        <CardContent className="p-6 space-y-4">
          {/* Header */}
          <div className="text-center space-y-1">
            <p className="text-amber-400/70 text-[11px] font-semibold tracking-widest uppercase">
              VEDD Technologies, LLC
            </p>
            <div className="flex items-center justify-center gap-2">
              <Award size={22} className="text-amber-400" />
              <h3 className="text-white font-bold text-lg">Certificate of Completion</h3>
              <Award size={22} className="text-amber-400" />
            </div>
          </div>

          <div className="border-t border-b border-amber-500/20 py-4 text-center space-y-1">
            <p className="text-white/50 text-xs">This certifies that</p>
            <p className="text-white text-xl font-semibold">{recipientName}</p>
            <p className="text-white/50 text-xs">has successfully completed</p>
            <p className="text-amber-300 font-medium text-sm">{courseTitle}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wide">Score</p>
              <p className="text-white font-semibold text-sm">{score}%</p>
            </div>
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wide">Issued</p>
              <p className="text-white font-semibold text-sm">{issueDate}</p>
            </div>
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wide">Cert ID</p>
              <p className="text-white font-mono text-[11px]">{certId}</p>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
              onClick={onDownload}
            >
              <Download size={12} className="mr-1.5" /> Download PDF
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="flex-1 text-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30"
                >
                  <CheckCircle2 size={12} className="mr-1.5" /> Verify
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#0d1226] border-white/10 max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-white">Certificate Verification</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                    <p className="text-green-300 text-xs">This certificate is authentic and verified.</p>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/50">Certificate ID</span>
                      <span className="text-white font-mono">{certId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Recipient</span>
                      <span className="text-white">{recipientName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Course</span>
                      <span className="text-white">{courseTitle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Issued By</span>
                      <span className="text-white">VEDD Technologies, LLC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Issue Date</span>
                      <span className="text-white">{issueDate}</span>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── CertificatesTab ─────────────────────────────────────────────────────────

function CertificatesTab({ recipientName, hasCerts }: { recipientName: string; hasCerts: boolean }) {
  const { toast } = useToast();

  const handleDownload = () => {
    toast({ title: "Feature coming soon", description: "PDF certificate download will be available shortly." });
  };

  if (!hasCerts) {
    return (
      <div className="text-center py-24 text-white/40">
        <Award size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium text-white/50">No certificates yet</p>
        <p className="text-sm mt-1">Complete a course to earn your first certificate</p>
      </div>
    );
  }

  const sampleCerts = [
    {
      courseTitle: "AI Literacy 101",
      score: 94,
      issueDate: "Apr 15, 2025",
      certId: "VEDD-CERT-10042",
    },
    {
      courseTitle: "Trading Fundamentals",
      score: 88,
      issueDate: "Apr 22, 2025",
      certId: "VEDD-CERT-10087",
    },
  ];

  return (
    <div className="space-y-5">
      <p className="text-white/50 text-sm">
        {sampleCerts.length} certificate{sampleCerts.length !== 1 ? "s" : ""} earned
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {sampleCerts.map(cert => (
          <CertificateCard
            key={cert.certId}
            recipientName={recipientName}
            courseTitle={cert.courseTitle}
            score={cert.score}
            issueDate={cert.issueDate}
            certId={cert.certId}
            onDownload={handleDownload}
          />
        ))}
      </div>
    </div>
  );
}

// ─── AICurriculumTab ──────────────────────────────────────────────────────────

function AICurriculumTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: "",
    category: "",
    audience: "",
    difficulty: "",
    minutes: "",
    objectives: "",
    grantAlignment: [] as string[],
  });
  const [result, setResult] = useState<CurriculumResult | null>(null);

  const generateMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const res = await apiRequest("POST", "/api/workforce/generate-curriculum", payload);
      return res.json() as Promise<CurriculumResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Curriculum generated!", description: "Review the preview below and save when ready." });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/workforce/save-curriculum", { ...form, curriculum: result });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved to Academy!", description: "The new course has been added to the catalog." });
      setResult(null);
      setForm({ title: "", category: "", audience: "", difficulty: "", minutes: "", objectives: "", grantAlignment: [] });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleGrant = (tag: string) => {
    setForm(f => ({
      ...f,
      grantAlignment: f.grantAlignment.includes(tag)
        ? f.grantAlignment.filter(t => t !== tag)
        : [...f.grantAlignment, tag],
    }));
  };

  const GRANTS = ["NSF", "DOL", "SBA", "CDFI", "EDA"];

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="bg-[#0d1226] border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-400" /> AI Curriculum Generator
          </CardTitle>
          <p className="text-white/50 text-xs">
            Generate grant-aligned course curricula using AI. Fill out the form and click generate.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Course Title</Label>
              <Input
                className="bg-white/5 border-white/10 text-white text-sm h-9"
                placeholder="e.g. Introduction to Algorithmic Trading"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white/70 text-sm h-9">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1226] border-white/10">
                  <SelectItem value="ai_literacy" className="text-white/80 text-sm">AI Literacy</SelectItem>
                  <SelectItem value="digital_skills" className="text-white/80 text-sm">Digital Skills</SelectItem>
                  <SelectItem value="trading_fundamentals" className="text-white/80 text-sm">Trading Fundamentals</SelectItem>
                  <SelectItem value="financial_planning" className="text-white/80 text-sm">Financial Planning</SelectItem>
                  <SelectItem value="web3_basics" className="text-white/80 text-sm">Web3 & Blockchain</SelectItem>
                  <SelectItem value="stem" className="text-white/80 text-sm">STEM</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Target Audience</Label>
              <Select value={form.audience} onValueChange={v => setForm(f => ({ ...f, audience: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white/70 text-sm h-9">
                  <SelectValue placeholder="Select audience" />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1226] border-white/10">
                  <SelectItem value="all" className="text-white/80 text-sm">General Public</SelectItem>
                  <SelectItem value="community" className="text-white/80 text-sm">Community Members</SelectItem>
                  <SelectItem value="youth" className="text-white/80 text-sm">Youth (13-21)</SelectItem>
                  <SelectItem value="ambassador" className="text-white/80 text-sm">Ambassadors</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Difficulty</Label>
              <Select value={form.difficulty} onValueChange={v => setForm(f => ({ ...f, difficulty: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white/70 text-sm h-9">
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1226] border-white/10">
                  <SelectItem value="beginner" className="text-green-400 text-sm">Beginner</SelectItem>
                  <SelectItem value="intermediate" className="text-amber-400 text-sm">Intermediate</SelectItem>
                  <SelectItem value="advanced" className="text-red-400 text-sm">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-white/70 text-xs">Estimated Duration (minutes)</Label>
              <Input
                type="number"
                className="bg-white/5 border-white/10 text-white text-sm h-9"
                placeholder="e.g. 60"
                value={form.minutes}
                onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-white/70 text-xs">Learning Objectives</Label>
            <Textarea
              className="bg-white/5 border-white/10 text-white text-sm resize-none"
              rows={3}
              placeholder="Describe what learners will know and be able to do after completing this course..."
              value={form.objectives}
              onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/70 text-xs">Grant Alignment</Label>
            <div className="flex flex-wrap gap-2">
              {GRANTS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleGrant(tag)}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-all ${
                    form.grantAlignment.includes(tag)
                      ? `${grantColor(tag)} font-semibold`
                      : "bg-white/5 border-white/10 text-white/50 hover:border-white/30"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            onClick={() => generateMutation.mutate(form)}
            disabled={generateMutation.isPending || !form.title || !form.category}
          >
            {generateMutation.isPending ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="mr-2"
                >
                  <Sparkles size={15} />
                </motion.div>
                Generating curriculum...
              </>
            ) : (
              <>
                <Sparkles size={15} className="mr-2" /> Generate Curriculum with AI
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Result preview */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-[#0d1226] border-indigo-500/30">
            <CardHeader>
              <CardTitle className="text-white text-base">Generated Curriculum Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <h4 className="text-indigo-300 font-semibold text-xs uppercase tracking-wide mb-1">Overview</h4>
                <p className="text-white/70">{result.overview}</p>
              </div>

              {result.objectives?.length > 0 && (
                <div>
                  <h4 className="text-indigo-300 font-semibold text-xs uppercase tracking-wide mb-2">Learning Objectives</h4>
                  <ul className="space-y-1">
                    {result.objectives.map((obj, i) => (
                      <li key={i} className="flex items-start gap-2 text-white/70">
                        <CheckCircle2 size={13} className="text-green-400 mt-0.5 flex-shrink-0" />
                        {obj}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.modules?.length > 0 && (
                <div>
                  <h4 className="text-indigo-300 font-semibold text-xs uppercase tracking-wide mb-2">Modules</h4>
                  <div className="space-y-2">
                    {result.modules.map((mod, i) => (
                      <div key={i} className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-white font-medium text-xs">{mod.title}</p>
                          <span className="text-white/40 text-[10px]">{mod.duration}</span>
                        </div>
                        <ul className="space-y-0.5">
                          {mod.topics.map((t, j) => (
                            <li key={j} className="text-white/50 text-[11px]">• {t}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.grantAlignment?.length > 0 && (
                <div>
                  <h4 className="text-indigo-300 font-semibold text-xs uppercase tracking-wide mb-2">Grant Alignment Notes</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {result.grantAlignment.map((note, i) => (
                      <Badge key={i} className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 border text-[11px]">
                        {note}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving..." : "Save to Academy"}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkforceAcademyPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const isAdmin = (user as any)?.role === "admin" || (user as any)?.isAdmin === true;
  const recipientName = (user as any)?.fullName || user?.username || "VEDD Learner";

  const [enrolledCourses, setEnrolledCourses] = useState<EnrolledCourse[]>([]);

  const handleEnroll = (courseId: number) => {
    if (enrolledCourses.some(e => e.courseId === courseId)) return;
    const course = COURSES.find(c => c.id === courseId);
    setEnrolledCourses(prev => [
      ...prev,
      {
        courseId,
        progress: 0,
        completed: false,
        enrolledAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      },
    ]);
    toast({
      title: "Enrolled!",
      description: `You've been enrolled in "${course?.title}". Head to My Progress to start.`,
    });
  };

  const handleProgressUpdate = (courseId: number, progress: number) => {
    setEnrolledCourses(prev =>
      prev.map(e => (e.courseId === courseId ? { ...e, progress } : e))
    );
  };

  const handleMarkComplete = (courseId: number) => {
    setEnrolledCourses(prev =>
      prev.map(e => (e.courseId === courseId ? { ...e, progress: 100, completed: true } : e))
    );
    const course = COURSES.find(c => c.id === courseId);
    toast({
      title: "Course completed!",
      description: `Congratulations! You've earned a certificate for "${course?.title}".`,
    });
  };

  const hasCerts = enrolledCourses.some(e => e.completed);

  const STATS = [
    { label: "Courses Available", value: "12", icon: BookOpen },
    { label: "Total Enrollments", value: "1,895", icon: Users },
    { label: "Certificates Issued", value: "384", icon: Award },
    { label: "Grant Tags", value: "7", icon: GraduationCap },
  ];

  return (
    <div className="min-h-screen bg-[#080B14] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Page header */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <GraduationCap size={20} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">VEDD Workforce Academy</h1>
              <p className="text-white/50 text-sm">AI & financial skills training — DOL WIOA · NSF AI Workforce · SBA grant eligible</p>
            </div>
          </div>
        </motion.div>

        {/* Key stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {STATS.map(stat => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="bg-[#0d1226] border-white/10">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <Icon size={15} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg leading-none">{stat.value}</p>
                    <p className="text-white/50 text-[11px] mt-0.5">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </motion.div>

        {/* Tabs */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <Tabs defaultValue="catalog">
            <TabsList className="bg-white/5 border border-white/10 p-1 h-auto flex-wrap gap-1">
              <TabsTrigger
                value="catalog"
                className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-white/60"
              >
                <BookOpen size={13} className="mr-1.5" /> Course Catalog
              </TabsTrigger>
              <TabsTrigger
                value="progress"
                className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-white/60"
              >
                <TrendingUp size={13} className="mr-1.5" /> My Progress
                {enrolledCourses.length > 0 && (
                  <span className="ml-1.5 bg-indigo-500/40 text-indigo-200 text-[10px] px-1.5 py-0.5 rounded-full">
                    {enrolledCourses.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="certificates"
                className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-white/60"
              >
                <Award size={13} className="mr-1.5" /> Certificates
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger
                  value="ai-generator"
                  className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-white/60"
                >
                  <Sparkles size={13} className="mr-1.5" /> AI Curriculum Generator
                </TabsTrigger>
              )}
            </TabsList>

            <div className="mt-6">
              <TabsContent value="catalog">
                <CourseCatalogTab enrolledCourses={enrolledCourses} onEnroll={handleEnroll} />
              </TabsContent>

              <TabsContent value="progress">
                <MyProgressTab
                  enrolledCourses={enrolledCourses}
                  onProgressUpdate={handleProgressUpdate}
                  onMarkComplete={handleMarkComplete}
                />
              </TabsContent>

              <TabsContent value="certificates">
                <CertificatesTab recipientName={recipientName} hasCerts={hasCerts} />
              </TabsContent>

              {isAdmin && (
                <TabsContent value="ai-generator">
                  <AICurriculumTab />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}
