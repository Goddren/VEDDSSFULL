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

export function SubscriptionUsageHeader() {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  // Fetch the user's subscription data
  const { data: subscription, isLoading: isLoadingSubscription } = useQuery({
    queryKey: ['/api/subscription'],
  });
  
  // Fetch subscription plans for tier comparison
  const { data: plans, isLoading: isLoadingPlans } = useQuery({
    queryKey: ['/api/subscription/plans'],
  });
  
  if (isLoadingSubscription || isLoadingPlans || !subscription) {
    return null; // Don't show anything while loading
  }
  
  const { 
    planName, 
    planId, 
    status, 
    monthlyAnalysisCount = 0,
    monthlySocialShareCount = 0,
    analysisLimit = 3,
    socialShareLimit = 1,
  } = subscription;
  
  // Get current plan and next tier if available
  const currentPlan = plans?.find((p: any) => p.id === planId);
  const nextTier = plans?.find((p: any) => p.id > planId);
  
  // Format the price from cents to dollars
  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };
  
  if (status === 'none' || planId === 1) {
    // For free plan users, always show the compact view with upgrade button
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
            {subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd).getTime() - Date.now() < 5 * 24 * 60 * 60 * 1000 && (
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