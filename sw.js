// KEmisora  sw.js  版 0.1.4  基づく仕様書：KEmisora_仕様書_v0.1.4.md
// 役割：オフライン用のキャッシュ。新しい版は、更新ボタンが押されたときだけ切り替える（skipWaiting は install では呼ばない）。

const CACHE_VERSION = 'kemisora-v0.1.4';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/config.js', 'js/util.js', 'js/kecore.js', 'js/store.js', 'js/engine.js', 'js/media.js',
  'js/library.js', 'js/tags.js', 'js/plans.js', 'js/planner.js', 'js/drive.js', 'js/sync.js',
  'js/driveimport.js', 'js/backup.js', 'js/session.js', 'js/player.js', 'js/ui.js', 'js/app.js',
  'js/worklet/kem-processor.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;     // 自分のサイトのGETだけ
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
