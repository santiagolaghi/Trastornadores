/* Accounts already authenticated on this device; sessions never leave this origin. */
(() => {
 'use strict';
 const KEY='tnt-device-accounts:v1';let activeSwitch=false;
 const accounts=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]').filter(a=>a.id&&a.refresh_token);}catch{return[];}};
 const write=rows=>localStorage.setItem(KEY,JSON.stringify(rows));
 const API=window.TNTAccounts={open,openMenu:toggleAccountMenu,remember,forget};
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
function toggleAccountMenu() {
 const $=selector=>document.querySelector(selector),esc=TNTUI.esc,avatarHtml=()=>TNTUI.avatar(TNT.person,{...TNT.account,avatar_url:TNT.avatar()});
 const existing = $('#tnt-account-menu');
 if (existing) { existing.dispatchEvent(new Event('tnt:account-close')); return; }
 const returnFocus=document.activeElement,U = TNTUI, m = document.createElement('section'),backdrop=document.createElement('div');backdrop.className='tnt-account-backdrop';backdrop.setAttribute('aria-hidden','true');
 m.id = 'tnt-account-menu';
 m.setAttribute('role', 'dialog');
 m.setAttribute('aria-label', 'Tu cuenta de TNT');m.setAttribute('aria-modal','true');
 const groups = [
  ['Tu cuenta', [
   ['profile', 'people', 'Mi perfil', 'Tus datos y tu historia en TNT'],
   ['accounts', 'undo', 'Cambiar / agregar cuenta', 'Tus cuentas de Google en este dispositivo'],
   ...((TNT.isStaff||TNT.isAdmin)?[['access', 'lock', 'Mis accesos y solicitudes', 'Consultá tus permisos']]:[])
  ]],
  ['Tu experiencia', [
   ['appearance', 'edit', 'Apariencia de TNT', 'Una identidad para toda la app'],
   ['theme', document.documentElement.dataset.tntTheme === 'dark' ? 'sun' : 'moon', 'Modo ' + (document.documentElement.dataset.tntTheme === 'dark' ? 'claro' : 'oscuro'), 'Elegí cómo ver tu pantalla'],
   ['community', 'people', 'Vida en comunidad', 'Tus lecturas, desafíos y acompañamiento'],
   ['phone', 'bell', 'Avisos en mi teléfono', 'Mensajes y novedades, también al salir'],
   ['tutorial', 'help', 'Cómo se usa este espacio', 'Volvé a recorrer el tutorial']
  ]],
  ...(TNT.isAdmin ? [['Administración', [
   ['admin', 'settings', 'Configuración de TNT', 'Personas, roles y preguntas'],
   ['studio', 'edit', 'Estudio TNT', 'Portadas, textos y módulos']
  ]]] : [])
 ];
 const row = item => '<button type="button" data-' + item[0] + ' class="tnt-account-action"><span class="tnt-account-action-icon">' + U.icon(item[1]) + '</span><span><strong>' + esc(item[2]) + '</strong><small>' + esc(item[3]) + '</small></span>' + U.icon('arrow', 'tnt-account-action-arrow') + '</button>';
 m.innerHTML = '<header class="tnt-account-cover"><span class="tnt-account-eyebrow">TU ESPACIO EN TNT</span><button type="button" class="tnt-account-close" aria-label="Cerrar menú de cuenta">' + U.icon('close') + '</button><div class="tnt-profile-head">' + avatarHtml() + '<div><b>' + esc(TNT.displayName()) + '</b><small>' + esc(TNT.identity?.email || '') + '</small><span class="tnt-account-role">' + esc(TNT.account?.ministry_role || 'Comunidad TNT') + (TNT.isAdmin ? ' · Administrador' : '') + '</span></div></div></header><div class="tnt-menu-actions">' + groups.map(([label, items]) => '<section class="tnt-account-group"><h3>' + esc(label) + '</h3>' + items.map(row).join('') + '</section>').join('') + '<button type="button" class="tnt-account-logout" data-logout>' + U.icon('logout') + '<span>Cerrar sesión</span></button></div>';
 function close() {
  m.remove();backdrop.remove();document.body.classList.remove('tnt-account-open');returnFocus?.focus?.();
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', escape);
 }
 function outside(event) { if (!m.contains(event.target) && !event.target.closest('[data-tnt-user],#account')) close(); }
 function escape(event) { if(event.key==='Tab'){const items=[...m.querySelectorAll('button,a[href]')].filter(x=>!x.disabled);if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}} if (event.key === 'Escape') { close(); $('[data-tnt-user]')?.focus(); } }
 m.addEventListener('tnt:account-close', close, { once: true });
 m.querySelector('.tnt-account-close').onclick = close;
 const actions = {
  admin: () => location.href = '/admin/?tab=settings',
  profile: () => TNT.showMyProfile(),
  accounts: () => TNTAccounts.open(),
  appearance: () => TNTAppearance.open(),
  theme: () => TNT.toggleTheme(),
  access: () => TNT.showAccess(),
  phone: () => TNTNotifications.phone(),community:()=>location.href='/comunidad',
  tutorial: () => TNTExperience.startTutorial(),
  studio: () => TNTExperience.openSettings(),
  logout: () => TNT.logout()
 };
 Object.entries(actions).forEach(([key, action]) => {
  m.querySelector('[data-' + key + ']')?.addEventListener('click', () => { close(); action(); });
 });
 document.body.append(backdrop,m);document.body.classList.add('tnt-account-open');m.querySelector('.tnt-account-close').focus();
 document.addEventListener('pointerdown', outside, true);
 document.addEventListener('keydown', escape);
}
 document.addEventListener('tnt:ready',()=>remember(TNT.session));document.addEventListener('tnt:profile',()=>remember(TNT.session));
})();
