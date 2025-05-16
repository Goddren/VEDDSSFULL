import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AnalysisState } from '@shared/types';
import { Check, Loader2, BarChart2, AlertTriangle } from 'lucide-react';

interface AnalysisStatusNotificationProps {
  state: AnalysisState;
  progress: number;
}

const AnalysisStatusNotification: React.FC<AnalysisStatusNotificationProps> = ({ 
  state, 
  progress 
}) => {
  // Auto-hide notification after completion
  const [visible, setVisible] = React.useState(true);
  
  useEffect(() => {
    // Reset visibility when state changes
    setVisible(true);
    
    // Auto-hide after completion with delay
    if (state === AnalysisState.COMPLETE) {
      const timer = setTimeout(() => {
        setVisible(false);
      }, 3000); // Hide after 3 seconds
      
      return () => clearTimeout(timer);
    }
  }, [state]);
  
  // Don't render in initial state
  if (state === AnalysisState.INITIAL) return null;
  
  // Determine content based on state
  const getContent = () => {
    switch (state) {
      case AnalysisState.UPLOADING:
        return {
          icon: <Loader2 className="h-5 w-5 animate-spin text-primary" />,
          title: 'Uploading Chart',
          message: 'Uploading and preparing your chart for analysis...',
          color: 'bg-blue-500/10 border-blue-500/20',
          progressColor: 'bg-blue-500'
        };
      
      case AnalysisState.ANALYZING:
        return {
          icon: <BarChart2 className="h-5 w-5 text-primary animate-pulse" />,
          title: 'Analyzing Chart',
          message: `AI is analyzing your chart (${Math.round(progress)}%)...`,
          color: 'bg-primary/10 border-primary/20',
          progressColor: 'bg-primary'
        };
      
      case AnalysisState.COMPLETE:
        return {
          icon: <Check className="h-5 w-5 text-green-500" />,
          title: 'Analysis Complete',
          message: 'Your chart has been analyzed successfully!',
          color: 'bg-green-500/10 border-green-500/20',
          progressColor: 'bg-green-500'
        };
      
      case AnalysisState.ERROR:
        return {
          icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
          title: 'Analysis Failed',
          message: 'There was an error analyzing your chart.',
          color: 'bg-red-500/10 border-red-500/20',
          progressColor: 'bg-red-500'
        };
      
      default:
        return null;
    }
  };
  
  const content = getContent();
  if (!content) return null;
  
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`fixed top-5 right-5 z-50 w-72 border rounded-lg shadow-lg ${content.color}`}
        >
          <div className="p-4">
            <div className="flex items-center mb-3">
              {content.icon}
              <h3 className="font-medium ml-2">{content.title}</h3>
              <button 
                onClick={() => setVisible(false)}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {content.message}
            </p>
            
            {state === AnalysisState.ANALYZING && (
              <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                <motion.div 
                  className={`h-full ${content.progressColor}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnalysisStatusNotification;