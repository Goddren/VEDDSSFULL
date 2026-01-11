import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, ChevronRight } from "lucide-react";

interface InteractiveFeatureCardProps {
  icon: React.ReactNode;
  title: string;
  shortDescription: string;
  fullDescription: string;
  demoContent?: React.ReactNode;
  color: string;
  accentColor: string;
}

export function InteractiveFeatureCard({
  icon,
  title,
  shortDescription,
  fullDescription,
  demoContent,
  color,
  accentColor,
}: InteractiveFeatureCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      <motion.div
        layoutId={`card-${title}`}
        onClick={() => setIsExpanded(true)}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        className={`relative cursor-pointer overflow-hidden rounded-2xl ${color} border border-gray-200 dark:border-gray-700 p-6 shadow-lg transition-shadow hover:shadow-xl`}
        whileHover={{ scale: 1.03, y: -5 }}
        whileTap={{ scale: 0.98 }}
      >
        <motion.div
          className={`absolute inset-0 ${accentColor} opacity-0`}
          animate={{ opacity: isHovered ? 0.1 : 0 }}
        />

        <div className="relative z-10">
          <motion.div
            className={`inline-flex p-3 rounded-xl ${accentColor} bg-opacity-20 mb-4`}
            animate={{ rotate: isHovered ? [0, -5, 5, 0] : 0 }}
            transition={{ duration: 0.5 }}
          >
            {icon}
          </motion.div>

          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            {title}
          </h3>

          <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
            {shortDescription}
          </p>

          <motion.div
            className="flex items-center text-sm font-medium"
            style={{ color: accentColor.replace("bg-", "").includes("red") ? "#ef4444" : 
                           accentColor.includes("blue") ? "#3b82f6" :
                           accentColor.includes("green") ? "#22c55e" :
                           accentColor.includes("purple") ? "#a855f7" :
                           accentColor.includes("amber") ? "#f59e0b" :
                           accentColor.includes("cyan") ? "#06b6d4" : "#ef4444" }}
            animate={{ x: isHovered ? 5 : 0 }}
          >
            <span>Explore Feature</span>
            <ChevronRight className="h-4 w-4 ml-1" />
          </motion.div>
        </div>

        <motion.div
          className="absolute -bottom-2 -right-2 w-24 h-24 rounded-full opacity-10"
          style={{ background: `radial-gradient(circle, ${accentColor.replace("bg-", "")} 0%, transparent 70%)` }}
          animate={{
            scale: isHovered ? [1, 1.2, 1] : 1,
          }}
          transition={{ duration: 1, repeat: isHovered ? Infinity : 0 }}
        />
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setIsExpanded(false)}
            />

            <motion.div
              layoutId={`card-${title}`}
              className="fixed inset-4 md:inset-10 lg:inset-20 z-50 overflow-hidden rounded-3xl bg-white dark:bg-gray-900 shadow-2xl"
            >
              <div className="h-full flex flex-col">
                <div className={`relative ${color} p-6 md:p-8`}>
                  <button
                    onClick={() => setIsExpanded(false)}
                    className="absolute top-4 right-4 p-2 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
                  >
                    <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  </button>

                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className={`inline-flex p-4 rounded-2xl ${accentColor} bg-opacity-20 mb-4`}
                  >
                    <div className="scale-150">{icon}</div>
                  </motion.div>

                  <motion.h2
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white"
                  >
                    {title}
                  </motion.h2>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-8">
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      How It Works
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
                      {fullDescription}
                    </p>

                    {demoContent && (
                      <div className="mt-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                          <Play className="h-5 w-5" />
                          Interactive Demo
                        </h3>
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
                          {demoContent}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

interface FeatureCardGridProps {
  features: Array<{
    icon: React.ReactNode;
    title: string;
    shortDescription: string;
    fullDescription: string;
    demoContent?: React.ReactNode;
    color: string;
    accentColor: string;
  }>;
}

export function FeatureCardGrid({ features }: FeatureCardGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {features.map((feature, index) => (
        <motion.div
          key={feature.title}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: index * 0.1 }}
        >
          <InteractiveFeatureCard {...feature} />
        </motion.div>
      ))}
    </div>
  );
}
