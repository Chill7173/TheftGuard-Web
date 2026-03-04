// TheftGuard Service Worker
// Provides offline support, caching, and PWA capabilities

const CACHE_NAME = 'theftguard-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install event - cache resources
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        return;
    }

    // Firebase requests - network first
    if (event.request.url.includes('firebase') || 
        event.request.url.includes('googleapis')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const cache = caches.open(CACHE_NAME);
                    cache.then(c => c.put(event.request, response.clone()));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Static assets - cache first
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(response => {
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, responseToCache));
                    return response;
                });
            })
            .catch(() => {
                // Return offline page if needed
                if (event.request.mode === 'navigate') {
                    return new Response('Offline - cached data available', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: new Headers({ 'Content-Type': 'text/plain' })
                    });
                }
            })
    );
});

// Background sync for offline actions (Phase 4)
self.addEventListener('sync', event => {
    if (event.tag === 'sync-anomalies') {
        event.waitUntil(syncAnomalies());
    }
    if (event.tag === 'sync-rules') {
        event.waitUntil(syncRules());
    }
});

async function syncAnomalies() {
    try {
        const db = await openObjectStore('theftguard-db', 'anomalies');
        // Sync pending anomalies to Firebase
        return true;
    } catch (e) {
        console.error('Sync failed:', e);
        return false;
    }
}

async function syncRules() {
    try {
        const db = await openObjectStore('theftguard-db', 'rules');
        // Sync pending rules to Firebase
        return true;
    } catch (e) {
        console.error('Sync failed:', e);
        return false;
    }
}

// Push notifications (Phase 3)
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: 'icon.png',
            badge: 'icon.png',
            tag: data.tag || 'theftguard-notification',
            requireInteraction: data.requireInteraction || false,
            actions: [
                { action: 'open', title: 'Open App' },
                { action: 'close', title: 'Dismiss' }
            ]
        };
        event.waitUntil(self.registration.showNotification(data.title, options));
    }
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'open' || !event.action) {
        event.waitUntil(clients.matchAll({ type: 'window' }).then(clientList => {
            for (let client of clientList) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        }));
    }
});
