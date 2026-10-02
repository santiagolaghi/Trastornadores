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
TNT.toggleTheme=function(){const current=document.documentElement.dataset.tntTheme||theme();TNT.setTheme(current==='dark'?'light':'dark')};
function rank(x){return levelRank[String(x||'none').toLowerCase()]||0}
function permissionMatch(rows,mod,scope,action){
 const exact=rows.find(x=>x.module===mod&&x.scope===scope&&x.action===action);
 return exact||rows.find(x=>x.module===mod&&x.scope==='*'&&x.action===action)||null;
}
TNT.accessLevel=(mod,scope='*')=>{
 const account=TNT.account||{};
 if(account.enabled===false)return 'none';
 if(account.system_role==='admin'&&mod!=='efe')return 'manage';
 const override=permissionMatch(TNT.personPermissions||[],mod,scope,'view');
 if(override)return override.allowed?'view':'none';
 const preset=permissionMatch(TNT.rolePermissions||[],mod,scope,'view');
 if(account.staff_status==='approved'&&preset)return preset.allowed?'view':'none';
 const base=TNTUI.accessInfo(account,TNT.grants,mod,scope).level;
 return base;
};
TNT.hasAccess=(mod,scope='*',min='view')=>rank(TNT.accessLevel(mod,scope))>=rank(min);
TNT.canAction=(mod,action,scope='*')=>{
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
 const manageActions=new Set(['manage','create_saturday','edit_event','manage_people','templates','create_chat','manage_members','delete_chat','history','reports','delete']);
 return editActions.has(action)?TNT.hasAccess(mod,scope,'edit'):manageActions.has(action)?TNT.hasAccess(mod,scope,'manage'):false;
};
TNT.displayName=function(){return TNT.identity?.display_name||TNT.account?.nickname||TNT.person?.full_name||TNT.identity?.email||'TNT'};
TNT.avatar=function(){return TNT.account?.avatar_url||TNT.identity?.avatar_url||''};
TNT.logout=async function(){await sb?.auth?.signOut?.();localStorage.removeItem('tnt-central-user');location.replace('/?v=14')};
function avatarHtml(cls='tnt-avatar'){const a=TNT.avatar(),n=TNT.displayName();return a?`<img class="${cls}" src="${esc(a)}" alt="">`:`<span class="${cls} fallback">${esc(initials(n))}</span>`}
async function ensureIdentity(session){
 if(!sb||!session)return null;
 const er=await sb.rpc('tnt_ensure_account');if(er.error)throw er.error;
 const ar=await sb.from('tnt_accounts').select('*').eq('auth_user_id',session.user.id).maybeSingle();if(ar.error)throw ar.error;
 if(!ar.data)throw new Error('No pude vincular tu Cuenta TNT.');if(ar.data.enabled===false)throw new Error('Tu cuenta está deshabilitada. Consultá con un Admin TNT.');
 const pr=await sb.from('tnt_people').select('*').eq('id',ar.data.person_id).single();if(pr.error)throw pr.error;
 const gr=await sb.from('tnt_access_grants').select('*').eq('person_id',ar.data.person_id);TNT.grants=gr.data||[];
 const legacy=await sb.from('tnt_module_access').select('*').eq('person_id',ar.data.person_id);for(const g of legacy.data||[]){if(g.module!=='efe'&&!TNT.grants.some(x=>x.module===g.module&&x.scope==='*'))TNT.grants.push({module:g.module,scope:'*',enabled:g.enabled,access_level:g.access_level});}
 const [rp,pp]=await Promise.all([
   ar.data.ministry_role?sb.from('tnt_role_permission_presets').select('*').eq('role',ar.data.ministry_role):Promise.resolve({data:[]}),
   sb.from('tnt_person_permission_overrides').select('*').eq('person_id',ar.data.person_id)
 ]);
 TNT.rolePermissions=rp.data||[];TNT.personPermissions=pp.data||[];
 TNT.account=ar.data;TNT.person=pr.data;TNT.isAdmin=ar.data.system_role==='admin';TNT.isStaff=ar.data.staff_status==='approved';
 TNT.identity={person_id:pr.data.id,auth_user_id:session.user.id,email:session.user.email||ar.data.email||'',full_name:pr.data.full_name||'',nickname:ar.data.nickname||'',display_name:ar.data.nickname||pr.data.full_name||session.user.email||'TNT',system_role:ar.data.system_role,ministry_role:ar.data.ministry_role||'',avatar_url:ar.data.avatar_url||session.user.user_metadata?.avatar_url||session.user.user_metadata?.picture||''};
 localStorage.setItem('tnt-central-user',JSON.stringify(TNT.identity));
 return TNT.identity;
}
function renderShell(){
 if(!shellEnabled||$('#tnt-shell'))return;
 document.body.classList.add('tnt-shell-active');const el=document.createElement('header');el.id='tnt-shell';
 el.innerHTML=`<button class="tnt-shell-home" data-tnt-home aria-label="Inicio TNT">${TNTUI.icon('home')}</button><div class="tnt-shell-brand"><b>${esc(moduleLabel)}</b><small>Trastornadores</small></div><button class="tnt-shell-icon" data-tnt-notify aria-label="Notificaciones">${TNTUI.icon('bell')}</button><button class="tnt-shell-icon" data-tnt-chat aria-label="Chat TNT">${TNTUI.icon('chat')}</button><button class="tnt-shell-icon" data-tnt-theme aria-label="Cambiar entre modo claro y oscuro">${TNTUI.icon('sun')}</button><button class="tnt-shell-user" data-tnt-user aria-label="Abrir mi cuenta">${avatarHtml()}<span>${esc(TNT.displayName())}</span>${TNT.isAdmin?'<i class="tnt-admin-badge">Admin</i>':''}</button>`;
 document.body.appendChild(el);
 const measure=()=>{document.documentElement.style.setProperty('--tnt-shell-h',el.getBoundingClientRect().height+'px');};if(window.ResizeObserver)new ResizeObserver(measure).observe(el);measure();
 $('[data-tnt-home]',el).onclick=()=>location.href='/';$('[data-tnt-notify]',el).onclick=showNotifications;$('[data-tnt-chat]',el).hidden=!TNT.hasAccess('chat');$('[data-tnt-chat]',el).onclick=()=>location.href='/chat/';$('[data-tnt-theme]',el).onclick=()=>TNT.toggleTheme();$('[data-tnt-user]',el).onclick=toggleAccountMenu;
}
function toggleAccountMenu(){let m=$('#tnt-account-menu');if(m){m.remove();return}m=document.createElement('section');m.id='tnt-account-menu';m.innerHTML=`<div class="tnt-profile-head">${avatarHtml()}<div><b>${esc(TNT.displayName())}</b><small>${esc(TNT.identity?.email||'')}</small><small>${esc(TNT.account?.ministry_role||'')}${TNT.isAdmin?' · Administrador':''}</small></div></div><div class="tnt-menu-actions">${TNT.isAdmin?'<button data-admin>Administración</button>':''}<button data-profile>Mi perfil</button><button data-theme>Modo ${document.documentElement.dataset.tntTheme==='dark'?'claro':'oscuro'}</button><button data-access>Mis accesos y solicitudes</button><button class="wide danger" data-logout>Cerrar sesión</button></div>`;document.body.appendChild(m);$('[data-admin]',m)?.addEventListener('click',()=>location.href='/admin/?v=14');$('[data-profile]',m).onclick=showProfile;$('[data-theme]',m).onclick=()=>{TNT.toggleTheme();m.remove()};$('[data-access]',m).onclick=showAccess;$('[data-logout]',m).onclick=()=>TNT.logout();setTimeout(()=>document.addEventListener('click',outside,{once:true}),0);function outside(e){if(!m.contains(e.target)&&!e.target.closest('[data-tnt-user]'))m.remove()}}
function sheet(title,body){return TNTUI.modal(title,body)}
async function showNotifications(){const r=await sb.from('tnt_notifications').select('*').order('created_at',{ascending:false}).limit(40);const rows=(r.data||[]).filter(n=>!n.person_id||n.person_id===TNT.person?.id);const o=sheet('Notificaciones',`<p>Todo lo que requiere tu atención en TNT.</p><div style="display:grid;gap:7px">${rows.length?rows.map(n=>`<button data-note="${n.id}" data-href="${esc(n.href||'')}" style="text-align:left;border:1px solid var(--tnt-line);background:${n.read_at?'var(--tnt-panel2)':'color-mix(in srgb,var(--tnt-accent) 10%,var(--tnt-panel))'};color:var(--tnt-text);border-radius:13px;padding:10px"><b style="display:block;font-size:14px">${esc(n.title)}</b><small style="color:var(--tnt-muted)">${esc(n.body||'') }</small></button>`).join(''):'<div class="tnt-pill good">No tenés notificaciones pendientes.</div>'}</div>`);o.querySelectorAll('[data-note]').forEach(b=>b.onclick=async()=>{await sb.from('tnt_notifications').update({read_at:new Date().toISOString()}).eq('id',b.dataset.note);if(b.dataset.href)location.href=b.dataset.href;else b.remove()})}
function showProfile(){
 const a=TNT.account||{};const o=sheet('Mi cuenta',`<div class="tnt-profile-head">${avatarHtml()}<div><b>${esc(TNT.displayName())}</b><small>${esc(TNT.identity?.email)}</small><small>${esc(a.ministry_role)}</small></div></div><form class="tnt-form" id="tnt-profile-form" style="margin-top:22px"><div><label for="tnt-nickname">Cómo querés que te llamemos</label><input id="tnt-nickname" name="nickname" maxlength="80" value="${esc(a.nickname||TNT.person.full_name)}" required></div><div><label for="tnt-bio">Sobre vos</label><textarea id="tnt-bio" name="bio" maxlength="500">${esc(a.bio||'')}</textarea></div><fieldset><legend>Tu equipo</legend><div><label for="tnt-skills">Habilidades</label><input id="tnt-skills" name="skills" value="${esc((a.skills||[]).join(', '))}" placeholder="Música, cocina, fotografía…"><small class="tnt-help">Separá cada habilidad con una coma.</small></div><div><label for="tnt-areas">Áreas donde participás</label><input id="tnt-areas" name="areas" value="${esc((a.service_areas||[]).join(', '))}" placeholder="Buffet, bienvenida, técnica…"></div></fieldset><fieldset><legend>Disponibilidad habitual</legend><div class="tnt-check-grid">${['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d=>`<label><input type="checkbox" name="days" value="${d}" ${(a.availability_days||[]).includes(d)?'checked':''}>${d}</label>`).join('')}</div><small class="tnt-help">Podés indicar excepciones por fecha en Organización.</small></fieldset><fieldset><legend>Contacto</legend><label for="tnt-contact">Teléfono de contacto</label><input id="tnt-contact" name="contact" type="tel" maxlength="40" value="${esc(a.profile_extra?.contact||'')}"><label><input type="checkbox" name="contact_public" ${a.profile_extra?.contact_public?'checked':''}> Compartir este contacto con el equipo (si lo desmarcás, no se guarda)</label></fieldset><div><label for="tnt-photo">Foto de perfil</label><input id="tnt-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp"></div><button class="tnt-button primary" type="submit">Guardar perfil</button><div class="tnt-profile-error" role="alert"></div></form>`);
 const membership=document.createElement('button');membership.type='button';membership.className='tnt-button';membership.textContent='Mi participación y función en TNT';membership.onclick=()=>TNT.configureMembership();o.querySelector('.tnt-sheet').append(membership);
 o.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),btn=e.target.querySelector('button[type=submit]');btn.disabled=true;try{
 const patch={nickname:String(f.get('nickname')||'').trim(),bio:String(f.get('bio')||'').trim(),skills:String(f.get('skills')||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,20),service_areas:String(f.get('areas')||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,20),availability_days:f.getAll('days'),profile_extra:{...(a.profile_extra||{}),contact:String(f.get('contact')||'').trim(),contact_public:f.has('contact_public')}};const image=f.get('photo');
 if(image?.size){if(!['image/jpeg','image/png','image/webp'].includes(image.type)||image.size>5*1024*1024)throw new Error('Elegí una imagen JPG, PNG o WebP de hasta 5 MB.');const path=TNT.person.id+'/'+crypto.randomUUID()+'.'+({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[image.type]);const up=await sb.storage.from('tnt-avatars').upload(path,image,{upsert:false});if(up.error)throw up.error;patch.avatar_url=sb.storage.from('tnt-avatars').getPublicUrl(path).data.publicUrl;}
 if(!patch.profile_extra.contact_public)delete patch.profile_extra.contact;const r=await sb.from('tnt_accounts').update(patch).eq('person_id',TNT.person.id).select('person_id,nickname,bio,avatar_url').single();if(r.error)throw r.error;
 Object.assign(TNT.account,patch);Object.assign(TNT.identity,{nickname:patch.nickname,display_name:patch.nickname||TNT.person.full_name,avatar_url:patch.avatar_url||TNT.avatar()});localStorage.setItem('tnt-central-user',JSON.stringify(TNT.identity));TNTUI.closeModal(o);$('#tnt-shell')?.remove();renderShell();TNTUI.toast('Perfil actualizado');document.dispatchEvent(new CustomEvent('tnt:profile'));
 }catch(err){o.querySelector('[role=alert]').textContent=err.message;}finally{btn.disabled=false;}};
}
const ACCESS_AREAS=[['organizacion','Organización','*'],['campamento','Campamento','*'],['efe','Asistencia · EFE Varones','varones'],['efe','Asistencia · EFE Mujeres +18','mujeres18'],['efe','Asistencia · EFE Mujeres 12 a 14','mujeres12_14'],['efe','Asistencia · EFE Mujeres 15 a 17','mujeres15_17'],['lista-sabados','Asistencia · Sábados','*'],['glosario','Prédicas y glosario','*'],['buffet','Buffet','*']];
const accessLabel=(mod,scope)=>ACCESS_AREAS.find(([m,,sc])=>m===mod&&sc===scope)?.[1]||mod;
async function showAccess(){if(!TNT.person)return;const r=await sb.from('tnt_access_requests').select('*').eq('person_id',TNT.person.id).order('created_at',{ascending:false});if(r.error)return TNTUI.toast('No se pudieron cargar las solicitudes.',true);const pending=(r.data||[]).filter(x=>x.status==='pending'),gs=(TNT.grants||[]).filter(x=>x.enabled),missing=ACCESS_AREAS.filter(([m,,scope])=>!TNT.hasAccess(m,scope,'view'));const o=sheet('Accesos y solicitudes',`<p>Solicitá el espacio que necesitás. Un administrador revisará tu pedido.</p>${pending.length?`<h3>En espera</h3><div class="tnt-access-list">${pending.map(x=>`<div class="tnt-pill warn">${esc(accessLabel(x.module,x.scope))} · Pendiente de revisión</div>`).join('')}</div>`:''}<h3>Tus accesos</h3><div class="tnt-access-list">${TNT.isAdmin?'<div class="tnt-pill good">Administrador</div>':gs.length?gs.map(g=>`<div class="tnt-pill">${esc(accessLabel(g.module,g.scope))} · ${g.access_level==='manage'?'Administrar':g.access_level==='edit'?'Editar':'Consultar'}</div>`).join(''):'<p>Todavía no tenés permisos específicos.</p>'}</div>${missing.length?`<h3>Solicitar acceso</h3><div class="tnt-access-list">${missing.map(([mod,label,scope])=>`<button class="tnt-button" data-access-request="${mod}" data-scope="${scope}" ${pending.some(x=>x.module===mod&&x.scope===scope)?'disabled':''}>${esc(label)}${pending.some(x=>x.module===mod&&x.scope===scope)?' · Solicitud pendiente':' · Solicitar'}</button>`).join('')}</div>`:''}`);o.querySelectorAll('[data-access-request]').forEach(b=>b.onclick=async()=>{b.disabled=true;const ok=await requestAccess(b.dataset.accessRequest,b.dataset.scope);if(ok){TNTUI.closeModal(o);showAccess()}else b.disabled=false;});}
async function requestAccess(mod,scope='*'){if(!TNT.person)return false;const existing=await sb.from('tnt_access_requests').select('id,status').eq('person_id',TNT.person.id).eq('module',mod).eq('scope',scope).eq('status','pending').limit(1);if(existing.error){TNTUI.toast(existing.error.message,true);return false}if(existing.data?.length){TNTUI.toast('Esta solicitud ya está pendiente de revisión.');return false}const r=await sb.from('tnt_access_requests').insert({person_id:TNT.person.id,module:mod,scope,requested_level:'view',note:'Solicitud desde la aplicación'}).select('*');if(r.error){TNTUI.toast(r.error.message,true);return false}TNTUI.toast('Solicitud enviada: '+accessLabel(mod,scope));return true;}
TNT.showAccess=showAccess;
function blockAccess(){if(!moduleName||TNT.hasAccess(moduleName,moduleScope,'view')||((TNT.isAdmin||TNT.isStaff)&&moduleScope==='*'&&TNT.grants.some(g=>g.module===moduleName&&g.enabled&&rank(g.access_level)>=1&&(!g.valid_from||Date.parse(g.valid_from)<=Date.now())&&(!g.valid_until||Date.parse(g.valid_until)>=Date.now()))))return false;const d=document.createElement('div');d.id='tnt-access-block';d.innerHTML=`<section class="tnt-access-card"><div class="ico">🔒</div><h2>Este espacio no está habilitado para tu cuenta.</h2><p>Estás entrando como <b>${esc(TNT.displayName())}</b>. Un Administrador puede darte acceso a ${esc(moduleLabel)}${moduleScope!=='*'?' · '+esc(moduleScope):''}.</p><button data-request>Solicitar acceso</button><button class="secondary" data-home>Volver al inicio</button></section>`;document.body.appendChild(d);$('[data-request]',d).onclick=()=>requestAccess(moduleName,moduleScope);$('[data-home]',d).onclick=()=>location.href='/?v=14';return true}
TNT.configureMembership=function(){
 const a=TNT.account,p=TNT.person;
 const staff=a.staff_status==='approved'||a.staff_status==='pending';
 const o=sheet(a.onboarding_completed_at?'Tu participación en TNT':'Te damos la bienvenida a TNT',`<form class="tnt-form" id="tnt-membership"><p>Queremos mostrarte los espacios que te corresponden.</p><fieldset class="tnt-membership-choices"><legend>¿Sos parte del staff?</legend><label><input type="radio" name="staff" value="yes" ${staff?'checked':''} required> Sí, soy parte del equipo</label><label><input type="radio" name="staff" value="no" ${a.staff_status==='approved'?'disabled':''} ${!staff&&a.onboarding_completed_at?'checked':''} required> No, participo de TNT</label></fieldset>${a.staff_status==='approved'?'<p class="tnt-help">Tu participación en el staff ya fue aprobada. Si necesitás pasar a comunidad, pedile a un administrador que lo cambie.</p>':''}<label id="staff-role-field">¿Qué función cumplís?<select name="role" aria-label="Tu función en el staff">${['Pastor/a','Líder','Timoteo','Colaborador'].map(r=>`<option value="${r}" ${(a.requested_ministry_role||a.ministry_role)===r?'selected':''}>${r==='Colaborador'?'Colaborador/a':r}</option>`).join('')}</select><small>Un administrador revisará tu elección antes de habilitar el staff.</small></label><label>Fecha de nacimiento<input name="birthday" type="date" max="${TNTUI.dateKey()}" value="${esc(p.birthday||'')}" required></label><label>Sexo<select name="sex" aria-label="Sexo"><option value="U" ${p.sex==='U'?'selected':''}>Prefiero no indicarlo</option><option value="M" ${p.sex==='M'?'selected':''}>Varón</option><option value="F" ${p.sex==='F'?'selected':''}>Mujer</option></select></label><p role="status" id="membership-status"></p><button class="tnt-button primary" type="submit">Guardar y continuar</button></form>`);
 const form=o.querySelector('form'),roleField=o.querySelector('#staff-role-field');const adjust=()=>{roleField.hidden=form.elements.staff.value!=='yes';};form.querySelectorAll('[name=staff]').forEach(el=>el.onchange=adjust);adjust();
 form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');button.disabled=true;status.textContent='Guardando…';try{const result=await sb.rpc('tnt_complete_onboarding',{p_staff:form.elements.staff.value==='yes',p_role:form.elements.staff.value==='yes'?form.elements.role.value:null,p_birthday:form.elements.birthday.value||null,p_sex:form.elements.sex.value});if(result.error)throw result.error;await ensureIdentity(TNT.session);o.querySelector('.tnt-close').click();document.dispatchEvent(new CustomEvent('tnt:membership'));TNTUI.toast(form.elements.staff.value==='yes'&&(a.staff_status!=='approved'||form.elements.role.value!==a.ministry_role)?'Tu función quedó pendiente de revisión.':'Tus datos quedaron guardados.');}catch(error){status.textContent=error.message||'No se pudo guardar. Reintentá.';}finally{button.disabled=false;}};
};
TNT.sheet=sheet;TNT.requestAccess=requestAccess;TNT.editProfile=showProfile;
async function init(){
 theme();try{
 if(!sb)throw new Error('No se pudo cargar la conexión. Volvé a intentar.');
 const sr=await TNT.withTimeout(sb.auth.getSession(),'El inicio de sesión');if(sr.error)throw sr.error;const session=sr.data?.session;TNT.session=session;
 if(!session){localStorage.removeItem('tnt-central-user');if(!publicPage&&location.pathname!=='/'){location.replace('/?login=1&next='+encodeURIComponent(location.pathname+location.search));return}readyResolve.splice(0).forEach(r=>r(null));document.dispatchEvent(new CustomEvent('tnt:ready',{detail:null}));return;}
 await TNT.withTimeout(ensureIdentity(session),'La carga de tu cuenta');if(!publicPage&&moduleName&&!TNT.account.onboarding_completed_at){TNT.blocked=true;location.replace('/?onboarding=1');readyResolve.splice(0).forEach(r=>r(TNT.identity));return;}renderShell();TNT.blocked=blockAccess();readyResolve.splice(0).forEach(r=>r(TNT.identity));document.dispatchEvent(new CustomEvent('tnt:ready',{detail:TNT.identity}));
 }catch(e){TNT.error=e;console.error(e);readyResolve.splice(0).forEach(r=>r(null));document.dispatchEvent(new CustomEvent('tnt:error',{detail:e}));if(!publicPage){const panel=document.createElement('div');panel.id='tnt-access-block';panel.innerHTML=`<section class="tnt-access-card"><h2>No pudimos cargar tu cuenta</h2><p>${esc(e.message)}</p><button id="tnt-retry">Volver a intentar</button><button class="secondary" id="tnt-back">Volver al inicio</button></section>`;document.body.append(panel);$('#tnt-retry').onclick=()=>location.reload();$('#tnt-back').onclick=()=>location.href='/';}}
}
function measureViewport(){const v=window.visualViewport;document.documentElement.style.setProperty('--tnt-viewport-height',(v?.height||window.innerHeight)+'px');document.documentElement.style.setProperty('--tnt-viewport-top',(v?.offsetTop||0)+'px');}
measureViewport();window.addEventListener('resize',measureViewport);window.visualViewport?.addEventListener('resize',measureViewport);window.visualViewport?.addEventListener('scroll',measureViewport);
init();
})();