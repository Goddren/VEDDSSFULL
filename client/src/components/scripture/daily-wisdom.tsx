import { motion, AnimatePresence } from "framer-motion";
import { getDailyScripture, getRandomScripture, getScriptureIndex } from "@/data/scripture-wisdom";
import { Book, Sparkles, RefreshCw } from "lucide-react";
import { useState } from "react";

export function DailyWisdom() {
  const [scripture, setScripture] = useState(getDailyScripture);
  const [key, setKey] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    const currentIndex = getScriptureIndex(scripture);
    const next = getRandomScripture(currentIndex);
    setTimeout(() => {
      setScripture(next);
      setKey(k => k + 1);
      setSpinning(false);
    }, 300);
  };

  return (
    <div className="max-w-md w-full mx-auto text-center bg-gradient-to-r from-indigo-900/70 via-purple-900/70 to-indigo-900/70 rounded-xl p-4 sm:p-6 shadow-lg border border-indigo-500/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Book className="h-5 w-5 text-indigo-300" />
          <h3 className="text-lg font-semibold text-indigo-200">Daily Scripture</h3>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg px-2.5 py-1.5 transition-all"
          title="Show a different scripture"
        >
          <RefreshCw className={`h-3 w-3 ${spinning ? 'animate-spin' : ''}`} />
          New
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-white/90 italic mb-2 text-sm sm:text-base">"{scripture.verse}"</p>
          <p className="text-indigo-300 text-xs sm:text-sm mb-4">— {scripture.reference}</p>

          <div className="mt-4 pt-4 border-t border-indigo-500/30">
            <div className="flex items-center justify-center mb-2">
              <Sparkles className="h-4 w-4 mr-2 text-amber-300" />
              <h4 className="text-sm font-medium text-amber-200">Trading Wisdom</h4>
            </div>
            <p className="text-white/80 text-xs sm:text-sm">{scripture.tradingWisdom}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
