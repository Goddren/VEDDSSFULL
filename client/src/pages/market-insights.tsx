import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarketInsightsDisplay } from "@/components/market-insights/market-insights-display";
import { ChevronLeft, Info, LightbulbIcon, BookOpen } from "lucide-react";

export default function MarketInsightsPage() {
  const [location, setLocation] = useLocation();
  
  return (
    <div className="container max-w-6xl py-8 px-4 mx-auto">
      {/* Back button */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setLocation('/dashboard')}
          className="flex items-center text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </Button>
      </div>
      
      <div className="flex flex-col gap-8">
        <div className="text-center mb-2">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Interactive AI Market Insights
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Gain powerful market understanding through interactive AI-powered insights with contextual animations and visualizations.
          </p>
        </div>
        
        <MarketInsightsDisplay />
        
        <div className="grid md:grid-cols-3 gap-4 mt-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-500/5 to-blue-500/5 border-indigo-200/20">
            <div className="flex items-start gap-3">
              <div className="bg-indigo-500/10 p-2 rounded-lg">
                <Info className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Contextual Animations</h3>
                <p className="text-sm text-muted-foreground">
                  Visualize market movements and patterns with intuitive animations that adapt to the insight type.
                </p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-purple-500/5 to-pink-500/5 border-purple-200/20">
            <div className="flex items-start gap-3">
              <div className="bg-purple-500/10 p-2 rounded-lg">
                <LightbulbIcon className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium mb-1">AI-Powered Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Get intelligent insights on patterns, trends, and key levels with confidence scoring and detailed explanations.
                </p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-200/20">
            <div className="flex items-start gap-3">
              <div className="bg-amber-500/10 p-2 rounded-lg">
                <BookOpen className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Educational Context</h3>
                <p className="text-sm text-muted-foreground">
                  Learn market concepts through interactive tooltips that explain patterns and indicators as you explore them.
                </p>
              </div>
            </div>
          </Card>
        </div>
        
        <div className="flex justify-center mt-6">
          <Button
            variant="outline"
            onClick={() => setLocation('/analysis')}
            className="gap-2"
          >
            Apply Insights to Your Analysis
          </Button>
        </div>
      </div>
    </div>
  );
}