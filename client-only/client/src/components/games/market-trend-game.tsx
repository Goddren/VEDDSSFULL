import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, RotateCcw, Timer, Trophy, Sparkles, CheckCircle2, XCircle, Share2 } from 'lucide-react';

interface CandleData {
  open: number;
  high: number;
  close: number;
  low: number;
  timestamp: number;
}

interface GameState {
  score: number;
  round: number;
  selectedPrediction: 'up' | 'down' | 'neutral' | null;
  timeRemaining: number;
  candles: CandleData[];
  hiddenCandles: CandleData[];
  correctPredictions: number;
  wrongPredictions: number;
  roundResult: 'correct' | 'wrong' | null;
  isGameActive: boolean;
  isRoundActive: boolean;
  gameMode: 'easy' | 'medium' | 'hard';
  streak: number;
  bestStreak: number;
  currency: string;
  showTutorial: boolean;
}

const GAME_MODES = {
  easy: { hiddenCandles: 3, timeLimit: 20, roundsToWin: 5 },
  medium: { hiddenCandles: 5, timeLimit: 15, roundsToWin: 7 },
  hard: { hiddenCandles: 7, timeLimit: 10, roundsToWin: 10 }
};

const CURRENCY_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 
  'USD/CAD', 'NZD/USD', 'USD/CHF', 'EUR/GBP'
];

export function MarketTrendGame() {
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    round: 0,
    selectedPrediction: null,
    timeRemaining: 0,
    candles: [],
    hiddenCandles: [],
    correctPredictions: 0,
    wrongPredictions: 0,
    roundResult: null,
    isGameActive: false,
    isRoundActive: false,
    gameMode: 'easy',
    streak: 0,
    bestStreak: 0,
    currency: CURRENCY_PAIRS[0],
    showTutorial: true
  });
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  
  // Clean up the timer when the component unmounts
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);
  
  // Generate random candle data for the game
  const generateCandleData = (count: number, startPrice: number = 100): CandleData[] => {
    const candles: CandleData[] = [];
    let currentPrice = startPrice;
    
    for (let i = 0; i < count; i++) {
      const volatility = Math.random() * 2; // Random volatility factor
      const change = (Math.random() - 0.5) * volatility; // Random price change, biased slightly upward
      const open = currentPrice;
      
      // Calculate high, low, and close with some randomness
      const close = open * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      
      candles.push({
        open,
        high,
        low,
        close,
        timestamp: Date.now() - (count - i) * 60000 // Each candle is 1 minute apart
      });
      
      currentPrice = close; // Next candle's open is this candle's close
    }
    
    return candles;
  };
  
  // Start a new game
  const startGame = (mode: 'easy' | 'medium' | 'hard') => {
    const initialCandles = generateCandleData(10); // 10 visible candles
    
    setGameState({
      ...gameState,
      score: 0,
      round: 1,
      selectedPrediction: null,
      timeRemaining: GAME_MODES[mode].timeLimit,
      candles: initialCandles,
      hiddenCandles: generateCandleData(GAME_MODES[mode].hiddenCandles, initialCandles[initialCandles.length - 1].close),
      correctPredictions: 0,
      wrongPredictions: 0,
      roundResult: null,
      isGameActive: true,
      isRoundActive: true,
      gameMode: mode,
      streak: 0,
      currency: CURRENCY_PAIRS[Math.floor(Math.random() * CURRENCY_PAIRS.length)],
      showTutorial: false
    });
    
    // Start the timer
    startTimer();
  };
  
  // Start the round timer
  const startTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    timerRef.current = setInterval(() => {
      setGameState(prevState => {
        if (prevState.timeRemaining <= 1) {
          clearInterval(timerRef.current!);
          return {
            ...prevState,
            timeRemaining: 0,
            isRoundActive: false,
            roundResult: 'wrong', // Time out counts as wrong
            wrongPredictions: prevState.wrongPredictions + 1,
            streak: 0
          };
        }
        return {
          ...prevState,
          timeRemaining: prevState.timeRemaining - 1
        };
      });
    }, 1000);
  };
  
  // Handle user prediction (up, down, or neutral)
  const handlePrediction = (prediction: 'up' | 'down' | 'neutral') => {
    // First, stop the timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    // Determine if the prediction is correct
    const lastVisibleCandle = gameState.candles[gameState.candles.length - 1];
    const firstHiddenCandle = gameState.hiddenCandles[0];
    const priceChange = firstHiddenCandle.close - lastVisibleCandle.close;
    
    let actualTrend: 'up' | 'down' | 'neutral';
    const changeThreshold = lastVisibleCandle.close * 0.0005; // 0.05% threshold for "neutral"
    
    if (Math.abs(priceChange) < changeThreshold) {
      actualTrend = 'neutral';
    } else if (priceChange > 0) {
      actualTrend = 'up';
    } else {
      actualTrend = 'down';
    }
    
    const isCorrect = prediction === actualTrend;
    const newStreak = isCorrect ? gameState.streak + 1 : 0;
    const newBestStreak = Math.max(newStreak, gameState.bestStreak);
    
    // Update the game state
    setGameState(prevState => ({
      ...prevState,
      selectedPrediction: prediction,
      isRoundActive: false,
      roundResult: isCorrect ? 'correct' : 'wrong',
      score: isCorrect ? prevState.score + calculatePoints(prevState.timeRemaining, prevState.gameMode, newStreak) : prevState.score,
      correctPredictions: isCorrect ? prevState.correctPredictions + 1 : prevState.correctPredictions,
      wrongPredictions: isCorrect ? prevState.wrongPredictions : prevState.wrongPredictions + 1,
      streak: newStreak,
      bestStreak: newBestStreak
    }));
    
    // Show toast notification
    toast({
      title: isCorrect ? "Correct Prediction!" : "Wrong Prediction",
      description: isCorrect 
        ? `The market went ${actualTrend}. You earned ${calculatePoints(gameState.timeRemaining, gameState.gameMode, newStreak)} points!` 
        : `The market went ${actualTrend}. Better luck next time!`,
      variant: isCorrect ? "default" : "destructive",
    });
    
    // If streak milestone reached, show special toast
    if (newStreak > 0 && newStreak % 3 === 0) {
      toast({
        title: "🔥 Streak Bonus!",
        description: `You're on fire with a ${newStreak} prediction streak!`,
        variant: "default",
      });
    }
  };
  
  // Calculate points based on time remaining and game mode
  const calculatePoints = (timeRemaining: number, mode: 'easy' | 'medium' | 'hard', streak: number) => {
    const basePoints = timeRemaining * (mode === 'easy' ? 10 : mode === 'medium' ? 20 : 30);
    const streakMultiplier = 1 + (streak * 0.1); // 10% bonus for each consecutive correct prediction
    return Math.round(basePoints * streakMultiplier);
  };
  
  // Start the next round
  const nextRound = () => {
    // Update game state for the next round
    const lastCandle = [...gameState.candles, ...gameState.hiddenCandles].pop()!;
    const newCandles = [...gameState.candles.slice(-5), ...gameState.hiddenCandles]; // Keep last 5 visible + previously hidden
    const newHiddenCandles = generateCandleData(GAME_MODES[gameState.gameMode].hiddenCandles, lastCandle.close);
    
    setGameState(prevState => ({
      ...prevState,
      round: prevState.round + 1,
      selectedPrediction: null,
      timeRemaining: GAME_MODES[prevState.gameMode].timeLimit,
      candles: newCandles,
      hiddenCandles: newHiddenCandles,
      roundResult: null,
      isRoundActive: true,
      currency: CURRENCY_PAIRS[Math.floor(Math.random() * CURRENCY_PAIRS.length)]
    }));
    
    // Start the timer
    startTimer();
  };
  
  // Restart the game (back to mode selection)
  const restartGame = () => {
    setGameState(prevState => ({
      ...prevState,
      score: 0,
      round: 0,
      selectedPrediction: null,
      timeRemaining: 0,
      candles: [],
      hiddenCandles: [],
      correctPredictions: 0,
      wrongPredictions: 0,
      roundResult: null,
      isGameActive: false,
      isRoundActive: false,
      streak: 0
    }));
  };
  
  // Share game results
  const shareResults = () => {
    const shareText = `📊 I scored ${gameState.score} points in the Market Trend Prediction Game! 
🎯 ${gameState.correctPredictions} correct predictions with a ${gameState.bestStreak} prediction streak!
🏆 Can you beat my score? #TradingMaster`;
    
    // Try to use the Web Share API if available
    if (navigator.share) {
      navigator.share({
        title: 'My Market Prediction Game Results',
        text: shareText,
      }).catch(err => {
        console.error('Error sharing:', err);
      });
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(shareText).then(() => {
        toast({
          title: "Results Copied!",
          description: "Your game results have been copied to clipboard. Share with your friends!",
        });
      });
    }
  };
  
  // Render chart (simplified for this demo)
  const renderCandleChart = () => {
    const visibleCandles = gameState.candles;
    const chartHeight = 200;
    const chartWidth = 350;
    
    if (!visibleCandles.length) return null;
    
    // Calculate the min and max prices to scale the chart
    const allPrices = visibleCandles.flatMap(c => [c.high, c.low]);
    const minPrice = Math.min(...allPrices) * 0.998;
    const maxPrice = Math.max(...allPrices) * 1.002;
    const priceRange = maxPrice - minPrice;
    
    // Calculate candle width based on number of candles
    const candleWidth = (chartWidth - 20) / visibleCandles.length;
    const scaleFactor = chartHeight / priceRange;
    
    return (
      <div className="relative h-[200px] w-full bg-gradient-to-b from-background to-gray-800/10 rounded-lg border overflow-hidden">
        {/* Price axis */}
        <div className="absolute top-0 right-0 bottom-0 w-12 flex flex-col justify-between p-1 text-xs text-muted-foreground">
          <div>{maxPrice.toFixed(2)}</div>
          <div>{((maxPrice + minPrice) / 2).toFixed(2)}</div>
          <div>{minPrice.toFixed(2)}</div>
        </div>
        
        {/* Candles */}
        <svg width={chartWidth} height={chartHeight} className="overflow-visible">
          {visibleCandles.map((candle, i) => {
            const x = 10 + i * candleWidth;
            const candleHeight = Math.abs(candle.open - candle.close) * scaleFactor;
            const yOpen = chartHeight - (candle.open - minPrice) * scaleFactor;
            const yClose = chartHeight - (candle.close - minPrice) * scaleFactor;
            const yTop = Math.min(yOpen, yClose);
            const fillColor = candle.close >= candle.open ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
            
            return (
              <g key={i}>
                {/* Wick (high to low) */}
                <line 
                  x1={x + candleWidth / 2} 
                  y1={chartHeight - (candle.high - minPrice) * scaleFactor}
                  x2={x + candleWidth / 2}
                  y2={chartHeight - (candle.low - minPrice) * scaleFactor}
                  stroke={fillColor}
                  strokeWidth={1}
                />
                
                {/* Body (open to close) */}
                <rect
                  x={x + candleWidth * 0.2}
                  y={yTop}
                  width={candleWidth * 0.6}
                  height={Math.max(1, candleHeight)}
                  fill={fillColor}
                />
              </g>
            );
          })}
          
          {/* Hidden candles area */}
          {gameState.isRoundActive && (
            <rect
              x={10 + visibleCandles.length * candleWidth}
              y={0}
              width={chartWidth - (10 + visibleCandles.length * candleWidth)}
              height={chartHeight}
              fill="url(#hiddenPattern)"
              fillOpacity={0.3}
            />
          )}
          
          {/* Revealed hidden candles after prediction */}
          {!gameState.isRoundActive && gameState.hiddenCandles.length > 0 && gameState.hiddenCandles.slice(0, 1).map((candle, i) => {
            const x = 10 + (visibleCandles.length + i) * candleWidth;
            const candleHeight = Math.abs(candle.open - candle.close) * scaleFactor;
            const yOpen = chartHeight - (candle.open - minPrice) * scaleFactor;
            const yClose = chartHeight - (candle.close - minPrice) * scaleFactor;
            const yTop = Math.min(yOpen, yClose);
            const fillColor = candle.close >= candle.open ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
            
            return (
              <g key={`hidden-${i}`}>
                <motion.line 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  x1={x + candleWidth / 2} 
                  y1={chartHeight - (candle.high - minPrice) * scaleFactor}
                  x2={x + candleWidth / 2}
                  y2={chartHeight - (candle.low - minPrice) * scaleFactor}
                  stroke={fillColor}
                  strokeWidth={1}
                />
                
                <motion.rect
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  x={x + candleWidth * 0.2}
                  y={yTop}
                  width={candleWidth * 0.6}
                  height={Math.max(1, candleHeight)}
                  fill={fillColor}
                />
              </g>
            );
          })}
          
          {/* Pattern definitions */}
          <defs>
            <pattern id="hiddenPattern" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
            </pattern>
          </defs>
        </svg>
        
        {/* Question mark for hidden part */}
        {gameState.isRoundActive && (
          <div className="absolute right-16 top-1/2 transform -translate-y-1/2">
            <motion.div 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-3xl font-bold text-primary/60"
            >
              ?
            </motion.div>
          </div>
        )}
        
        {/* Result indicator */}
        {gameState.roundResult && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className={cn(
              "absolute right-16 top-1/2 transform -translate-y-1/2 rounded-full p-2",
              gameState.roundResult === "correct" ? "bg-green-500/20" : "bg-red-500/20"
            )}
          >
            {gameState.roundResult === "correct" ? (
              <CheckCircle2 className="text-green-500 h-8 w-8" />
            ) : (
              <XCircle className="text-red-500 h-8 w-8" />
            )}
          </motion.div>
        )}
      </div>
    );
  };
  
  // Game completion check
  const isGameComplete = () => {
    return (
      gameState.isGameActive && 
      !gameState.isRoundActive && 
      gameState.round >= GAME_MODES[gameState.gameMode].roundsToWin
    );
  };
  
  // Render game tutorial
  const renderTutorial = () => (
    <div className="space-y-4 p-2">
      <h3 className="font-medium text-lg text-center">How to Play</h3>
      
      <div className="flex items-start gap-2">
        <div className="bg-primary/20 rounded-full p-1 mt-0.5">
          <ChevronRight className="h-4 w-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">
          You'll see a chart showing recent price movements for a currency pair.
        </p>
      </div>
      
      <div className="flex items-start gap-2">
        <div className="bg-primary/20 rounded-full p-1 mt-0.5">
          <ChevronRight className="h-4 w-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">
          Your task is to predict whether the price will go <span className="text-green-500">up</span>, <span className="text-red-500">down</span>, or remain <span className="text-blue-500">neutral</span> in the next candle.
        </p>
      </div>
      
      <div className="flex items-start gap-2">
        <div className="bg-primary/20 rounded-full p-1 mt-0.5">
          <ChevronRight className="h-4 w-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">
          The faster you answer, the more points you'll earn. Consecutive correct answers build a streak for bonus points!
        </p>
      </div>
      
      <div className="grid grid-cols-3 gap-2 mt-6">
        <Button 
          onClick={() => startGame('easy')} 
          className="bg-green-600 hover:bg-green-700"
        >
          Easy Mode
        </Button>
        <Button 
          onClick={() => startGame('medium')} 
          className="bg-amber-600 hover:bg-amber-700"
        >
          Medium Mode
        </Button>
        <Button 
          onClick={() => startGame('hard')} 
          className="bg-red-600 hover:bg-red-700"
        >
          Hard Mode
        </Button>
      </div>
    </div>
  );
  
  // Render game content based on state
  return (
    <Card className="w-full max-w-2xl mx-auto border-gray-800">
      <CardHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Sparkles className="h-5 w-5 mr-2 text-yellow-400" />
            <CardTitle>Market Trend Prediction Game</CardTitle>
          </div>
          {gameState.isGameActive && (
            <Badge variant="outline" className="bg-gray-800 text-white border-gray-700">
              <Timer className="h-3 w-3 mr-1" />
              {gameState.timeRemaining}s
            </Badge>
          )}
        </div>
        
        <CardDescription className="text-gray-300">
          Test your trading skills by predicting market movements
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        {!gameState.isGameActive && gameState.showTutorial && renderTutorial()}
        
        {gameState.isGameActive && (
          <>
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Round</div>
                <div className="text-xl font-semibold">
                  {gameState.round} / {GAME_MODES[gameState.gameMode].roundsToWin}
                </div>
              </div>
              
              <div className="space-y-1 text-center">
                <div className="text-sm text-muted-foreground">Currency Pair</div>
                <div className="text-lg font-medium">{gameState.currency}</div>
              </div>
              
              <div className="space-y-1 text-right">
                <div className="text-sm text-muted-foreground">Score</div>
                <div className="text-xl font-semibold">{gameState.score}</div>
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Time Remaining</span>
                <span>{gameState.timeRemaining}s</span>
              </div>
              <Progress value={(gameState.timeRemaining / GAME_MODES[gameState.gameMode].timeLimit) * 100} />
            </div>
            
            {/* Chart area */}
            <div className="py-2">
              {renderCandleChart()}
            </div>
            
            {/* Prediction buttons */}
            {gameState.isRoundActive ? (
              <div className="grid grid-cols-3 gap-3">
                <Button 
                  variant="outline" 
                  className="border-green-500 hover:bg-green-500/20 hover:text-green-500 flex flex-col py-4"
                  onClick={() => handlePrediction('up')}
                >
                  <TrendingUp className="h-5 w-5 text-green-500 mb-1" />
                  <span>Up</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="border-blue-500 hover:bg-blue-500/20 hover:text-blue-500 flex flex-col py-4"
                  onClick={() => handlePrediction('neutral')}
                >
                  <Minus className="h-5 w-5 text-blue-500 mb-1" />
                  <span>Neutral</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="border-red-500 hover:bg-red-500/20 hover:text-red-500 flex flex-col py-4"
                  onClick={() => handlePrediction('down')}
                >
                  <TrendingDown className="h-5 w-5 text-red-500 mb-1" />
                  <span>Down</span>
                </Button>
              </div>
            ) : (
              <div className="flex justify-center">
                {isGameComplete() ? (
                  <Button 
                    onClick={restartGame}
                    className="bg-primary hover:bg-primary/90 flex items-center"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Play Again
                  </Button>
                ) : (
                  <Button 
                    onClick={nextRound}
                    className="bg-primary hover:bg-primary/90 flex items-center"
                  >
                    <ChevronRight className="mr-2 h-4 w-4" />
                    Next Round
                  </Button>
                )}
              </div>
            )}
            
            {/* Game stats */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-green-500/10 p-2">
                <div className="text-xs text-muted-foreground mb-1">Correct</div>
                <div className="text-green-500 font-medium">{gameState.correctPredictions}</div>
              </div>
              
              <div className="rounded-md bg-primary/10 p-2">
                <div className="text-xs text-muted-foreground mb-1">Streak</div>
                <div className="text-primary font-medium">
                  {gameState.streak > 0 && '🔥'} {gameState.streak}
                </div>
              </div>
              
              <div className="rounded-md bg-red-500/10 p-2">
                <div className="text-xs text-muted-foreground mb-1">Wrong</div>
                <div className="text-red-500 font-medium">{gameState.wrongPredictions}</div>
              </div>
            </div>
          </>
        )}
        
        {/* Game completed screen */}
        {isGameComplete() && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 rounded-lg bg-gradient-to-r from-indigo-500/20 to-purple-500/20 p-4 border border-indigo-500/30"
          >
            <div className="text-center space-y-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, 15, -15, 0] }}
                transition={{ duration: 0.7 }}
                className="mx-auto rounded-full bg-indigo-500/20 p-3 w-fit"
              >
                <Trophy className="h-8 w-8 text-yellow-400" />
              </motion.div>
              
              <h3 className="text-xl font-semibold">Game Completed!</h3>
              
              <div className="font-bold text-3xl text-primary/90">
                {gameState.score} Points
              </div>
              
              <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
                <div className="rounded-md bg-blue-500/10 p-2">
                  <div className="text-xs text-muted-foreground mb-1">Accuracy</div>
                  <div className="text-blue-500 font-medium">
                    {Math.round((gameState.correctPredictions / (gameState.correctPredictions + gameState.wrongPredictions)) * 100)}%
                  </div>
                </div>
                
                <div className="rounded-md bg-yellow-500/10 p-2">
                  <div className="text-xs text-muted-foreground mb-1">Best Streak</div>
                  <div className="text-yellow-500 font-medium">
                    {gameState.bestStreak > 0 && '🔥'} {gameState.bestStreak}
                  </div>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                className="border-primary/30 hover:bg-primary/20 mt-2 flex items-center mx-auto"
                onClick={shareResults}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share Results
              </Button>
            </div>
          </motion.div>
        )}
      </CardContent>
      
      <CardFooter className="bg-gray-900/30 border-t border-gray-800 px-4 py-3 flex justify-between">
        {gameState.isGameActive ? (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={restartGame}
            className="text-muted-foreground hover:text-white"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Restart
          </Button>
        ) : (
          <div className="text-xs text-muted-foreground italic">
            "Practice makes perfect prediction"
          </div>
        )}
        
        <div className="flex space-x-2">
          <Badge variant="secondary" className="bg-gray-800 border-gray-700">
            {gameState.gameMode === 'easy' ? 'Easy' : gameState.gameMode === 'medium' ? 'Medium' : 'Hard'}
          </Badge>
        </div>
      </CardFooter>
    </Card>
  );
}