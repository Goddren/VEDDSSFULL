import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wand2, BookOpen, FileText, ChevronRight, ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ProposalMode = 'auto' | 'guided' | 'template';

const GUIDED_SECTIONS = [
  { key: 'executiveSummary', label: 'Executive Summary', description: 'Brief overview of your proposal (200-300 words)' },
  { key: 'orgBackground', label: 'Organizational Background', description: 'VEDD\'s history, mission, and track record (250-350 words)' },
  { key: 'projectDescription', label: 'Project Description', description: 'What you will do with the funding (300-400 words)' },
  { key: 'goalsObjectives', label: 'Goals & Objectives', description: 'SMART goals and measurable outcomes (200-300 words)' },
  { key: 'budgetNarrative', label: 'Budget Narrative', description: 'How funds will be used (200-300 words)' },
  { key: 'impactStatement', label: 'Impact Statement', description: 'Community impact and long-term vision (250-350 words)' },
];

const TEMPLATE_TYPES = [
  { key: 'ambassador_program', label: 'Ambassador Program', description: 'Focus: Ambassador network, training, and certification' },
  { key: 'fintech_expansion', label: 'Fintech Platform', description: 'Focus: AI trading technology and financial inclusion' },
  { key: 'community_dev', label: 'Community Development', description: 'Focus: Inter-city economic empowerment and faith community' },
];

interface ProposalEditorProps {
  applicationId: number;
  currentMode: string;
  currentContent: string | null;
  currentSections: Record<string, string> | null;
  onGenerated: (content: string, sections?: Record<string, string>) => void;
}

export function ProposalEditor({
  applicationId,
  currentMode,
  currentContent,
  currentSections,
  onGenerated,
}: ProposalEditorProps) {
  const [mode, setMode] = useState<ProposalMode>((currentMode as ProposalMode) || 'auto');
  const [generating, setGenerating] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);
  const [userInputs, setUserInputs] = useState<Record<string, string>>({});
  const [templateType, setTemplateType] = useState<string>('fintech_expansion');
  const { toast } = useToast();

  const handleGenerate = async (options: Record<string, any> = {}) => {
    setGenerating(true);
    try {
      const body: any = { mode, options };
      if (mode === 'guided') {
        body.options = { sectionKey: GUIDED_SECTIONS[guidedStep].key, userInputs };
      }
      if (mode === 'template') {
        body.options = { templateType };
      }

      const result = await apiRequest("POST", `/api/grants/applications/${applicationId}/generate-proposal`, body) as any;
      onGenerated(result.proposalContent || '', result.proposalSections || undefined);
      toast({ title: "Proposal section generated", description: mode === 'guided' ? `Section: ${GUIDED_SECTIONS[guidedStep].label}` : "Full proposal ready" });

      if (mode === 'guided' && guidedStep < GUIDED_SECTIONS.length - 1) {
        setGuidedStep(s => s + 1);
      }
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { key: 'auto', icon: <Wand2 className="w-4 h-4" />, label: 'Auto', desc: 'Full AI write' },
          { key: 'guided', icon: <BookOpen className="w-4 h-4" />, label: 'Guided', desc: 'Section by section' },
          { key: 'template', icon: <FileText className="w-4 h-4" />, label: 'Template', desc: 'VEDD brand templates' },
        ] as const).map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`p-3 rounded-lg border text-left transition-all ${
              mode === m.key
                ? 'border-green-500/60 bg-green-500/10'
                : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
            }`}
          >
            <div className={`flex items-center gap-2 mb-1 ${mode === m.key ? 'text-green-400' : 'text-gray-400'}`}>
              {m.icon}
              <span className="text-xs font-semibold">{m.label}</span>
            </div>
            <p className="text-[10px] text-gray-500">{m.desc}</p>
          </button>
        ))}
      </div>

      {/* Mode-specific controls */}
      {mode === 'auto' && (
        <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
          <p className="text-xs text-gray-300 mb-3">
            AI will write a complete 1500-2500 word professional grant proposal tailored to this specific grant and VEDD's mission.
          </p>
          <Button
            onClick={() => handleGenerate()}
            disabled={generating}
            className="w-full bg-green-600 hover:bg-green-500 text-white gap-2"
            size="sm"
          >
            {generating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</> : <><Wand2 className="w-3.5 h-3.5" /> Generate Full Proposal</>}
          </Button>
        </div>
      )}

      {mode === 'guided' && (
        <div className="space-y-3">
          {/* Section progress */}
          <div className="flex gap-1">
            {GUIDED_SECTIONS.map((s, idx) => (
              <button
                key={s.key}
                onClick={() => setGuidedStep(idx)}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  currentSections?.[s.key] ? 'bg-green-500' :
                  idx === guidedStep ? 'bg-blue-500' : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-white">Step {guidedStep + 1}/{GUIDED_SECTIONS.length}: {GUIDED_SECTIONS[guidedStep].label}</span>
              {currentSections?.[GUIDED_SECTIONS[guidedStep].key] && <Badge className="text-[10px] bg-green-600/20 text-green-300 border-green-500/40">Done</Badge>}
            </div>
            <p className="text-[11px] text-gray-400 mb-3">{GUIDED_SECTIONS[guidedStep].description}</p>
            <textarea
              placeholder="Optional: Add specific details, metrics, or talking points for this section..."
              value={userInputs[`section_${GUIDED_SECTIONS[guidedStep].key}`] || ''}
              onChange={e => setUserInputs(prev => ({ ...prev, [`section_${GUIDED_SECTIONS[guidedStep].key}`]: e.target.value }))}
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-gray-200 placeholder-gray-600 resize-none h-20 mb-3"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setGuidedStep(s => Math.max(0, s - 1))} disabled={guidedStep === 0} className="border-gray-600 text-gray-300 gap-1 h-7">
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <Button
                onClick={() => handleGenerate()}
                disabled={generating}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white gap-2 h-7 text-xs"
              >
                {generating ? <><Loader2 className="w-3 h-3 animate-spin" /> Writing...</> : <><Wand2 className="w-3 h-3" /> Write This Section</>}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setGuidedStep(s => Math.min(GUIDED_SECTIONS.length - 1, s + 1))} disabled={guidedStep === GUIDED_SECTIONS.length - 1} className="border-gray-600 text-gray-300 gap-1 h-7">
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {mode === 'template' && (
        <div className="space-y-3">
          <div className="grid gap-2">
            {TEMPLATE_TYPES.map(t => (
              <button
                key={t.key}
                onClick={() => setTemplateType(t.key)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  templateType === t.key ? 'border-green-500/60 bg-green-500/10' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                }`}
              >
                <p className={`text-xs font-medium ${templateType === t.key ? 'text-green-300' : 'text-gray-200'}`}>{t.label}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{t.description}</p>
              </button>
            ))}
          </div>
          <Button
            onClick={() => handleGenerate()}
            disabled={generating}
            className="w-full bg-green-600 hover:bg-green-500 text-white gap-2"
            size="sm"
          >
            {generating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</> : <><FileText className="w-3.5 h-3.5" /> Generate from Template</>}
          </Button>
        </div>
      )}
    </div>
  );
}
