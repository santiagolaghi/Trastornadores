(() => {
 'use strict';
 const VERSION='20261017r4';
 const PUBLIC_KEY='BF3EVnNKTFBmSHImqA-PpYPylaHMG9L-A-gomiSB20084j_mNWWAT_Gm282-ovE5fXBN6fkPT_QyuXSx4H8r1hI';
 const ICON='/icons/dynamite-app-192.png?v='+VERSION,BADGE='/icons/notification-badge.png?v='+VERSION;
 const receipts=new Map();let registered,lastCheck=0;
 const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window);
 const permission=()=>window.Notification?.permission||'default';
 const owner=()=>window.TNT?.account?.auth_user_id||window.TNT?.person?.id||'';
 const consentKey=()=> 'tnt-phone-enabled:'+owner();
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
  publicKey:PUBLIC_KEY,version:VERSION,supported,permission,
  async enableTNT(){const {sub}=await subscription();await save(sub);consent(true);return sub;},
  async disableTNT(){const sub=await P.current();if(sub){const r=await TNT.sb.rpc('tnt_push_unsubscribe',{p_endpoint:sub.endpoint});if(r.error)throw r.error;}consent(false);},
  forget(){consent(false);},
  async sync(){if(!owner()||!consent()||permission()!=='granted')return;const {sub}=await subscription({ask:false});await save(sub);},
  async enableCamp(sb,token){const {sub,reg}=await subscription();const r=await sb.rpc('tnt_camp_public_push_subscribe',{p_token:token,p_subscription:sub.toJSON()});if(r.error)throw r.error;await reg.showNotification('Avisos de Campamento activados',{body:'Las novedades del campamento también van a aparecer en este teléfono.',icon:ICON,badge:BADGE,tag:'tnt-push-enabled',data:{url:'/campamento/inscripcion/?token='+encodeURIComponent(token)}});return sub;},
  async current(){if(!('serviceWorker'in navigator))return null;const reg=await registration();return reg.pushManager.getSubscription();},
  async test(){if(permission()!=='granted')throw new Error('Permití los avisos en este teléfono antes de probarlos.');const sub=await P.current();if(!sub)throw new Error('Activá los avisos en este teléfono antes de probarlos.');const r=await TNT.sb.rpc('tnt_push_test',{p_endpoint:sub.endpoint});if(r.error)throw r.error;return{...r.data,received:receipts.has(r.data?.id)};},
  async testStatus(id){const r=await TNT.sb.rpc('tnt_push_test_status',{p_id:id});if(r.error)throw r.error;return{...r.data,received:receipts.has(id)};},
  async updateApp(){const reg=await registration();await timeout(reg.update(),'No pudimos buscar la actualización. Revisá la conexión.');await activated(reg.installing||reg.waiting);const response=await fetch('/manifest.webmanifest',{cache:'no-store'});if(!response.ok)throw new Error('No pudimos buscar la actualización. Reintentá.');const manifest=await response.json();if(manifest.id!=='/'||!manifest.icons?.length)throw new Error('La actualización todavía no está disponible.');return{version:await workerVersion(reg)};}
 };
 navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type!=='TNT_PUSH_RECEIVED'||!e.data.id)return;receipts.set(e.data.id,Date.now());if(receipts.size>10)receipts.delete(receipts.keys().next().value);document.dispatchEvent(new CustomEvent('tnt:phone-received',{detail:{id:e.data.id}}));});
 // Check on every entry, including direct module links. Never reload a user's draft.
 function check(){if(!('serviceWorker'in navigator)||Date.now()-lastCheck<300000)return;lastCheck=Date.now();registration().then(reg=>reg.update()).catch(()=>{});}
 if(document.readyState==='complete')check();else window.addEventListener('load',check,{once:true});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){check();P.sync().catch(()=>{});}});
 window.addEventListener('online',()=>{lastCheck=0;check();P.sync().catch(()=>{});});
 document.addEventListener('tnt:ready',()=>P.sync().catch(()=>{}));
})();
