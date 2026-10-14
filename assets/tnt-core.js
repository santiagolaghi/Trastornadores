(function(){
'use strict';
const SUPABASE_URL='https://oeodnnomgiddkblnlzay.supabase.co';
const SUPABASE_KEY='sb_publishable_X06jWDKqV6jgKbaa1PrrbQ_zto1XeTJ';
const script=document.currentScript;
const moduleName=script?.dataset?.module||document.body?.dataset?.tntModule||'';
const moduleLabel=script?.dataset?.label||document.body?.dataset?.tntLabel||moduleName||'TNT';
const moduleScope=script?.dataset?.scope||document.body?.dataset?.tntScope||'*';
const shellEnabled=(script?.dataset?.shell||document.body?.dataset?.tntShell||'on')!=='off';
const publicPage=(script?.dataset?.public||'false')==='true';
const levelRank={none:0,view:1,user:1,edit:2,editor:2,manage:3,manager:3,admin:4};
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const requestFetch=async(url,options={})=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}};
const sb=window.supabase?.createClient?.(SUPABASE_URL,SUPABASE_KEY,{global:{fetch:requestFetch},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const readyResolve=[];
const TNT=window.TNT={sb,identity:null,person:null,account:null,grants:[],rolePermissions:[],personPermissions:[],module:moduleName,scope:moduleScope,isAdmin:false,ready:new Promise(r=>readyResolve.push(r))};
TNT.withTimeout=(promise,label='La conexión',ms=25000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(label+' tardó demasiado. Reintentá.')),ms);Promise.resolve(promise).then(resolve,reject).finally(()=>clearTimeout(timer));});
function initials(n){return String(n||'TNT').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'T'}
function theme(){let t=localStorage.getItem('tnt-theme')||'dark';if(t==='system')t=matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';document.documentElement.dataset.tntTheme=t;return t}
TNT.setTheme=function(t){localStorage.setItem('tnt-theme',t);theme();document.dispatchEvent(new CustomEvent('tnt:theme',{detail:{theme:t}}))};
window.addEventListener('storage',e=>{if(e.key==='tnt-theme'){theme();document.dispatchEvent(new CustomEvent('tnt:theme'));}});
TNT.toggleTheme=function(){const current=document.documentElement.dataset.tntTheme||theme();TNT.setTheme(current==='dark'?'light':'dark')};
function rank(x){return levelRank[String(x||'none').toLowerCase()]||0}
function permissionMatch(rows,mod,scope,action){
 const exact=rows.find(x=>x.module===mod&&x.scope===scope&&x.action===action);
 return exact||rows.find(x=>x.module===mod&&x.scope==='*'&&x.action===action)||null;
}
TNT.accessLevel=(mod,scope='*')=>{
 if(TNT.profileComplete!==true||(!TNT.isAdmin&&window.TNTExperience&&!TNTExperience.enabled(mod)))return 'none';
 return TNTUI.accessInfo(TNT.account||{},TNT.grants,mod,scope,Date.now(),TNT.rolePermissions||[],TNT.personPermissions||[]).level;
};
TNT.hasAccess=(mod,scope='*',min='view')=>levelRank[min]===undefined?TNT.canAction(mod,min,scope):rank(TNT.accessLevel(mod,scope))>=rank(min);
TNT.canAction=(mod,action,scope='*')=>{
 if(TNT.profileComplete!==true||(!TNT.isAdmin&&window.TNTExperience&&!TNTExperience.enabled(mod)))return false;
 const account=TNT.account||{};
 if(account.enabled===false)return false;
 if(account.system_role==='admin'&&mod!=='efe')return true;
 if(action==='view')return TNT.hasAccess(mod,scope,'view');
 if(!TNT.hasAccess(mod,scope,'view'))return false;
 const override=permissionMatch(TNT.personPermissions||[],mod,scope,action);
 if(override)return !!override.allowed;
 const preset=permissionMatch(TNT.rolePermissions||[],mod,scope,action);
 if(preset)return !!preset.allowed;
 const editActions=new Set(['edit','attendance','send_message','update_own_activity','create_activity','edit_activity','assign_people','edit_people','sell','edit_stock']);
 const manageActions=new Set(['manage','create_saturday','edit_event','manage_people','templates','create_chat','manage_members','delete_chat','history','reports','delete','delete_activity','delete_event']);
 return editActions.has(action)?TNT.hasAccess(mod,scope,'edit'):manageActions.has(action)?TNT.hasAccess(mod,scope,'manage'):false;
};
TNT.displayName=function(){return TNT.identity?.display_name||TNT.account?.nickname||TNT.person?.full_name||TNT.identity?.email||'TNT'};
TNT.avatar=function(){return TNT.account?.avatar_url||TNT.identity?.avatar_url||''};
TNT.logout=async function(){window.TNTPush?.forget();try{const sub=await window.TNTPush?.current();if(sub)await sb.rpc('tnt_push_unsubscribe',{p_endpoint:sub.endpoint});}catch{}await sb?.auth?.signOut?.();localStorage.removeItem('tnt-central-user');location.replace('/?v=14')};
function avatarHtml(cls='tnt-avatar'){return TNTUI.avatar(TNT.person,{...TNT.account,avatar_url:TNT.avatar()},cls);}
async function ensureIdentity(session){
 if(!sb||!session)return null;
 // Creating/syncing an account is a sign-in operation, not part of a live read.
 if(!TNT.account||TNT.account.auth_user_id!==session.user.id){const er=await sb.rpc('tnt_ensure_account');if(er.error)throw er.error;}
 const ar=await sb.from('tnt_accounts').select('*').eq('auth_user_id',session.user.id).maybeSingle();if(ar.error)throw ar.error;
 if(!ar.data)throw new Error('No pude vincular tu Cuenta TNT.');if(ar.data.enabled===false)throw new Error('Tu cuenta está deshabilitada. Consultá con un Admin TNT.');
 const [pr,gr,legacy,rp,pp,profile]=await Promise.all([
   sb.from('tnt_people').select('*').eq('id',ar.data.person_id).single(),
   sb.from('tnt_access_grants').select('*').eq('person_id',ar.data.person_id),
   sb.from('tnt_module_access').select('*').eq('person_id',ar.data.person_id),
   ar.data.ministry_role?sb.from('tnt_role_permission_presets').select('*').eq('role',ar.data.ministry_role):Promise.resolve({data:[]}),
   sb.from('tnt_person_permission_overrides').select('*').eq('person_id',ar.data.person_id),
   sb.rpc('tnt_profile_context')
 ]);
 for(const result of [pr,gr,legacy,rp,pp,profile])if(result.error)throw result.error;
 if(pr.data.active===false)throw new Error('Tu perfil está archivado. Consultá con un administrador.');
 TNT.grants=gr.data||[];
 for(const g of legacy.data||[])if(g.module!=='efe'&&!TNT.grants.some(x=>x.module===g.module&&x.scope==='*'))TNT.grants.push({module:g.module,scope:'*',enabled:g.enabled,access_level:g.access_level});
 TNT.rolePermissions=rp.data||[];TNT.personPermissions=(pp.data||[]).filter(x=>!x.archived_at);
 TNT.profileContext=profile.data;TNT.profileComplete=profile.data?.complete===true;
 TNT.account=ar.data;TNT.person=pr.data;TNT.isAdmin=ar.data.system_role==='admin';TNT.isStaff=ar.data.staff_status==='approved';
 TNT.identity={person_id:pr.data.id,auth_user_id:session.user.id,email:session.user.email||ar.data.email||'',full_name:pr.data.full_name||'',nickname:ar.data.nickname||'',display_name:ar.data.nickname||pr.data.full_name||session.user.email||'TNT',system_role:ar.data.system_role,ministry_role:ar.data.ministry_role||'',avatar_url:ar.data.avatar_url||session.user.user_metadata?.avatar_url||session.user.user_metadata?.picture||''};
 if(window.TNTExperience&&!TNTExperience.loaded){await TNTExperience.load(sb);TNTExperience.loaded=true;}
 localStorage.setItem('tnt-central-user',JSON.stringify(TNT.identity));
 return TNT.identity;
}
function renderShell(){
 if($('#tnt-shell')||!TNT.identity)return;
 document.body.classList.add('tnt-shell-active');const el=document.createElement('header');el.id='tnt-shell';
 el.innerHTML=`<button class="tnt-shell-home" data-tnt-home aria-label="${moduleName?'Volver al inicio TNT':'Inicio TNT'}">${moduleName?TNTUI.icon('back'):'<img class="tnt-brand-mark" src="/icons/dynamite-app.svg?v=20261013" alt="TNT">'}</button><div class="tnt-shell-brand"><b>${esc(moduleName?moduleLabel:'Trastornadores')}</b><small>${moduleName?'Trastornadores':'Hacemos TNT'}</small></div><nav class="tnt-shell-tools" aria-label="Mi cuenta y configuración">${TNT.isAdmin?`<a class="tnt-shell-icon" data-tnt-admin href="/admin/" aria-label="Administración TNT">${TNTUI.icon('settings')}</a>`:''}<button class="tnt-shell-icon" data-tnt-theme aria-label="Cambiar tema">${TNTUI.icon('sun')}</button><button class="tnt-shell-icon" data-tnt-notify aria-label="Notificaciones">${TNTUI.icon('bell')}</button><button class="tnt-shell-user" data-tnt-user aria-label="Abrir mi cuenta">${avatarHtml()}</button></nav>`;
 document.body.appendChild(el);
 const measure=()=>{document.documentElement.style.setProperty('--tnt-shell-h',el.getBoundingClientRect().height+'px');};if(window.ResizeObserver)new ResizeObserver(measure).observe(el);measure();
 $('[data-tnt-home]',el).onclick=()=>location.href='/';$('[data-tnt-notify]',el).onclick=()=>window.TNTNotifications?TNTNotifications.open():showNotifications();$('[data-tnt-theme]',el).onclick=()=>TNT.toggleTheme();$('[data-tnt-user]',el).onclick=toggleAccountMenu;
 const syncTheme=()=>{const dark=document.documentElement.dataset.tntTheme==='dark',button=$('[data-tnt-theme]',el);button.innerHTML=TNTUI.icon(dark?'sun':'moon');button.setAttribute('aria-label',dark?'Usar modo claro':'Usar modo oscuro');};syncTheme();document.addEventListener('tnt:theme',syncTheme);
 document.addEventListener('tnt:profile',()=>{$('[data-tnt-user]',el).innerHTML=avatarHtml();});

}
function toggleAccountMenu(){let m=$('#tnt-account-menu');if(m){m.remove();return}m=document.createElement('section');m.id='tnt-account-menu';m.innerHTML=`<div class="tnt-profile-head">${avatarHtml()}<div><b>${esc(TNT.displayName())}</b><small>${esc(TNT.identity?.email||'')}</small><small>${esc(TNT.account?.ministry_role||'')}${TNT.isAdmin?' · Administrador':''}</small></div></div><div class="tnt-menu-actions">${TNT.isAdmin?'<button data-admin>Administración</button>':''}<button data-profile>Mi perfil</button><button data-theme>Modo ${document.documentElement.dataset.tntTheme==='dark'?'claro':'oscuro'}</button><button data-access>Mis accesos y solicitudes</button><button data-phone>Avisos en mi teléfono</button><button data-tutorial>Cómo se usa este espacio</button>${TNT.isAdmin?'<button data-studio>Estudio TNT</button>':''}<button class="wide danger" data-logout>Cerrar sesión</button></div>`;document.body.appendChild(m);$('[data-admin]',m)?.addEventListener('click',()=>location.href='/admin/?v=14');$('[data-profile]',m).onclick=TNT.showMyProfile;$('[data-theme]',m).onclick=()=>{TNT.toggleTheme();m.remove()};$('[data-access]',m).onclick=showAccess;$('[data-phone]',m).onclick=()=>{m.remove();TNTNotifications.phone();};$('[data-tutorial]',m).onclick=()=>{m.remove();TNTExperience.startTutorial();};$('[data-studio]',m)?.addEventListener('click',()=>{m.remove();TNTExperience.openSettings();});$('[data-logout]',m).onclick=()=>TNT.logout();setTimeout(()=>document.addEventListener('click',outside,{once:true}),0);function outside(e){if(!m.contains(e.target)&&!e.target.closest('[data-tnt-user]'))m.remove()}}
function sheet(title,body){return TNTUI.modal(title,body)}
async function showNotifications(){const r=await sb.from('tnt_notifications').select('*').order('created_at',{ascending:false}).limit(40);const rows=(r.data||[]).filter(n=>!n.person_id||n.person_id===TNT.person?.id);const o=sheet('Notificaciones',`<p>Todo lo que requiere tu atención en TNT.</p><div style="display:grid;gap:7px">${rows.length?rows.map(n=>`<button data-note="${n.id}" data-href="${esc(n.href||'')}" style="text-align:left;border:1px solid var(--tnt-line);background:${n.read_at?'var(--tnt-panel2)':'color-mix(in srgb,var(--tnt-accent) 10%,var(--tnt-panel))'};color:var(--tnt-text);border-radius:13px;padding:10px"><b style="display:block;font-size:14px">${esc(n.title)}</b><small style="color:var(--tnt-muted)">${esc(n.body||'') }</small></button>`).join(''):'<div class="tnt-pill good">No tenés notificaciones pendientes.</div>'}</div>`);o.querySelectorAll('[data-note]').forEach(b=>b.onclick=async()=>{await sb.from('tnt_notifications').update({read_at:new Date().toISOString()}).eq('id',b.dataset.note);if(b.dataset.href)location.href=b.dataset.href;else b.remove()})}
async function showProfile(){
 const onProfiles=/^\/perfiles\/datos\/?$/.test(location.pathname);
 if(!onProfiles){location.href='/perfiles/datos/?me=1&edit=1';return;}
 return TNTProfileEditor.open(TNT.person.id);
}
TNT.showMyAttendance=async function(){const r=await sb.rpc('tnt_my_attendance');if(r.error)return TNTUI.toast('No pudimos cargar tus asistencias.',true);sheet('Mis asistencias',`<p>Solo ves tus propios registros.</p><div class="tnt-access-list">${(r.data||[]).map(x=>`<article class="tnt-pill"><b>${esc(TNTUI.date(x.meeting_date))} · ${esc(x.area)}</b><span>${esc({present:'Presente',absent:'Ausente',pending:'Sin registrar',justified:'Justificado'}[x.status]||'Sin registrar')}</span></article>`).join('')||'<p>Todavía no hay asistencias registradas para tu perfil.</p>'}</div>`);};
const ACCESS_AREAS=[['organizacion','Organización','*'],['campamento','Campamento','*'],['efe','Asistencia · EFE Varones','varones'],['efe','Asistencia · EFE Mujeres +18','mujeres18'],['efe','Asistencia · EFE Mujeres 12 a 14','mujeres12_14'],['efe','Asistencia · EFE Mujeres 15 a 17','mujeres15_17'],['lista-sabados','Asistencia · Sábados','*'],['glosario','Prédicas y glosario','*'],['buffet','Buffet','*'],['perfiles','Perfiles','*']];
const accessLabel=(mod,scope)=>ACCESS_AREAS.find(([m,,sc])=>m===mod&&sc===scope)?.[1]||mod;
async function showAccess(){if(!TNT.person)return;const r=await sb.from('tnt_access_requests').select('*').eq('person_id',TNT.person.id).order('created_at',{ascending:false});if(r.error)return TNTUI.toast('No se pudieron cargar las solicitudes.',true);const pending=(r.data||[]).filter(x=>x.status==='pending'),gs=ACCESS_AREAS.filter(([m,,scope])=>TNT.hasAccess(m,scope,'view')),missing=ACCESS_AREAS.filter(([m,,scope])=>!TNT.hasAccess(m,scope,'view'));const o=sheet('Accesos y solicitudes',`<p>Solicitá el espacio que necesitás. Un administrador revisará tu pedido.</p>${pending.length?`<h3>En espera</h3><div class="tnt-access-list">${pending.map(x=>`<div class="tnt-pill warn">${esc(accessLabel(x.module,x.scope))} · Pendiente de revisión</div>`).join('')}</div>`:''}<h3>Tus accesos</h3><div class="tnt-access-list">${TNT.isAdmin?'<div class="tnt-pill good">Administrador</div>':gs.length?gs.map(([mod,label,scope])=>`<div class="tnt-pill">${esc(label)} · ${TNTUI.accessInfo(TNT.account,TNT.grants,mod,scope,Date.now(),TNT.rolePermissions,TNT.personPermissions).source==='role'?'Según tu rol':'Autorizado'}</div>`).join(''):'<p>Todavía no tenés permisos específicos.</p>'}</div>${missing.length?`<h3>Solicitar acceso</h3><div class="tnt-access-list">${missing.map(([mod,label,scope])=>`<button class="tnt-button" data-access-request="${mod}" data-scope="${scope}" ${pending.some(x=>x.module===mod&&x.scope===scope)?'disabled':''}>${esc(label)}${pending.some(x=>x.module===mod&&x.scope===scope)?' · Solicitud pendiente':' · Solicitar'}</button>`).join('')}</div>`:''}`);o.querySelectorAll('[data-access-request]').forEach(b=>b.onclick=async()=>{b.disabled=true;const ok=await requestAccess(b.dataset.accessRequest,b.dataset.scope);if(ok){TNTUI.closeModal(o);showAccess()}else b.disabled=false;});}
async function requestAccess(mod,scope='*'){if(!TNT.person)return false;const existing=await sb.from('tnt_access_requests').select('id,status').eq('person_id',TNT.person.id).eq('module',mod).eq('scope',scope).eq('status','pending').limit(1);if(existing.error){TNTUI.toast(existing.error.message,true);return false}if(existing.data?.length){TNTUI.toast('Esta solicitud ya está pendiente de revisión.');return false}const r=await sb.from('tnt_access_requests').insert({person_id:TNT.person.id,module:mod,scope,requested_level:'view',note:'Solicitud desde la aplicación'}).select('*');if(r.error){TNTUI.toast(r.error.message,true);return false}TNTUI.toast('Solicitud enviada: '+accessLabel(mod,scope));return true;}
TNT.showAccess=showAccess;
function blockAccess(){if(TNT.ownProfilePage?.()&&TNT.profileComplete)return false;if(window.TNTExperience&&moduleName&&!TNT.isAdmin&&!TNTExperience.enabled(moduleName))return true;if(!moduleName||TNT.hasAccess(moduleName,moduleScope,'view')||(TNT.profileComplete&&(TNT.isAdmin||TNT.isStaff)&&moduleScope==='*'&&TNT.grants.some(g=>g.module===moduleName&&g.enabled&&rank(g.access_level)>=1&&(!g.valid_from||Date.parse(g.valid_from)<=Date.now())&&(!g.valid_until||Date.parse(g.valid_until)>=Date.now()))))return false;const d=document.createElement('div');d.id='tnt-access-block';d.innerHTML=`<section class="tnt-access-card"><div class="ico">🔒</div><h2>Este espacio no está habilitado para tu cuenta.</h2><p>Estás entrando como <b>${esc(TNT.displayName())}</b>. Un Administrador puede darte acceso a ${esc(moduleLabel)}${moduleScope!=='*'?' · '+esc(moduleScope):''}.</p><button data-request>Solicitar acceso</button><button class="secondary" data-home>Volver al inicio</button></section>`;document.body.appendChild(d);$('[data-request]',d).onclick=()=>requestAccess(moduleName,moduleScope);$('[data-home]',d).onclick=()=>location.href='/?v=14';return true}
TNT.mountProfileCompletion=function(container){
 const P=window.TNTProfiles,a=TNT.account,ctx=TNT.profileContext,values=ctx.values,staff=a.staff_status==='approved'||a.staff_status==='pending';
 const role=a.requested_ministry_role||a.ministry_role||'Colaborador',completingFields={...ctx.fields,efe_group:{...ctx.fields.efe_group,visible:false},efe_service_role:{...ctx.fields.efe_service_role,visible:false}};
 container.innerHTML=`<form class="tnt-form profile-completion" id="tnt-membership" novalidate><nav class="profile-steps" aria-label="Pasos del perfil"><span class="is-active">1 · Tus datos</span><span>2 · Sobre vos</span><span>3 · Tu lugar</span></nav>${P.render(completingFields,values,ctx.groups,{locked:!!a.onboarding_completed_at,role:a.ministry_role})}<fieldset class="profile-section"><legend>03 · Tu lugar en TNT</legend>${ctx.fields.efe_group?P.field('efe_group',P.config(ctx.fields).efe_group,values.efe_group,ctx.groups):''}<div data-efe-service-role>${P.field("efe_service_role",P.config(ctx.fields).efe_service_role,values.efe_service_role||"Participo",ctx.groups)}</div><label>Correo de tu cuenta<input type="email" value="${esc(TNT.identity.email)}" readonly></label><fieldset class="tnt-membership-choices"><legend>¿Sos parte del staff?</legend><label><input type="radio" name="staff" value="yes" ${staff?'checked':''} required> Sí, soy parte del equipo</label><label><input type="radio" name="staff" value="no" ${a.staff_status==='approved'?'disabled':''} ${!staff&&a.onboarding_completed_at?'checked':''} required> Soy parte de la comunidad</label></fieldset><label data-staff-role>Tu función<select name="role">${['Pastor/a','Líder','Timoteo','Colaborador'].map(r=>`<option value="${r}" ${r===role?'selected':''}>${r}</option>`).join('')}</select><small>El staff se habilita cuando un administrador confirma tu función.</small></label><label class="profile-consent"><input name="consent" type="checkbox" ${TNT.person.profile_consent?'checked':''} required><span>Confirmo mis datos y autorizo su uso interno para organización y contacto.</span></label></fieldset><p class="profile-save-status" role="status" aria-live="polite"></p><footer class="profile-form-footer"><button class="tnt-button" type="button" data-previous>${TNTUI.icon('back')}Volver</button><button class="tnt-button primary" type="button" data-next>Continuar ${TNTUI.icon('arrow')}</button><button class="tnt-button primary" type="submit">Guardar y entrar a TNT ${TNTUI.icon('arrow')}</button></footer></form>`;
 const form=container.querySelector('form'),sections=[...form.querySelectorAll(':scope > .profile-section')],prev=form.querySelector('[data-previous]'),next=form.querySelector('[data-next]'),submit=form.querySelector('[type=submit]');let step=0;
 const roleField=form.querySelector('[data-staff-role]');const adjustRole=()=>{const yes=form.elements.staff.value==='yes';roleField.hidden=!yes;form.elements.role.disabled=!yes;const efeRole=form.querySelector('[data-efe-service-role]');if(efeRole){const show=yes&&form.elements.efe_group?.value&&form.elements.efe_group.value!=='none';efeRole.hidden=!show;efeRole.querySelector('select').disabled=!show;}const extra=sections[1];if(extra){const saved={...values,...P.collect(form,ctx.fields),_profile_roles:[]};const html=P.render(completingFields,saved,ctx.groups,{mode:'extra',role:yes?form.elements.role.value:'Comunidad'});const node=document.createElement('div');node.innerHTML=html;const content=node.querySelector('fieldset');if(content)extra.innerHTML=content.innerHTML;P.bind(form,ctx.fields,saved,ctx.groups);}};form.elements.efe_group?.addEventListener('change',adjustRole);form.elements.role.addEventListener('change',adjustRole);form.querySelectorAll('[name=staff]').forEach(x=>x.onchange=adjustRole);adjustRole();
 const paint=()=>{sections.forEach((s,i)=>s.hidden=i!==step);form.querySelectorAll('.profile-steps span').forEach((s,i)=>{s.classList.toggle('is-active',i===step);s.classList.toggle('is-done',i<step);});prev.hidden=step===0;next.hidden=step===sections.length-1;submit.hidden=step!==sections.length-1;};
 const validSection=()=>{for(const el of sections[step].querySelectorAll('input,select,textarea'))if(!el.checkValidity()){el.reportValidity();return false;}for(const [key,f] of Object.entries(P.config(ctx.fields))){if(f.type!=='multiselect'||!f.required)continue;const el=sections[step].querySelector('[name='+key+']');if(el&&!P.collect(form,ctx.fields)[key]?.length){form.querySelector('[data-error='+key+']').textContent='Elegí al menos una opción o escribí tu respuesta.';el.focus();return false;}}return true;};
 next.onclick=()=>{if(!validSection())return;step++;paint();container.scrollIntoView({behavior:'smooth',block:'start'});};prev.onclick=()=>{step--;paint();};paint();P.bind(form,ctx.fields,values,ctx.groups);
 if(!a.onboarding_completed_at&&a.staff_status!=='approved'&&!TNT.isAdmin){
  const candidates=document.createElement('section');candidates.className='tnt-profile-match';candidates.setAttribute('aria-live','polite');sections[0].append(candidates);let lookupTimer,lookupVersion=0,matchedName='';
  const lookup=async()=>{const name=[form.elements.first_name?.value,form.elements.last_name?.value].filter(Boolean).join(' ').trim(),birthday=form.elements.birthday?.value||null,version=++lookupVersion;if(name.length<7||name===matchedName){candidates.innerHTML='';return;}try{const r=await sb.rpc('tnt_match_profile_names',{p_name:name,p_birthday:birthday});if(r.error)throw r.error;if(version!==lookupVersion)return;const rows=Array.isArray(r.data)?r.data:[];candidates.innerHTML=rows.map(p=>`<article data-tnt-record><span>ENCONTRAMOS UN PERFIL DE TNT</span><h3>¿Sos ${esc(p.full_name)}?</h3><p>Si sos vos, usamos ese nombre para solicitar la vinculación de tu cuenta Google y conservar tu historial.</p><div><button type="button" class="tnt-button primary" data-match-person="${p.id}">Sí, soy yo</button><button type="button" class="tnt-button" data-no-match>No soy yo</button></div></article>`).join('');candidates.querySelectorAll('[data-match-person]').forEach(b=>b.onclick=()=>{const p=rows.find(p=>p.id===b.dataset.matchPerson),parts=p.full_name.trim().split(/\s+/);form.elements.first_name.value=parts.shift();form.elements.last_name.value=parts.join(' ');matchedName=p.full_name;candidates.innerHTML='<p>Listo. Completá tu fecha de nacimiento y el resto de los datos. Un administrador verifica la vinculación para conservar tu historia.</p>';});candidates.querySelectorAll('[data-no-match]').forEach(b=>b.onclick=()=>b.closest('article').remove());}catch(e){if(version===lookupVersion)candidates.innerHTML='<p>No pudimos buscar coincidencias. Podés seguir completando tus datos.</p>';}};
  ['first_name','last_name','birthday'].forEach(name=>form.elements[name]?.addEventListener('input',()=>{clearTimeout(lookupTimer);lookupTimer=setTimeout(lookup,350);}));setTimeout(lookup,100);
 }

 form.onsubmit=async e=>{e.preventDefault();for(let i=0;i<sections.length;i++){step=i;paint();if(!validSection())return;}if(!P.validate(form,ctx.fields))return;submit.disabled=true;const status=form.querySelector('[role=status]');status.textContent='Guardando tu perfil…';try{const result=await sb.rpc('tnt_finish_onboarding',{p_values:P.collect(form,ctx.fields),p_staff:form.elements.staff.value==='yes',p_role:form.elements.staff.value==='yes'?form.elements.role.value:null});if(result.error)throw result.error;await ensureIdentity(TNT.session);if(!TNT.profileComplete)throw Error('Todavía falta completar un campo obligatorio. Revisá el formulario.');const o=container.closest('dialog');if(o)await TNTUI.closeModal(o);TNT.blocked=false;document.dispatchEvent(new CustomEvent('tnt:membership'));}catch(error){status.textContent=error.message||'No pudimos guardar. Tus respuestas siguen acá.';submit.disabled=false;}};
};
TNT.configureMembership=async function(){
 if(!TNT.profileComplete){const o=sheet('Tu perfil, tu lugar en TNT','<div id="complete-profile"></div>');TNT.mountProfileCompletion(o.querySelector('#complete-profile'));return;}
 const a=TNT.account,staff=a.staff_status==='approved'||a.staff_status==='pending';
 const o=sheet('Tu participación en TNT',`<form class="tnt-form"><fieldset class="tnt-membership-choices"><legend>¿Sos parte del staff?</legend><label><input type="radio" name="staff" value="yes" ${staff?'checked':''} required> Sí, soy parte del equipo</label><label><input type="radio" name="staff" value="no" ${a.staff_status==='approved'?'disabled':''} ${!staff?'checked':''} required> Soy parte de la comunidad</label></fieldset><label data-role>Tu función<select name="role">${['Pastor/a','Líder','Timoteo','Colaborador'].map(r=>`<option ${(a.requested_ministry_role||a.ministry_role)===r?'selected':''}>${r}</option>`).join('')}</select><small>Un administrador revisará tu elección.</small></label><p role="status"></p><button class="tnt-button primary" type="submit">Guardar participación</button></form>`);
 const f=o.querySelector('form'),adjust=()=>{const yes=f.elements.staff.value==='yes';f.querySelector('[data-role]').hidden=!yes;f.elements.role.disabled=!yes;};f.querySelectorAll('[name=staff]').forEach(x=>x.onchange=adjust);adjust();
 f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;try{const r=await sb.rpc('tnt_request_membership',{p_staff:f.elements.staff.value==='yes',p_role:f.elements.staff.value==='yes'?f.elements.role.value:null});if(r.error)throw r.error;await ensureIdentity(TNT.session);await TNTUI.closeModal(o);document.dispatchEvent(new CustomEvent('tnt:membership'));TNTUI.toast('Tu participación quedó guardada.');}catch(err){f.querySelector('[role=status]').textContent=err.message;b.disabled=false;}};
};

TNT.sheet=sheet;TNT.requestAccess=requestAccess;TNT.editProfile=showProfile;TNT.showMyProfile=()=>{location.href='/perfiles/datos/?me=1';};
TNT.ownProfilePage=()=>moduleName==='perfiles'&&/^\/perfiles\/datos\/?$/.test(location.pathname)&&new URLSearchParams(location.search).get('me')==='1';
TNT.refreshIdentity=async()=>{const identity=await ensureIdentity(TNT.session);const button=document.querySelector('[data-tnt-user]');if(button)button.innerHTML=avatarHtml();return identity;};
TNT.refreshAccess=async()=>{try{await TNT.refreshIdentity();document.dispatchEvent(new CustomEvent('tnt:permissions'));document.dispatchEvent(new CustomEvent('tnt:membership'));TNTUI.toast('Tu acceso está actualizado.');}catch(e){TNTUI.toast(e.message,true);}};
async function checkProfileRequirements(){
 if(!TNT.identity||!TNT.profileComplete||document.hidden)return;
 try{const r=await sb.rpc('tnt_profile_context');if(r.error)return;TNT.profileContext=r.data;
  if(r.data.complete!==true){TNT.profileComplete=false;TNT.blocked=true;
   if(moduleName){document.body.classList.remove('tnt-access-ready');location.replace('/?onboarding=1');}
   else document.dispatchEvent(new CustomEvent('tnt:membership'));
  }
 }catch(e){console.warn('Actualización de requisitos',e);}
}
document.addEventListener('visibilitychange',checkProfileRequirements);
const profileRequirementsTimer=setInterval(checkProfileRequirements,30000);
window.addEventListener('pagehide',()=>clearInterval(profileRequirementsTimer),{once:true});
async function init(){
 theme();try{
 if(!sb)throw new Error('No se pudo cargar la conexión. Volvé a intentar.');
 const sr=await TNT.withTimeout(sb.auth.getSession(),'El inicio de sesión');if(sr.error)throw sr.error;const session=sr.data?.session;TNT.session=session;if(publicPage&&!moduleName)document.body.classList.add('tnt-access-ready');
 if(!session){localStorage.removeItem('tnt-central-user');if(!publicPage&&location.pathname!=='/'){location.replace('/?login=1&next='+encodeURIComponent(location.pathname+location.search));return}readyResolve.splice(0).forEach(r=>r(null));document.dispatchEvent(new CustomEvent('tnt:ready',{detail:null}));return;}
 await TNT.withTimeout(ensureIdentity(session),'La carga de tu cuenta');if(moduleName&&!TNT.profileComplete){TNT.blocked=true;location.replace('/?onboarding=1');readyResolve.splice(0).forEach(r=>r(TNT.identity));return;}document.body.classList.add('tnt-access-ready');renderShell();TNT.blocked=blockAccess();readyResolve.splice(0).forEach(r=>r(TNT.identity));document.dispatchEvent(new CustomEvent('tnt:ready',{detail:TNT.identity}));
 }catch(e){TNT.blocked=true;TNT.error=e;console.error(e);readyResolve.splice(0).forEach(r=>r(null));document.dispatchEvent(new CustomEvent('tnt:error',{detail:e}));if(!publicPage){const panel=document.createElement('div');panel.id='tnt-access-block';panel.innerHTML=`<section class="tnt-access-card"><h2>No pudimos cargar tu cuenta</h2><p>${esc(e.message)}</p><button id="tnt-retry">Volver a intentar</button><button class="secondary" id="tnt-back">Volver al inicio</button></section>`;document.body.append(panel);$('#tnt-retry').onclick=()=>location.reload();$('#tnt-back').onclick=()=>location.href='/';}}
}
function measureViewport(){const v=window.visualViewport;document.documentElement.style.setProperty('--tnt-viewport-height',(v?.height||window.innerHeight)+'px');document.documentElement.style.setProperty('--tnt-viewport-top',(v?.offsetTop||0)+'px');}
measureViewport();window.addEventListener('resize',measureViewport);window.visualViewport?.addEventListener('resize',measureViewport);window.visualViewport?.addEventListener('scroll',measureViewport);
init();
})();
