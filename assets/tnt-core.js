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
const sb=window.supabase?.createClient?.(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const readyResolve=[];
const TNT=window.TNT={sb,identity:null,person:null,account:null,grants:[],module:moduleName,scope:moduleScope,isAdmin:false,ready:new Promise(r=>readyResolve.push(r))};
function initials(n){return String(n||'TNT').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'T'}
function theme(){let t=localStorage.getItem('tnt-theme')||'system';if(t==='system')t=matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';document.documentElement.dataset.tntTheme=t;return t}
TNT.setTheme=function(t){localStorage.setItem('tnt-theme',t);theme();document.dispatchEvent(new CustomEvent('tnt:theme',{detail:{theme:t}}))};
TNT.toggleTheme=function(){const current=document.documentElement.dataset.tntTheme||theme();TNT.setTheme(current==='dark'?'light':'dark')};
function rank(x){return levelRank[String(x||'none').toLowerCase()]||0}
TNT.accessLevel=function(mod,scope='*'){
 if(TNT.isAdmin)return'manage';
 let best='none',br=0;
 for(const g of TNT.grants||[]){if(!g.enabled||g.module!==mod)continue;if(g.scope!=='*'&&g.scope!==scope)continue;if(g.valid_from&&Date.parse(g.valid_from)>Date.now())continue;if(g.valid_until&&Date.parse(g.valid_until)<Date.now())continue;const r=rank(g.access_level);if(r>br){br=r;best=g.access_level}}
 return best;
};
TNT.hasAccess=function(mod,scope='*',min='view'){return TNT.isAdmin||rank(TNT.accessLevel(mod,scope))>=rank(min)};
TNT.displayName=function(){return TNT.identity?.display_name||TNT.account?.nickname||TNT.person?.full_name||TNT.identity?.email||'TNT'};
TNT.avatar=function(){return TNT.account?.avatar_url||TNT.identity?.avatar_url||''};
TNT.logout=async function(){await sb?.auth?.signOut?.();localStorage.removeItem('tnt-central-user');location.replace('/?v=13')};
function avatarHtml(cls='tnt-avatar'){const a=TNT.avatar(),n=TNT.displayName();return a?`<img class="${cls}" src="${esc(a)}" alt="">`:`<span class="${cls} fallback">${esc(initials(n))}</span>`}
async function ensureIdentity(session){
 if(!sb||!session)return null;
 const er=await sb.rpc('tnt_ensure_account');if(er.error)throw er.error;
 const ar=await sb.from('tnt_accounts').select('*').eq('auth_user_id',session.user.id).maybeSingle();if(ar.error)throw ar.error;
 if(!ar.data)throw new Error('No pude vincular tu Cuenta TNT.');
 const pr=await sb.from('tnt_people').select('*').eq('id',ar.data.person_id).single();if(pr.error)throw pr.error;
 const gr=await sb.from('tnt_access_grants').select('*').eq('person_id',ar.data.person_id);TNT.grants=gr.data||[];
 const legacy=await sb.from('tnt_module_access').select('*').eq('person_id',ar.data.person_id);for(const g of legacy.data||[]){if(!TNT.grants.some(x=>x.module===g.module&&x.scope==='*'))TNT.grants.push({module:g.module,scope:'*',enabled:g.enabled,access_level:g.access_level});}
 TNT.account=ar.data;TNT.person=pr.data;TNT.isAdmin=ar.data.system_role==='admin';
 TNT.identity={person_id:pr.data.id,auth_user_id:session.user.id,email:session.user.email||ar.data.email||'',full_name:pr.data.full_name||'',nickname:ar.data.nickname||'',display_name:ar.data.nickname||pr.data.full_name||session.user.email||'TNT',system_role:ar.data.system_role,ministry_role:ar.data.ministry_role||'',avatar_url:ar.data.avatar_url||session.user.user_metadata?.avatar_url||session.user.user_metadata?.picture||''};
 localStorage.setItem('tnt-central-user',JSON.stringify(TNT.identity));
 return TNT.identity;
}
function renderShell(){if(!shellEnabled||$('#tnt-shell'))return;document.body.classList.add('tnt-shell-active');const el=document.createElement('div');el.id='tnt-shell';el.innerHTML=`<button class="tnt-shell-home" data-tnt-home aria-label="Inicio">⌂</button><div class="tnt-shell-brand"><b>${esc(moduleLabel)}</b><small>TNT · Trastornadores</small></div><button class="tnt-shell-icon" data-tnt-notify title="Notificaciones">🔔</button><button class="tnt-shell-icon" data-tnt-chat title="Chat">◌</button><button class="tnt-shell-icon" data-tnt-theme title="Cambiar tema">◐</button><button class="tnt-shell-user" data-tnt-user>${avatarHtml()}<span>${esc(TNT.displayName())}</span>${TNT.isAdmin?'<i class="tnt-admin-badge">ADMIN</i>':''}</button>`;document.body.appendChild(el);
 $('[data-tnt-home]',el).onclick=()=>location.href='/?v=13';$('[data-tnt-notify]',el).onclick=showNotifications;$('[data-tnt-chat]',el).onclick=()=>location.href='/chat/?v=13';$('[data-tnt-theme]',el).onclick=()=>TNT.toggleTheme();$('[data-tnt-user]',el).onclick=toggleAccountMenu;
}
function toggleAccountMenu(){let m=$('#tnt-account-menu');if(m){m.remove();return}m=document.createElement('section');m.id='tnt-account-menu';m.innerHTML=`<div class="tnt-profile-head">${avatarHtml()}<div><b>${esc(TNT.displayName())}</b><small>${esc(TNT.identity?.email||'')}</small><small>${esc(TNT.account?.ministry_role||'Usuario TNT')} · ${TNT.isAdmin?'Administrador':'Usuario'}</small></div></div><div class="tnt-menu-actions">${TNT.isAdmin?'<button data-admin>Administración</button>':''}<button data-profile>Mi perfil</button><button data-theme>Modo ${document.documentElement.dataset.tntTheme==='dark'?'claro':'oscuro'}</button><button data-access>Mis accesos</button><button class="wide danger" data-logout>Cerrar sesión</button></div>`;document.body.appendChild(m);$('[data-admin]',m)?.addEventListener('click',()=>location.href='/admin/?v=13');$('[data-profile]',m).onclick=showProfile;$('[data-theme]',m).onclick=()=>{TNT.toggleTheme();m.remove()};$('[data-access]',m).onclick=showAccess;$('[data-logout]',m).onclick=()=>TNT.logout();setTimeout(()=>document.addEventListener('click',outside,{once:true}),0);function outside(e){if(!m.contains(e.target)&&!e.target.closest('[data-tnt-user]'))m.remove()}}
function sheet(title,body){$('.tnt-overlay')?.remove();const o=document.createElement('div');o.className='tnt-overlay';o.innerHTML=`<section class="tnt-sheet"><button class="tnt-close">×</button><h3>${esc(title)}</h3>${body}</section>`;document.body.appendChild(o);$('.tnt-close',o).onclick=()=>o.remove();o.onclick=e=>{if(e.target===o)o.remove()};return o}
async function showNotifications(){const r=await sb.from('tnt_notifications').select('*').order('created_at',{ascending:false}).limit(40);const rows=(r.data||[]).filter(n=>!n.person_id||n.person_id===TNT.person?.id);const o=sheet('Notificaciones',`<p>Todo lo que requiere tu atención en TNT.</p><div style="display:grid;gap:7px">${rows.length?rows.map(n=>`<button data-note="${n.id}" data-href="${esc(n.href||'')}" style="text-align:left;border:1px solid var(--tnt-line);background:${n.read_at?'var(--tnt-panel2)':'color-mix(in srgb,var(--tnt-accent) 10%,var(--tnt-panel))'};color:var(--tnt-text);border-radius:13px;padding:10px"><b style="display:block;font-size:10px">${esc(n.title)}</b><small style="color:var(--tnt-muted)">${esc(n.body||'') }</small></button>`).join(''):'<div class="tnt-pill good">No tenés notificaciones pendientes.</div>'}</div>`);o.querySelectorAll('[data-note]').forEach(b=>b.onclick=async()=>{await sb.from('tnt_notifications').update({read_at:new Date().toISOString()}).eq('id',b.dataset.note);if(b.dataset.href)location.href=b.dataset.href;else b.remove()})}
function showProfile(){const p=TNT.person||{},a=TNT.account||{};sheet('Mi Cuenta TNT',`<div class="tnt-profile-head">${avatarHtml()}<div><b>${esc(TNT.displayName())}</b><small>${esc(TNT.identity?.email||'')}</small></div></div><p>Rol TNT: <b>${esc(a.ministry_role||'Timoteo')}</b></p><p>${esc(a.bio||'Tu cuenta identifica todas tus acciones dentro de TNT.')}</p><div style="display:flex;gap:6px;flex-wrap:wrap">${(a.service_areas||[]).map(x=>`<span class="tnt-pill">${esc(x)}</span>`).join('')}</div>`)}
function showAccess(){const gs=(TNT.grants||[]).filter(x=>x.enabled);sheet('Mis accesos',`<p>Estos permisos los administra el equipo de Administradores.</p><div style="display:grid;gap:7px">${TNT.isAdmin?'<div class="tnt-pill good">Administrador · acceso total</div>':gs.length?gs.map(g=>`<div class="tnt-pill">${esc(g.module)} · ${esc(g.scope)} · ${esc(g.access_level)}</div>`).join(''):'<div class="tnt-pill warn">Todavía no tenés permisos específicos.</div>'}</div>`)}
async function requestAccess(mod,scope){if(!TNT.person)return;const r=await sb.from('tnt_access_requests').insert({person_id:TNT.person.id,module:mod,scope,requested_level:'view',note:'Solicitud desde la aplicación'}).select('*');if(r.error)alert(r.error.message);else alert('Solicitud enviada a los Administradores.')}
function blockAccess(){if(!moduleName||TNT.hasAccess(moduleName,moduleScope,'view'))return false;const d=document.createElement('div');d.id='tnt-access-block';d.innerHTML=`<section class="tnt-access-card"><div class="ico">🔒</div><h2>Este espacio no está habilitado para tu cuenta.</h2><p>Estás entrando como <b>${esc(TNT.displayName())}</b>. Un Administrador puede darte acceso a ${esc(moduleLabel)}${moduleScope!=='*'?' · '+esc(moduleScope):''}.</p><button data-request>Solicitar acceso</button><button class="secondary" data-home>Volver al inicio</button></section>`;document.body.appendChild(d);$('[data-request]',d).onclick=()=>requestAccess(moduleName,moduleScope);$('[data-home]',d).onclick=()=>location.href='/?v=13';return true}
TNT.sheet=sheet;TNT.requestAccess=requestAccess;
async function init(){theme();if(!sb){console.error('Supabase client unavailable');readyResolve.splice(0).forEach(r=>r(null));return}const sr=await sb.auth.getSession();const session=sr.data?.session;if(!session){localStorage.removeItem('tnt-central-user');if(!publicPage&&location.pathname!=='/'){location.replace('/?v=13&login=1&next='+encodeURIComponent(location.pathname+location.search));return}readyResolve.splice(0).forEach(r=>r(null));document.dispatchEvent(new CustomEvent('tnt:ready',{detail:null}));return}try{await ensureIdentity(session);renderShell();blockAccess();readyResolve.splice(0).forEach(r=>r(TNT.identity));document.dispatchEvent(new CustomEvent('tnt:ready',{detail:TNT.identity}));}catch(e){console.error(e);readyResolve.splice(0).forEach(r=>r(null));document.dispatchEvent(new CustomEvent('tnt:error',{detail:e}))}}
init();
})();