import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Cloud, Star } from 'lucide-react';

type DayNightSceneProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

export function DayNightScene({ className = '', size = 'md' }: DayNightSceneProps) {
  const [isNight, setIsNight] = useState<boolean>(false);
  
  useEffect(() => {
    try {
      // Check if we're in dark mode
      const savedTheme = localStorage.getItem('veddTheme') as 'light' | 'dark' | null;
      setIsNight(savedTheme === 'dark');
      
      // Listen for theme changes
      const handleThemeChange = () => {
        try {
          const theme = localStorage.getItem('veddTheme');
          setIsNight(theme === 'dark');
        } catch (error) {
          console.error('Error handling theme change:', error);
        }
      };
      
      window.addEventListener('storage', handleThemeChange);
      
      // Also setup a mutation observer to detect class changes on the document
      const observer = new MutationObserver((mutations) => {
        try {
          for (const mutation of mutations) {
            if (mutation.attributeName === 'class') {
              setIsNight(document.documentElement.classList.contains('dark'));
              break;
            }
          }
        } catch (error) {
          console.error('Error in mutation observer:', error);
        }
      });
      
      if (typeof document !== 'undefined' && document.documentElement) {
        observer.observe(document.documentElement, { attributes: true });
      }
      
      return () => {
        window.removeEventListener('storage', handleThemeChange);
        if (observer) {
          observer.disconnect();
        }
      };
    } catch (error) {
      console.error('Error setting up theme detection:', error);
      return () => {};
    }
  }, []);
  
  // Determine dimensions based on size
  const getSize = () => {
    switch (size) {
      case 'sm': return 'h-24 w-24';
      case 'lg': return 'h-48 w-48';
      default: return 'h-32 w-32';
    }
  };
  
  // Create 5 random stars with different positions
  const stars = Array.from({ length: 8 }).map((_, i) => {
    const left = `${Math.random() * 100}%`;
    const top = `${Math.random() * 100}%`;
    const delay = Math.random() * 2;
    const size = Math.random() * 0.5 + 0.5; // Between 0.5 and 1
    
    return { left, top, delay, size, id: i };
  });

  return (
    <div className={`relative overflow-hidden rounded-full ${getSize()} ${className}`}>
      <motion.div 
        className="absolute inset-0 bg-gradient-to-b from-blue-300 to-blue-500"
        animate={{ 
          opacity: isNight ? 0 : 1 
        }}
        transition={{ duration: 1 }}
      >
        {/* Day time scene */}
        <motion.div
          className="absolute top-[20%] left-[25%]"
          animate={{
            x: isNight ? -100 : 0,
            opacity: isNight ? 0 : 1,
          }}
          transition={{ duration: 1.5 }}
        >
          <Sun className="text-yellow-400 h-8 w-8" />
        </motion.div>
        
        {/* Clouds */}
        <motion.div
          className="absolute top-[35%] left-[15%]"
          animate={{
            x: [0, 10, 0],
            opacity: isNight ? 0 : [0.7, 0.9, 0.7],
          }}
          transition={{ 
            repeat: Infinity, 
            duration: 15,
            repeatType: "reverse",
            opacity: { duration: 1 } 
          }}
        >
          <Cloud className="text-white h-5 w-5" />
        </motion.div>
        
        <motion.div
          className="absolute top-[25%] right-[20%]"
          animate={{
            x: [0, -15, 0],
            opacity: isNight ? 0 : [0.8, 1, 0.8],
          }}
          transition={{ 
            repeat: Infinity, 
            duration: 20,
            repeatType: "reverse",
            opacity: { duration: 1 } 
          }}
        >
          <Cloud className="text-white h-6 w-6" />
        </motion.div>
      </motion.div>
      
      {/* Night time scene */}
      <motion.div 
        className="absolute inset-0 bg-gradient-to-b from-blue-900 to-indigo-900"
        animate={{ 
          opacity: isNight ? 1 : 0 
        }}
        transition={{ duration: 1 }}
      >
        {/* Moon */}
        <motion.div
          className="absolute top-[20%] right-[25%]"
          animate={{
            x: isNight ? 0 : 100,
            opacity: isNight ? 1 : 0,
          }}
          transition={{ duration: 1.5 }}
        >
          <Moon className="text-gray-100 h-6 w-6" />
        </motion.div>
        
        {/* Stars */}
        {stars.map((star) => (
          <motion.div
            key={star.id}
            className="absolute"
            style={{ 
              left: star.left, 
              top: star.top 
            }}
            animate={{
              opacity: isNight ? [0.5, 1, 0.5] : 0,
              scale: isNight ? [star.size, star.size * 1.2, star.size] : 0,
            }}
            transition={{ 
              repeat: Infinity, 
              duration: 2 + star.delay,
              repeatType: "reverse",
              opacity: { duration: 0.8 } 
            }}
          >
            <div className="bg-white rounded-full h-1 w-1" />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}