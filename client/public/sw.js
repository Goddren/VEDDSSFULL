const CACHE_VERSION = 'vedd-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing version', CACHE_VERSION);
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating version', CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (!cache.startsWith(CACHE_VERSION)) {
              console.log('Service Worker: Clearing old cache', cache);
              return caches.delete(cache);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// Fetch event - stale-while-revalidate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API requests - network first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            return cached || new Response(
              JSON.stringify({ error: 'Offline', offline: true }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Static assets - cache first, update in background (stale-while-revalidate)
  event.respondWith(
    caches.match(request)
      .then(cached => {
        const fetchPromise = fetch(request).then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        }).catch(err => {
          console.log('Fetch failed, using cache:', err);
          return cached;
        });

        return cached || fetchPromise;
      })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received', event);
  
  let notificationData = {
    title: 'VEDD AI Alert',
    body: 'You have a new trading alert',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [200, 100, 200],
    tag: 'vedd-alert',
    renotify: true,
    requireInteraction: false,
    data: {
      url: '/mobile-alerts',
      type: 'alert'
    },
    actions: [
      { action: 'view', title: 'View Details' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        ...data,
        data: { ...notificationData.data, ...data.data }
      };
      
      if (data.type === 'price_alert') {
        notificationData.tag = 'vedd-price-alert';
        notificationData.vibrate = [300, 100, 300, 100, 300];
        notificationData.requireInteraction = true;
      } else if (data.type === 'analysis_complete') {
        notificationData.tag = 'vedd-analysis';
        notificationData.actions = [
          { action: 'view', title: 'View Analysis' },
          { action: 'share', title: 'Share' }
        ];
      } else if (data.type === 'trade_signal') {
        notificationData.tag = 'vedd-trade-signal';
        notificationData.vibrate = [500, 200, 500];
        notificationData.requireInteraction = true;
        notificationData.actions = [
          { action: 'trade', title: 'Open Trade' },
          { action: 'view', title: 'View Details' }
        ];
      } else if (data.type === 'news_alert') {
        notificationData.tag = 'vedd-news';
        notificationData.actions = [
          { action: 'view', title: 'Read News' },
          { action: 'dismiss', title: 'Dismiss' }
        ];
      }
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event.action);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  let urlToOpen = event.notification.data?.url || '/mobile-alerts';
  const notificationType = event.notification.data?.type;
  const notificationId = event.notification.data?.id;

  if (event.action === 'trade' && notificationType === 'trade_signal') {
    urlToOpen = '/dashboard';
  } else if (event.action === 'share' && notificationType === 'analysis_complete') {
    urlToOpen = notificationId ? `/analysis/${notificationId}?share=true` : '/analysis';
  } else if (event.action === 'view') {
    switch (notificationType) {
      case 'price_alert':
        urlToOpen = '/mobile-alerts';
        break;
      case 'analysis_complete':
        urlToOpen = notificationId ? `/analysis/${notificationId}` : '/analysis';
        break;
      case 'trade_signal':
        urlToOpen = '/dashboard';
        break;
      case 'news_alert':
        urlToOpen = '/news';
        break;
      default:
        urlToOpen = event.notification.data?.url || '/mobile-alerts';
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if ('focus' in client) {
            const clientUrl = new URL(client.url);
            const targetUrl = new URL(urlToOpen, self.location.origin);
            
            if (clientUrl.pathname !== targetUrl.pathname) {
              client.navigate(urlToOpen);
            }
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync event for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'sync-alerts') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_ALERTS',
            timestamp: Date.now()
          });
        });
      })
    );
  }
});
