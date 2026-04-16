import { Link, useLocation } from 'wouter';
import { Home, LineChart, Scan, BarChart3, Menu } from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Settings,
  History,
  CreditCard,
  Award,
  Users,
  Newspaper,
  Clock,
  Briefcase,
  Zap,
  HelpCircle,
  BookOpen,
  GraduationCap,
  Lightbulb,
  Coins,
  Webhook,
  Wallet,
  User,
  LogOut,
  Layers,
  Shirt,
  DollarSign,
  Globe,
  Search,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { isMobileDevice } from '@/lib/pwa';

const primaryNavItems = [
  { name: 'Home', path: '/dashboard', icon: Home },
  { name: 'Analysis', path: '/analysis', icon: LineChart },
  { name: 'SOL Scanner', path: '/solana-scanner', icon: Scan },
  { name: 'MT5 Data', path: '/mt5-chart-data', icon: BarChart3 },
];

const allNavItems = [
  { name: '7 ye even 8', path: '/seven-eight', icon: Layers },
  { name: 'Dashboard', path: '/dashboard', icon: Home },
  { name: 'Analysis', path: '/analysis', icon: LineChart },
  { name: 'Multi-TF EA', path: '/multi-timeframe', icon: Clock },
  { name: 'My EAs', path: '/my-eas', icon: Briefcase },
  { name: 'Marketplace', path: '/ea-marketplace', icon: Zap },
  { name: 'Solana Scanner', path: '/solana-scanner', icon: Scan },
  { name: 'VEDD Tokenomics', path: '/vedd-tokenomics', icon: Coins },
  { name: 'VEDD Clothing', path: '/vedd-clothing', icon: Shirt },
  { name: 'VEDD Wallet', path: '/vedd-wallet', icon: Wallet },
  { name: 'MT5 Chart Data', path: '/mt5-chart-data', icon: BarChart3 },
  { name: 'Webhooks', path: '/webhooks', icon: Webhook },
  { name: 'What If Analysis', path: '/what-if', icon: Lightbulb },
  { name: 'Historical', path: '/historical', icon: History },
  { name: 'Community', path: '/community', icon: Users },
  { name: 'Achievements', path: '/achievements', icon: Award },
  { name: 'Ambassador Training', path: '/ambassador-training', icon: GraduationCap },
  { name: 'Recruit Ambassadors', path: '/ambassador/recruitment', icon: Users },
  { name: 'My Lead Page', path: '/ambassador/recruitment?tab=leadpages', icon: Globe },
  { name: 'Social Scanner', path: '/ambassador/recruitment?tab=social', icon: Search },
  { name: 'Token Investments', path: '/token-investments', icon: Coins },
  { name: 'Referral Hub', path: '/referral', icon: DollarSign },
  { name: 'Grants & Funding', path: '/grants', icon: DollarSign },
  { name: 'User Guide', path: '/user-guide', icon: BookOpen },
  { name: 'Blog', path: '/blog', icon: Newspaper },
  { name: 'Pricing', path: '/subscription', icon: CreditCard },
  { name: 'Profile', path: '/profile', icon: User },
  { name: 'Support', path: '/support', icon: HelpCircle },
];

export function MobileBottomNav() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logoutMutation } = useAuth();

  if (!isMobileDevice()) {
    return null;
  }

  const authPages = ['/', '/login', '/register', '/forgot-password'];
  if (authPages.includes(location) || !user) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 frosted-bar md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {primaryNavItems.map((item) => {
          const isActive = location === item.path ||
            (item.path === '/dashboard' && location === '/');
          return (
            <Link key={item.path} href={item.path}>
              <button className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}>
                <item.icon className="h-5 w-5 mb-1" />
                <span className="text-[10px] font-medium">{item.name}</span>
                {isActive && (
                  <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-primary" />
                )}
              </button>
            </Link>
          );
        })}

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all ${
              menuOpen
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
              <Menu className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">More</span>
              {menuOpen && (
                <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[75vh] rounded-t-3xl bg-[#0d0f18] border-t border-white/10">
            <div className="pt-3 pb-20">
              {/* Handle pill */}
              <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mb-5" />
              <h3 className="text-base font-semibold mb-4 px-3 text-white">All Pages</h3>
              <div className="grid grid-cols-3 gap-2 px-3 max-h-[52vh] overflow-y-auto">
                {allNavItems.map((item) => {
                  const isActive = location === item.path;
                  return (
                    <Link key={item.path} href={item.path}>
                      <button
                        onClick={() => setMenuOpen(false)}
                        className={`feature-tile w-full items-center text-center ${
                          isActive ? 'feature-tile-active' : ''
                        }`}
                      >
                        <div className={`icon-tile-sm mx-auto ${isActive ? 'bg-primary/20' : 'bg-white/5'}`}>
                          <item.icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-gray-400'}`} />
                        </div>
                        <span className={`text-[11px] font-medium text-center leading-tight w-full ${isActive ? 'text-primary' : 'text-gray-300'}`}>{item.name}</span>
                      </button>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-white/06 px-3">
                <Button
                  variant="outline"
                  className="w-full justify-start text-red-400 hover:text-red-300 border-red-500/20 hover:bg-red-500/10 rounded-xl"
                  onClick={() => {
                    logoutMutation.mutate();
                    setMenuOpen(false);
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Log Out
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
