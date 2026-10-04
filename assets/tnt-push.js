(() => {
'use strict';
const PUBLIC_KEY='BF3EVnNKTFBmSHImqA-PpYPylaHMG9L-A-gomiSB20084j_mNWWAT_Gm282-ovE5fXBN6fkPT_QyuXSx4H8r1hI';
const ICON='/icons/icon-192.png',BADGE='/icons/notification-badge.png';
function keyBytes(base64){const pad='='.repeat((4-base64.length%4)%4),raw=atob((base64+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
async function registration(){if(!('serviceWorker'in navigator))throw new Error('Este navegador no admite notificaciones en segundo plano.');await navigator.serviceWorker.register('/sw.js',{scope:'/'});return navigator.serviceWorker.ready}
async function subscription(){
 if(!('Notification'in window)||!('PushManager'in window))throw new Error('Este teléfono no admite notificaciones web.');
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw new Error('Necesitamos permiso para mostrar avisos en el teléfono. Podés habilitarlo desde los permisos del navegador.');
 const reg=await registration();
 let sub=await reg.pushManager.getSubscription();
 if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(PUBLIC_KEY)});
 return{sub,reg};
}
async function success(reg,title='Avisos TNT activados',url='/campamento/'){
 try{await reg.showNotification(title,{body:'Las novedades importantes también van a aparecer en este teléfono.',icon:ICON,badge:BADGE,tag:'tnt-push-enabled',data:{url},vibrate:[90,45,90]})}catch{}
}
window.TNTPush={
 publicKey:PUBLIC_KEY,
 supported:()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window),
 permission:()=>window.Notification?.permission||'default',
 async enableTNT(){const {sub,reg}=await subscription();if(!window.TNT?.sb)throw new Error('Iniciá sesión en TNT.');const r=await TNT.sb.rpc('tnt_push_subscribe',{p_subscription:sub.toJSON()});if(r.error)throw r.error;await success(reg,'Avisos TNT activados','/');return sub},
 async enableCamp(sb,token){const {sub,reg}=await subscription();const r=await sb.rpc('tnt_camp_public_push_subscribe',{p_token:token,p_subscription:sub.toJSON()});if(r.error)throw r.error;await success(reg,'Avisos de Campamento activados','/campamento/inscripcion/?token='+encodeURIComponent(token));return sub},
 async current(){try{const reg=await registration();return reg.pushManager.getSubscription()}catch{return null}}
};
})();
