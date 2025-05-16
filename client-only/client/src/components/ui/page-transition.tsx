import { motion, AnimatePresence } from "framer-motion";
import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const [location] = useLocation();
  const [key, setKey] = useState(location);
  
  useEffect(() => {
    // Update the key only when navigating to a dashboard route or from it
    const isDashboard = location.includes('/dashboard') || 
                        location.includes('/analysis') || 
                        location.includes('/profile') ||
                        location.includes('/home');
    const isAuth = location === '/auth';
    const isLanding = location === '/';
    
    // Only apply transition for auth to dashboard or dashboard to auth transitions
    if ((isDashboard && (key === '/auth' || key === '/')) || 
        ((isAuth || isLanding) && key.includes('/dashboard'))) {
      setKey(location);
    }
  }, [location, key]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ 
          type: "spring", 
          stiffness: 250, 
          damping: 25,
          duration: 0.3 
        }}
        className="w-full h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}