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
import { Menu, Bell, User, LogOut, Settings, History, LineChart, CreditCard, Award, Users, Newspaper, Wand2, Clock } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const Header: React.FC = () => {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', active: location === '/dashboard', icon: <Settings className="h-4 w-4 mr-2" /> },
    { name: 'Analysis', path: '/analysis', active: location === '/analysis', icon: <LineChart className="h-4 w-4 mr-2" /> },
    { name: 'Multi-TF EA', path: '/multi-timeframe', active: location === '/multi-timeframe', icon: <Clock className="h-4 w-4 mr-2" /> },
    { name: 'Historical', path: '/historical', active: location === '/historical', icon: <History className="h-4 w-4 mr-2" /> },
    { name: 'Strategy Wizard', path: '/strategy-wizard', active: location === '/strategy-wizard', icon: <Wand2 className="h-4 w-4 mr-2" /> },
    { name: 'Community', path: '/community', active: location === '/community', icon: <Users className="h-4 w-4 mr-2" /> },
    { name: 'Blog', path: '/blog', active: location === '/blog', icon: <Newspaper className="h-4 w-4 mr-2" /> },
    { name: 'Achievements', path: '/achievements', active: location === '/achievements', icon: <Award className="h-4 w-4 mr-2" /> },
    { name: 'Pricing', path: '/subscription', active: location === '/subscription', icon: <CreditCard className="h-4 w-4 mr-2" /> },
  ];

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
        
        <div className="hidden md:flex space-x-8">
          {navItems.map(item => (
            <Link 
              key={item.path} 
              href={item.path}
              className={`transition-colors flex items-center ${item.active ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {item.name}
            </Link>
          ))}
        </div>
        
        <div className="flex items-center space-x-4">
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
                <Link href="/achievements">
                  <div className="flex items-center w-full">
                    <Award className="mr-2 h-4 w-4" />
                    <span>Achievements</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              {/* Social Hub removed as requested */}

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
