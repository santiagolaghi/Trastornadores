const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
function device({permission='granted',failure=null,legacyVersion=false}={}){
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://tnt-test.example/organizacion/',runScripts:'outside-only'}),w=dom.window;
 const calls=[],events={},shown=[];let sub=null;
 const create=()=>({endpoint:'https://push.example.invalid/device',options:{},toJSON(){return{endpoint:this.endpoint,keys:{auth:'test',p256dh:'test'}}},async unsubscribe(){sub=null}});
 w.Notification={permission,async requestPermission(){calls.push('permission');return this.permission='granted'}};w.PushManager=function(){};
 const reg={active:{state:'activated',postMessage(message,ports){ports[0].reply({version:w.TNTPush.version})}},async update(){calls.push('update')},pushManager:{async getSubscription(){return sub},async subscribe(){calls.push('subscribe');return sub=create()}},async showNotification(...args){shown.push(args)}};
 w.MessageChannel=class{constructor(){this.port1={close(){}};this.port2={reply:data=>this.port1.onmessage({data})}}};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{async register(url,options){calls.push({register:url,options});return reg},addEventListener(type,fn){events[type]=fn}}});
 w.TNT={person:{id:'person-one'},account:{auth_user_id:'user-one'},sb:{async rpc(name,args){calls.push({rpc:name,args});return{error:failure,data:name==='tnt_push_test'?{id:'test-one',status:'pending'}:name==='tnt_push_test_status'?{id:args.p_id,status:'sent'}:null}}}};
 w.fetch=async(url,options)=>{calls.push({fetch:url,options});return{ok:true,json:async()=>({id:'/',icons:[{}]})}};
 if(legacyVersion)w.localStorage.setItem('tnt-assets-version','20261012');
 w.eval(fs.readFileSync(path.join(__dirname,'../assets/tnt-push.js'),'utf8'));
 return{w,calls,shown,events,expire(){sub=null},close:()=>w.close()};
}
test('La activación guarda el dispositivo sin confundir un aviso local con la entrega push',async()=>{const d=device();try{await d.w.TNTPush.enableTNT();await d.w.TNTPush.enableTNT();assert.equal(d.calls.filter(x=>x==='subscribe').length,1);assert.equal(d.calls.filter(x=>x.register).length,1);assert.equal(d.calls.find(x=>x.register).options.updateViaCache,'none');assert.equal(d.shown.length,0);assert.equal(d.w.localStorage.getItem('tnt-phone-enabled:user-one'),'yes')}finally{d.close()}});
test('Un permiso bloqueado o un alta fallida no activa la recuperación automática',async()=>{for(const variant of [{permission:'denied'},{failure:{message:'No guardado'}}]){const d=device(variant);try{await assert.rejects(d.w.TNTPush.enableTNT());assert.equal(d.w.localStorage.getItem('tnt-phone-enabled:user-one'),null);assert.equal(d.shown.length,0)}finally{d.close()}}});
test('Solo una cuenta que activó los avisos recupera una suscripción vencida',async()=>{const d=device();try{await d.w.TNTPush.sync();assert.equal(d.calls.filter(x=>x==='subscribe').length,0);await d.w.TNTPush.enableTNT();d.expire();await d.w.TNTPush.sync();assert.equal(d.calls.filter(x=>x==='subscribe').length,2);d.w.TNT.account.auth_user_id='another-user';d.expire();await d.w.TNTPush.sync();assert.equal(d.calls.filter(x=>x==='subscribe').length,2);assert.equal(d.calls.filter(x=>x==='permission').length,0)}finally{d.close()}});
test('Desactivar o salir impide que el siguiente refresco reactive los avisos',async()=>{const d=device();try{await d.w.TNTPush.enableTNT();await d.w.TNTPush.disableTNT();d.expire();await d.w.TNTPush.sync();assert.equal(d.calls.filter(x=>x==='subscribe').length,1);await d.w.TNTPush.enableTNT();d.w.TNTPush.forget();d.expire();await d.w.TNTPush.sync();assert.equal(d.calls.filter(x=>x==='subscribe').length,2);assert(d.calls.some(x=>x.rpc==='tnt_push_unsubscribe'))}finally{d.close()}});
test('Enviado por el servidor no significa recibido hasta que responde el worker del teléfono',async()=>{const d=device();try{await d.w.TNTPush.enableTNT();const q=await d.w.TNTPush.test();assert.equal(q.status,'pending');assert.equal((await d.w.TNTPush.testStatus(q.id)).received,false);d.events.message({data:{type:'TNT_PUSH_RECEIVED',id:q.id}});assert.equal((await d.w.TNTPush.testStatus(q.id)).received,true);assert.equal((await d.w.TNTPush.testStatus('another-test')).received,false)}finally{d.close()}});
test('La actualización usa un manifiesto estable y no depende de la versión vieja guardada',async()=>{const d=device({legacyVersion:true});try{const state=await d.w.TNTPush.updateApp();assert.equal(state.version,d.w.TNTPush.version);assert.equal(d.calls.find(x=>x.fetch).fetch,'/manifest.webmanifest');assert.equal(d.calls.find(x=>x.fetch).options.cache,'no-store');assert(d.calls.some(x=>x.register==='/sw.js'));assert.equal(d.w.location.pathname,'/organizacion/')}finally{d.close()}});

function enter(d){d.w.TNT.identity={email:'demo@example.test'};d.w.TNT.profileComplete=true;d.w.document.dispatchEvent(new d.w.CustomEvent('tnt:ready'));return d.w.document.getElementById('tnt-phone-invite');}
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
test('Entrar ofrece los avisos sin pedir permiso; solo un toque suscribe el teléfono',async()=>{const d=device({permission:'default'});try{
 const panel=enter(d);assert(panel);assert.equal(d.calls.includes('permission'),false);assert.equal(d.calls.includes('subscribe'),false);
 d.w.TNTPush.maybePrompt();assert.equal(d.w.document.querySelectorAll('#tnt-phone-invite').length,1);
 panel.querySelector('[data-phone-invite-enable]').click();panel.querySelector('[data-phone-invite-enable]').click();await tick();
 assert.equal(d.calls.filter(c=>c==='permission').length,1);assert.equal(d.calls.filter(c=>c==='subscribe').length,1);assert.equal(d.w.document.getElementById('tnt-phone-invite'),null);d.w.TNTPush.maybePrompt();assert.equal(d.w.document.getElementById('tnt-phone-invite'),null);
}finally{d.close()}});
test('Los avisos bloqueados explican los ajustes y Más tarde no insiste al cambiar de módulo',async()=>{const d=device({permission:'denied'});try{
 const panel=enter(d);panel.querySelector('[data-phone-invite-enable]').click();assert(panel.querySelector('[role=status]').textContent.includes('Permisos'));assert.equal(d.calls.includes('permission'),false);
 panel.querySelector('[data-phone-invite-later]').click();d.w.TNTPush.maybePrompt();assert.equal(d.w.document.getElementById('tnt-phone-invite'),null);assert.equal(d.w.sessionStorage.getItem('tnt-phone-invite-dismissed:user-one'),'yes');
}finally{d.close()}});
test('Una activación fallida conserva el aviso y permite reintentar sin anunciar éxito',async()=>{const d=device({failure:{message:'No se pudo guardar el dispositivo'}});try{
 const panel=enter(d);panel.querySelector('[data-phone-invite-enable]').click();await tick();assert(panel.isConnected);assert.equal(panel.querySelector('[data-phone-invite-enable]').disabled,false);assert(panel.querySelector('[role=status]').textContent.includes('No se pudo'));assert.equal(d.w.localStorage.getItem('tnt-phone-enabled:user-one'),null);
}finally{d.close()}});
test('No pide avisos antes de completar el perfil ni reactiva una desactivación explícita',async()=>{const d=device();try{
 d.w.TNT.identity={};d.w.TNT.profileComplete=false;d.w.TNTPush.maybePrompt();assert.equal(d.w.document.getElementById('tnt-phone-invite'),null);
 await d.w.TNTPush.enableTNT();await d.w.TNTPush.disableTNT();enter(d);assert.equal(d.w.document.getElementById('tnt-phone-invite'),null);
 await d.w.TNTPush.enableTNT();assert.equal(d.w.localStorage.getItem('tnt-phone-paused:user-one'),null);
}finally{d.close()}});
test('iPhone sin instalar recibe la guía de pantalla de inicio, no una solicitud imposible',async()=>{const d=device({permission:'default'});try{
 Object.defineProperty(d.w.navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});const panel=enter(d);assert(panel.textContent.includes('pantalla de inicio'));panel.querySelector('[data-phone-invite-enable]').click();assert(panel.querySelector('[role=status]').textContent.includes('Safari'));assert.equal(d.calls.includes('permission'),false);
}finally{d.close()}});
