// Bump this whenever the shell or a module changes. Older caches are removed
// during activate so a phone cannot keep rendering a previous TNT build.
const CACHE='tnt-20261012-profiles-permissions';
const CORE=['/','/index.html','/manifest.webmanifest?v=20261012','/icons/dynamite-app.svg?v=20261012','/icons/dynamite-app-192.png?v=20261012','/icons/notification-badge.png','/icons/dynamite-app-512.png?v=20261012','/icons/icon-maskable-512.png?v=2','/icons/dynamite.svg','/assets/tnt-experience.js?v=20261012','/assets/tnt-experience.js?v=20261012','/assets/tnt-experience-base.js?v=12','/assets/tnt-live-guard.js?v=12','/assets/tnt-buffet-stock.js?v=1','/assets/tnt-buffet-permissions.js?v=1','/assets/tnt-buffet-polish.js?v=1','/assets/tnt-buffet-ops.js?v=2','/assets/tnt-experience.css?v=20261012','/assets/tnt-notifications.js?v=20261012','/supabase-lite.js?v=12','/supabase-lite.js?v=15','/assets/tnt-ui.css?v=37','/assets/tnt-design.css?v=20261012','/assets/fonts/inter.woff2','/assets/fonts/archivo-black.woff2','/assets/tnt-identity.css?v=1','/assets/tnt-components.js?v=20261012','/assets/tnt-core.js?v=20261012','/assets/tnt-module-theme.css?v=10','/assets/tnt-push.js?v=20261012','/organizacion/','/campamento/','/campamento/inscripcion/','/glosario/','/asistencia/','/lista-sabados/','/efe/','/buffet/','/chat/','/admin/','/perfiles/'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&/^(tnt-|perfiles-)/.test(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request;
  const u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(CACHE).then(k=>k.put(r,c));return x}).catch(()=>caches.match(r).then(x=>x||caches.match('/index.html'))));
    return;
  }
  if(u.searchParams.has('v')&&(/^\/(?:assets|icons)\//.test(u.pathname)||u.pathname==='/supabase-lite.js')){
    e.respondWith(caches.open(CACHE).then(async cache=>{
      const hit=await cache.match(r);if(hit)return hit;
      const fresh=await fetch(r);if(fresh.ok)await cache.put(r,fresh.clone());return fresh;
    }));
    return;
  }
  if(/\.(?:js|css|html)$/.test(u.pathname)){
    e.respondWith(fetch(r).then(x=>{const y=x.clone();caches.open(CACHE).then(k=>k.put(r,y));return x}).catch(()=>caches.match(r)));
    return;
  }
  e.respondWith(caches.match(r).then(c=>c||fetch(r).then(x=>{const y=x.clone();caches.open(CACHE).then(k=>k.put(r,y));return x})));
});
self.addEventListener('push',e=>{
  let d={};
  try{d=e.data?e.data.json():{}}catch{}
  const url=d.url||'/';
  const opts={body:d.body||'Tenés una novedad en TNT.',icon:d.icon||'/icons/dynamite-app-192.png?v=20261012',badge:d.badge||'/icons/notification-badge.png',tag:d.tag||('tnt-'+Date.now()),data:{url},vibrate:[90,45,90],timestamp:Date.now(),renotify:true};
  e.waitUntil(self.registration.showNotification(d.title||'TNT',opts));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const target=e.notification.data?.url||'/';
  e.waitUntil((async()=>{
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of list){
      try{const u=new URL(client.url),t=new URL(target,self.location.origin);if(u.origin===t.origin){await client.focus();if('navigate' in client)await client.navigate(t.href);return;}}catch{}
    }
    return clients.openWindow(target);
  })());
});
