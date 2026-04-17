import { Link, useLocation } from 'wouter';
import {
  Home,
  TrendingUp,
  Zap,
  Users,
  Grid3X3,
  ChevronRight,
  LogOut,
  Settings,
  History,
  CreditCard,
  Award,
  Newspaper,
  Clock,
  Briefcase,
  HelpCircle,
  BookOpen,
  GraduationCap,
  Lightbulb,
  Coins,
  Webhook,
  Wallet,
  DollarSign,
  Globe,
  Search,
  BarChart3,
  LineChart,
  Scan,
  Brain,
  Radio,
} from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/use-auth';
import { isMobileDevice } from '@/lib/pwa';

/* ─── Category definitions for the More sheet ─────── */
const tradingItems = [
  { name: 'Weekly Strategy', path: '/weekly-strategy', icon: TrendingUp, color: 'icon-box-red' },
  { name: 'Multi-TF EA', path: '/multi-timeframe', icon: Clock, color: 'icon-box-amber' },
  { name: 'My EAs', path: '/my-eas', icon: Briefcase, color: 'icon-box-amber' },
  { name: 'Marketplace', path: '/ea-marketplace', icon: Zap, color: 'icon-box-red' },
  { name: 'Historical', path: '/historical', icon: History, color: 'icon-box-purple' },
  { name: 'What If Analysis', path: '/what-if', icon: Lightbulb, color: 'icon-box-cyan' },
  { name: 'MT5 Chart Data', path: '/mt5-chart-data', icon: BarChart3, color: 'icon-box-cyan' },
];

const aiToolItems = [
  { name: 'SOL Scanner', path: '/solana-scanner', icon: Scan, color: 'icon-box-cyan' },
  { name: 'VEDD Tokenomics', path: '/vedd-tokenomics', icon: Coins, color: 'icon-box-amber' },
  { name: 'Analysis', path: '/analysis', icon: LineChart, color: 'icon-box-red' },
  { name: 'AI Models', path: '/ai-trading-models', icon: Brain, color: 'icon-box-purple' },
  { name: 'Webhooks', path: '/webhooks', icon: Webhook, color: 'icon-box-blue' },
  { name: 'Live Monitor', path: '/live-monitor', icon: Radio, color: 'icon-box-green' },
];

const communityItems = [
  { name: 'Community', path: '/community', icon: Users, color: 'icon-box-purple' },
  { name: 'Ambassador Training', path: '/ambassador-training', icon: GraduationCap, color: 'icon-box-amber' },
  { name: 'Recruit Ambassadors', path: '/ambassador/recruitment', icon: Users, color: 'icon-box-red' },
  { name: 'My Lead Page', path: '/ambassador/recruitment?tab=leadpages', icon: Globe, color: 'icon-box-blue' },
  { name: 'Social Scanner', path: '/ambassador/recruitment?tab=social', icon: Search, color: 'icon-box-pink' },
  { name: 'Host Dashboard', path: '/host-dashboard', icon: Award, color: 'icon-box-amber' },
  { name: 'Blog', path: '/blog', icon: Newspaper, color: 'icon-box-green' },
];

const financeItems = [
  { name: 'Token Investments', path: '/token-investments', icon: Coins, color: 'icon-box-amber' },
  { name: 'VEDD Wallet', path: '/vedd-wallet', icon: Wallet, color: 'icon-box-purple' },
  { name: 'Referral Hub', path: '/referral', icon: DollarSign, color: 'icon-box-green' },
  { name: 'Grants & Funding', path: '/grants', icon: DollarSign, color: 'icon-box-green' },
  { name: 'Achievements', path: '/achievements', icon: Award, color: 'icon-box-amber' },
  { name: 'Pricing', path: '/subscription', icon: CreditCard, color: 'icon-box-red' },
];

/* ─── Sheet category section ──────────────────────── */
function SheetSection({
  title,
  items,
  location,
  onClose,
}: {
  title: string;
  items: { name: string; path: string; icon: React.ComponentType<{ className?: string }>; color: string }[];
  location: string;
  onClose: () => void;
}) {
  return (
    <div className="mb-2">
      <p className="section-title px-4 pt-4 pb-2">{title}</p>
      <div className="smart-card mx-3 overflow-hidden">
        {items.map((item, i) => {
          const isActive = location === item.path || location.startsWith(item.path.split('?')[0]);
          return (
            <Link key={`${item.path}-${i}`} href={item.path}>
              <button
                onClick={onClose}
                className={`list-row w-full text-left ${isActive ? 'bg-red-500/06' : ''}`}
              >
                <span className={`icon-box-sm ${item.color}`}>
                  <item.icon className="h-3.5 w-3.5" />
                </span>
                <span className={`flex-1 text-sm font-medium ${isActive ? 'text-red-400' : 'text-white'}`}>
                  {item.name}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 shrink-0" />
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────── */
export function MobileBottomNav() {
  const [location] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { user, logoutMutation } = useAuth();

  if (!isMobileDevice()) return null;

  const authPages = ['/', '/login', '/register', '/forgot-password'];
  if (authPages.includes(location) || !user) return null;

  const tabs = [
    { name: 'Home',    path: '/dashboard',             Icon: Home       },
    { name: 'Trading', path: '/weekly-strategy',        Icon: TrendingUp },
    { name: 'AI',      path: '/analysis',               Icon: Zap        },
    { name: 'Grow',    path: '/ambassador/recruitment',  Icon: Users      },
  ];

  return (
    <>
      {/* ── Tab Bar ── */}
      <nav className="tab-bar md:hidden">
        {tabs.map(({ name, path, Icon }) => {
          const isActive = location === path || (path === '/dashboard' && location === '/');
          return (
            <Link key={path} href={path}>
              <button className={`tab-item ${isActive ? 'active' : ''}`}>
                <span className="tab-icon-wrap">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="tab-lbl">{name}</span>
              </button>
            </Link>
          );
        })}

        {/* More tab */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button className={`tab-item ${sheetOpen ? 'active' : ''}`}>
              <span className="tab-icon-wrap">
                <Grid3X3 className="h-[18px] w-[18px]" />
              </span>
              <span className="tab-lbl">More</span>
            </button>
          </SheetTrigger>

          <SheetContent
            side="bottom"
            className="p-0 border-0"
            style={{
              background: '#080B14',
              borderRadius: '28px 28px 0 0',
              maxHeight: '85vh',
              border: '1px solid rgba(255,255,255,0.07)',
              borderBottom: 'none',
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Title */}
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="section-heading">All Features</h2>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 80px)', paddingBottom: '100px' }}>
              <SheetSection title="Trading" items={tradingItems} location={location} onClose={() => setSheetOpen(false)} />
              <SheetSection title="AI Tools" items={aiToolItems} location={location} onClose={() => setSheetOpen(false)} />
              <SheetSection title="Community" items={communityItems} location={location} onClose={() => setSheetOpen(false)} />
              <SheetSection title="Finance" items={financeItems} location={location} onClose={() => setSheetOpen(false)} />

              {/* Bottom actions */}
              <div className="mx-3 mt-2 mb-4 space-y-2">
                <Link href="/profile">
                  <button onClick={() => setSheetOpen(false)} className="list-row w-full smart-card text-left rounded-2xl">
                    <span className="icon-box-sm icon-box-blue">
                      <Settings className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 text-sm font-medium text-white">Settings / Profile</span>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
                  </button>
                </Link>
                <button
                  onClick={() => {
                    logoutMutation.mutate();
                    setSheetOpen(false);
                  }}
                  className="list-row w-full smart-card rounded-2xl"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <span className="icon-box-sm icon-box-red">
                    <LogOut className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-red-400">Log Out</span>
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}
