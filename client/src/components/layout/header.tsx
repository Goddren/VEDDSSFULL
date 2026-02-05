import React from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import VeddLogo from '@/components/ui/vedd-logo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, Bell, User, LogOut, Settings, History, LineChart, CreditCard, Award, Users, Newspaper, Wand2, Clock, Briefcase, Zap, HelpCircle, BookOpen, GraduationCap, FileText, Lightbulb, ChevronDown, MoreHorizontal, BarChart3, Webhook, Wallet, Scan, Coins } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const Header: React.FC = () => {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  // Primary nav items shown directly in header
  const primaryNavItems = [
    { name: 'Dashboard', path: '/dashboard', active: location === '/dashboard', icon: <Settings className="h-4 w-4 mr-2" /> },
    { name: 'Analysis', path: '/analysis', active: location === '/analysis', icon: <LineChart className="h-4 w-4 mr-2" /> },
    { name: 'Multi-TF EA', path: '/multi-timeframe', active: location === '/multi-timeframe', icon: <Clock className="h-4 w-4 mr-2" /> },
    { name: 'My EAs', path: '/my-eas', active: location === '/my-eas', icon: <Briefcase className="h-4 w-4 mr-2" /> },
    { name: 'Marketplace', path: '/ea-marketplace', active: location === '/ea-marketplace', icon: <Zap className="h-4 w-4 mr-2" /> },
  ];

  // Secondary nav items shown in "More" dropdown
  const moreNavItems = [
    { name: 'Solana Scanner', path: '/solana-scanner', active: location === '/solana-scanner', icon: <Scan className="h-4 w-4 mr-2" /> },
    { name: 'VEDD Tokenomics', path: '/vedd-tokenomics', active: location === '/vedd-tokenomics', icon: <Coins className="h-4 w-4 mr-2" /> },
    { name: 'MT5 Chart Data', path: '/mt5-chart-data', active: location === '/mt5-chart-data', icon: <BarChart3 className="h-4 w-4 mr-2" /> },
    { name: 'Webhooks', path: '/webhooks', active: location === '/webhooks', icon: <Webhook className="h-4 w-4 mr-2" /> },
    { name: 'What If Analysis', path: '/what-if', active: location === '/what-if', icon: <Lightbulb className="h-4 w-4 mr-2" /> },
    { name: 'Historical', path: '/historical', active: location === '/historical', icon: <History className="h-4 w-4 mr-2" /> },
    { name: 'Community', path: '/community', active: location === '/community', icon: <Users className="h-4 w-4 mr-2" /> },
    { name: 'Blog', path: '/blog', active: location === '/blog', icon: <Newspaper className="h-4 w-4 mr-2" /> },
    { name: 'Achievements', path: '/achievements', active: location === '/achievements', icon: <Award className="h-4 w-4 mr-2" /> },
    { name: 'Pricing', path: '/subscription', active: location === '/subscription', icon: <CreditCard className="h-4 w-4 mr-2" /> },
    { name: 'Support', path: '/support', active: location === '/support', icon: <HelpCircle className="h-4 w-4 mr-2" /> },
  ];

  // All nav items for mobile menu
  const navItems = [...primaryNavItems, ...moreNavItems];

  // Get user initials for avatar fallback
  const getUserInitials = () => {
    if (!user) return "?";
    if (user.fullName) {
      return user.fullName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
    }
    return user.username.substring(0, 2).toUpperCase();
  };

  const handleLogout = () => {
    logoutMutation.mutate();
    setMobileMenuOpen(false);
  };

  const handleMobileNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header className="w-full bg-background border-b py-3 px-4 md:px-8">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <VeddLogo height={40} />
            <span className="ml-2 text-xl font-bold tracking-tight">VEDD</span>
          </Link>
        </div>
        
        <div className="hidden md:flex items-center space-x-4 lg:space-x-6">
          {primaryNavItems.map(item => (
            <Link 
              key={item.path} 
              href={item.path}
              className={`text-sm transition-colors flex items-center ${item.active ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {item.name}
            </Link>
          ))}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="h-4 w-4 mr-1" />
                More
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48">
              {moreNavItems.map(item => (
                <DropdownMenuItem key={item.path} asChild className="cursor-pointer">
                  <Link href={item.path}>
                    <div className={`flex items-center w-full ${item.active ? 'text-primary font-medium' : ''}`}>
                      {item.icon}
                      <span>{item.name}</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center space-x-2 md:space-x-4">
          <div className="hidden md:flex items-center gap-2">
            <Link href="/user-guide">
              <Button 
                variant="outline" 
                size="sm" 
                className="border-blue-500/50 text-blue-500 hover:bg-blue-500/10"
                data-testid="button-user-guide"
              >
                <BookOpen className="h-4 w-4 mr-1" />
                Guide
              </Button>
            </Link>
            <Link href="/ambassador-training">
              <Button 
                variant="outline" 
                size="sm" 
                className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                data-testid="button-ambassador"
              >
                <GraduationCap className="h-4 w-4 mr-1" />
                Ambassador
              </Button>
            </Link>
          </div>
          
          <ThemeToggle />
          
          <Button variant="ghost" size="icon" className="rounded-full">
            <Bell className="h-5 w-5" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarImage src={user?.profileImage || ""} alt={user?.username || "User"} />
                <AvatarFallback className="bg-primary/10 text-primary">{getUserInitials()}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.fullName || user?.username}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/profile">
                  <div className="flex items-center w-full">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/vedd-wallet">
                  <div className="flex items-center w-full">
                    <Wallet className="mr-2 h-4 w-4" />
                    <span>VEDD Wallet</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/achievements">
                  <div className="flex items-center w-full">
                    <Award className="mr-2 h-4 w-4" />
                    <span>Achievements</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/social-hub">
                  <div className="flex items-center w-full">
                    <Users className="mr-2 h-4 w-4" />
                    <span>Social Hub</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/user-guide">
                  <div className="flex items-center w-full">
                    <BookOpen className="mr-2 h-4 w-4" />
                    <span>User Guide</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/ambassador-training">
                  <div className="flex items-center w-full">
                    <GraduationCap className="mr-2 h-4 w-4" />
                    <span>Ambassador Program</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="md:hidden rounded"
                data-testid="mobile-menu-button"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <div className="flex flex-col gap-6 mt-10">
                {navItems.map(item => (
                  <Link 
                    key={item.path} 
                    href={item.path}
                    onClick={handleMobileNavClick}
                    className={`text-lg font-medium transition-colors flex items-center ${item.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    data-testid={`mobile-nav-${item.path.substring(1)}`}
                  >
                    {item.icon}
                    {item.name}
                  </Link>
                ))}
                <Link 
                  href="/profile"
                  onClick={handleMobileNavClick}
                  className={`text-lg font-medium transition-colors flex items-center ${location === '/profile' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  data-testid="mobile-nav-profile"
                >
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </Link>
                <Link 
                  href="/vedd-wallet"
                  onClick={handleMobileNavClick}
                  className={`text-lg font-medium transition-colors flex items-center ${location === '/vedd-wallet' ? 'text-purple-500' : 'text-purple-400 hover:text-purple-300'}`}
                  data-testid="mobile-nav-vedd-wallet"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  VEDD Wallet
                </Link>
                <div className="border-t border-gray-700 my-2 pt-2">
                  <Link 
                    href="/user-guide"
                    onClick={handleMobileNavClick}
                    className={`text-lg font-medium transition-colors flex items-center ${location === '/user-guide' ? 'text-blue-500' : 'text-blue-400 hover:text-blue-300'}`}
                    data-testid="mobile-nav-user-guide"
                  >
                    <BookOpen className="h-4 w-4 mr-2" />
                    User Guide
                  </Link>
                </div>
                <Link 
                  href="/ambassador-training"
                  onClick={handleMobileNavClick}
                  className={`text-lg font-medium transition-colors flex items-center ${location === '/ambassador-training' ? 'text-amber-500' : 'text-amber-400 hover:text-amber-300'}`}
                  data-testid="mobile-nav-ambassador"
                >
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Ambassador Program
                </Link>
                <button 
                  onClick={handleLogout}
                  className="text-lg font-medium transition-colors flex items-center text-muted-foreground hover:text-foreground text-left"
                  data-testid="mobile-nav-logout"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Log out
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
