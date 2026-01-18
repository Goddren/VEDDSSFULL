import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HelpCircle, 
  TrendingUp, 
  Target, 
  Shield, 
  BarChart2, 
  Clock,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ConfidenceExplainerProps {
  confidence: string;
  confidencePercent?: number;
  compact?: boolean;
}

const confidenceFactors = [
  { 
    name: 'Pattern Confluence', 
    description: 'Multiple chart patterns appearing together increase confidence',
    icon: TrendingUp,
    example: 'Double bottom + bullish engulfing = stronger signal'
  },
  { 
    name: 'Indicator Agreement', 
    description: 'RSI, MACD, and moving averages pointing the same direction',
    icon: Target,
    example: 'All indicators bullish = higher confidence'
  },
  { 
    name: 'Support/Resistance', 
    description: 'Entry points near strong S/R levels with good risk-reward',
    icon: Shield,
    example: 'Entry at key support = more reliable'
  },
  { 
    name: 'Volume Confirmation', 
    description: 'Breakouts with high volume are more reliable signals',
    icon: BarChart2,
    example: 'High volume breakout = stronger conviction'
  },
  { 
    name: 'Timeframe Agreement', 
    description: '60%+ of timeframes agreeing adds a +10% confidence boost',
    icon: Clock,
    example: 'M15, H1, H4 all bullish = confidence boost'
  }
];

const confidenceLevels = [
  { level: 'Low', range: '40-55%', color: 'text-red-400', bgColor: 'bg-red-500/20', description: 'Single signal, weak confirmation' },
  { level: 'Medium', range: '56-74%', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', description: 'Some confluence, moderate setup' },
  { level: 'High', range: '75-95%', color: 'text-green-400', bgColor: 'bg-green-500/20', description: 'Strong confluence, multiple confirmations' }
];

export function ConfidenceExplainer({ confidence, confidencePercent, compact = false }: ConfidenceExplainerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const currentLevel = confidenceLevels.find(l => l.level.toLowerCase() === confidence?.toLowerCase()) || confidenceLevels[1];
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsExpanded(!isExpanded);
    }
  };

  if (compact) {
    return (
      <div 
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={handleKeyDown}
        className="cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className={`font-medium ${currentLevel.color}`}>
            {confidence} {confidencePercent ? `(${confidencePercent}%)` : ''}
          </span>
          <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-300" />
        </div>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2"
            >
              <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-3 text-xs space-y-2">
                <p className="text-gray-300">
                  <strong className={currentLevel.color}>{confidence}</strong> confidence means {currentLevel.description.toLowerCase()}.
                </p>
                <div className="flex flex-wrap gap-1">
                  {confidenceFactors.slice(0, 3).map((factor) => (
                    <Badge key={factor.name} variant="outline" className="text-xs bg-gray-800">
                      {factor.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/60 border border-gray-700 rounded-xl overflow-hidden">
      <div 
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={handleKeyDown}
        className="p-4 cursor-pointer hover:bg-gray-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/50"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${currentLevel.bgColor}`}>
              {confidence?.toLowerCase() === 'high' ? (
                <CheckCircle2 className={`w-5 h-5 ${currentLevel.color}`} />
              ) : confidence?.toLowerCase() === 'low' ? (
                <AlertTriangle className={`w-5 h-5 ${currentLevel.color}`} />
              ) : (
                <Target className={`w-5 h-5 ${currentLevel.color}`} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">AI Confidence:</span>
                <span className={`font-bold ${currentLevel.color}`}>
                  {confidence} {confidencePercent ? `(${confidencePercent}%)` : ''}
                </span>
              </div>
              <p className="text-sm text-gray-400">{currentLevel.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              How is this calculated?
            </Badge>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="px-4 pb-4 space-y-4 border-t border-gray-700/50 pt-4">
              <div>
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  5 Factors That Determine Confidence
                </h4>
                <div className="grid gap-2">
                  {confidenceFactors.map((factor) => (
                    <div 
                      key={factor.name}
                      className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded bg-gray-700/50">
                          <factor.icon className="w-4 h-4 text-green-400" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-white text-sm">{factor.name}</p>
                          <p className="text-xs text-gray-400">{factor.description}</p>
                          <p className="text-xs text-green-400/80 mt-1 italic">e.g., {factor.example}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Confidence Levels</h4>
                <div className="grid grid-cols-3 gap-2">
                  {confidenceLevels.map((level) => (
                    <div 
                      key={level.level}
                      className={`rounded-lg p-2 text-center ${level.bgColor} border ${
                        level.level.toLowerCase() === confidence?.toLowerCase() 
                          ? 'border-white/30 ring-1 ring-white/20' 
                          : 'border-transparent'
                      }`}
                    >
                      <p className={`font-bold ${level.color}`}>{level.level}</p>
                      <p className="text-xs text-gray-300">{level.range}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-xs text-amber-200">
                  <strong>Important:</strong> Confidence measures signal quality, NOT profit probability. 
                  Even high-confidence setups require proper risk management. Always use stop-losses!
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ConfidenceExplainer;
