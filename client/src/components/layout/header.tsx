import React from 'react';
import { Link, useLocation } from 'wouter';
import VeddLogo from '@/components/ui/vedd-logo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, Bell } from 'lucide-react';

const Header: React.FC = () => {
  const [location] = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', active: location === '/dashboard' },
    { name: 'Analysis', path: '/analysis', active: location === '/analysis' },
    { name: 'Historical', path: '/historical', active: location === '/historical' },
    { name: 'Settings', path: '/settings', active: location === '/settings' }
  ];

  return (
    <header className="w-full bg-[#0A0A0A] py-4 px-4 md:px-8 shadow-lg">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center">
          <Link href="/">
            <a className="flex items-center">
              <VeddLogo height={40} />
              <span className="ml-2 text-xl font-bold tracking-tight">VEDD</span>
            </a>
          </Link>
        </div>
        
        <div className="hidden md:flex space-x-8">
          {navItems.map(item => (
            <Link key={item.path} href={item.path}>
              <a className={`transition-colors ${item.active ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                {item.name}
              </a>
            </Link>
          ))}
        </div>
        
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" className="rounded-full bg-[#333333] hover:bg-[#1E1E1E] border-none">
            <Bell className="h-5 w-5 text-gray-300" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-8 w-8 bg-[#E64A4A] cursor-pointer">
                <AvatarFallback>US</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Subscription</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden rounded bg-[#333333] hover:bg-[#1E1E1E] border-none">
                <Menu className="h-5 w-5 text-gray-300" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-[#0A0A0A] border-[#333333]">
              <div className="flex flex-col gap-6 mt-10">
                {navItems.map(item => (
                  <Link key={item.path} href={item.path}>
                    <a className={`text-lg font-medium transition-colors ${item.active ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                      {item.name}
                    </a>
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
