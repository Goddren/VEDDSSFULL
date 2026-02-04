import { useState, useEffect, useCallback } from 'react';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
    const savedSound = localStorage.getItem('soundEnabled');
    if (savedSound !== null) {
      setSoundEnabled(savedSound === 'true');
    }
  }, []);
  
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('Browser does not support notifications');
      return false;
    }
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (err) {
      console.error('Failed to request notification permission:', err);
      return false;
    }
  }, []);
  
  const playSound = useCallback((type: 'buy' | 'sell' | 'alert' | 'success' | 'error') => {
    if (!soundEnabled) return;
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      switch (type) {
        case 'buy':
          oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1);
          oscillator.frequency.setValueAtTime(1320, audioContext.currentTime + 0.2);
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.4);
          break;
        case 'sell':
          oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(550, audioContext.currentTime + 0.15);
          oscillator.frequency.setValueAtTime(440, audioContext.currentTime + 0.3);
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.4);
          break;
        case 'alert':
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
          oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
          oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.3);
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.5);
          break;
        case 'success':
          oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1);
          oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2);
          gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.35);
          break;
        case 'error':
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(150, audioContext.currentTime + 0.2);
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
          break;
      }
    } catch (err) {
      console.log('Sound playback failed:', err);
    }
  }, [soundEnabled]);
  
  const sendNotification = useCallback((options: NotificationOptions) => {
    if (permission !== 'granted') {
      console.log('Notification permission not granted');
      return null;
    }
    
    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
      });
      
      if (options.onClick) {
        notification.onclick = () => {
          window.focus();
          options.onClick?.();
          notification.close();
        };
      }
      
      return notification;
    } catch (err) {
      console.error('Failed to send notification:', err);
      return null;
    }
  }, [permission]);
  
  const notifyTradeSignal = useCallback((symbol: string, signal: string, confidence: number) => {
    playSound('alert');
    sendNotification({
      title: `${signal} Signal: ${symbol}`,
      body: `${confidence}% confidence - Tap to approve trade`,
      tag: `trade-${symbol}`,
      requireInteraction: true,
    });
  }, [playSound, sendNotification]);
  
  const notifyTradeExecuted = useCallback((symbol: string, action: 'bought' | 'sold', amount: number) => {
    playSound(action === 'bought' ? 'buy' : 'sell');
    sendNotification({
      title: `Trade Executed: ${symbol}`,
      body: `Successfully ${action} for ${amount.toFixed(4)} SOL`,
      tag: `executed-${symbol}`,
    });
  }, [playSound, sendNotification]);
  
  const notifyTakeProfitHit = useCallback((symbol: string, profit: number) => {
    playSound('success');
    sendNotification({
      title: `Take Profit Hit: ${symbol}`,
      body: `+${profit.toFixed(2)}% profit reached - Auto-selling`,
      tag: `tp-${symbol}`,
      requireInteraction: true,
    });
  }, [playSound, sendNotification]);
  
  const notifyStopLossHit = useCallback((symbol: string, loss: number) => {
    playSound('error');
    sendNotification({
      title: `Stop Loss Triggered: ${symbol}`,
      body: `-${Math.abs(loss).toFixed(2)}% loss - Auto-selling to protect`,
      tag: `sl-${symbol}`,
      requireInteraction: true,
    });
  }, [playSound, sendNotification]);
  
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('soundEnabled', String(newValue));
      return newValue;
    });
  }, []);
  
  return {
    permission,
    soundEnabled,
    requestPermission,
    playSound,
    sendNotification,
    notifyTradeSignal,
    notifyTradeExecuted,
    notifyTakeProfitHit,
    notifyStopLossHit,
    toggleSound,
  };
}
