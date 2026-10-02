// Bump this whenever the shell or a module changes. Older caches are removed
// during activate so a phone cannot keep rendering a previous TNT build.
const CACHE='tnt-v45-saturday-roster-profile-precedence';
const CORE=['/','/index.html','/manifest.webmanifest','/icons/icon.svg','/supabase-lite.js?v=12','/assets/tnt-ui.css?v=34','/assets/tnt-core.js?v=40','/assets/tnt-module-theme.css?v=10','/organizacion/','/campamento/','/glosario/','/asistencia/','/lista-sabados/','/efe/','/buffet/','/chat/','/admin/','/perfiles/'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin||new URL(r.url).pathname.startsWith('/api/'))return;
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(CACHE).then(k=>k.put(r,c));return x}).catch(()=>caches.match(r).then(x=>x||caches.match('/index.html'))));
    return;
  }
  // Scripts and styles must follow the deployment. A stale cached JS file can
  // leave an otherwise healthy module looking broken after a release.
  if(/\.(?:js|css|html)$/.test(new URL(r.url).pathname)||r.url.includes('?v=')){
    e.respondWith(fetch(r).then(x=>{const y=x.clone();caches.open(CACHE).then(k=>k.put(r,y));return x}).catch(()=>caches.match(r)));
    return;
  }
  e.respondWith(caches.match(r).then(c=>c||fetch(r).then(x=>{const y=x.clone();caches.open(CACHE).then(k=>k.put(r,y));return x})));
});
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch{}
  e.waitUntil(self.registration.showNotification(d.title||'Asistencia TNT',{body:d.body||'',tag:d.tag||'asistencia-tnt',data:{url:d.url||'/asistencia/?mode=sabados'}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url||'/asistencia/?mode=sabados'));
});
