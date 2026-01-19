import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, TrendingUp, Clock, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface RewardHistoryItem {
  id: number;
  actionType: string;
  totalReward: number;
  status: string;
  transactionSig?: string;
  createdAt: string;
}

interface RewardSummary {
  total: number;
  pending: number;
  completed: number;
}

const actionTypeLabels: Record<string, string> = {
  challenge_completion: "Challenge Completed",
  event_hosting: "Event Hosted",
  content_share: "Content Shared",
  referral: "Referral Bonus",
  streak_bonus: "Streak Bonus",
  lesson_completion: "Lesson Completed"
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-500/20 text-green-400';
    case 'pending': return 'bg-yellow-500/20 text-yellow-400';
    case 'verified': return 'bg-blue-500/20 text-blue-400';
    case 'failed': return 'bg-red-500/20 text-red-400';
    case 'processing': return 'bg-purple-500/20 text-purple-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed': return <CheckCircle className="w-4 h-4" />;
    case 'pending': 
    case 'processing': return <Clock className="w-4 h-4" />;
    case 'failed': return <XCircle className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
};

export function VeddRewardsPanel() {
  const { data: summary, isLoading: summaryLoading } = useQuery<RewardSummary>({
    queryKey: ['/api/vedd/rewards/summary']
  });

  const { data: history, isLoading: historyLoading } = useQuery<RewardHistoryItem[]>({
    queryKey: ['/api/vedd/rewards/history']
  });

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-amber-900/40 to-yellow-900/20 border-amber-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-amber-400">
            <Coins className="w-5 h-5" />
            VEDD Token Rewards
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-8 bg-amber-800/30 rounded w-32" />
              <div className="h-4 bg-amber-800/30 rounded w-48" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-amber-400">
                  {summary?.total?.toFixed(2) || '0.00'}
                </span>
                <span className="text-amber-500/70">VEDD earned</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-900/20 rounded-lg p-3 border border-green-700/30">
                  <div className="flex items-center gap-2 text-green-400 mb-1">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Completed</span>
                  </div>
                  <div className="text-lg font-semibold text-green-300">
                    {summary?.completed?.toFixed(2) || '0.00'}
                  </div>
                </div>
                
                <div className="bg-yellow-900/20 rounded-lg p-3 border border-yellow-700/30">
                  <div className="flex items-center gap-2 text-yellow-400 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">Pending</span>
                  </div>
                  <div className="text-lg font-semibold text-yellow-300">
                    {summary?.pending?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-zinc-300 text-base">
            <TrendingUp className="w-4 h-4" />
            Reward History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex justify-between items-center">
                  <div className="h-4 bg-zinc-800 rounded w-32" />
                  <div className="h-4 bg-zinc-800 rounded w-16" />
                </div>
              ))}
            </div>
          ) : history && history.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {history.slice(0, 10).map((item) => (
                <div 
                  key={item.id} 
                  className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">
                        {actionTypeLabels[item.actionType] || item.actionType}
                      </span>
                      <Badge className={`text-xs ${getStatusColor(item.status)}`}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(item.status)}
                          {item.status}
                        </span>
                      </Badge>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-semibold">
                      +{item.totalReward} VEDD
                    </span>
                    {item.transactionSig && !item.transactionSig.startsWith('simulated') && (
                      <a
                        href={`https://solscan.io/tx/${item.transactionSig}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-zinc-500">
              <Coins className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No rewards yet</p>
              <p className="text-xs mt-1">Complete challenges and host events to earn VEDD tokens</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
