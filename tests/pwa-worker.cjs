const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function worker(){
 const events={},store=new Map(),network=[],messages=[],shown=[],origin='https://tnt-test.example';let offline=false;
 const key=r=>typeof r==='string'?r:r.url;
 const cache={match:async r=>store.get(key(r))?.clone(),put:async(r,response)=>store.set(key(r),response.clone()),add:async url=>{if(url==='/glosario/')throw Error('A single unavailable module');store.set(url,new Response(url))}};
 const self={location:{origin},addEventListener:(type,fn)=>events[type]=fn,skipWaiting:async()=>{},registration:{showNotification:async(...args)=>shown.push(args)},clients:{claim:async()=>{},matchAll:async()=>[{postMessage:message=>messages.push(message)}]}};
 const context={self,location:{origin},caches:{open:async()=>cache,match:cache.match},URL,Date,Promise,fetch:async(r,options)=>{network.push({url:key(r),options});if(offline)throw Error('Offline');return new Response('fresh')}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),context);
 async function request(url){let response;events.fetch({request:{method:'GET',url:origin+url},respondWith:p=>response=p});return response;}
 return{events,store,network,messages,shown,request,offline(value){offline=value}};
}
test('Un manifiesto o icono de una instalación anterior se renueva y conserva fallback sin conexión',async()=>{const w=worker();for(const url of ['/manifest.webmanifest?v=40','/manifest.webmanifest','/icons/icon-192.png','/icons/dynamite-app.svg?v=20261013','/icon.svg']){w.store.set('https://tnt-test.example'+url,new Response('stale'));assert.equal(await(await w.request(url)).text(),'fresh');assert.equal(w.network.at(-1).options.cache,'no-store');w.offline(true);assert.equal(await(await w.request(url)).text(),'fresh');w.offline(false)}});
test('Un módulo que falla durante la instalación no deja el resto de la app sin caché',async()=>{const w=worker();let done;w.events.install({waitUntil:p=>done=p});await done;assert(w.store.has('/index.html'));assert(w.store.has('/organizacion/'));assert(!w.store.has('/glosario/'))});
test('El worker confirma una prueba solo después de mostrar el aviso',async()=>{const w=worker();let done;w.events.push({data:{json:()=>({title:'Prueba',test_id:'test-one',url:'/'})},waitUntil:p=>done=p});await done;assert.equal(w.shown[0][0],'Prueba');assert.equal(w.messages[0].type,'TNT_PUSH_RECEIVED');assert.equal(w.messages[0].id,'test-one');let version;w.events.message({data:{type:'TNT_VERSION'},ports:[{postMessage:value=>version=value}]});assert.equal(version.version,'20261016')});
