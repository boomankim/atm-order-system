/* ATM Order System — Service Worker
 *
 * 자동 업데이트 전략:
 *   - install: skipWaiting() — 새 SW가 즉시 활성화 대기열로 이동
 *   - activate: 옛 캐시 전부 삭제 + clients.claim() — 즉시 페이지 제어
 *   - fetch:
 *       · navigate 요청 (메인 HTML): network-first, 실패 시 캐시 fallback
 *       · 정적 파일 (.png, manifest 등): cache-first
 *       · CDN: stale-while-revalidate
 *       · Firebase RTDB: 항상 네트워크
 *
 * 배포 시 아래 CACHE 버전만 올리면 옛 캐시가 자동 정리되고 새 HTML이 즉시 적용됨.
 */
const CACHE = 'atm-cache-v20260624a';

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

// CDN 도메인 (stale-while-revalidate)
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

// ---------------- install ----------------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      // 일부 항목 실패해도 install 진행
      return Promise.all(
        APP_SHELL.map(url =>
          cache.add(url).catch(err => console.warn('[sw] precache fail:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ---------------- activate ----------------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isCdnRequest(url) {
  return CDN_HOSTS.some(h => url.hostname.endsWith(h));
}
function isFirebaseRequest(url) {
  return FIREBASE_HOSTS.some(h => url.hostname.endsWith(h));
}
function isStaticAsset(url) {
  return /\.(png|jpg|jpeg|svg|webp|ico|gif|woff2?|ttf|json|css)$/i.test(url.pathname);
}

// ---------------- fetch ----------------
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
      caches.open(CACHE).then(async cache => {
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

  // 동일 출처만 처리
  if (url.origin !== self.location.origin) return;

  // navigate 요청 (메인 HTML) — network-first
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('./ATM_Order_System.html')))
    );
    return;
  }

  // 정적 파일 — cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => cache.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // 기타 동일 출처 — network-first with cache fallback
  event.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});

// HTML 페이지가 보내는 메시지 (캐시 강제 갱신 등)
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
