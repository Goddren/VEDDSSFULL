import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

type Plan = {
  id: number;
  name: string;
  description: string;
  price: number;
  interval: string;
  features: string[];
  analysisLimit: number;
  socialShareLimit: number;
  isActive: boolean;
};

type Subscription = {
  planId: number;
  planName: string;
  status: string;
  currentPeriodEnd?: Date;
  monthlyAnalysisCount: number;
  monthlySocialShareCount: number;
  analysisLimit: number;
  socialShareLimit: number;
};

export default function SubscriptionPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      setLocation('/auth');
    }
  }, [user, setLocation]);

  // Fetch subscription plans
  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ['/api/subscription/plans'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscription/plans');
      return response.json();
    },
  });

  // Fetch current subscription
  const { data: subscription, isLoading: subscriptionLoading } = useQuery<Subscription>({
    queryKey: ['/api/subscription'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscription');
      return response.json();
    },
    enabled: !!user,
  });

  // Format price for display
  const formatPrice = (price: number): string => {
    if (price === 0) return 'Free';
    return `$${(price / 100).toFixed(2)}`;
  };

  // Handle subscription
  const handleSubscribe = async (planId: number) => {
    try {
      setIsLoading(true);
      setSelectedPlanId(planId);

      // Check if already subscribed to this plan
      if (subscription?.planId === planId) {
        toast({
          title: 'Already Subscribed',
          description: `You are already subscribed to the ${subscription.planName} plan.`,
          variant: 'default',
        });
        setIsLoading(false);
        return;
      }

      // Create subscription
      const response = await apiRequest('POST', '/api/subscription/subscribe', { planId });
      const result = await response.json();

      if (result.clientSecret) {
        // For paid plans, redirect to Stripe checkout
        toast({
          title: 'Redirecting to Payment',
          description: 'Please complete your payment to activate your subscription.',
          variant: 'default',
        });
        // In a real application, we would use Stripe Elements here
        // For now, we'll just show a success message
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        // For free plan
        toast({
          title: 'Subscription Updated',
          description: `You are now subscribed to the ${plans?.find(p => p.id === planId)?.name} plan.`,
          variant: 'default',
        });
        window.location.reload();
      }
    } catch (error) {
      console.error('Error subscribing:', error);
      toast({
        title: 'Subscription Failed',
        description: error instanceof Error ? error.message : 'An error occurred while processing your subscription.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setSelectedPlanId(null);
    }
  };

  // Handle cancel subscription
  const handleCancelSubscription = async () => {
    try {
      setIsLoading(true);
      
      // Free plan doesn't need cancellation
      if (subscription?.planId === 1) {
        toast({
          title: 'Cannot Cancel Free Plan',
          description: 'You are on the Free plan which cannot be cancelled.',
          variant: 'default',
        });
        setIsLoading(false);
        return;
      }

      // Cancel subscription
      const response = await apiRequest('POST', '/api/subscription/cancel');
      const result = await response.json();

      toast({
        title: 'Subscription Cancelled',
        description: 'Your subscription has been cancelled. You will still have access until the end of your billing period.',
        variant: 'default',
      });
      
      // Reload to show updated subscription status
      window.location.reload();
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      toast({
        title: 'Cancellation Failed',
        description: error instanceof Error ? error.message : 'An error occurred while cancelling your subscription.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (plansLoading || subscriptionLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted/20">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <h2 className="mt-4 text-xl font-semibold">Loading Subscription Plans...</h2>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4 max-w-6xl">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold tracking-tight">Subscription Plans</h1>
        <p className="mt-4 text-xl text-muted-foreground">
          Choose the perfect plan to enhance your trading analytics experience
        </p>
      </div>

      {subscription && (
        <div className="mb-8">
          <Alert className="bg-card border-primary/20">
            <AlertCircle className="h-5 w-5 text-primary" />
            <AlertTitle className="text-primary font-medium">Current Subscription</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col space-y-2 mt-2">
                <div>
                  You are currently on the <span className="font-semibold">{subscription.planName}</span> plan.
                  {subscription.status === 'active' && subscription.currentPeriodEnd && (
                    <span className="ml-2">
                      Your subscription will renew on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div className="flex items-center space-x-2">
                    <div className="text-sm font-medium">Chart Analysis Usage:</div>
                    <div className="text-sm">
                      {subscription.monthlyAnalysisCount} / {subscription.analysisLimit} 
                      {subscription.analysisLimit > 999 ? ' (Unlimited)' : ''}
                    </div>
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ 
                          width: `${Math.min(100, (subscription.monthlyAnalysisCount / subscription.analysisLimit) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="text-sm font-medium">Social Sharing Usage:</div>
                    <div className="text-sm">
                      {subscription.monthlySocialShareCount} / {subscription.socialShareLimit}
                      {subscription.socialShareLimit > 999 ? ' (Unlimited)' : ''}
                    </div>
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ 
                          width: `${Math.min(100, (subscription.monthlySocialShareCount / subscription.socialShareLimit) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans?.map((plan) => (
          <Card key={plan.id} className={`relative overflow-hidden transition-all duration-300 ${
            subscription?.planId === plan.id 
              ? 'border-primary shadow-lg' 
              : 'hover:shadow-md hover:border-primary/50'
          }`}>
            {subscription?.planId === plan.id && (
              <div className="absolute top-0 right-0">
                <Badge className="m-2 bg-primary hover:bg-primary">Current Plan</Badge>
              </div>
            )}
            <CardHeader>
              <CardTitle className="flex justify-between items-start">
                <span>{plan.name}</span>
                <span className="text-2xl font-bold">{formatPrice(plan.price)}</span>
              </CardTitle>
              <CardDescription>{plan.interval === 'month' ? 'per month' : plan.interval}</CardDescription>
            </CardHeader>
            <CardContent className="min-h-[200px]">
              <div className="text-sm mb-4">{plan.description}</div>
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <Check className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
                <li className="flex items-start">
                  <Check className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
                  <span className="text-sm">
                    <strong>{plan.analysisLimit > 999 ? 'Unlimited' : plan.analysisLimit}</strong> chart analyses per month
                  </span>
                </li>
                <li className="flex items-start">
                  <Check className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
                  <span className="text-sm">
                    <strong>{plan.socialShareLimit > 999 ? 'Unlimited' : plan.socialShareLimit}</strong> social shares per month
                  </span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              {subscription?.planId === plan.id ? (
                subscription.planId !== 1 ? (
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={handleCancelSubscription}
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Cancel Subscription
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    Current Plan
                  </Button>
                )
              ) : (
                <Button 
                  variant="default" 
                  className="w-full" 
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isLoading || selectedPlanId === plan.id}
                >
                  {isLoading && selectedPlanId === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {plan.price === 0 ? 'Select Free Plan' : 'Subscribe'}
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Feature Comparison Table */}
      <div className="mt-16">
        <h2 className="text-3xl font-bold tracking-tight text-center mb-2">Feature Comparison</h2>
        <p className="text-center text-muted-foreground mb-8">See what's included in each subscription tier</p>
        
        <div className="overflow-x-auto rounded-lg border border-border shadow-lg">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-primary/10 to-primary/5">
                <th className="px-6 py-5 text-left font-medium text-muted-foreground">
                  <span className="text-base">Feature</span>
                </th>
                {plans?.map((plan) => (
                  <th key={plan.id} className={`px-6 py-5 text-center ${subscription?.planId === plan.id ? 'bg-primary/15' : ''}`}>
                    <span className="text-lg font-bold">{plan.name}</span>
                    <div className="text-base font-medium mt-1">
                      {formatPrice(plan.price)}
                      <span className="text-xs text-muted-foreground">/month</span>
                    </div>
                    {subscription?.planId === plan.id && 
                      <Badge className="mt-2 bg-primary hover:bg-primary">Current Plan</Badge>
                    }
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* Group 1: Basic Features */}
              <tr className="bg-muted/30">
                <td colSpan={plans?.length ? plans.length + 1 : 4} className="px-6 py-3 text-sm font-bold">
                  Core Trading Features
                </td>
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Chart Analyses per Month</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    <span className="font-semibold">{plan.analysisLimit > 999 ? 'Unlimited' : plan.analysisLimit}</span>
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Social Shares per Month</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    <span className="font-semibold">{plan.socialShareLimit > 999 ? 'Unlimited' : plan.socialShareLimit}</span>
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Pattern Recognition</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 1 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Entry & Exit Points</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 1 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Support & Resistance Levels</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 1 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>

              {/* Group 2: Standard Features */}
              <tr className="bg-muted/30">
                <td colSpan={plans?.length ? plans.length + 1 : 4} className="px-6 py-3 text-sm font-bold">
                  Advanced Features
                </td>
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">AI Trading Tip Generator</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Christian Market Wisdom</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Social Trading Features</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 2 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>

              {/* Group 3: Premium Features */}
              <tr className="bg-muted/30">
                <td colSpan={plans?.length ? plans.length + 1 : 4} className="px-6 py-3 text-sm font-bold">
                  Premium Features
                </td>
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Advanced Pattern Analysis</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 3 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">Priority Customer Support</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 3 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 text-sm font-medium">API Access</td>
                {plans?.map((plan) => (
                  <td key={plan.id} className={`px-6 py-4 text-center ${subscription?.planId === plan.id ? 'bg-primary/5' : ''}`}>
                    {plan.id >= 3 ? 
                      <div className="flex items-center justify-center">
                        <div className="p-1 rounded-full bg-primary/10">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      </div> : 
                      <span className="text-muted-foreground">-</span>
                    }
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>All subscriptions are automatically renewed monthly. You can cancel at any time.</p>
        <p className="mt-2">
          Need help? <a href="/contact" className="text-primary hover:underline">Contact support</a>
        </p>
      </div>
    </div>
  );
}