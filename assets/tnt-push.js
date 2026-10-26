(() => {
 'use strict';
 const VERSION='20261025c';
 const PUBLIC_KEY='BF3EVnNKTFBmSHImqA-PpYPylaHMG9L-A-gomiSB20084j_mNWWAT_Gm282-ovE5fXBN6fkPT_QyuXSx4H8r1hI';
 const ICON='/icons/dynamite-app-192.png?v='+VERSION,BADGE='/icons/notification-badge.png?v='+VERSION;
 const receipts=new Map();let registered,lastCheck=0,installPrompt=null,setupClosing=false;
 const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window);
 const permission=()=>window.Notification?.permission||'default';
 const installState=()=>{const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),android=/Android/i.test(navigator.userAgent);return{ios,android,mobile:ios||android,installed:!!navigator.standalone||!!window.matchMedia?.('(display-mode: standalone)').matches,embedded:/FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/i.test(navigator.userAgent)};};
 // Public forms remain available from their shared links. The TNT app itself
 // starts with installation; only the OS display mode confirms it is open as an app.
 const appEntry=()=>!/^\/campamento\/inscripcion(?:\/|$)/.test(location.pathname)&&!/^\/perfiles\/?$/.test(location.pathname);
 const setupSkipped=()=>{try{return sessionStorage.getItem('tnt-phone-unsupported:'+owner())==='yes';}catch{return false;}};
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;refreshSetup();});
 window.addEventListener('appinstalled',()=>{installPrompt=null;refreshSetup();});
 function installInstructions(){
  const {ios,installed,embedded}=installState(),url=location.origin+'/';
  return `<section class="tnt-install-guide">${installed?'<p>TNT ya está abierta como app. Podés activar los avisos desde el centro de notificaciones.</p>':`${embedded?'<p class="tnt-install-browser-note">Estás dentro de otra app. Usá su menú para abrir este enlace en '+(ios?'Safari':'tu navegador')+', o copiá la dirección de abajo.</p>':''}<ol>${ios?'<li>Abrí el enlace de TNT en <b>Safari</b>.</li><li>Tocá <b>Compartir</b> en el menú de Safari.</li><li>Elegí <b>Agregar a pantalla de inicio</b>. Si no aparece, bajá hasta <b>Editar acciones</b> y agregá esa opción.</li><li>Si aparece <b>Abrir como app web</b>, dejalo activado. Tocá <b>Agregar</b>.</li>':'<li>Abrí TNT en el navegador de tu teléfono.</li><li>En su menú, elegí <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.</li>'}<li>Abrí el nuevo ícono de <b>TNT</b>. Desde ahí podés iniciar sesión y activar los avisos.</li></ol><label>Enlace para instalar<input readonly aria-label="Enlace de TNT para instalar" value="${TNTUI.esc(url)}" data-install-url></label><button type="button" class="tnt-button" data-copy-install>Copiar enlace de TNT</button><p role="status" data-install-status aria-live="polite"></p>`}</section>`;
 }
 function bindInstallGuide(host){host.querySelector('[data-copy-install]')?.addEventListener('click',async()=>{const input=host.querySelector('[data-install-url]'),status=host.querySelector('[data-install-status]');try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(input.value);status.textContent='Enlace copiado. Pegalo en '+(installState().ios?'Safari':'tu navegador')+'.';}catch{input.focus();input.select();input.setSelectionRange(0,input.value.length);status.textContent='Mantené presionado el enlace seleccionado y elegí Copiar.';}});}
 function openInstall(){const dialog=TNTUI.modal(installState().ios?'Instalar TNT en iPhone o iPad':'Instalar TNT',installInstructions());bindInstallGuide(dialog);return dialog;}
 const owner=()=>window.TNT?.account?.auth_user_id||window.TNT?.person?.id||'';
 const consentKey=()=> 'tnt-phone-enabled:'+owner();
 const pausedKey=()=> 'tnt-phone-paused:'+owner();
 let dismissedOwner='',promptBusy=false;
 function dismissed(){try{return sessionStorage.getItem('tnt-phone-invite-dismissed:'+owner())==='yes';}catch{return dismissedOwner===owner();}}
 function paused(value){try{if(value===undefined)return localStorage.getItem(pausedKey())==='yes';if(value)localStorage.setItem(pausedKey(),'yes');else localStorage.removeItem(pausedKey());}catch{}return false;}
 function consent(value){try{if(value===undefined)return localStorage.getItem(consentKey())==='yes';if(value)localStorage.setItem(consentKey(),'yes');else localStorage.removeItem(consentKey());}catch{}return false;}
 function timeout(promise,label,ms=15000){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(label)),ms))]).finally(()=>clearTimeout(timer));}
 function keyBytes(base64){const pad='='.repeat((4-base64.length%4)%4),raw=atob((base64+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));}
 function activated(worker){if(!worker||worker.state==='activated')return Promise.resolve();return timeout(new Promise((resolve,reject)=>{const changed=()=>{if(worker.state==='activated'||worker.state==='redundant'){worker.removeEventListener('statechange',changed);worker.state==='activated'?resolve():reject(new Error('No pudimos actualizar TNT. Reintentá.'));}};worker.addEventListener('statechange',changed);changed();}),'La actualización tardó demasiado. Reintentá.');}
 async function registration(){
  if(!('serviceWorker'in navigator))throw new Error('Este navegador no admite avisos en segundo plano.');
  if(!registered)registered=timeout(navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}),'No pudimos conectar los avisos. Reintentá.').then(async reg=>{if(!reg.active)await activated(reg.installing||reg.waiting);if(!reg.active)throw new Error('Los avisos todavía no están disponibles. Reintentá.');return reg;}).catch(error=>{registered=null;throw error;});
  return registered;
 }
 async function subscription({ask=true}={}){
  if(installState().ios&&!installState().installed)throw new Error('Primero agregá TNT a la pantalla de inicio y abrila desde su ícono para activar los avisos.');
  if(!supported())throw new Error('Este teléfono no admite notificaciones web.');
  const allowed=permission()==='default'&&ask?await Notification.requestPermission():permission();
  if(allowed!=='granted')throw new Error('Permití las notificaciones de TNT en los ajustes del navegador.');
  const reg=await registration();let sub=await reg.pushManager.getSubscription();
  if(sub?.options?.applicationServerKey){const existing=new Uint8Array(sub.options.applicationServerKey),current=keyBytes(PUBLIC_KEY);if(existing.length!==current.length||existing.some((v,i)=>v!==current[i])){await sub.unsubscribe();sub=null;}}
  if(!sub)sub=await timeout(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(PUBLIC_KEY)}),'El teléfono tardó en activar los avisos. Reintentá.');
  return{sub,reg};
 }
 async function save(sub){if(!window.TNT?.sb||!owner())throw new Error('Iniciá sesión en TNT.');const r=await TNT.sb.rpc('tnt_push_subscribe',{p_subscription:sub.toJSON()});if(r.error)throw r.error;}
 async function workerVersion(reg){if(!window.MessageChannel)return null;return timeout(new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=e=>{channel.port1.close();resolve(e.data?.version||null);};reg.active.postMessage({type:'TNT_VERSION'},[channel.port2]);}),'Reabrí TNT para terminar la actualización.',3000);}
 const P=window.TNTPush={
  publicKey:PUBLIC_KEY,version:VERSION,supported,permission,installState,installInstructions,bindInstallGuide,openInstall,
  async enableTNT(){const {sub}=await subscription();await save(sub);consent(true);paused(false);document.getElementById('tnt-phone-invite')?.remove();await closeSetup();return sub;},
  async disableTNT(){const sub=await P.current();if(sub){const r=await TNT.sb.rpc('tnt_push_unsubscribe',{p_endpoint:sub.endpoint});if(r.error)throw r.error;}consent(false);paused(true);document.getElementById('tnt-phone-invite')?.remove();},
  forget(){consent(false);},
  async sync(){if(!owner()||!consent()||permission()!=='granted')return;const {sub}=await subscription({ask:false});await save(sub);},
  async enableCamp(sb,token){const {sub,reg}=await subscription();const r=await sb.rpc('tnt_camp_public_push_subscribe',{p_token:token,p_subscription:sub.toJSON()});if(r.error)throw r.error;await reg.showNotification('Avisos de Campamento activados',{body:'Las novedades del campamento también van a aparecer en este teléfono.',icon:ICON,badge:BADGE,tag:'tnt-push-enabled',data:{url:'/campamento/inscripcion/?token='+encodeURIComponent(token)}});return sub;},
  async current(){if(!('serviceWorker'in navigator))return null;const reg=await registration();return reg.pushManager.getSubscription();},
  async test(){if(permission()!=='granted')throw new Error('Permití los avisos en este teléfono antes de probarlos.');const sub=await P.current();if(!sub)throw new Error('Activá los avisos en este teléfono antes de probarlos.');const r=await TNT.sb.rpc('tnt_push_test',{p_endpoint:sub.endpoint});if(r.error)throw r.error;return{...r.data,received:receipts.has(r.data?.id)};},
  async testStatus(id){const r=await TNT.sb.rpc('tnt_push_test_status',{p_id:id});if(r.error)throw r.error;return{...r.data,received:receipts.has(id)};},
  async updateApp(){const reg=await registration();await timeout(reg.update(),'No pudimos buscar la actualización. Revisá la conexión.');await activated(reg.installing||reg.waiting);const response=await fetch('/manifest.webmanifest',{cache:'no-store'});if(!response.ok)throw new Error('No pudimos buscar la actualización. Reintentá.');const manifest=await response.json();if(manifest.id!=='/'||!manifest.icons?.length)throw new Error('La actualización todavía no está disponible.');return{version:await workerVersion(reg)};},
  maybePrompt
 };
 async function closeSetup(){const panel=document.getElementById('tnt-phone-setup');if(!panel)return;setupClosing=true;try{await TNTUI.closeModal(panel);}finally{setupClosing=false;}}
 function refreshSetup(){const panel=document.getElementById('tnt-phone-setup');if(panel?.dataset.step==='install'&&!installState().installed){const button=panel.querySelector('[data-setup-install]');if(button)button.hidden=!installPrompt;return;}maybePrompt();}
 function showSetup(step){
  if(setupClosing)return;
  const existing=document.getElementById('tnt-phone-setup');
  if(existing?.dataset.step===step&&existing.dataset.owner===owner())return;
  if(existing){closeSetup().then(maybePrompt);return;}
  document.getElementById('tnt-phone-invite')?.remove();
  const {ios}=installState(),install=step==='install',blocked=permission()==='denied',available=supported();
  const title=install?'TNT, en tu inicio.':'Activá tus avisos.';
  const intro=install?'Agregá TNT a la pantalla de inicio y abrila desde su ícono para empezar.':'Recibí los mensajes, actividades y novedades de tu equipo en este teléfono.';
  const progress='<ol class="tnt-setup-steps" aria-label="Preparar TNT"><li '+(install?'aria-current="step"':'class="is-done"')+'><b>1</b>Instalar</li><li class="'+(install?'':'is-done')+'"><b>2</b>Google</li><li '+(!install?'aria-current="step"':'')+'><b>3</b>Avisos</li></ol>';
  const recovery=ios?'En Ajustes → Notificaciones → TNT, activá Permitir notificaciones. Después volvé a TNT.':'En la información del sitio, entrá en Permisos → Notificaciones y elegí Permitir. Revisá también los ajustes del teléfono.';
  const help=blocked?recovery:'Tocá el botón y elegí Permitir cuando el teléfono te lo pregunte.';
  const content=install?'<button type="button" class="tnt-button primary" data-setup-install '+(!installPrompt?'hidden':'')+'>Instalar TNT</button>'+installInstructions():'<div class="tnt-setup-notice">'+TNTUI.icon('bell')+'<p>'+(available?help:'Este dispositivo no admite notificaciones web. Podés consultar tus avisos dentro de TNT.')+'</p></div><button type="button" class="tnt-button primary" data-setup-enable>'+(available?(blocked?'Ya los habilité · comprobar':'Activar notificaciones'):'Continuar en este dispositivo')+'</button>'+(available?'':'<p class="tnt-setup-small">Los avisos del teléfono seguirán desactivados.</p>')+'<button type="button" class="tnt-setup-exit" data-setup-logout>Cambiar de cuenta</button>';
  const panel=TNTUI.modal(title,progress+'<div class="tnt-setup-hero"><img src="'+ICON+'" width="72" height="72" alt=""><span>HACEMOS TNT.</span></div><p class="tnt-setup-intro">'+intro+'</p>'+content+'<p class="tnt-setup-status" role="status" aria-live="polite" data-setup-status></p>',false,{required:true});
  panel.id='tnt-phone-setup';panel.classList.add('tnt-setup');panel.dataset.step=step;panel.dataset.owner=owner();
  if(install){bindInstallGuide(panel);panel.querySelector('[data-setup-install]').onclick=async event=>{
   const prompt=installPrompt,status=panel.querySelector('[data-setup-status]');if(!prompt)return;
   installPrompt=null;event.currentTarget.hidden=true;
   try{await prompt.prompt();const choice=await prompt.userChoice;status.textContent=choice.outcome==='accepted'?'Listo. Abrí TNT desde el nuevo ícono para continuar.':'Podés instalarla desde el menú del navegador cuando quieras continuar.';}
   catch{status.textContent='Abrí el menú del navegador y elegí Instalar app o Agregar a pantalla de inicio.';}
  };return;}
  panel.querySelector('[data-setup-logout]').onclick=()=>window.TNT?.logout?.();
  panel.querySelector('[data-setup-enable]').onclick=async event=>{
   if(!available){try{sessionStorage.setItem('tnt-phone-unsupported:'+owner(),'yes');}catch{}await closeSetup();return;}
   const button=event.currentTarget,status=panel.querySelector('[data-setup-status]');if(promptBusy)return;
   if(permission()==='denied'){status.textContent=recovery;return;}
   button.disabled=true;promptBusy=true;status.textContent='Conectando tus avisos…';
   try{await P.enableTNT();}catch(error){status.textContent=permission()==='denied'?recovery:error.message||'No pudimos activar los avisos. Reintentá.';button.textContent=permission()==='denied'?'Ya los habilité · comprobar':'Reintentar';button.disabled=false;}
   finally{promptBusy=false;}
  };
 }
 function maybePrompt(){
  const device=installState();
  if(appEntry()&&device.mobile&&!device.installed){showSetup('install');return;}
  if(document.getElementById('tnt-phone-setup')?.dataset.step==='install'){closeSetup().then(maybePrompt);return;}
  const currentOwner=owner(),existing=document.getElementById('tnt-phone-invite');
  if(appEntry()&&device.mobile&&device.installed&&currentOwner&&window.TNT?.identity&&TNT.profileComplete&&!paused()&&!setupSkipped()&&!(permission()==='granted'&&consent())){showSetup('push');return;}
  if(document.getElementById('tnt-phone-setup')){closeSetup();return;}
  if(existing&&existing.dataset.owner!==currentOwner)existing.remove();
  if(!currentOwner||!window.TNT?.identity||!TNT.profileComplete||paused()||dismissed()||promptBusy||document.getElementById('tnt-phone-invite'))return;
  if(permission()==='granted'&&consent())return;
  const {ios,installed}=installState();
  if(!supported()&&!(ios&&!installed))return;
  const install=ios&&!installed,blocked=permission()==='denied',panel=document.createElement('section');
  panel.id='tnt-phone-invite';panel.className='tnt-phone-invite';panel.dataset.owner=currentOwner;panel.setAttribute('aria-labelledby','tnt-phone-invite-title');
  const title=install?'Llevá TNT a tu pantalla de inicio':blocked?'Tus avisos están bloqueados':'No te pierdas lo que pasa en TNT';
  const text=install?'En iPhone o iPad, agregá TNT a la pantalla de inicio para recibir mensajes y novedades.':blocked?'Podés volver a permitirlos desde los ajustes del teléfono o del navegador.':'Activá los mensajes y novedades del equipo en este teléfono, incluso cuando TNT esté cerrada.';
  panel.innerHTML=`<img src="${ICON}" alt="" width="42" height="42"><div class="tnt-phone-invite-copy"><h2 id="tnt-phone-invite-title">${title}</h2><p>${text}</p><p data-phone-invite-status role="status" aria-live="polite" hidden></p></div><div class="tnt-phone-invite-actions"><button type="button" class="tnt-button primary" data-phone-invite-enable>${install?'Cómo instalar':blocked?'Cómo activarlos':'Activar notificaciones'}</button><button type="button" class="tnt-button" data-phone-invite-later>Más tarde</button></div>`;
  document.body.append(panel);
  panel.querySelector('[data-phone-invite-later]').onclick=()=>{dismissedOwner=currentOwner;try{sessionStorage.setItem('tnt-phone-invite-dismissed:'+currentOwner,'yes');}catch{}panel.remove();};
  panel.querySelector('[data-phone-invite-enable]').onclick=async event=>{
   const button=event.currentTarget,status=panel.querySelector('[data-phone-invite-status]');
   status.hidden=false;
   if(install){status.hidden=true;P.openInstall();return;}
   if(permission()==='denied'){status.textContent=ios?'En Ajustes → Notificaciones → TNT, activá Permitir notificaciones. Después volvé a abrir TNT.':'Abrí la información del sitio junto a la dirección, entrá en Permisos → Notificaciones y elegí Permitir. Si sigue bloqueado, revisá los ajustes de notificaciones del teléfono.';return;}
   // Only the user's tap may request the system permission (especially on iOS).
   button.disabled=true;promptBusy=true;status.textContent='Activando los avisos…';
   try{await P.enableTNT();}
   catch(error){status.textContent=error.message||'No pudimos activar los avisos. Reintentá.';button.textContent=permission()==='denied'?'Cómo activarlos':'Reintentar';button.disabled=false;}
   finally{promptBusy=false;}
  };
 }
 navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='TNT_NOTIFICATION_RECEIVED'){window.TNTNotifications?.load().catch(()=>{});return;}if(e.data?.type!=='TNT_PUSH_RECEIVED'||!e.data.id)return;receipts.set(e.data.id,Date.now());if(receipts.size>10)receipts.delete(receipts.keys().next().value);document.dispatchEvent(new CustomEvent('tnt:phone-received',{detail:{id:e.data.id}}));});
 // Check on every entry, including direct module links. Never reload a user's draft.
 function check(){if(!('serviceWorker'in navigator)||Date.now()-lastCheck<300000)return;lastCheck=Date.now();registration().then(reg=>reg.update()).catch(()=>{});}
 if(document.readyState==='complete')check();else window.addEventListener('load',check,{once:true});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){check();P.sync().catch(()=>{});maybePrompt();}});
 window.addEventListener('online',()=>{lastCheck=0;check();P.sync().catch(()=>{});});
 document.addEventListener('tnt:ready',()=>{P.sync().catch(()=>{});maybePrompt();});
 document.addEventListener('tnt:profile',maybePrompt);
 document.addEventListener('tnt:membership',maybePrompt);
 window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change',maybePrompt);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',maybePrompt,{once:true});else maybePrompt();
 if(window.TNT?.ready)Promise.resolve(TNT.ready).then(maybePrompt).catch(()=>{});
})();
