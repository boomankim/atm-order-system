/* ATM Order System — Service Worker
 *
 * 전략:
 *   - App Shell (HTML, manifest, icons): cache-first
 *   - CDN 라이브러리 (jsPDF, html2canvas, Firebase SDK): stale-while-revalidate
 *   - Firebase Realtime Database 요청: 네트워크 우선 (실시간 동기화)
 *   - 그 외 동일 출처 GET: cache-first → 네트워크 fallback
 *
 * 캐시 버전을 올리면 구버전 캐시는 activate에서 정리됨.
 */
const CACHE_VERSION = 'atm-v1-2026-06-16';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;

// 앱 셸 — 첫 install 시 미리 캐싱
const APP_SHELL = [
  './',
  './ATM_Order_System.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './icon-maskable-512.png'
];

// CDN 도메인 (캐싱 대상)
const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'www.gstatic.com'
];

// Firebase Realtime Database 도메인 (항상 네트워크)
const FIREBASE_HOSTS = [
  'firebaseio.com',
  'firebasedatabase.app',
  'googleapis.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(cache => {
      // 일부 항목 실패해도 install 진행
      return Promise.all(
        APP_SHELL.map(url =>
          cache.add(url).catch(err => console.warn('[sw] precache fail:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isCdnRequest(url) {
  return CDN_HOSTS.some(h => url.hostname.endsWith(h));
}
function isFirebaseRequest(url) {
  return FIREBASE_HOSTS.some(h => url.hostname.endsWith(h));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Firebase RTDB — 네트워크 전용 (실시간 동기화 보장)
  if (isFirebaseRequest(url)) return;

  // CDN — stale-while-revalidate
  if (isCdnRequest(url)) {
    event.respondWith(
      caches.open(CDN_CACHE).then(async cache => {
        const cached = await cache.match(req);
        const network = fetch(req).then(res => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 동일 출처 — cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) {
          // 백그라운드에서 최신본 갱신
          fetch(req).then(res => {
            if (res && res.status === 200) {
              caches.open(APP_SHELL_CACHE).then(cache => cache.put(req, res.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(req).then(res => {
          if (res && res.status === 200 && req.url.match(/\.(html|js|css|png|jpg|svg|webp|json)$/)) {
            const copy = res.clone();
            caches.open(APP_SHELL_CACHE).then(cache => cache.put(req, copy));
          }
          return res;
        }).catch(() => {
          // 오프라인 fallback — 메인 페이지 반환
          if (req.mode === 'navigate') {
            return caches.match('./ATM_Order_System.html');
          }
        });
      })
    );
  }
});

// HTML 페이지가 보내는 메시지 (캐시 강제 갱신 등)
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
