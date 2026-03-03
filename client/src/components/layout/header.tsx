import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import VeddLogo from '@/components/ui/vedd-logo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Menu, Bell, User, LogOut, Settings, History, LineChart, CreditCard,
  Award, Users, Newspaper, Wand2, Clock, Briefcase, Zap, HelpCircle,
  BookOpen, GraduationCap, FileText, Lightbulb, ChevronDown, MoreHorizontal,
  BarChart3, Webhook, Wallet, Scan, Coins, KeyRound, Rocket, Brain, Shirt,
  Radio, Star, CheckCircle2, AlertTriangle, Loader2, ExternalLink
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const AI_PROVIDERS = [
  { id: 'openai',    name: 'OpenAI',      placeholder: 'sk-...',       icon: '🤖' },
  { id: 'anthropic', name: 'Anthropic',   placeholder: 'sk-ant-...',   icon: '🧠' },
  { id: 'google',    name: 'Google AI',   placeholder: 'AIza...',      icon: '💎' },
  { id: 'groq',      name: 'Groq',        placeholder: 'gsk_...',      icon: '⚡' },
];

interface UserApiKey {
  id: number;
  provider: string;
  hasKey: boolean;
  label: string | null;
  isActive: boolean;
  isValid: boolean;
  lastValidated: string | null;
  usageCount: number;
}

const Header: React.FC = () => {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // AI key quick-switch dialog state
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');

  // Query user's saved AI keys
  const { data: savedKeys = [] } = useQuery<UserApiKey[]>({
    queryKey: ['/api/user-api-keys'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  // Derived key status for the dot indicator
  const activeValidKey = savedKeys.find(k => k.isActive && k.isValid);
  const hasInvalidKey = savedKeys.some(k => !k.isValid && k.hasKey);
  const keyStatus: 'valid' | 'invalid' | 'none' =
    activeValidKey ? 'valid' : hasInvalidKey ? 'invalid' : 'none';

  const dotColor =
    keyStatus === 'valid'   ? 'bg-emerald-400' :
    keyStatus === 'invalid' ? 'bg-red-400' : '';

  const dotTitle =
    keyStatus === 'valid'   ? `Own AI key active (${activeValidKey?.provider})` :
    keyStatus === 'invalid' ? 'Key invalid — click to fix' :
    'No personal AI key — using platform key';

  // Save key mutation
  const saveKeyMutation = useMutation({
    mutationFn: async ({ provider, apiKey, label }: { provider: string; apiKey: string; label: string }) => {
      const res = await apiRequest('POST', '/api/user-api-keys', { provider, apiKey, label });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys'] });
      setNewKeyValue('');
      setNewKeyLabel('');
      toast({ title: 'Key Saved', description: 'Click Validate to confirm it works.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to save key', variant: 'destructive' });
    },
  });

  // Validate key mutation
  const validateMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await apiRequest('POST', '/api/user-api-keys/validate', { provider });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-api-keys'] });
      if (data.valid) {
        toast({ title: 'Key Valid', description: `${data.provider} key is working.` });
      } else {
        toast({ title: 'Key Invalid', description: `Check your ${data.provider} key.`, variant: 'destructive' });
      }
    },
    onError: (err: any) => {
      toast({ title: 'Validation Error', description: err.message, variant: 'destructive' });
    },
  });

  // Primary nav items shown directly in header
  const primaryNavItems = [
    { name: 'Dashboard', path: '/dashboard', active: location === '/dashboard', icon: <Settings className="h-4 w-4 mr-2" /> },
    { name: 'Analysis', path: '/analysis', active: location === '/analysis', icon: <LineChart className="h-4 w-4 mr-2" /> },
    { name: 'Multi-TF EA', path: '/multi-timeframe', active: location === '/multi-timeframe', icon: <Clock className="h-4 w-4 mr-2" /> },
    { name: 'My EAs', path: '/my-eas', active: location === '/my-eas', icon: <Briefcase className="h-4 w-4 mr-2" /> },
    { name: 'VEDD SS AI', path: '/weekly-strategy', active: location === '/weekly-strategy', icon: <Rocket className="h-4 w-4 mr-2" /> },
    { name: 'Marketplace', path: '/ea-marketplace', active: location === '/ea-marketplace', icon: <Zap className="h-4 w-4 mr-2" /> },
  ];

  // Secondary nav items shown in "More" dropdown
  const moreNavItems = [
    { name: 'Live Monitor', path: '/live-monitor', active: location === '/live-monitor', icon: <Radio className="h-4 w-4 mr-2" /> },
    { name: 'Solana Scanner', path: '/solana-scanner', active: location === '/solana-scanner', icon: <Scan className="h-4 w-4 mr-2" /> },
    { name: 'VEDD Tokenomics', path: '/vedd-tokenomics', active: location === '/vedd-tokenomics', icon: <Coins className="h-4 w-4 mr-2" /> },
    { name: 'VEDD Clothing', path: '/vedd-clothing', active: location === '/vedd-clothing', icon: <Shirt className="h-4 w-4 mr-2" /> },
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

  const navItems = [...primaryNavItems, ...moreNavItems];

  const getUserInitials = () => {
    if (!user) return '?';
    if (user.fullName) {
      return user.fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2);
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

  const providerInfo = AI_PROVIDERS.find(p => p.id === selectedProvider);
  const existingKey = savedKeys.find(k => k.provider === selectedProvider);

  return (
    <>
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

            {/* Avatar + AI key status dot */}
            <div className="flex items-center gap-1">
              {/* AI key status dot — separate click target */}
              {user && keyStatus !== 'none' && (
                <button
                  onClick={() => setKeyDialogOpen(true)}
                  title={dotTitle}
                  className="relative flex-shrink-0"
                >
                  <span className={`block w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-background animate-pulse`} />
                </button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="relative cursor-pointer">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.profileImage || ''} alt={user?.username || 'User'} />
                      <AvatarFallback className="bg-primary/10 text-primary">{getUserInitials()}</AvatarFallback>
                    </Avatar>
                    {/* Dot for "no key" state on the avatar itself */}
                    {user && keyStatus === 'none' && (
                      <span
                        title="No personal AI key — click avatar → AI API Keys to add one"
                        className="absolute bottom-0 right-0 block w-2.5 h-2.5 rounded-full bg-gray-400 ring-2 ring-background"
                      />
                    )}
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.fullName || user?.username}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {/* AI key status row inside dropdown */}
                  <div
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent rounded-sm text-sm"
                    onClick={() => setKeyDialogOpen(true)}
                  >
                    {keyStatus === 'valid' && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                    {keyStatus === 'invalid' && <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />}
                    {keyStatus === 'none' && <KeyRound className="h-4 w-4 text-gray-400 shrink-0" />}
                    <span className={`text-xs ${keyStatus === 'valid' ? 'text-emerald-400' : keyStatus === 'invalid' ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {keyStatus === 'valid' ? `${activeValidKey?.provider} key active` :
                       keyStatus === 'invalid' ? 'Key invalid — fix now' :
                       'Add your AI key'}
                    </span>
                  </div>
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
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/ai-api-keys">
                      <div className="flex items-center w-full">
                        <KeyRound className="mr-2 h-4 w-4" />
                        <span>AI API Keys</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href="/ai-trading-models">
                      <div className="flex items-center w-full">
                        <Brain className="mr-2 h-4 w-4" />
                        <span>AI Trading Models</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => { window.dispatchEvent(new CustomEvent('vedd:replay-tutorial')); }}
                  >
                    <Star className="mr-2 h-4 w-4" />
                    <span>Getting Started Tour</span>
                  </DropdownMenuItem>
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
            </div>

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
                  {/* Mobile AI key quick access */}
                  <button
                    onClick={() => { setMobileMenuOpen(false); setKeyDialogOpen(true); }}
                    className="text-lg font-medium transition-colors flex items-center text-left gap-2"
                  >
                    {keyStatus === 'valid' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    {keyStatus === 'invalid' && <AlertTriangle className="h-4 w-4 text-red-400" />}
                    {keyStatus === 'none' && <KeyRound className="h-4 w-4 text-muted-foreground" />}
                    <span className={keyStatus === 'valid' ? 'text-emerald-400' : keyStatus === 'invalid' ? 'text-red-400' : 'text-muted-foreground'}>
                      {keyStatus === 'valid' ? 'AI Key Active' : keyStatus === 'invalid' ? 'AI Key Invalid' : 'Add AI Key'}
                    </span>
                  </button>
                  <Link
                    href="/ai-api-keys"
                    onClick={handleMobileNavClick}
                    className={`text-lg font-medium transition-colors flex items-center ${location === '/ai-api-keys' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    data-testid="mobile-nav-ai-api-keys"
                  >
                    <KeyRound className="h-4 w-4 mr-2" />
                    AI API Keys
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

      {/* AI Key Quick-Switch Dialog */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              AI Key Manager
            </DialogTitle>
          </DialogHeader>

          {/* Current status summary */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            keyStatus === 'valid'   ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' :
            keyStatus === 'invalid' ? 'bg-red-500/10 border border-red-500/25 text-red-400' :
            'bg-muted border text-muted-foreground'
          }`}>
            {keyStatus === 'valid'   && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {keyStatus === 'invalid' && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {keyStatus === 'none'    && <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>
              {keyStatus === 'valid'
                ? `${activeValidKey?.provider} key is active and working`
                : keyStatus === 'invalid'
                ? 'Your key failed — paste a new one below'
                : 'No personal key — platform key in use'}
            </span>
          </div>

          {/* Saved keys list */}
          {savedKeys.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Saved Keys</p>
              {savedKeys.map(k => {
                const pInfo = AI_PROVIDERS.find(p => p.id === k.provider);
                return (
                  <div key={k.provider} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/50 text-sm">
                    <span className="flex items-center gap-1.5">
                      <span>{pInfo?.icon}</span>
                      <span className="font-medium capitalize">{k.provider}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {k.isValid
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        disabled={validateMutation.isPending}
                        onClick={() => validateMutation.mutate(k.provider)}
                      >
                        {validateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Test'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add / replace key form */}
          <div className="space-y-3 pt-1 border-t">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Add or Replace Key</p>
            <div className="space-y-1">
              <Label className="text-xs">Provider</Label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">API Key</Label>
              <Input
                type="password"
                placeholder={providerInfo?.placeholder || 'Paste your key...'}
                value={newKeyValue}
                onChange={e => setNewKeyValue(e.target.value)}
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label (optional)</Label>
              <Input
                placeholder="e.g. My personal key"
                value={newKeyLabel}
                onChange={e => setNewKeyLabel(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              disabled={!newKeyValue.trim() || saveKeyMutation.isPending}
              onClick={() => saveKeyMutation.mutate({ provider: selectedProvider, apiKey: newKeyValue.trim(), label: newKeyLabel.trim() })}
            >
              {saveKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Key
            </Button>
            {existingKey && (
              <Button
                variant="outline"
                className="flex-1"
                disabled={validateMutation.isPending}
                onClick={() => validateMutation.mutate(selectedProvider)}
              >
                {validateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Validate
              </Button>
            )}
          </DialogFooter>

          <div className="text-center">
            <Link href="/ai-api-keys" onClick={() => setKeyDialogOpen(false)}>
              <span className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 cursor-pointer">
                <ExternalLink className="h-3 w-3" />
                Manage all keys & switch AI model
              </span>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Header;
