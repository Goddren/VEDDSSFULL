import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface ProposalPreviewProps {
  content: string;
  grantTitle: string;
  funder: string;
  applicationId: number;
}

export function ProposalPreview({ content, grantTitle, funder, applicationId }: ProposalPreviewProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard", description: "Proposal text has been copied." });
  };

  const handleExport = () => {
    window.open(`/api/grants/applications/${applicationId}/export`, '_blank');
  };

  // Render markdown-style headers
  const renderContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('## ')) {
        return (
          <h2 key={idx} className="text-sm font-bold text-white mt-5 mb-2 pb-1 border-b border-gray-700">
            {line.replace('## ', '')}
          </h2>
        );
      }
      if (line.startsWith('# ')) {
        return (
          <h1 key={idx} className="text-base font-bold text-white mt-4 mb-2">
            {line.replace('# ', '')}
          </h1>
        );
      }
      if (line.trim() === '') return <div key={idx} className="h-2" />;
      return (
        <p key={idx} className="text-xs text-gray-300 leading-relaxed">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-gray-800 border border-gray-700 rounded-t-lg p-3 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-white">Preview</h3>
          <p className="text-[10px] text-gray-400">{grantTitle} — {funder}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-600 text-gray-300 gap-1" onClick={handleExport}>
            Export
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-600 text-gray-300 gap-1" onClick={handleCopy}>
            {copied ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-900 border border-t-0 border-gray-700 rounded-b-lg p-4 font-mono">
        {content ? (
          <div className="max-w-none prose-invert">
            {/* Document header */}
            <div className="text-center mb-6 pb-4 border-b border-gray-700">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Grant Proposal</div>
              <div className="text-base font-bold text-white">VEDD AI Trading</div>
              <div className="text-xs text-gray-400 mt-1">{grantTitle}</div>
              <div className="text-xs text-green-400">{funder}</div>
            </div>
            <div className="space-y-0.5">
              {renderContent(content)}
            </div>
            <div className="text-center mt-8 pt-4 border-t border-gray-700">
              <div className="text-[10px] text-gray-500">veddbuild.com</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            Generate a proposal to see the preview
          </div>
        )}
      </div>
    </div>
  );
}
