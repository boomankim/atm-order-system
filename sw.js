/* 출퇴근 앱 서비스워커 — 설치 가능 조건 충족용. HTML은 항상 네트워크 우선, 실패 시 캐시. */
const CACHE='att-v2026.09.15c';
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./index.html','./manifest.json','./icon-192.png','./icon-512.png']).catch(()=>{})).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url);
  if(u.origin!==location.origin) return; // Firebase/CDN은 그대로
  e.respondWith(fetch(r).then(res=>{ if(res.ok){ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(r,cp)); } return res; }).catch(()=>caches.match(r,{ignoreSearch:true})));
});
