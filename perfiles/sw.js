// Retire the old Perfiles worker. The shared /sw.js only caches public assets
// from this origin and never Supabase responses containing personal data.
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(caches.keys()
  .then(keys=>Promise.all(keys.filter(k=>k.startsWith('perfiles-')).map(k=>caches.delete(k))))
  .then(()=>self.registration.unregister())));
