const CACHE_NAME = 'jefram-stores-v3';
const STATIC_CACHE = 'jefram-static-v3';
const DYNAMIC_CACHE = 'jefram-dynamic-v3';

const STATIC_ASSETS = [
    './',
    './index.html',
    './category.html',
    './product.html',
    './flash-sales.html',
    './top-selling.html',
    './all-products.html',
    './faqs.html',
    './privacy-policy.html',
    './terms-of-service.html',
    './admin/index.html',
    './api.js'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                return cache.addAll(STATIC_ASSETS.map(url => new Request(url, {cache: 'reload'})))
                    .catch(err => {
                        console.log('Cache install failed:', err);
                        // Continue even if caching fails
                    });
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(event) {
    // Skip API requests - let them go directly to network
    if (event.request.url.includes('/api/')) {
        return;
    }
    if (event.request.mode === 'navigate') {
        event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
        return;
    }
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(response => {
                    // Only cache successful responses
                    if (!response || response.status !== 200 || response.type === 'opaque') {
                        return response;
                    }
                    const responseToCache = response.clone();
                    caches.open(DYNAMIC_CACHE)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        })
                        .catch(err => {
                            console.log('Cache write failed:', err);
                        });
                    return response;
                }).catch(err => {
                    console.log('Fetch failed:', err);
                    throw err;
                });
            })
    );
});

self.addEventListener('push', function(event) {
    const data = event.data.json();
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/favicon.ico',
            badge: '/favicon.ico'
        })
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
