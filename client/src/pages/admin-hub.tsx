import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import {
  Coins, Users, FileText, Wallet, Shield, Settings, ChevronRight,
  CheckCircle, Clock, AlertTriangle, TrendingUp, RefreshCw,
  Key, BookOpen, Zap, BarChart3, Gift, Lock, ExternalLink,
  Copy, CheckSquare, Rocket, Star, UserCog, Search
} from 'lucide-react';
import { SiSolana } from 'react-icons/si';
import { useState } from 'react';

interface PoolOverview {
  pools: Array<{ id: number; label: string; publicKey: string; tokenBalance: number; isLowBalance: boolean }>;
  pendingTransfers: number;
  completedTransfersToday: number;
  totalDistributedToday: number;
}

interface PendingReward {
  id: number;
  userId: number;
  actionType: string;
  totalReward: number;
  createdAt: string;
}

interface AdminUser {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  isAmbassador: boolean;
  walletAddress: string | null;
  subscriptionTier: string | null;
  createdAt: string | null;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-2 text-gray-500 hover:text-amber-400 transition-colors"
    >
      {copied ? <CheckSquare className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function AdminHub() {
  const { user } = useAuth();
  const [setupStep, setSetupStep] = useState(0);
  const [userSearch, setUserSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: overview } = useQuery<PoolOverview>({
    queryKey: ['/api/vedd/admin/overview'],
    enabled: !!user?.isAdmin,
    refetchInterval: 30000,
  });

  const { data: pendingRewards = [] } = useQuery<PendingReward[]>({
    queryKey: ['/api/vedd/admin/pending-rewards'],
    enabled: !!user?.isAdmin,
    refetchInterval: 15000,
  });

  const { data: allUsers = [] } = useQuery<AdminUser[]>({
    queryKey: ['/api/admin/users'],
    enabled: !!user?.isAdmin,
    refetchInterval: 60000,
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: number; updates: { isAmbassador?: boolean; isAdmin?: boolean } }) => {
      await apiRequest('PATCH', `/api/admin/users/${userId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
  });

  if (!user?.isAdmin) {
    return (
      <div className="app-page flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Lock className="h-12 w-12 text-gray-600 mx-auto mb-3" />
          <p className="text-white font-semibold">Admin Access Required</p>
          <p className="text-gray-500 text-sm mt-1">This area is restricted to admins only.</p>
        </div>
      </div>
    );
  }

  const poolReady = (overview?.pools?.length ?? 0) > 0;
  const hasBalance = poolReady && (overview?.pools[0]?.tokenBalance ?? 0) > 0;
  const envVarsMissing = !poolReady;

  const setupSteps = [
    {
      number: 1,
      title: 'Get your VEDD token mint address',
      status: 'required',
      content: (
        <div className="space-y-3">
          <p className="text-gray-300 text-sm">Your VEDD token lives on Solana (pump.fun). You need its mint address to tell the app which token to send.</p>
          <div className="space-y-2">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-white text-xs font-semibold">Go to pump.fun and find your token</p>
                <p className="text-gray-500 text-xs mt-0.5">Navigate to <span className="text-amber-400">pump.fun</span> → search "VEDD" or find your token in your wallet</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-white text-xs font-semibold">Copy the Contract Address (mint address)</p>
                <p className="text-gray-500 text-xs mt-0.5">On the token page, copy the long string that looks like <code className="bg-black/30 px-1 rounded text-amber-300">HnvM...pump</code> — this is your mint address</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <p className="text-white text-xs font-semibold">Save it — you'll add this to Render env vars in Step 4</p>
                <div className="mt-1.5 bg-black/30 rounded-lg px-3 py-2 flex items-center justify-between">
                  <code className="text-amber-300 text-xs">VEDD_TOKEN_MINT=HnvMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      number: 2,
      title: 'Create a dedicated Treasury (rewards) wallet',
      status: 'required',
      content: (
        <div className="space-y-3">
          <p className="text-gray-300 text-sm">Create a <strong className="text-white">new Phantom wallet</strong> specifically for sending ambassador rewards. Never use your main personal wallet — keep the treasury separate for security.</p>
          <div className="space-y-2">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-white text-xs font-semibold">Open Phantom → click your profile icon (top left)</p>
                <p className="text-gray-500 text-xs mt-0.5">In the wallet selector screen, click <span className="text-blue-400">"Add / Connect Wallet"</span> → <span className="text-blue-400">"Create new wallet"</span></p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-white text-xs font-semibold">Label it "VEDD Treasury" or "VEDD Rewards Pool"</p>
                <p className="text-gray-500 text-xs mt-0.5">You'll see the new wallet's public address — copy it and save it (you'll register it in Step 5)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <p className="text-white text-xs font-semibold">Fund it with SOL for gas fees</p>
                <p className="text-gray-500 text-xs mt-0.5">Send ~0.05 SOL to cover transaction fees. Each token send costs ~0.000005 SOL (very cheap)</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      number: 3,
      title: 'Transfer VEDD tokens into the Treasury wallet',
      status: 'required',
      content: (
        <div className="space-y-3">
          <p className="text-gray-300 text-sm">Load the Treasury wallet with VEDD tokens from your main holdings. We recommend <strong className="text-white">10–20 million VEDD</strong> to start — this covers months of ambassador rewards at current earn rates.</p>

          {/* Price context banner */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-500/08 border border-blue-500/20 mb-2">
            <span className="text-blue-400 text-xs font-semibold">💡 Current price context:</span>
            <span className="text-gray-400 text-xs">At pump.fun price (~$0.00000244/VEDD) — 1M VEDD ≈ <strong className="text-white">$2.44</strong> · These are very affordable treasury loads right now</span>
          </div>

          <div className="rounded-xl p-3 bg-emerald-500/08 border border-emerald-500/20 space-y-2">
            <p className="text-emerald-400 text-xs font-semibold">📊 How long will it last? (avg ambassador earns ~900 VEDD/month)</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { supply: '5M VEDD',  usd: '~$12',  ambassadors: '~5,556 ambassadors × 1 month' },
                { supply: '10M VEDD', usd: '~$24',  ambassadors: '~11,111 ambassadors × 1 month' },
                { supply: '20M VEDD', usd: '~$49',  ambassadors: '~22,222 ambassadors × 1 month' },
                { supply: '50M VEDD', usd: '~$122', ambassadors: 'Full 5% rewards pool' },
              ].map(r => (
                <div key={r.supply} className="bg-white/[0.03] rounded-lg px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-amber-400 font-bold">{r.supply}</p>
                    <p className="text-emerald-400 text-[10px] font-semibold">{r.usd} today</p>
                  </div>
                  <p className="text-gray-500 text-[10px] mt-0.5">{r.ambassadors}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
            <Zap className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-white text-xs font-semibold">In Phantom: Send → paste Treasury wallet address → enter amount → confirm</p>
              <p className="text-gray-500 text-xs mt-0.5">Make sure you're sending the VEDD token (not SOL). Search by mint address if needed.</p>
            </div>
          </div>
        </div>
      )
    },
    {
      number: 4,
      title: 'Export the Treasury private key & add to Render',
      status: envVarsMissing ? 'required' : 'done',
      content: (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/08 border border-red-500/20">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-300 text-xs">The private key gives full control of the Treasury wallet. Store it <strong>only</strong> in Render environment variables — never share it or commit it to Git.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-white text-xs font-semibold">In Phantom: Settings → Security & Privacy → Export Private Key</p>
                <p className="text-gray-500 text-xs mt-0.5">Select the Treasury wallet. Enter your Phantom password to reveal the private key (a string of letters/numbers)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-white text-xs font-semibold">Convert to JSON byte array using this tool</p>
                <p className="text-gray-500 text-xs mt-0.5">Go to <a href="https://solana-labs.github.io/solana-web3.js/" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline">Solana Keypair tool</a> or use the Solana CLI: <code className="bg-black/30 px-1 rounded">solana-keygen pubkey &lt;keyfile&gt;</code></p>
                <p className="text-gray-500 text-xs mt-1">Or paste your base58 private key into <a href="https://www.npmjs.com/package/bs58" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline">bs58 decoder</a> to get the byte array</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <p className="text-white text-xs font-semibold">Go to Render dashboard → your service → Environment</p>
                <p className="text-gray-500 text-xs mt-0.5">Add these 3 variables then click "Save Changes" — Render will redeploy automatically:</p>
                <div className="mt-2 space-y-1.5">
                  {[
                    { key: 'VEDD_TOKEN_MINT', value: '<your pump.fun mint address>', hint: 'From Step 1' },
                    { key: 'POOL_WALLET_PRIVATE_KEY', value: '[12,34,56,...,255]', hint: 'JSON byte array from Step 3' },
                    { key: 'SOLANA_RPC_URL', value: 'https://api.mainnet-beta.solana.com', hint: 'Or use QuickNode/Helius for faster sends' },
                  ].map(v => (
                    <div key={v.key} className="bg-black/30 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between">
                        <code className="text-amber-300 text-[11px]">{v.key}</code>
                        <span className="text-[10px] text-gray-600">{v.hint}</span>
                      </div>
                      <code className="text-gray-500 text-[10px]">{v.value}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {!envVarsMissing && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <p className="text-emerald-300 text-xs font-semibold">Environment variables detected — pool wallet registered ✓</p>
            </div>
          )}
        </div>
      )
    },
    {
      number: 5,
      title: 'Register the Treasury wallet in the Admin Panel',
      status: poolReady ? 'done' : 'required',
      content: (
        <div className="space-y-3">
          <p className="text-gray-300 text-sm">Tell the app about your Treasury wallet so it knows where to send tokens from. This is a one-time setup done from the Token Distribution panel.</p>
          <div className="space-y-2">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-white text-xs font-semibold">Go to Token Distribution panel (link below)</p>
                <p className="text-gray-500 text-xs mt-0.5">Scroll to "Add Pool Wallet" section</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-white text-xs font-semibold">Fill in the form:</p>
                <div className="mt-1 space-y-1">
                  <p className="text-gray-500 text-xs">• Label: <span className="text-white">Ambassador Rewards Pool</span></p>
                  <p className="text-gray-500 text-xs">• Public Key: <span className="text-amber-400">your Treasury wallet public address</span></p>
                  <p className="text-gray-500 text-xs">• Type: <span className="text-white">rewards</span> (default)</p>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <p className="text-white text-xs font-semibold">Click "Initialize Pool Wallet" → then "Sync" to pull live balance</p>
                <p className="text-gray-500 text-xs mt-0.5">The panel will now show your VEDD balance and alert you if it runs low</p>
              </div>
            </div>
          </div>
          {poolReady ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-emerald-300 text-xs font-semibold">Pool wallet registered ✓</p>
                <p className="text-gray-500 text-[10px]">{overview?.pools[0]?.label} · {overview?.pools[0]?.tokenBalance?.toLocaleString()} VEDD balance</p>
              </div>
            </div>
          ) : (
            <Link href="/admin/vedd-pool">
              <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 transition-all">
                Open Token Distribution Panel <ChevronRight className="h-4 w-4" />
              </button>
            </Link>
          )}
        </div>
      )
    },
    {
      number: 6,
      title: 'Verify ambassador actions & send tokens',
      status: poolReady && hasBalance ? 'active' : 'waiting',
      content: (
        <div className="space-y-3">
          <p className="text-gray-300 text-sm">Once the Treasury is funded, ambassador rewards flow like this automatically:</p>
          <div className="space-y-2">
            {[
              { step: 'Ambassador completes an action', detail: 'Posts content, refers someone, completes journey day, hosts event, scans clothing', icon: Rocket, color: 'text-blue-400' },
              { step: 'System logs a pending reward', detail: 'The action type, token amount, and user ID are queued in the verification list', icon: Clock, color: 'text-amber-400' },
              { step: 'You see it in the Verification Queue', detail: 'Check the Token Distribution panel — it shows User ID, action type, and amount', icon: Shield, color: 'text-purple-400' },
              { step: 'Click "Quick Approve" or "Review & Approve"', detail: 'On approve, tokens are instantly sent from the Treasury to the ambassador\'s connected Phantom wallet', icon: Zap, color: 'text-emerald-400' },
              { step: 'Transaction appears on Solscan', detail: 'A link to the blockchain transaction is shown in the Transfer History — proof of payment', icon: CheckCircle, color: 'text-emerald-400' },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/05">
                <s.icon className={`h-4 w-4 ${s.color} shrink-0 mt-0.5`} />
                <div>
                  <p className="text-white text-xs font-semibold">{s.step}</p>
                  <p className="text-gray-500 text-[11px] mt-0.5">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/admin/vedd-pool">
            <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-all">
              Open Verification Queue ({pendingRewards.length} pending) <ChevronRight className="h-4 w-4" />
            </button>
          </Link>
        </div>
      )
    },
  ];

  const adminTools = [
    {
      href: '/admin/vedd-pool',
      icon: Coins,
      iconClass: 'icon-box-amber',
      title: 'Token Distribution',
      desc: 'Verify ambassador actions & send VEDD tokens',
      badge: (pendingRewards.length > 0) ? `${pendingRewards.length} pending` : null,
      badgeColor: 'bg-amber-500/20 text-amber-400',
      status: poolReady ? (hasBalance ? 'Live' : 'No balance') : 'Setup needed',
      statusColor: poolReady && hasBalance ? 'text-emerald-400' : 'text-amber-400',
    },
    {
      href: '/blog',
      icon: FileText,
      iconClass: 'icon-box-blue',
      title: 'Blog Management',
      desc: 'AI generate, publish, and manage blog posts',
      badge: null,
      badgeColor: '',
      status: 'Active',
      statusColor: 'text-emerald-400',
    },
    {
      href: '/ambassador/recruitment',
      icon: Users,
      iconClass: 'icon-box-purple',
      title: 'Ambassador Hub',
      desc: 'Manage ambassadors, lead pages, social scans',
      badge: null,
      badgeColor: '',
      status: 'Active',
      statusColor: 'text-emerald-400',
    },
    {
      href: '/ambassador/recruitment?tab=leadpages',
      icon: Rocket,
      iconClass: 'icon-box-purple',
      title: 'Lead Pages',
      desc: 'Create & manage ambassador landing pages',
      badge: null,
      badgeColor: '',
      status: 'Active',
      statusColor: 'text-emerald-400',
    },
    {
      href: '/vedd-tokenomics',
      icon: BarChart3,
      iconClass: 'icon-box-amber',
      title: 'Tokenomics',
      desc: 'View price roadmap, allocation, reward config',
      badge: null,
      badgeColor: '',
      status: 'View',
      statusColor: 'text-gray-400',
    },
    {
      href: '/token-investments',
      icon: TrendingUp,
      iconClass: 'icon-box-green',
      title: 'Investment Pools',
      desc: 'Manage staking and investment pool settings',
      badge: null,
      badgeColor: '',
      status: 'Active',
      statusColor: 'text-emerald-400',
    },
  ];

  const setupProgress = setupSteps.filter(s => s.status === 'done').length;
  const setupTotal = setupSteps.filter(s => s.status !== 'waiting').length;

  return (
    <div className="app-page">
      <div className="container mx-auto px-4 md:px-6">

        {/* Header */}
        <div className="pt-5 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="icon-box-lg icon-box-red">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Admin Control Centre</h1>
              <p className="stat-lbl">VEDD Trading AI · {user?.username}</p>
            </div>
          </div>
        </div>

        {/* Status strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Pool Wallets', value: overview?.pools.length ?? 0, color: (overview?.pools.length ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Pending Rewards', value: pendingRewards.length, color: pendingRewards.length > 0 ? 'text-amber-400' : 'text-emerald-400' },
            { label: 'Sent Today', value: overview?.completedTransfersToday ?? 0, color: 'text-blue-400' },
            { label: 'VEDD Today', value: `${(overview?.totalDistributedToday ?? 0).toFixed(0)}`, color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className="smart-card p-3 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="stat-lbl text-[10px] mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Quick access tools */}
        <div className="mb-5">
          <p className="section-title mb-3">Admin Tools</p>
          <div className="smart-card">
            {adminTools.map(tool => (
              <Link key={tool.href} href={tool.href}>
                <div className="list-row">
                  <span className={`icon-box-sm ${tool.iconClass}`}>
                    <tool.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-semibold">{tool.title}</p>
                      {tool.badge && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tool.badgeColor}`}>{tool.badge}</span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs">{tool.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-semibold ${tool.statusColor}`}>{tool.status}</span>
                    <ChevronRight className="h-4 w-4 text-gray-600" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Treasury Setup Walkthrough */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Treasury Setup Walkthrough</p>
            <span className="text-xs text-gray-500">{setupProgress}/{setupSteps.length} complete</span>
          </div>

          {/* Progress bar */}
          <div className="prog-track mb-4">
            <div className="prog-fill" style={{
              width: `${(setupProgress / setupSteps.length) * 100}%`,
              background: setupProgress === setupSteps.length
                ? 'linear-gradient(90deg,#10b981,#34d399)'
                : 'linear-gradient(90deg,#f59e0b,#fbbf24)',
            }} />
          </div>

          {setupProgress === setupSteps.length && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 mb-4">
              <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-emerald-300 font-semibold text-sm">Treasury is fully operational 🎉</p>
                <p className="text-gray-500 text-xs mt-0.5">Ambassador rewards will be sent automatically to Phantom wallets after your verification.</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {setupSteps.map((step, i) => {
              const isOpen = setupStep === i;
              const isDone = step.status === 'done';
              const isWaiting = step.status === 'waiting';
              return (
                <div key={i}
                  className={`rounded-2xl overflow-hidden border transition-all ${isDone ? 'border-emerald-500/20 bg-emerald-500/03' : isWaiting ? 'border-white/05 bg-white/[0.01] opacity-50' : 'border-amber-500/20 bg-amber-500/03'}`}>
                  <button
                    onClick={() => !isWaiting && setSetupStep(isOpen ? -1 : i)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    disabled={isWaiting}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${isDone ? 'bg-emerald-500/20 text-emerald-400' : isWaiting ? 'bg-white/05 text-gray-600' : 'bg-amber-500/20 text-amber-400'}`}>
                      {isDone ? <CheckCircle className="h-4 w-4" /> : step.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isDone ? 'text-emerald-300' : isWaiting ? 'text-gray-600' : 'text-white'}`}>{step.title}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isDone && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Done</span>}
                      {!isWaiting && (
                        <ChevronRight className={`h-4 w-4 text-gray-600 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-white/05">
                      <div className="pt-3">
                        {step.content}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Treasury tokenomics at a glance */}
        <div className="smart-card p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="icon-box-sm icon-box-amber">
              <SiSolana className="h-3.5 w-3.5" />
            </div>
            <p className="text-white font-semibold text-sm">VEDD Token — Supply & Treasury Math</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              { label: 'Total Supply', value: '1B VEDD', color: 'text-white' },
              { label: 'Rewards Pool (5%)', value: '50M VEDD', color: 'text-amber-400' },
              { label: 'Avg Ambassador/mo', value: '~900 VEDD', color: 'text-blue-400' },
              { label: 'Sell pressure/month', value: '<0.005%', color: 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.03] rounded-xl p-3 text-center">
                <p className={`text-sm font-black ${s.color}`}>{s.value}</p>
                <p className="stat-lbl text-[10px] mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide mb-2">Reward Schedule (seeded in DB)</p>
            {[
              { action: 'Daily post (verified)', reward: '10 VEDD', limit: '1/day' },
              { action: 'Referral signup', reward: '50 VEDD', limit: '5/day' },
              { action: 'Referral subscribes', reward: '200 VEDD', limit: '5/day' },
              { action: 'Journey day completed', reward: '10 VEDD', limit: '1/day' },
              { action: '44-day journey bonus', reward: '500 VEDD', limit: 'once' },
              { action: 'Event hosted', reward: '100 VEDD', limit: '1/day · verified' },
              { action: 'Wear-to-earn QR scan', reward: '50 VEDD', limit: '1/day · verified' },
            ].map(r => (
              <div key={r.action} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/04">
                <span className="text-gray-400 text-xs">{r.action}</span>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-xs font-bold">{r.reward}</span>
                  <span className="text-[10px] text-gray-600">{r.limit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ambassador / User Management */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">User & Ambassador Management</p>
            <span className="text-xs text-gray-500">{allUsers.length} users</span>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search by username or email…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
            />
          </div>

          <div className="smart-card divide-y divide-white/05">
            {allUsers
              .filter(u => {
                if (!userSearch) return true;
                const q = userSearch.toLowerCase();
                return u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
              })
              .slice(0, 50)
              .map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/20 to-amber-500/20 flex items-center justify-center shrink-0">
                    <UserCog className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm font-semibold truncate">{u.username}</p>
                      {u.isAdmin && <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full">Admin</span>}
                      {u.isAmbassador && <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded-full">Ambassador</span>}
                      {u.subscriptionTier && u.subscriptionTier !== 'free' && <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-full capitalize">{u.subscriptionTier}</span>}
                    </div>
                    <p className="text-gray-500 text-xs truncate">{u.email}{u.walletAddress ? ` · ${u.walletAddress.slice(0, 6)}…${u.walletAddress.slice(-4)}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Toggle Ambassador */}
                    <button
                      onClick={() => updateUserMutation.mutate({ userId: u.id, updates: { isAmbassador: !u.isAmbassador } })}
                      disabled={updateUserMutation.isPending || u.id === user?.id}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                        u.isAmbassador
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30'
                          : 'bg-white/[0.03] text-gray-500 border-white/10 hover:bg-purple-500/20 hover:text-purple-300 hover:border-purple-500/30'
                      }`}
                      title={u.isAmbassador ? 'Remove ambassador' : 'Make ambassador'}
                    >
                      {u.isAmbassador ? 'Amb ✓' : '+ Amb'}
                    </button>
                  </div>
                </div>
              ))}
            {allUsers.length === 0 && (
              <div className="px-4 py-6 text-center text-gray-500 text-sm">No users loaded</div>
            )}
          </div>
          <p className="text-[10px] text-gray-600 mt-2 text-center">Click "+ Amb" to grant ambassador access · ambassadors can access all ambassador routes and earn VEDD rewards</p>
        </div>

      </div>
    </div>
  );
}
