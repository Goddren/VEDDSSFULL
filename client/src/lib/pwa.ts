export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if ('serviceWorker' in navigator) {
    try {
      // updateViaCache: 'none' — browser must ALWAYS re-fetch sw.js from the
      // network, bypassing its own HTTP cache. This is the critical flag that
      // makes cache-busting work on mobile. Without it, browsers can serve a
      // stale sw.js even when the server sends no-cache headers.
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      console.log('Service Worker registered successfully:', registration.scope);

      // When a new SW is found and finishes installing, reload the page so
      // users get the latest build immediately. skipWaiting() in sw.js fires
      // on install, then 'controllerchange' fires here — one reload, no loop.
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloading) {
          reloading = true;
          console.log('New Service Worker activated — reloading for latest build');
          window.location.reload();
        }
      });

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('Service Worker update found — installing new version');

        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            console.log('SW state:', newWorker.state);
            // 'installed' with an existing controller = new SW waiting.
            // skipWaiting() in sw.js means it will take over automatically,
            // which fires controllerchange above and reloads the page.
          });
        }
      });

      // Proactively check for a new SW version every time the page gains focus
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => { /* network may be offline */ });
        }
      });

      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }
  return null;
};

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return Notification.permission;
};

export const subscribeToPushNotifications = async (
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> => {
  try {
    const permission = await requestNotificationPermission();
    
    if (permission !== 'granted') {
      console.log('Notification permission not granted');
      return null;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        'BEl62iUYgUivxIkv69yViEuiBIa-Ib37J8mrYJA9LNm7vzQlkjqJz0qnqwMH2PbCPp6kQk1qh9dxXQ9F9LRVmY4'
      )
    });

    console.log('Push subscription successful:', subscription);
    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return null;
  }
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const setupPWAInstallPrompt = () => {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    console.log('PWA install prompt ready');
  });

  window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    deferredPrompt = null;
  });
};

export const showPWAInstallPrompt = async (): Promise<boolean> => {
  if (!deferredPrompt) {
    console.log('PWA install prompt not available');
    return false;
  }

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  
  console.log(`User ${outcome} the install prompt`);
  deferredPrompt = null;
  
  return outcome === 'accepted';
};

export const isPWAInstalled = (): boolean => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
};

export const canInstallPWA = (): boolean => {
  return deferredPrompt !== null;
};

export const sendNotification = async (
  title: string,
  options?: NotificationOptions
): Promise<void> => {
  if (!('Notification' in window)) {
    console.log('Notifications not supported');
    return;
  }

  if (Notification.permission === 'granted') {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      ...options,
      vibrate: [200, 100, 200],
    } as NotificationOptions & { vibrate?: number[] });
  }
};

export const checkForUpdates = async (): Promise<void> => {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update();
    }
  }
};

export const isMobileDevice = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

export const getNetworkStatus = (): boolean => {
  return navigator.onLine;
};

export const watchNetworkStatus = (
  onOnline: () => void,
  onOffline: () => void
): (() => void) => {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
};
