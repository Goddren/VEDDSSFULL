import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { ArrowLeft, LinkIcon, Copy, Check, Rocket, ListChecks } from 'lucide-react';

interface UserProfile {
  city: string | null;
  propFirmReferralLink: string | null;
}

const STEPS = [
  {
    title: 'Welcome + what VEDD does',
    detail: "Open with a quick demo of the AI SS Engine — live signals, auto-trade, and the safety gates that protect an account. Keep it to 5 minutes; the goal is a live account by the end of the session, not a lecture.",
  },
  {
    title: 'Sign up for a funded account',
    detail: 'Have everyone open your prop firm referral link on their phone or laptop right now and start the application. Walk around and help anyone stuck on the signup form.',
  },
  {
    title: 'Wait for approval, connect while you wait',
    detail: "While approvals come through, have attendees create their VEDD account (or log in) and get to the dashboard — that way there's zero dead time once their funded account is ready.",
  },
  {
    title: 'Connect the funded account to VEDD',
    detail: "Once approved, connect the account credentials to VEDD: MT5 accounts use the MT5 Chart Data EA, TradeLocker-based accounts connect directly from the Webhooks page. Both take under 5 minutes.",
  },
  {
    title: 'Turn on the AI SS Engine',
    detail: "Head to the AI SS Engine page, set a weekly goal, and flip the engine on. Attendees leave with a live, AI-managed funded account — not just a signup.",
  },
];

export default function AmbassadorPropFirmEventPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [linkInput, setLinkInput] = useState('');
  const [copied, setCopied] = useState(false);

  const name = (user as any)?.fullName || (user as any)?.username || 'A VEDD Ambassador';

  const { data: profile } = useQuery<UserProfile | null>({
    queryKey: [`/api/profile/${(user as any)?.id}`],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/profile/${(user as any)?.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!(user as any)?.id,
  });
  const city = profile?.city || '';

  useEffect(() => { if (profile?.propFirmReferralLink) setLinkInput(profile.propFirmReferralLink); }, [profile?.propFirmReferralLink]);

  const saveLinkMutation = useMutation({
    mutationFn: async (link: string) => (await apiRequest('POST', '/api/profile', { propFirmReferralLink: link })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/profile/${(user as any)?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/daily-tasks'] });
      toast({ title: 'Referral link saved' });
    },
  });

  const referralLink = profile?.propFirmReferralLink || '';

  const inviteText = `Come get set up with a funded trading account — free, hands-on session${city ? ` in ${city}` : ''}. Bring a laptop or phone.

We'll walk you through:
1. Signing up for a funded prop firm account
2. Connecting it to VEDD's AI trading engine
3. Leaving with a live, AI-managed account

Sign up for your funded account here: ${referralLink || '[add your referral link]'}

Hosted by ${name}, VEDD Community Ambassador.`;

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </Link>

        <div className="flex items-center gap-2.5 mb-1">
          <Rocket className="w-6 h-6 text-emerald-400" />
          <h1 className="text-xl font-bold">Host a Prop Firm Setup Event</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          A fast, hands-on session: attendees sign up for a funded account through your referral link, then connect it to VEDD's AI SS Engine — all in one sitting.
        </p>

        <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-4 mb-6">
          <label className="text-xs font-bold text-gray-400 flex items-center gap-1.5 mb-2"><LinkIcon className="w-3.5 h-3.5" /> Your Prop Firm Referral Link</label>
          <div className="flex gap-2">
            <input
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              placeholder="e.g. atlasfunded.com/?afmc=6l5"
              className="flex-1 bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
            />
            <button
              onClick={() => saveLinkMutation.mutate(linkInput)}
              disabled={saveLinkMutation.isPending || !linkInput.trim()}
              className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
            >
              {saveLinkMutation.isPending ? '…' : 'Save'}
            </button>
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5">This is your own affiliate link with the prop firm — attendees who sign up through it fund your referral, and you help them go live with VEDD the same day.</p>
        </div>

        <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-white">Event Invite / Flyer Copy</p>
            <button
              onClick={copyInvite}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 flex items-center gap-1"
            >
              {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy invite</>}
            </button>
          </div>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed bg-black/30 rounded-lg p-3">{inviteText}</pre>
          {!referralLink && <p className="text-[10px] text-amber-400 mt-2">Add your referral link above so it's included automatically.</p>}
        </div>

        <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
          <p className="text-sm font-bold text-white flex items-center gap-2 mb-4"><ListChecks className="w-4 h-4 text-emerald-400" /> Run of Show</p>
          <div className="space-y-3">
            {STEPS.map((step, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black bg-emerald-500/20 text-emerald-400 flex-shrink-0">{i + 1}</span>
                <div>
                  <p className="text-xs font-bold text-white">{step.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-800">
            <Link href="/mt5-chart-data" className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300">MT5 connect guide →</Link>
            <Link href="/webhooks#tradelocker" className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300">TradeLocker connect guide →</Link>
            <Link href="/weekly-strategy" className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300">AI SS Engine →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
