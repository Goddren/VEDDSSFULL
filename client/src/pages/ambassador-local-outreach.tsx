import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { ArrowLeft, MapPin, Copy, Check, Library, Church, Building2, Rocket, Handshake, Wifi } from 'lucide-react';

interface UserProfile {
  city: string | null;
}

type VenueKey = 'library' | 'church' | 'hotel' | 'incubator' | 'bni' | 'coworking';

const VENUES: { key: VenueKey; label: string; icon: typeof Library; subject: string; searchQuery: string; body: (name: string, city: string) => string }[] = [
  {
    key: 'library',
    label: 'Public Library',
    icon: Library,
    searchQuery: 'public library',
    subject: 'Free financial literacy workshop for your community',
    body: (name, city) => `Hi,

My name is ${name}, and I'm a Community Ambassador with VEDD, a financial education platform. I'd love to host a free, one-hour workshop at your library introducing ${city ? `${city} residents` : 'community members'} to the basics of budgeting, saving, and safe investing — no sales pitch, just practical financial skills.

Would your library have a meeting room available for a workshop like this in the next few weeks? I'm flexible on timing and can bring all materials.

Thank you for considering this — happy to answer any questions.

Best,
${name}
VEDD Community Ambassador`,
  },
  {
    key: 'church',
    label: 'Church / Faith Community',
    icon: Church,
    searchQuery: 'church',
    subject: 'Financial wellness workshop for your congregation',
    body: (name, city) => `Hello,

My name is ${name}, and I serve as a Community Ambassador with VEDD, a financial education platform grounded in helping people build real financial stability. I'd love to offer a free financial wellness session for your congregation${city ? ` here in ${city}` : ''} — covering budgeting, saving, and building a healthy relationship with money.

Would you be open to me hosting a short session after a service or during a community night? I can work around whatever fits your calendar best.

Thank you for your time and the work you do for the community.

Warmly,
${name}
VEDD Community Ambassador`,
  },
  {
    key: 'hotel',
    label: 'Hotel / Event Space',
    icon: Building2,
    searchQuery: 'hotel event space',
    subject: 'Small community event — meeting space inquiry',
    body: (name, city) => `Hello,

My name is ${name}, a Community Ambassador with VEDD, a financial education company. I'm organizing a free community financial literacy event${city ? ` in ${city}` : ''} and I'm looking for a meeting room to host roughly 20-30 attendees for about 2 hours.

Could you let me know if you have space available, and whether there's a rate for a community/nonprofit-style event? I'm flexible on dates and happy to provide more details about the event.

Thank you,
${name}
VEDD Community Ambassador`,
  },
  {
    key: 'incubator',
    label: 'Business Incubator / Accelerator',
    icon: Rocket,
    searchQuery: 'business incubator OR startup accelerator',
    subject: 'Free financial literacy session for your founder community',
    body: (name, city) => `Hi,

My name is ${name}, a Community Ambassador with VEDD, a financial education and AI-assisted trading platform. Founders are great at building products but often self-taught (or under-taught) on managing personal and business finances — I'd love to offer a free session${city ? ` at your space in ${city}` : ''} on financial fundamentals, cash flow discipline, and building a safety net while bootstrapping.

Would you be open to me presenting at an upcoming founder meetup, demo day, or office hours slot? Happy to tailor the content to whatever's most useful for your cohort.

Thanks for considering it,
${name}
VEDD Community Ambassador`,
  },
  {
    key: 'bni',
    label: 'BNI / Business Networking Group',
    icon: Handshake,
    searchQuery: 'BNI chapter OR business networking group',
    subject: 'Guest visitor request — financial education category',
    body: (name, city) => `Hello,

My name is ${name}, a Community Ambassador with VEDD, a financial education and AI-trading platform${city ? ` based in ${city}` : ''}. I'd love to visit an upcoming chapter meeting as a guest to learn more about your group and share what VEDD offers — financial literacy education, AI-assisted trading tools, and a referral-friendly business model that could be a good fit for your "financial education" or "fintech" seat if it's open.

Could you let me know the best way to attend as a visitor, or who to speak with about a guest slot?

Thank you,
${name}
VEDD Community Ambassador`,
  },
  {
    key: 'coworking',
    label: 'Coworking Space / Tech Hub',
    icon: Wifi,
    searchQuery: 'coworking space OR tech hub',
    subject: 'Community event idea for your members',
    body: (name, city) => `Hi,

My name is ${name}, a Community Ambassador with VEDD, a financial education and AI-trading platform. I'd love to host a free lunch-and-learn or evening session for your members${city ? ` here in ${city}` : ''} — covering practical financial literacy and how AI tools are changing personal trading and investing.

Would your space be open to hosting something like this, whether in your event calendar or as a community perk for members? I can work around your schedule and bring all materials.

Thanks for considering it,
${name}
VEDD Community Ambassador`,
  },
];

export default function AmbassadorLocalOutreachPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cityInput, setCityInput] = useState('');
  const [copiedKey, setCopiedKey] = useState<VenueKey | null>(null);

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

  useEffect(() => { if (profile?.city) setCityInput(profile.city); }, [profile?.city]);

  const saveCityMutation = useMutation({
    mutationFn: async (newCity: string) => (await apiRequest('POST', '/api/profile', { city: newCity })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/profile/${(user as any)?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/daily-tasks'] });
      toast({ title: 'City saved' });
    },
  });

  const copyTemplate = async (venue: typeof VENUES[number]) => {
    const text = `Subject: ${venue.subject}\n\n${venue.body(name, city)}`;
    await navigator.clipboard.writeText(text);
    setCopiedKey(venue.key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </Link>

        <h1 className="text-xl font-bold mb-1">Book Your First Local Event</h1>
        <p className="text-sm text-gray-500 mb-6">Pick a venue, copy the letter, fill in the blanks, and send it — this is how ambassadors get their first in-person event on the calendar.</p>

        <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-4 mb-6">
          <label className="text-xs font-bold text-gray-400 flex items-center gap-1.5 mb-2"><MapPin className="w-3.5 h-3.5" /> Your City</label>
          <div className="flex gap-2">
            <input
              value={cityInput}
              onChange={e => setCityInput(e.target.value)}
              placeholder="e.g. Austin, TX"
              className="flex-1 bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={() => saveCityMutation.mutate(cityInput)}
              disabled={saveCityMutation.isPending || !cityInput.trim()}
              className="text-xs font-bold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
            >
              {saveCityMutation.isPending ? '…' : 'Save'}
            </button>
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5">Used to personalize your outreach letters and find local events happening near you.</p>
        </div>

        <div className="space-y-4">
          {VENUES.map(venue => {
            const Icon = venue.icon;
            return (
              <div key={venue.key} className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-white flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-400" /> {venue.label}</p>
                  <button
                    onClick={() => copyTemplate(venue)}
                    className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 flex items-center gap-1"
                  >
                    {copiedKey === venue.key ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy letter</>}
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mb-2">Subject: {venue.subject}</p>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed bg-black/30 rounded-lg p-3">{venue.body(name, city)}</pre>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(venue.searchQuery)}${city ? `+near+${encodeURIComponent(city)}` : ''}`}
                  target="_blank" rel="noreferrer"
                  className="inline-block mt-2 text-[10px] font-bold text-indigo-400 hover:text-indigo-300"
                >
                  Find {venue.label.toLowerCase()} near you →
                </a>
              </div>
            );
          })}
        </div>

        {city && (
          <a
            href={`https://www.google.com/search?q=events+near+${encodeURIComponent(city)}+this+week`}
            target="_blank" rel="noreferrer"
            className="block mt-6 text-center text-xs font-bold text-amber-400 hover:text-amber-300"
          >
            See what's happening in {city} this week →
          </a>
        )}
      </div>
    </div>
  );
}
