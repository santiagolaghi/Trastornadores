// Bump this whenever the shell or a module changes. Older caches are removed
// during activate so a phone cannot keep rendering a previous TNT build.
const VERSION='20261024e';
const CACHE='tnt-20261024-startup';
const CORE=['/assets/tnt-approved.css?v=20261024d','/assets/tnt-unified.css?v=20261024b','/comunidad/','/perfil/','/biblia/','/juegos/','/assets/tnt-life.css?v=20261023d','/assets/tnt-life.js?v=20261024e','/organizacion/app.js?v=20261023e','/organizacion/style.css?v=20261018','/chat/whatsapp.css?v=20261017r3','/assets/tnt-next.css?v=20261021r4','/','/index.html','/manifest.webmanifest','/icons/dynamite-app.svg?v=20261013','/icons/dynamite-app-192.png?v=20261014','/icons/notification-badge.png','/icons/dynamite-app-512.png?v=20261013','/icons/icon-maskable-512.png?v=20261013','/icons/dynamite.svg','/assets/tnt-experience.js?v=20261024e','/assets/tnt-profiles.js?v=20261018r2','/assets/tnt-profile-settings.js?v=20261016','/assets/tnt-schedule-order.js?v=20261021r3','/assets/tnt-buffet-stock.js?v=1','/assets/tnt-buffet-permissions.js?v=1','/assets/tnt-buffet-polish.js?v=1','/assets/tnt-buffet-ops.js?v=2','/assets/tnt-experience.css?v=20261013','/assets/tnt-notifications.js?v=20261024e','/supabase-lite.js?v=12','/supabase-lite.js?v=15','/assets/tnt-ui.css?v=37','/assets/tnt-design.css?v=20261016','/assets/fonts/inter.woff2','/assets/fonts/archivo-black.woff2','/assets/tnt-identity.css?v=1','/assets/tnt-components.js?v=20261024d','/assets/tnt-core.js?v=20261024e','/assets/tnt-module-theme.css?v=10','/assets/tnt-push.js?v=20261024e','/organizacion/','/campamento/','/campamento/inscripcion/','/glosario/','/asistencia/','/lista-sabados/','/efe/','/buffet/','/chat/','/admin/','/perfiles/'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(CORE.map(url=>c.add(url)))).catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&/^(tnt-|perfiles-)/.test(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request;
  const u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;
  // Installed apps may still request a legacy manifest/icon URL. Always fetch
  // its current bytes instead of pinning it to the first cached installation.
  if(u.pathname.endsWith('/manifest.webmanifest')||u.pathname==='/icon.svg'||/^\/(?:icons\/|perfiles\/icon\.svg|buffet\/icon\.svg)/.test(u.pathname)){
    e.respondWith(caches.open(CACHE).then(async cache=>{
      try{const fresh=await fetch(r,{cache:'no-store'});if(!fresh.ok)throw new Error('Asset unavailable');await cache.put(r,fresh.clone());return fresh;}
      catch(error){const hit=await cache.match(r);if(hit)return hit;throw error;}
    }));return;
  }
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
self.addEventListener('message',e=>{if(e.data?.type==='TNT_VERSION')e.ports?.[0]?.postMessage({version:VERSION});});
self.addEventListener('push',e=>{
  let d={};
  try{d=e.data?e.data.json():{}}catch{}
  let url='/';try{const target=new URL(d.url||'/',self.location.origin);if(target.origin===self.location.origin)url=target.href;}catch{}
  let icon='/icons/dynamite-app-192.png?v=20261014';try{const portrait=new URL(d.sender_avatar||d.icon||icon,self.location.origin);if(portrait.protocol==='https:'||portrait.origin===self.location.origin)icon=portrait.href;}catch{}
  const opts={body:d.body||'Tenés una novedad en TNT.',icon,badge:'/icons/notification-badge.png?v=20261014',tag:d.tag||('tnt-'+Date.now()),data:{url,notification_id:d.notification_id,thread_id:d.thread_id,task_id:d.task_id,comment_id:d.comment_id,sender_id:d.sender_id},vibrate:[90,45,90],timestamp:Date.now(),renotify:true};
  e.waitUntil((async()=>{await self.registration.showNotification(d.title||'TNT',opts);if(d.test_id){const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const page of pages)page.postMessage({type:'TNT_PUSH_RECEIVED',id:d.test_id});}const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const page of windows)page.postMessage({type:'TNT_NOTIFICATION_RECEIVED'});})());
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
