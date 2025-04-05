import React from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface PricingPlan {
  name: string;
  price: string;
  description: string;
  features: Array<{
    text: string;
    included: boolean;
  }>;
  buttonText: string;
  popular?: boolean;
}

const pricingPlans: PricingPlan[] = [
  {
    name: "Basic",
    price: "$9.99",
    description: "Essential chart analysis for beginning traders",
    features: [
      { text: "10 chart analyses per month", included: true },
      { text: "Basic pattern recognition", included: true },
      { text: "Support & resistance levels", included: true },
      { text: "Entry & exit points", included: true },
      { text: "Historical analysis storage (7 days)", included: true },
      { text: "Advanced indicator analysis", included: false },
      { text: "Priority support", included: false },
      { text: "Custom timeframe analysis", included: false },
    ],
    buttonText: "Get Started",
  },
  {
    name: "Pro",
    price: "$19.99",
    description: "Advanced analysis for serious traders",
    features: [
      { text: "30 chart analyses per month", included: true },
      { text: "Advanced pattern recognition", included: true },
      { text: "Support & resistance levels", included: true },
      { text: "Entry & exit points", included: true },
      { text: "Historical analysis storage (30 days)", included: true },
      { text: "Advanced indicator analysis", included: true },
      { text: "Priority support", included: false },
      { text: "Custom timeframe analysis", included: true },
    ],
    buttonText: "Upgrade to Pro",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "$39.99",
    description: "Complete solution for professional traders",
    features: [
      { text: "Unlimited chart analyses", included: true },
      { text: "Advanced pattern recognition", included: true },
      { text: "Support & resistance levels", included: true },
      { text: "Entry & exit points", included: true },
      { text: "Unlimited historical analysis storage", included: true },
      { text: "Advanced indicator analysis", included: true },
      { text: "Priority support", included: true },
      { text: "Custom timeframe analysis", included: true },
    ],
    buttonText: "Contact Sales",
  },
];

export default function SubscriptionPage() {
  const { user } = useAuth();

  return (
    <div className="container max-w-6xl py-10">
      <div className="mx-auto mb-10 max-w-md text-center">
        <h1 className="text-3xl font-bold">Choose Your Trading Plan</h1>
        <p className="mt-4 text-muted-foreground">
          Select the perfect plan to elevate your trading analysis and decision making
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {pricingPlans.map((plan) => (
          <Card
            key={plan.name}
            className={cn(
              "flex flex-col",
              plan.popular && "border-primary shadow-lg"
            )}
          >
            {plan.popular && (
              <div className="absolute right-0 top-0">
                <div className="rounded-bl-lg rounded-tr-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Most Popular
                </div>
              </div>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <div className="flex items-baseline">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="ml-1 text-muted-foreground">/month</span>
              </div>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center">
                    {feature.included ? (
                      <>
                        <Check className="mr-2 h-4 w-4 text-primary" />
                        <span>{feature.text}</span>
                      </>
                    ) : (
                      <>
                        <X className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{feature.text}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className={cn("w-full", plan.popular ? "" : "bg-muted hover:bg-muted/80")}
                variant={plan.popular ? "default" : "outline"}
              >
                {plan.buttonText}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-10 text-center">
        <p className="text-muted-foreground">
          All plans include our core AI-powered chart analysis technology
        </p>
        {!user && (
          <Button asChild className="mt-4">
            <Link href="/auth">Sign up to get started</Link>
          </Button>
        )}
      </div>
    </div>
  );
}