import { useState, useEffect } from 'react';
import { Sun, Moon, Sunrise, Sunset, Cloud } from 'lucide-react';
import { Button } from './button';
import { motion, AnimatePresence } from 'framer-motion';

export type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // Check for saved theme preference in localStorage
    const savedTheme = localStorage.getItem('veddTheme') as Theme | null;
    
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
      // Default to light theme if no preference
      setTheme('light');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    
    // Save theme preference to localStorage
    localStorage.setItem('veddTheme', newTheme);
    
    // Toggle dark class on document root
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={toggleTheme} 
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      className="relative rounded-full w-10 h-10 transition-all overflow-hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === 'light' ? (
          <motion.div 
            key="sun" 
            initial={{ y: 20, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }} 
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="relative">
              <Sun className="h-5 w-5 text-yellow-500" />
              <motion.div 
                className="absolute -top-4 -right-4"
                animate={{ 
                  x: [0, 10, 0],
                  opacity: [1, 0.7, 1] 
                }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 6,
                  repeatType: "reverse" 
                }}
              >
                <Cloud className="h-3 w-3 text-gray-400" />
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="moon" 
            initial={{ y: 20, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }} 
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="relative">
              <Moon className="h-5 w-5 text-blue-300" />
              <motion.div 
                className="absolute -top-3 -right-3"
                animate={{ 
                  opacity: [0.3, 0.7, 0.3] 
                }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 3,
                  repeatType: "reverse" 
                }}
              >
                <div className="h-1 w-1 bg-white rounded-full" />
              </motion.div>
              <motion.div 
                className="absolute -bottom-3 left-0"
                animate={{ 
                  opacity: [0.5, 0.9, 0.5] 
                }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 4,
                  repeatType: "reverse" 
                }}
              >
                <div className="h-1 w-1 bg-white rounded-full" />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  );
}