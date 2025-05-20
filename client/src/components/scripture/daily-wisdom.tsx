import { motion } from "framer-motion";
import { getDailyScripture } from "@/data/scripture-wisdom";
import { Book, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";

export function DailyWisdom() {
  const [scripture, setScripture] = useState(getDailyScripture());
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show scripture after a short delay
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div 
      className="max-w-md mx-auto text-center bg-gradient-to-r from-indigo-900/70 via-purple-900/70 to-indigo-900/70 rounded-lg p-6 shadow-lg border border-indigo-500/30"
      initial={{ opacity: 0, y: 20 }}
      animate={{ 
        opacity: isVisible ? 1 : 0, 
        y: isVisible ? 0 : 20
      }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-center mb-3">
        <Book className="h-5 w-5 mr-2 text-indigo-300" />
        <h3 className="text-lg font-semibold text-indigo-200">Daily Scripture</h3>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <p className="text-white/90 italic mb-2">"{scripture.verse}"</p>
        <p className="text-indigo-300 text-sm mb-4">— {scripture.reference}</p>
      </motion.div>

      <motion.div
        className="mt-4 pt-4 border-t border-indigo-500/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <div className="flex items-center justify-center mb-2">
          <Sparkles className="h-4 w-4 mr-2 text-amber-300" />
          <h4 className="text-sm font-medium text-amber-200">Trading Wisdom</h4>
        </div>
        <p className="text-white/80 text-sm">{scripture.tradingWisdom}</p>
      </motion.div>
    </motion.div>
  );
}