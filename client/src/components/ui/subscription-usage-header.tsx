import React from 'react';
import { UsageBar } from '@/components/ui/usage-bar';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, Crown, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Define the subscription types
interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  price: number;
  featuresIncluded: string[];
  analysisLimit: number;
  socialShareLimit: number;
}

interface UserSubscription {
  planId: number;
  planName: string;
  status: 'active' | 'canceled' | 'none';
  currentPeriodEnd?: string;
  stripeSubscriptionId?: string;
  monthlyAnalysisCount: number;
  monthlySocialShareCount: number;
  analysisLimit: number;
  socialShareLimit: number;
}

interface SubscriptionUsageHeaderProps {
  compact?: boolean;
}

export function SubscriptionUsageHeader({ compact = false }: SubscriptionUsageHeaderProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  // Fetch the user's subscription data
  const { data: subscription, isLoading: isLoadingSubscription } = useQuery<UserSubscription>({
    queryKey: ['/api/subscription'],
  });
  
  // Fetch subscription plans for tier comparison
  const { data: plans, isLoading: isLoadingPlans } = useQuery<SubscriptionPlan[]>({
    queryKey: ['/api/subscription/plans'],
  });
  
  if (isLoadingSubscription || isLoadingPlans || !subscription) {
    return null;
  }
  
  const { 
    planName, 
    planId, 
    status, 
    monthlyAnalysisCount = 0,
    monthlySocialShareCount = 0,
    analysisLimit = 3,
    socialShareLimit = 1,
    currentPeriodEnd,
  } = subscription;
  
  const currentPlan = plans?.find((p) => p.id === planId);
  const nextTier = plans?.find((p) => p.id > planId);
  
  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };
  
  const analysisPercent = Math.round((monthlyAnalysisCount / analysisLimit) * 100);
  const isLow = analysisPercent >= 80;
  
  if (compact) {
    return (
      <div className="flex items-center gap-3 ml-auto">
        <Link href="/subscription" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
            <Crown className="w-3 h-3" />
            <span className="font-medium hidden sm:inline">{planName}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className={isLow ? 'text-amber-500' : ''}>{monthlyAnalysisCount}/{analysisLimit}</span>
            <span className="hidden md:inline">analyses</span>
          </div>
        </Link>
        {(status === 'none' || planId === 1) && (
          <Link href="/subscription">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
              Upgrade
            </Button>
          </Link>
        )}
      </div>
    );
  }
  
  if (status === 'none' || planId === 1) {
    return (
      <div className="bg-gray-900/60 backdrop-blur-sm border-b border-gray-800 py-1.5">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-4 w-full">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <UsageBar 
                current={monthlyAnalysisCount} 
                limit={analysisLimit} 
                type="analysis" 
                planName={planName}
                compact={true} 
              />
              <UsageBar 
                current={monthlySocialShareCount} 
                limit={socialShareLimit} 
                type="social" 
                planName={planName}
                compact={true} 
              />
            </div>
            <Link href="/subscription">
              <Button size="sm" variant="outline" className="bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20">
                Upgrade <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-900/60 backdrop-blur-sm border-b border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-1.5">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-1 px-2 py-1">
                  <Crown className="h-4 w-4 text-amber-500" />
                  <span className="font-medium">{planName} Plan</span>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Subscription</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="flex items-center gap-2" disabled>
                  <Crown className="h-4 w-4 text-amber-500" />
                  <span>{planName}</span>
                  <span className="ml-auto text-muted-foreground text-sm">
                    {currentPlan && formatPrice(currentPlan.price)}/mo
                  </span>
                </DropdownMenuItem>
                
                {nextTier && (
                  <Link href="/subscription">
                    <DropdownMenuItem className="flex items-center gap-2 cursor-pointer">
                      <Crown className="h-4 w-4 text-gray-400" />
                      <span>Upgrade to {nextTier.name}</span>
                      <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    </DropdownMenuItem>
                  </Link>
                )}
                
                <DropdownMenuSeparator />
                <Link href="/profile">
                  <DropdownMenuItem className="cursor-pointer">
                    Manage Subscription
                  </DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Only show warning for nearly expired */}
            {currentPeriodEnd && new Date(currentPeriodEnd).getTime() - Date.now() < 5 * 24 * 60 * 60 * 1000 && (
              <div className="flex items-center text-amber-500 text-xs gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Expires soon</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="py-3 flex gap-4 items-center">
            <div className="flex-1 space-y-2">
              <UsageBar 
                current={monthlyAnalysisCount} 
                limit={analysisLimit} 
                type="analysis" 
                planName={planName}
              />
              <UsageBar 
                current={monthlySocialShareCount} 
                limit={socialShareLimit} 
                type="social"
                planName={planName}
              />
            </div>
            <Link href="/subscription">
              <Button size="sm" variant="outline" className="whitespace-nowrap">
                Manage Plan
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}