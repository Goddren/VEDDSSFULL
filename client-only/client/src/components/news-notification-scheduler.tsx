import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getNewsForSymbol, registerNewsNotifications } from '@/lib/news-service';
import { NewsEvent } from '@/components/ui/news-alert';

// This component handles scheduling and triggering of news notifications
// It can be placed in App.tsx or any other component that's consistently mounted
export function NewsNotificationScheduler() {
  const { toast } = useToast();
  const [subscribedSymbols, setSubscribedSymbols] = useState<string[]>([]);
  
  // Check localStorage on mount for any saved symbols to track
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tradingAnalysisNotificationSymbols');
      if (saved) {
        const symbols = JSON.parse(saved);
        if (Array.isArray(symbols)) {
          setSubscribedSymbols(symbols);
        }
      }
    } catch (err) {
      console.error('Error loading notification preferences:', err);
    }
  }, []);

  // Subscribe or unsubscribe to notifications for a symbol
  function toggleSymbolNotifications(symbol: string, subscribe: boolean) {
    let updated: string[];
    
    if (subscribe) {
      // Add the symbol only if it doesn't already exist
      updated = subscribedSymbols.includes(symbol) ? 
        [...subscribedSymbols] : [...subscribedSymbols, symbol];
    } else {
      updated = subscribedSymbols.filter(s => s !== symbol);
    }
    
    setSubscribedSymbols(updated);
    
    // Save to localStorage
    try {
      localStorage.setItem('tradingAnalysisNotificationSymbols', JSON.stringify(updated));
    } catch (err) {
      console.error('Error saving notification preferences:', err);
    }
  }
  
  // Handle notification display
  const handleNewsNotification = (newsEvent: NewsEvent) => {
    toast({
      title: `${newsEvent.impact.toUpperCase()} Impact Event: ${newsEvent.currency}`,
      description: `${newsEvent.title} - ${new Date(newsEvent.dateTime).toLocaleString()}`,
      variant: "default",
    });
  };

  // Set up news notification timers for all subscribed symbols
  useEffect(() => {
    if (subscribedSymbols.length === 0) return;
    
    // Cleanup functions for each symbol's notifications
    const cleanupFunctions: (() => void)[] = [];
    
    subscribedSymbols.forEach(symbol => {
      const news = getNewsForSymbol(symbol);
      
      // Only schedule notifications for future events
      const futureNews = news.filter(event => {
        const eventTime = new Date(event.dateTime);
        return eventTime > new Date();
      });
      
      // Register for notifications
      if (futureNews.length > 0) {
        const cleanup = registerNewsNotifications(futureNews, handleNewsNotification);
        cleanupFunctions.push(cleanup);
      }
    });
    
    // Cleanup on unmount or when symbols change
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [subscribedSymbols, toast]);
  
  // This component doesn't render anything visible
  return null;
}

// Helper hook to use outside of the component
export function useNewsNotifications() {
  const [subscribedSymbols, setSubscribedSymbols] = useState<string[]>([]);
  
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tradingAnalysisNotificationSymbols');
      if (saved) {
        const symbols = JSON.parse(saved);
        if (Array.isArray(symbols)) {
          setSubscribedSymbols(symbols);
        }
      }
    } catch (err) {
      console.error('Error loading notification preferences:', err);
    }
  }, []);
  
  function subscribeToSymbol(symbol: string) {
    // Add the symbol only if it doesn't already exist
    const updated = subscribedSymbols.includes(symbol) ? 
      [...subscribedSymbols] : [...subscribedSymbols, symbol];
    setSubscribedSymbols(updated);
    localStorage.setItem('tradingAnalysisNotificationSymbols', JSON.stringify(updated));
    return updated;
  }
  
  function unsubscribeFromSymbol(symbol: string) {
    const updated = subscribedSymbols.filter(s => s !== symbol);
    setSubscribedSymbols(updated);
    localStorage.setItem('tradingAnalysisNotificationSymbols', JSON.stringify(updated));
    return updated;
  }
  
  function isSubscribed(symbol: string) {
    return subscribedSymbols.includes(symbol);
  }
  
  return {
    subscribedSymbols,
    subscribeToSymbol,
    unsubscribeFromSymbol,
    isSubscribed
  };
}