/* ATM 매입단가 v2 — 공유 받기 전용 서비스워커
 * 범위(scope)를 ./danga-share/ 로만 좁게 등록해서
 * 오더 시스템의 sw.js(전체 범위)와 절대 충돌하지 않는다.
 * 역할: 폰의 스캔/갤러리 앱에서 "공유 → 단가" 로 보낸 파일(POST)을 받아
 *       캐시에 잠시 보관하고 앱 화면으로 리다이렉트한다.
 */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/danga-share/receive')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const files = fd.getAll('media').filter(f => f && f.size);
        const cache = await caches.open('danga-share');
        await cache.put('./danga-share/count',
          new Response(String(files.length), { headers: { 'Content-Type': 'text/plain' } }));
        for (let i = 0; i < files.length; i++) {
          await cache.put('./danga-share/file-' + i, new Response(files[i], {
            headers: {
              'Content-Type': files[i].type || 'application/octet-stream',
              'X-File-Name': encodeURIComponent(files[i].name || ('shared_' + i))
            }
          }));
        }
      } catch (err) { /* 실패해도 앱으로는 이동 */ }
      return Response.redirect('../ATM_Danga_v2.html?shared=1', 303);
    })());
  }
});
