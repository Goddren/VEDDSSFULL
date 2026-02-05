import { Link, useLocation } from 'wouter';
import { Home, LineChart, Scan, Coins, Menu } from 'lucide-react';
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
  BarChart3, 
  Webhook, 
  Wallet,
  User,
  LogOut
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { isMobileDevice } from '@/lib/pwa';

const primaryNavItems = [
  { name: 'Home', path: '/dashboard', icon: Home },
  { name: 'Analysis', path: '/analysis', icon: LineChart },
  { name: 'SOL Scanner', path: '/solana-scanner', icon: Scan },
  { name: 'Tokenomics', path: '/vedd-tokenomics', icon: Coins },
];

const allNavItems = [
  { name: 'Dashboard', path: '/dashboard', icon: Home },
  { name: 'Analysis', path: '/analysis', icon: LineChart },
  { name: 'Multi-TF EA', path: '/multi-timeframe', icon: Clock },
  { name: 'My EAs', path: '/my-eas', icon: Briefcase },
  { name: 'Marketplace', path: '/ea-marketplace', icon: Zap },
  { name: 'Solana Scanner', path: '/solana-scanner', icon: Scan },
  { name: 'VEDD Tokenomics', path: '/vedd-tokenomics', icon: Coins },
  { name: 'VEDD Wallet', path: '/vedd-wallet', icon: Wallet },
  { name: 'MT5 Chart Data', path: '/mt5-chart-data', icon: BarChart3 },
  { name: 'Webhooks', path: '/webhooks', icon: Webhook },
  { name: 'What If Analysis', path: '/what-if', icon: Lightbulb },
  { name: 'Historical', path: '/historical', icon: History },
  { name: 'Community', path: '/community', icon: Users },
  { name: 'Achievements', path: '/achievements', icon: Award },
  { name: 'Ambassador Training', path: '/ambassador-training', icon: GraduationCap },
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {primaryNavItems.map((item) => {
          const isActive = location === item.path || 
            (item.path === '/dashboard' && location === '/');
          return (
            <Link key={item.path} href={item.path}>
              <button className={`flex flex-col items-center justify-center w-16 h-14 rounded-lg transition-colors ${
                isActive 
                  ? 'text-primary bg-primary/10' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}>
                <item.icon className="h-5 w-5 mb-1" />
                <span className="text-[10px] font-medium">{item.name}</span>
              </button>
            </Link>
          );
        })}
        
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button className={`flex flex-col items-center justify-center w-16 h-14 rounded-lg transition-colors ${
              menuOpen 
                ? 'text-primary bg-primary/10' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}>
              <Menu className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl">
            <div className="pt-2 pb-20">
              <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-4 px-2">All Pages</h3>
              <div className="grid grid-cols-3 gap-2 px-2 max-h-[50vh] overflow-y-auto">
                {allNavItems.map((item) => {
                  const isActive = location === item.path;
                  return (
                    <Link key={item.path} href={item.path}>
                      <button 
                        onClick={() => setMenuOpen(false)}
                        className={`flex flex-col items-center justify-center w-full p-3 rounded-xl transition-colors ${
                          isActive 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted/50 hover:bg-muted text-foreground'
                        }`}
                      >
                        <item.icon className="h-6 w-6 mb-2" />
                        <span className="text-xs font-medium text-center leading-tight">{item.name}</span>
                      </button>
                    </Link>
                  );
                })}
              </div>
              
              <div className="mt-4 pt-4 border-t border-border px-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
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
