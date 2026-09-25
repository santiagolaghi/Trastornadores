const CACHE='tnt-v10-global-platform';
const CORE=['/','/index.html','/manifest.webmanifest','/icons/icon.svg','/supabase-lite.js?v=3','/assets/tnt-ui.css?v=10','/assets/tnt-core.js?v=10','/assets/tnt-module-theme.css?v=10','/organizacion/','/campamento/','/glosario/','/lista-sabados/','/efe/','/buffet/','/chat/','/admin/'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin||new URL(r.url).pathname.startsWith('/api/'))return;
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(CACHE).then(k=>k.put(r,c));return x}).catch(()=>caches.match(r).then(x=>x||caches.match('/index.html'))));
    return;
  }
  e.respondWith(caches.match(r).then(c=>c||fetch(r).then(x=>{const y=x.clone();caches.open(CACHE).then(k=>k.put(r,y));return x})));
});
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch{}
  e.waitUntil(self.registration.showNotification(d.title||'Lista Sábados',{body:d.body||'',tag:d.tag||'lista-sabados',data:{url:d.url||'/?open=sabados'}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url||'/?open=sabados'));
});
