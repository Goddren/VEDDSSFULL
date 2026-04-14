import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-600/30 text-gray-300 border-gray-500/50" },
  applied: { label: "Applied", className: "bg-blue-600/30 text-blue-200 border-blue-500/50" },
  under_review: { label: "Under Review", className: "bg-yellow-600/30 text-yellow-200 border-yellow-500/50" },
  awarded: { label: "Awarded ✓", className: "bg-green-600/30 text-green-200 border-green-500/50" },
  rejected: { label: "Rejected", className: "bg-red-600/30 text-red-200 border-red-500/50" },
};

export function ApplicationStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.draft;
  return (
    <Badge className={`text-xs font-medium border ${config.className}`}>
      {config.label}
    </Badge>
  );
}

export const STATUS_STEPS = ["draft", "applied", "under_review", "awarded"];

export function ApplicationStatusPipeline({ status }: { status: string }) {
  const currentIdx = STATUS_STEPS.indexOf(status);
  const isRejected = status === "rejected";

  return (
    <div className="flex items-center gap-1 mt-2">
      {STATUS_STEPS.map((step, idx) => {
        const labels: Record<string, string> = {
          draft: "Draft",
          applied: "Applied",
          under_review: "Review",
          awarded: "Awarded",
        };
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx && !isRejected;
        const isFuture = idx > currentIdx;
        return (
          <div key={step} className="flex items-center gap-1 flex-1">
            <div className={`flex flex-col items-center flex-1`}>
              <div className={`w-3 h-3 rounded-full border-2 transition-all ${
                isPast ? "bg-green-500 border-green-500" :
                isCurrent ? "bg-blue-500 border-blue-400 ring-2 ring-blue-400/30" :
                "bg-gray-700 border-gray-600"
              }`} />
              <span className={`text-[9px] mt-0.5 ${
                isCurrent ? "text-blue-400 font-medium" :
                isPast ? "text-green-400" : "text-gray-500"
              }`}>{labels[step]}</span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 -mt-3 ${isPast ? "bg-green-500" : "bg-gray-700"}`} />
            )}
          </div>
        );
      })}
      {isRejected && (
        <span className="text-red-400 text-[10px] font-medium ml-1">✗ Rejected</span>
      )}
    </div>
  );
}
