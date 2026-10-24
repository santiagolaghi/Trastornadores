const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
function device({permission='granted',permissionResponse='granted',failure=null,legacyVersion=false,userAgent='',installed=false,pushSupported=true,url='/organizacion/'}={}){
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://tnt-test.example'+url,runScripts:'outside-only'}),w=dom.window;
 const media={get matches(){return installed},addEventListener(type,fn){this.change=fn}};w.matchMedia=()=>media;
 if(userAgent)Object.defineProperty(w.navigator,'userAgent',{value:userAgent,configurable:true});
 const calls=[],events={},shown=[];let sub=null;
 const create=()=>({endpoint:'https://push.example.invalid/device',options:{},toJSON(){return{endpoint:this.endpoint,keys:{auth:'test',p256dh:'test'}}},async unsubscribe(){sub=null}});
 w.Notification={permission,async requestPermission(){calls.push('permission');return this.permission=permissionResponse}};if(pushSupported)w.PushManager=function(){};
 const reg={active:{state:'activated',postMessage(message,ports){ports[0].reply({version:w.TNTPush.version})}},async update(){calls.push('update')},pushManager:{async getSubscription(){return sub},async subscribe(){calls.push('subscribe');return sub=create()}},async showNotification(...args){shown.push(args)}};
 w.MessageChannel=class{constructor(){this.port1={close(){}};this.port2={reply:data=>this.port1.onmessage({data})}}};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{async register(url,options){calls.push({register:url,options});return reg},addEventListener(type,fn){events[type]=fn}}});
 w.TNT={person:{id:'person-one'},account:{auth_user_id:'user-one'},sb:{async rpc(name,args){calls.push({rpc:name,args});return{error:failure,data:name==='tnt_push_test'?{id:'test-one',status:'pending'}:name==='tnt_push_test_status'?{id:args.p_id,status:'sent'}:null}}}};
 w.fetch=async(url,options)=>{calls.push({fetch:url,options});return{ok:true,json:async()=>({id:'/',icons:[{}]})}};
  w.TNTUI={icon:()=>'<svg></svg>',esc:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),modal(title,html,wide,options){const dialog=w.document.createElement('section');dialog._required=options?.required;dialog.innerHTML='<h2>'+title+'</h2>'+html;w.document.body.append(dialog);return dialog;},async closeModal(dialog){dialog.remove()}};
 if(legacyVersion)w.localStorage.setItem('tnt-assets-version','20261012');
 w.eval(fs.readFileSync(path.join(__dirname,'../assets/tnt-push.js'),'utf8'));
 return{w,calls,shown,events,install(){installed=true;media.change?.()},expire(){sub=null},close:()=>w.close()};
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
test('iPhone empieza con instalación obligatoria; los avisos esperan a la app, Google y el perfil',async()=>{const d=device({permission:'default',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});try{
 enter(d);const panel=d.w.document.getElementById('tnt-phone-setup');assert(panel._required);assert.equal(panel.dataset.step,'install');assert.equal(panel.querySelector('[data-phone-invite-later]'),null);const guide=panel.querySelector('.tnt-install-guide');assert(guide.textContent.includes('Safari'));assert(guide.textContent.includes('Abrir como app web'));assert.equal(guide.querySelector('input').value,'https://tnt-test.example/');await assert.rejects(d.w.TNTPush.enableTNT(),/pantalla de inicio/);
 d.w.TNT.identity=null;d.install();await tick();assert.equal(d.w.document.getElementById('tnt-phone-setup'),null);assert.equal(d.calls.includes('permission'),false);
 enter(d);const push=d.w.document.getElementById('tnt-phone-setup');assert.equal(push.dataset.step,'push');assert.equal(d.calls.includes('permission'),false);push.querySelector('[data-setup-enable]').click();await tick();assert.equal(d.calls.filter(c=>c==='permission').length,1);assert.equal(d.w.document.getElementById('tnt-phone-setup'),null);assert(d.calls.some(c=>c.rpc==='tnt_push_subscribe'));
}finally{d.close()}});

test('Android usa el instalador nativo una vez y no confunde aceptar con abrir la app',async()=>{const d=device({permission:'default',userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/130'});try{
 const event=new d.w.Event('beforeinstallprompt',{cancelable:true});let prompts=0;event.prompt=async()=>prompts++;event.userChoice=Promise.resolve({outcome:'accepted'});d.w.dispatchEvent(event);enter(d);
 let panel=d.w.document.getElementById('tnt-phone-setup'),button=panel.querySelector('[data-setup-install]');assert.equal(button.hidden,false);assert(event.defaultPrevented);button.click();await tick();assert.equal(prompts,1);assert(button.hidden);assert.equal(d.w.TNTPush.installState().installed,false);assert.equal(d.calls.includes('permission'),false);assert(panel.querySelector('[data-setup-status]').textContent.includes('nuevo ícono'));
 d.w.dispatchEvent(new d.w.Event('appinstalled'));assert.equal(d.w.document.getElementById('tnt-phone-setup').dataset.step,'install');d.install();await tick();assert.equal(d.w.document.getElementById('tnt-phone-setup').dataset.step,'push');
}finally{d.close()}});

test('El bloqueo móvil explica cómo recuperar permisos y no solicita ni guarda consentimiento',async()=>{const d=device({permission:'denied',userAgent:'Android',installed:true});try{
 enter(d);const panel=d.w.document.getElementById('tnt-phone-setup');assert.equal(panel.querySelector('[data-phone-invite-later]'),null);panel.querySelector('[data-setup-enable]').click();assert(panel.textContent.includes('Permisos'));assert.equal(d.calls.includes('permission'),false);assert.equal(d.w.localStorage.getItem('tnt-phone-enabled:user-one'),null);
 d.w.Notification.permission='granted';panel.querySelector('[data-setup-enable]').click();await tick();assert.equal(d.w.document.getElementById('tnt-phone-setup'),null);assert(d.calls.some(c=>c.rpc==='tnt_push_subscribe'));
}finally{d.close()}});

test('Rechazar el primer aviso cambia a recuperación de permisos sin volver a pedirlos',async()=>{const d=device({permission:'default',permissionResponse:'denied',userAgent:'Android',installed:true});try{
 enter(d);const panel=d.w.document.getElementById('tnt-phone-setup');panel.querySelector('[data-setup-enable]').click();await tick();assert(panel.querySelector('[data-setup-status]').textContent.includes('Permisos'));assert.equal(d.calls.filter(c=>c==='permission').length,1);panel.querySelector('[data-setup-enable]').click();assert.equal(d.calls.filter(c=>c==='permission').length,1);assert.equal(d.calls.includes('subscribe'),false);assert(panel.isConnected);
}finally{d.close()}});

test('Un teléfono sin soporte puede continuar sin inventar permiso ni suscripción',async()=>{const d=device({permission:'default',userAgent:'iPhone',installed:true,pushSupported:false});try{
 enter(d);const panel=d.w.document.getElementById('tnt-phone-setup');assert(panel.textContent.includes('no admite'));panel.querySelector('[data-setup-enable]').click();await tick();d.w.TNTPush.maybePrompt();assert.equal(d.w.document.getElementById('tnt-phone-setup'),null);assert.equal(d.calls.includes('permission'),false);assert.equal(d.calls.includes('subscribe'),false);assert.equal(d.w.localStorage.getItem('tnt-phone-enabled:user-one'),null);
}finally{d.close()}});

test('Los formularios públicos compartidos no requieren instalar la app',async()=>{for(const url of ['/perfiles/','/campamento/inscripcion/?token=public']){const d=device({userAgent:'Android',url});try{d.w.TNTPush.maybePrompt();assert.equal(d.w.document.getElementById('tnt-phone-setup'),null);}finally{d.close()}}});
test('La guía detecta navegadores internos y iPad; copiar sin portapapeles deja seleccionado el enlace limpio',async()=>{const d=device();try{
 Object.defineProperties(d.w.navigator,{userAgent:{value:'Mozilla/5.0 (iPad) Instagram'},platform:{value:'MacIntel'},maxTouchPoints:{value:5}});const dialog=d.w.TNTPush.openInstall();assert(dialog.textContent.includes('dentro de otra app'));assert.equal(d.w.TNTPush.installState().ios,true);dialog.querySelector('[data-copy-install]').click();await tick();assert.equal(dialog.querySelector('input').selectionStart,0);assert.equal(dialog.querySelector('input').selectionEnd,dialog.querySelector('input').value.length);assert(dialog.querySelector('[data-install-status]').textContent.includes('Copiar'));assert.equal(d.calls.includes('permission'),false);
}finally{d.close()}});
