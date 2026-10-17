/* Accounts already authenticated on this device; sessions never leave this origin. */
(() => {
 'use strict';
 const KEY='tnt-device-accounts:v1';let activeSwitch=false;
 const accounts=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]').filter(a=>a.id&&a.refresh_token);}catch{return[];}};
 const write=rows=>localStorage.setItem(KEY,JSON.stringify(rows));
 const API=window.TNTAccounts={open,remember,forget};
 async function remember(session){
  const T=window.TNT;if(!session?.refresh_token||!T?.identity||activeSwitch)return;
  const row={id:session.user.id,email:session.user.email||T.identity.email,name:T.displayName(),avatar:T.avatar(),access_token:session.access_token,refresh_token:session.refresh_token};write([row,...accounts().filter(a=>a.id!==row.id)].slice(0,6));
 }
 function forget(id=window.TNT?.session?.user?.id){write(accounts().filter(a=>a.id!==id));}
 function open(){
  const T=TNT,U=TNTUI,current=T.session?.user?.id;
  const o=U.modal('Tus cuentas en este dispositivo','<p>Cambiá entre cuentas que ya iniciaron sesión acá. Cada una conserva sus propios roles y permisos.</p><div class="tnt-device-accounts">'+accounts().map(a=>'<div class="tnt-device-account">'+U.avatar({full_name:a.name},{avatar_url:a.avatar})+'<button data-switch-account="'+U.esc(a.id)+'" '+(a.id===current?'disabled':'')+'><b>'+U.esc(a.name)+'</b><small>'+U.esc(a.email)+'</small><span>'+(a.id===current?'Cuenta actual':'Cambiar a esta cuenta')+'</span></button><button class="tnt-icon-button" data-forget-account="'+U.esc(a.id)+'" aria-label="Quitar cuenta de este dispositivo">'+U.icon('close')+'</button></div>').join('')+'</div><button class="tnt-button primary" data-add-account>'+U.icon('plus')+'Agregar otra cuenta Google</button><p role="status" aria-live="polite"></p>');
  const status=o.querySelector('[role=status]');
  o.querySelectorAll('[data-forget-account]').forEach(b=>b.onclick=()=>{forget(b.dataset.forgetAccount);b.closest('.tnt-device-account').remove();});
  o.querySelectorAll('[data-switch-account]').forEach(b=>b.onclick=async()=>{const a=accounts().find(a=>a.id===b.dataset.switchAccount);if(!a)return;b.disabled=true;status.textContent='Cambiando de cuenta…';
   try{await remember((await T.sb.auth.getSession()).data?.session);activeSwitch=true;const sub=await window.TNTPush?.current();if(sub){const removed=await T.sb.rpc('tnt_push_unsubscribe',{p_endpoint:sub.endpoint});if(removed.error)throw removed.error;}const r=await T.sb.auth.setSession({access_token:a.access_token,refresh_token:a.refresh_token});if(r.error)throw r.error;localStorage.removeItem('tnt-central-user');location.replace('/');}
   catch(error){activeSwitch=false;status.textContent=error.message+' Podés volver a agregar la cuenta con Google.';b.disabled=false;}
  });
  o.querySelector('[data-add-account]').onclick=async event=>{event.target.disabled=true;try{await remember((await T.sb.auth.getSession()).data?.session);const r=await T.sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/',queryParams:{prompt:'select_account'}}});if(r.error)throw r.error;}catch(error){status.textContent=error.message;event.target.disabled=false;}};
 }
 document.addEventListener('tnt:ready',()=>remember(TNT.session));document.addEventListener('tnt:profile',()=>remember(TNT.session));
})();
