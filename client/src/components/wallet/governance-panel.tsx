import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Vote, 
  Plus, 
  ThumbsUp, 
  ThumbsDown, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Users,
  Coins,
  TrendingUp,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSolanaWallet } from '@/hooks/use-solana-wallet';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { GovernanceProposal } from '@shared/schema';

const PROPOSAL_CATEGORIES = [
  { value: 'feature', label: 'New Feature', icon: TrendingUp },
  { value: 'tokenomics', label: 'Tokenomics', icon: Coins },
  { value: 'partnership', label: 'Partnership', icon: Users },
  { value: 'community', label: 'Community', icon: Vote },
  { value: 'other', label: 'Other', icon: Clock },
];

function ProposalCard({ proposal, onVote }: { proposal: GovernanceProposal; onVote: (id: number, vote: 'for' | 'against') => void }) {
  const [expanded, setExpanded] = useState(false);
  const { walletData } = useSolanaWallet();
  
  const totalVotes = proposal.votesFor + proposal.votesAgainst;
  const forPercentage = totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 50;
  const quorumProgress = (proposal.totalVotingPower / proposal.quorumRequired) * 100;
  
  const isActive = proposal.status === 'active' && new Date(proposal.endDate) > new Date();
  const timeLeft = new Date(proposal.endDate).getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));

  const canVote = walletData && walletData.veddBalance > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl overflow-hidden"
    >
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                isActive ? 'bg-green-500/20 text-green-400' : 
                proposal.status === 'passed' ? 'bg-blue-500/20 text-blue-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>
                {isActive ? `${daysLeft}d left` : proposal.status}
              </span>
              <span className="text-gray-500 text-xs capitalize">{proposal.category}</span>
            </div>
            <h3 className="text-white font-semibold text-lg mb-1">{proposal.title}</h3>
            <p className="text-gray-400 text-sm line-clamp-2">{proposal.description}</p>
          </div>
          <button className="text-gray-400 hover:text-white mt-1">
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-green-400">{proposal.votesFor} For</span>
            <span className="text-red-400">{proposal.votesAgainst} Against</span>
          </div>
          <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 to-green-400"
              style={{ width: `${forPercentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Quorum: {quorumProgress.toFixed(0)}%</span>
            <span>{proposal.totalVotingPower.toLocaleString()} / {proposal.quorumRequired.toLocaleString()} VEDD</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-700/50"
          >
            <div className="p-4 space-y-4">
              <p className="text-gray-300 text-sm">{proposal.description}</p>
              
              {isActive && canVote && (
                <div className="flex gap-2">
                  <Button
                    onClick={(e) => { e.stopPropagation(); onVote(proposal.id, 'for'); }}
                    className="flex-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30"
                  >
                    <ThumbsUp className="mr-2 h-4 w-4" />
                    Vote For
                  </Button>
                  <Button
                    onClick={(e) => { e.stopPropagation(); onVote(proposal.id, 'against'); }}
                    className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30"
                  >
                    <ThumbsDown className="mr-2 h-4 w-4" />
                    Vote Against
                  </Button>
                </div>
              )}

              {!canVote && isActive && (
                <p className="text-amber-400 text-sm text-center py-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  Hold VEDD tokens to participate in governance
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function GovernancePanel() {
  const { walletData, connected } = useSolanaWallet();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProposal, setNewProposal] = useState({
    title: '',
    description: '',
    category: 'feature',
    durationDays: 7,
  });

  const { data: proposals = [], isLoading } = useQuery<GovernanceProposal[]>({
    queryKey: ['/api/governance/proposals'],
    enabled: connected,
  });

  const voteMutation = useMutation({
    mutationFn: async ({ proposalId, vote }: { proposalId: number; vote: 'for' | 'against' }) => {
      return apiRequest('/api/governance/vote', {
        method: 'POST',
        body: JSON.stringify({
          proposalId,
          vote,
          walletAddress: walletData?.address,
          votingPower: walletData?.veddBalance || 0,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/governance/proposals'] });
      toast({
        title: "Vote Submitted",
        description: "Your vote has been recorded",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Vote Failed",
        description: error.message || "Failed to submit vote",
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newProposal) => {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + data.durationDays);
      
      return apiRequest('/api/governance/proposals', {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          category: data.category,
          proposerWallet: walletData?.address,
          endDate: endDate.toISOString(),
          quorumRequired: 1000,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/governance/proposals'] });
      setShowCreateDialog(false);
      setNewProposal({ title: '', description: '', category: 'feature', durationDays: 7 });
      toast({
        title: "Proposal Created",
        description: "Your proposal is now live for voting",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create proposal",
        variant: "destructive",
      });
    },
  });

  const handleVote = (proposalId: number, vote: 'for' | 'against') => {
    voteMutation.mutate({ proposalId, vote });
  };

  const handleCreate = () => {
    if (!newProposal.title || !newProposal.description) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(newProposal);
  };

  const canCreateProposal = walletData && walletData.veddBalance >= 100;

  if (!connected) {
    return (
      <div className="bg-gray-800/40 rounded-xl p-8 text-center border border-gray-700/50">
        <Vote className="h-12 w-12 mx-auto text-gray-600 mb-4" />
        <h3 className="text-white font-semibold text-lg mb-2">Connect Wallet to Vote</h3>
        <p className="text-gray-400 text-sm">
          Connect your Phantom wallet to participate in VEDD governance
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Vote className="h-7 w-7 text-purple-400" />
            Governance
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Vote on proposals with your VEDD tokens
          </p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button
              disabled={!canCreateProposal}
              className="bg-purple-600 hover:bg-purple-500"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Proposal
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Create Proposal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Title</label>
                <Input
                  value={newProposal.title}
                  onChange={(e) => setNewProposal({ ...newProposal, title: e.target.value })}
                  placeholder="Proposal title"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Category</label>
                <Select
                  value={newProposal.category}
                  onValueChange={(value) => setNewProposal({ ...newProposal, category: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {PROPOSAL_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value} className="text-white">
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Description</label>
                <Textarea
                  value={newProposal.description}
                  onChange={(e) => setNewProposal({ ...newProposal, description: e.target.value })}
                  placeholder="Describe your proposal..."
                  className="bg-gray-800 border-gray-700 text-white min-h-[120px]"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Voting Duration (days)</label>
                <Select
                  value={String(newProposal.durationDays)}
                  onValueChange={(value) => setNewProposal({ ...newProposal, durationDays: Number(value) })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="3" className="text-white">3 days</SelectItem>
                    <SelectItem value="7" className="text-white">7 days</SelectItem>
                    <SelectItem value="14" className="text-white">14 days</SelectItem>
                    <SelectItem value="30" className="text-white">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-500"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Proposal'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {walletData && (
        <div className="bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Coins className="h-6 w-6 text-purple-400" />
            <div>
              <p className="text-white font-semibold">Your Voting Power</p>
              <p className="text-purple-300 text-sm">{walletData.veddBalance.toLocaleString()} VEDD</p>
            </div>
          </div>
          {!canCreateProposal && (
            <p className="text-amber-400 text-xs">Need 100+ VEDD to create proposals</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-800/40 rounded-xl h-40 animate-pulse" />
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <div className="bg-gray-800/40 rounded-xl p-8 text-center border border-gray-700/50">
          <Vote className="h-12 w-12 mx-auto text-gray-600 mb-4" />
          <h3 className="text-white font-semibold text-lg mb-2">No Active Proposals</h3>
          <p className="text-gray-400 text-sm">
            Be the first to create a governance proposal
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} onVote={handleVote} />
          ))}
        </div>
      )}
    </div>
  );
}
