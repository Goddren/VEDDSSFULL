import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, DollarSign, Globe, ExternalLink, Star } from "lucide-react";

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
}

const grantTypeConfig: Record<string, { label: string; color: string }> = {
  business_fintech: { label: "Fintech", color: "bg-purple-600/30 text-purple-200 border-purple-500/50" },
  community_dev: { label: "Community", color: "bg-green-600/30 text-green-200 border-green-500/50" },
  ambassador_education: { label: "Education", color: "bg-blue-600/30 text-blue-200 border-blue-500/50" },
  international: { label: "International", color: "bg-orange-600/30 text-orange-200 border-orange-500/50" },
  ai_focused: { label: "AI/Tech", color: "bg-cyan-600/30 text-cyan-200 border-cyan-500/50" },
};

interface GrantCardProps {
  grant: Grant;
  hasApplied?: boolean;
  onApply: (grant: Grant) => void;
}

export function GrantCard({ grant, hasApplied, onApply }: GrantCardProps) {
  const typeConfig = grantTypeConfig[grant.grantType] || { label: grant.grantType, color: "bg-gray-600/30 text-gray-200 border-gray-500/50" };
  const score = grant.relevanceScore || 0;
  const deadlineDate = grant.deadline ? new Date(grant.deadline) : null;
  const isExpired = deadlineDate && deadlineDate < new Date();

  return (
    <Card className={`bg-gray-900/60 border ${grant.isFeatured ? 'border-yellow-500/40' : 'border-gray-700/50'} p-4 hover:border-green-500/40 transition-all`}>
      {grant.isFeatured && (
        <div className="flex items-center gap-1 mb-2">
          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
          <span className="text-yellow-400 text-[10px] font-medium uppercase tracking-wide">Featured Opportunity</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2">{grant.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{grant.funder}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className={`text-[10px] border ${typeConfig.color}`}>{typeConfig.label}</Badge>
          {grant.isVerified && <Badge className="text-[10px] bg-green-600/20 text-green-300 border-green-500/40">✓ Verified</Badge>}
        </div>
      </div>

      <p className="text-xs text-gray-400 line-clamp-2 mb-3">{grant.description}</p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {grant.fundingAmount && (
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-green-400 shrink-0" />
            <span className="text-xs text-green-300 font-medium truncate">{grant.fundingAmount}</span>
          </div>
        )}
        {deadlineDate && (
          <div className="flex items-center gap-1.5">
            <Calendar className={`w-3 h-3 shrink-0 ${isExpired ? 'text-red-400' : 'text-blue-400'}`} />
            <span className={`text-xs truncate ${isExpired ? 'text-red-300 line-through' : 'text-blue-300'}`}>
              {deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}
        {grant.geographicScope && (
          <div className="flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-300 truncate">{grant.geographicScope}</span>
          </div>
        )}
        {score > 0 && (
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full shrink-0 ${score >= 85 ? 'bg-green-400' : score >= 70 ? 'bg-yellow-400' : 'bg-gray-400'}`} />
            <span className="text-xs text-gray-300">{score}% match</span>
          </div>
        )}
      </div>

      {grant.aiScanNotes && (
        <p className="text-[11px] text-gray-500 italic line-clamp-1 mb-3">💡 {grant.aiScanNotes}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className={`flex-1 text-xs h-7 ${hasApplied ? 'bg-green-700/50 hover:bg-green-700/70 text-green-200' : 'bg-green-600 hover:bg-green-500 text-white'}`}
          onClick={() => onApply(grant)}
          disabled={isExpired || false}
        >
          {hasApplied ? "✓ Applied — View" : isExpired ? "Deadline Passed" : "Start Application"}
        </Button>
        {grant.applicationUrl && (
          <a href={grant.applicationUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="h-7 px-2 border-gray-600 text-gray-300 hover:text-white">
              <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
        )}
      </div>
    </Card>
  );
}
