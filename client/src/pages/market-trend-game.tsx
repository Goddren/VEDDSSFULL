import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarketTrendGame } from "@/components/games/market-trend-game";
import { ChevronLeft, GamepadIcon } from "lucide-react";

export default function MarketTrendGamePage() {
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
            Market Trend Prediction Game
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Test your trading skills by predicting where the market will go next. Earn points, build streaks, and sharpen your market intuition.
          </p>
        </div>
        
        <MarketTrendGame />
        
        <div className="grid md:grid-cols-3 gap-4 mt-4">
          <Card className="p-4 bg-gradient-to-br from-green-500/5 to-emerald-500/5 border-green-200/20">
            <div className="flex items-start gap-3">
              <div className="bg-green-500/10 p-2 rounded-lg">
                <GamepadIcon className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Train Your Intuition</h3>
                <p className="text-sm text-muted-foreground">
                  Develop your market sense by making rapid predictions based on real chart patterns.
                </p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-blue-500/5 to-sky-500/5 border-blue-200/20">
            <div className="flex items-start gap-3">
              <div className="bg-blue-500/10 p-2 rounded-lg">
                <GamepadIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Multiple Difficulty Levels</h3>
                <p className="text-sm text-muted-foreground">
                  Challenge yourself with three difficulty modes that test your prediction speed and accuracy.
                </p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-purple-500/5 to-violet-500/5 border-purple-200/20">
            <div className="flex items-start gap-3">
              <div className="bg-purple-500/10 p-2 rounded-lg">
                <GamepadIcon className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Track Your Progress</h3>
                <p className="text-sm text-muted-foreground">
                  Build prediction streaks and compete for high scores. Share your results with friends.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}