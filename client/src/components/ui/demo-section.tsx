import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  AlertTriangle,
  BarChart2,
  Zap,
  CheckCircle,
  Play,
  RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function DemoSection() {
  const [demoStage, setDemoStage] = useState<"idle" | "uploading" | "analyzing" | "complete">("idle");
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);

  const simulateAnalysis = () => {
    setDemoStage("uploading");
    setTimeout(() => {
      setDemoStage("analyzing");
      setTimeout(() => {
        setDemoStage("complete");
        setSelectedPattern("Double Bottom");
      }, 2000);
    }, 1000);
  };

  const resetDemo = () => {
    setDemoStage("idle");
    setSelectedPattern(null);
  };

  const patterns = [
    { name: "Double Bottom", confidence: 87, signal: "bullish" },
    { name: "Support Zone", confidence: 92, signal: "bullish" },
    { name: "RSI Divergence", confidence: 78, signal: "bullish" },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8 md:p-12 border border-gray-700">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <div className="text-center mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 text-red-400 text-sm font-medium mb-4"
          >
            <Play className="h-4 w-4" />
            Interactive Demo
          </motion.div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Try It Yourself
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Experience how our AI analyzes trading charts in real-time. Click below to simulate an analysis.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="aspect-video rounded-2xl bg-gray-800/50 border border-gray-700 overflow-hidden relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  {demoStage === "idle" && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="text-center p-8"
                    >
                      <motion.div
                        className="mx-auto w-20 h-20 rounded-2xl bg-gray-700/50 border-2 border-dashed border-gray-600 flex items-center justify-center mb-4"
                        animate={{ borderColor: ["#4b5563", "#ef4444", "#4b5563"] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Upload className="h-8 w-8 text-gray-400" />
                      </motion.div>
                      <p className="text-gray-400 text-sm">
                        Click "Start Demo" to simulate chart upload
                      </p>
                    </motion.div>
                  )}

                  {demoStage === "uploading" && (
                    <motion.div
                      key="uploading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-center"
                    >
                      <motion.div
                        className="w-16 h-16 border-4 border-red-500/30 border-t-red-500 rounded-full mx-auto mb-4"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <p className="text-gray-300">Uploading chart...</p>
                    </motion.div>
                  )}

                  {demoStage === "analyzing" && (
                    <motion.div
                      key="analyzing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full relative"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900">
                        {[...Array(20)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="absolute w-1 bg-gradient-to-t from-transparent to-green-500/50"
                            style={{
                              left: `${5 + i * 4.5}%`,
                              height: `${30 + Math.random() * 40}%`,
                              bottom: "10%",
                            }}
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            transition={{ delay: i * 0.05 }}
                          />
                        ))}
                      </div>
                      <motion.div
                        className="absolute inset-0 border-2 border-red-500/50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ duration: 0.5, repeat: 3 }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                          className="px-4 py-2 rounded-lg bg-black/80 text-red-400 font-medium flex items-center gap-2"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        >
                          <Sparkles className="h-4 w-4" />
                          AI Analyzing...
                        </motion.div>
                      </div>
                    </motion.div>
                  )}

                  {demoStage === "complete" && (
                    <motion.div
                      key="complete"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="w-full h-full relative bg-gradient-to-br from-gray-800 to-gray-900"
                    >
                      {[...Array(20)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute w-1 bg-gradient-to-t from-transparent to-green-500/50"
                          style={{
                            left: `${5 + i * 4.5}%`,
                            height: `${30 + Math.sin(i * 0.5) * 20}%`,
                            bottom: "10%",
                          }}
                        />
                      ))}
                      <motion.div
                        className="absolute top-4 left-4 right-4 flex items-center justify-between"
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-sm font-medium">
                          <TrendingUp className="h-4 w-4" />
                          Bullish Signal
                        </div>
                        <div className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-sm font-medium">
                          87% Confidence
                        </div>
                      </motion.div>
                      <motion.div
                        className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2"
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        <div className="px-2 py-1 rounded bg-gray-700/80 text-xs text-gray-300 text-center">
                          Entry: 1.0850
                        </div>
                        <div className="px-2 py-1 rounded bg-gray-700/80 text-xs text-green-400 text-center">
                          TP: 1.0920
                        </div>
                        <div className="px-2 py-1 rounded bg-gray-700/80 text-xs text-red-400 text-center">
                          SL: 1.0810
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="mt-4 flex justify-center gap-4">
              {demoStage === "idle" ? (
                <Button
                  onClick={simulateAnalysis}
                  className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white px-8"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Demo
                </Button>
              ) : demoStage === "complete" ? (
                <Button
                  onClick={resetDemo}
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              ) : null}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-4"
          >
            <h3 className="text-xl font-bold text-white mb-6">
              {demoStage === "complete" ? "Analysis Results" : "What You'll Get"}
            </h3>

            {patterns.map((pattern, index) => (
              <motion.div
                key={pattern.name}
                initial={{ opacity: 0, x: 20 }}
                animate={{ 
                  opacity: demoStage === "complete" ? 1 : 0.5,
                  x: 0 
                }}
                transition={{ delay: demoStage === "complete" ? 0.3 + index * 0.1 : 0 }}
                className={`p-4 rounded-xl border transition-all ${
                  demoStage === "complete" 
                    ? "bg-gray-800/80 border-gray-600" 
                    : "bg-gray-800/30 border-gray-700/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      pattern.signal === "bullish" ? "bg-green-500/20" : "bg-red-500/20"
                    }`}>
                      {pattern.signal === "bullish" ? (
                        <TrendingUp className="h-4 w-4 text-green-400" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    <span className="font-medium text-white">{pattern.name}</span>
                  </div>
                  {demoStage === "complete" && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-1 text-green-400"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">{pattern.confidence}%</span>
                    </motion.div>
                  )}
                </div>
                {demoStage === "complete" && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pattern.confidence}%` }}
                    transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                    className="h-1.5 rounded-full bg-gradient-to-r from-green-500 to-green-400"
                  />
                )}
              </motion.div>
            ))}

            {demoStage === "complete" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 mt-6"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-400">AI Recommendation</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Strong bullish momentum detected. Consider long entry with tight stop loss at support level.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
