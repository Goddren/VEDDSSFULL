import React from "react";
import { useLocation, Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SimpleInsight } from "@/components/tooltips";

export default function SimpleTooltipShowcase() {
  const [, setLocation] = useLocation();
  
  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="flex items-center">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="mr-4"
        >
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 via-amber-500 to-orange-500 bg-clip-text text-transparent">
            Simple AI Insight Tooltips
          </h1>
          <p className="text-gray-400 mt-1">
            Simplified tooltips that provide contextual information for market data and insights
          </p>
        </div>
      </div>

      <Card className="bg-black/40 border-gray-800">
        <CardHeader>
          <CardTitle>Simple Market Tooltips</CardTitle>
          <CardDescription>
            Basic tooltips for market analysis insights
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-4">
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Bullish Trend</span>
              <SimpleInsight
                type="bullish"
                title="Bullish Market"
                description="Price is in an uptrend with higher highs and higher lows. Consider buy opportunities."
              >
                <span className="px-3 py-1 bg-green-500/20 text-green-500 rounded-full">Bullish</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Bearish Trend</span>
              <SimpleInsight
                type="bearish"
                title="Bearish Market"
                description="Price is in a downtrend with lower highs and lower lows. Consider sell opportunities."
              >
                <span className="px-3 py-1 bg-red-500/20 text-red-500 rounded-full">Bearish</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Neutral Market</span>
              <SimpleInsight
                type="neutral"
                title="Neutral Market"
                description="Price is moving sideways with no clear directional bias. Wait for clearer signals."
              >
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded-full">Neutral</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Volatile Market</span>
              <SimpleInsight
                type="volatile"
                title="Volatile Market"
                description="Price is showing high volatility with erratic movements. Use wider stops."
              >
                <span className="px-3 py-1 bg-purple-500/20 text-purple-500 rounded-full">Volatile</span>
              </SimpleInsight>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}