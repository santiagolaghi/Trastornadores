(function(){
'use strict';
const U=TNTUI, app=document.getElementById('app');
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();

const state={pending:new Set(),hasActivities:false,events:[],tasks:[],days:[],items:[],responsibles:[],assignees:[],people:[],accounts:[],members:[],notes:[],files:[],errors:[],news:[]};
const modules=[
{id:'organizacion',name:'Organización',icon:'calendar',desc:'Actividades, calendario y equipo.',color:'var(--tnt-lilac)',cover:'/assets/covers/equipo.jpg'},
{id:'chat',name:'Chat TNT',icon:'chat',desc:'Coordiná con tu equipo.',color:'var(--tnt-lime)',cover:'/assets/covers/comunidad.jpg'},
{id:'asistencia',name:'Asistencia',href:'/asistencia/',icon:'check',desc:'EFE y sábados · lista y seguimiento.',color:'var(--tnt-peach)',cover:'/assets/covers/asistencia.jpg'},
{id:'campamento',name:'Campamento',icon:'camp',desc:'Inscripciones, pagos y logística.',color:'var(--tnt-blue)',cover:'/assets/covers/campamento.jpg'},
{id:'glosario',name:'Prédicas y glosario',icon:'book',desc:'Tus mensajes y recursos bíblicos.',color:'var(--tnt-lilac)',cover:'/assets/covers/glosario.jpg'},
{id:'buffet',name:'Buffet',icon:'food',desc:'Ventas, caja y mercadería.',color:'var(--tnt-peach)',cover:'/assets/covers/buffet.jpg'},
{id:'perfiles',name:'Perfiles',href:'/perfiles/datos/',icon:'people',desc:'Base central de todas las personas.',color:'var(--tnt-blue)',cover:'/assets/covers/comunidad.jpg'}];
const EFE_SCOPES=['varones','mujeres18','mujeres12_14','mujeres15_17'];
function can(id){if(window.TNTExperience&&!TNTExperience.enabled(id))return false;if(id==='asistencia')return TNT.isAdmin||TNT.hasAccess('lista-sabados','*','view')||EFE_SCOPES.some(scope=>TNT.hasAccess('efe',scope,'view'));return TNT.hasAccess(id)||((TNT.isAdmin||TNT.isStaff)&&TNT.grants.some(g=>g.module===id&&g.enabled&&TNT.hasAccess(id,g.scope)));}
function coordinated(){return upcoming().filter(e=>state.members.some(m=>m.event_id===e.id&&m.person_id===TNT.person.id&&m.event_role==='organizer'));}
function personalActivities(){
 const pid=TNT.person.id,events=upcoming(),byEvent=new Map(events.map(e=>[e.id,e])),rows=[];
 const own=new Map(state.assignees.filter(a=>a.person_id===pid).map(a=>[a.task_id,a]));
 const assignedItems=new Set(state.responsibles.filter(r=>r.person_id===pid).map(r=>r.item_id));
 const timing=(task,item,event)=>{const date=task?.planned_start?U.dateKey(task.planned_start):item?state.days.find(d=>d.id===item.day_id)?.date:null;return{date:date||event.start_date,time:task?.planned_start?U.time(task.planned_start):item?.starts_at?item.starts_at.slice(0,5):''};};
 for(const task of state.tasks){
  const event=byEvent.get(task.event_id),assignment=own.get(task.id),slots=state.items.filter(i=>i.task_id===task.id&&!i.archived_at),slot=slots.find(i=>assignedItems.has(i.id))||slots[0];
  if(!event||task.archived_at||U.completed(task)||assignment?.assignment_status==='declined'||(!assignment&&!slots.some(i=>assignedItems.has(i.id))))continue;
  const when=timing(task,slot,event),pending=!!assignment&&['pending','assigned','invited'].includes(assignment.assignment_status);
  rows.push({id:'task-'+task.id,title:task.title,event:event.name,people:state.assignees.filter(a=>a.task_id===task.id&&a.assignment_status!=='declined').map(a=>a.person_id),featured:task,...when,role:pending?'Confirmá tu participación':'Sos parte del equipo',pending,href:'/organizacion/?task='+encodeURIComponent(task.id)});
 }
 for(const item of state.items){
  if(item.task_id||!assignedItems.has(item.id)||item.archived_at||U.completed(item))continue;
  const date=state.days.find(d=>d.id===item.day_id),event=byEvent.get(date?.event_id);if(!event)continue;
  rows.push({id:'item-'+item.id,title:item.title,event:event.name,people:state.responsibles.filter(r=>r.item_id===item.id).map(r=>r.person_id),...timing(null,item,event),role:'Sos responsable',href:'/organizacion/?view=schedule&event='+encodeURIComponent(event.id)+'&item='+encodeURIComponent(item.id)});
 }
 for(const event of coordinated())rows.push({id:'event-'+event.id,title:event.name,event:event.location||'Encuentro TNT',people:state.members.filter(m=>m.event_id===event.id&&m.event_role==='organizer').map(m=>m.person_id),date:event.start_date,time:event.start_time?.slice(0,5)||'',role:'Coordinás este encuentro',href:'/organizacion/?view=schedule&event='+encodeURIComponent(event.id)+'&program=1'});
 return rows.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'99:99').localeCompare(b.time||'99:99')||a.title.localeCompare(b.title));
}
function activitiesSection(){
 if(!can('organizacion'))return '';
 if(!state.hasActivities&&state.pending.has('activities'))return '<section class="hub-activities" aria-busy="true"><header><h2>Lo próximo</h2><a class="tnt-button" href="/organizacion/?view=my">Ver agenda '+U.icon('arrow')+'</a></header><p role="status">Buscando tus próximas actividades…</p></section>';
 const rows=personalActivities(),day=U.dateKey(),dateLabel=date=>date===day?'Hoy':date===U.addDays(day,1)?'Mañana':U.date(date,{weekday:'short',day:'numeric',month:'short'});
 return `<section class="hub-activities" aria-labelledby="my-activities-title"><header><h2 id="my-activities-title">Lo próximo <span>${rows.length}</span></h2><a class="tnt-button" href="/organizacion/?view=my">Ver agenda ${U.icon('arrow')}</a></header>${rows.length?`<div class="hub-activity-list" role="region" aria-label="Todas mis próximas actividades">${rows.map((row,i)=>{
 const color=row.featured?.is_featured?TNTColors.activityColor(row.featured.feature_color):null,tone=color||['var(--tnt-blue)','var(--tnt-yellow)','var(--tnt-lilac)','var(--tnt-peach)'][i%4];
 return `<a class="hub-activity ${row.date===day?'is-today':''} ${row.pending?'needs-confirmation':''}" style="--activity-tone:${tone};--activity-ink:${color?TNTColors.ink(color):'#24241f'}" data-my-activity="${U.esc(row.id)}" href="${U.esc(row.href)}"><span class="hub-activity-date"><b>${U.esc(dateLabel(row.date))}</b>${row.time?'<strong>'+U.esc(row.time)+'</strong>':''}</span><span class="hub-activity-copy"><b>${U.esc(row.title)}</b><small>${U.esc(row.event)}</small><em>${row.pending?U.icon('alert'):U.icon(row.id.startsWith('event-')?'people':'check')}${U.esc(row.role)}</em>${U.namedPeople(row.people||[],state.people,state.accounts,row.id.startsWith('event-')?'Coordina':'Responsable')}</span>${U.icon('arrow')}</a>`;
 }).join('')}</div>`:`<p class="hub-activities-empty">${state.errors.some(e=>['activities','tasks','assignees','days','items','responsibles'].includes(e))?'No pudimos actualizar tus actividades. Tocá Reintentar para ver la lista completa.':'Todavía no tenés próximas actividades asignadas.'}</p>`}</section>`;
}
function upcoming(){return state.events.filter(e=>(e.end_date||e.start_date)>=U.dateKey()&&e.status!=='cancelled').sort((a,b)=>a.start_date.localeCompare(b.start_date));}
function unread(){return state.notes.filter(n=>(!n.person_id||n.person_id===TNT.person.id)&&!n.read_at);}
function personalAvatar(){return U.avatar(TNT.person,{...TNT.account,avatar_url:TNT.avatar()});}
function access(id){if(id==='asistencia'){const efe=EFE_SCOPES.some(scope=>TNT.hasAccess('efe',scope,'view')),sab=TNT.isAdmin||TNT.hasAccess('lista-sabados','*','view');return [efe?'EFE':null,sab?'Sábados':null].filter(Boolean).join(' + ')||'Asistencia';}if(TNT.isAdmin&&id!=='efe')return 'Administrás este espacio';const grants=TNT.grants.filter(g=>g.module===id&&g.enabled),r=grants.map(g=>g.access_level);return r.some(x=>['manage','manager','admin'].includes(x))?'Gestión habilitada':r.some(x=>['edit','editor'].includes(x))?'Edición habilitada':id==='chat'?'Conversaciones de TNT':'Consulta habilitada';}
function stat(m){if(m.id==='organizacion'){if(!state.hasActivities&&state.pending.has('activities'))return 'Actualizando tus actividades…';const count=personalActivities().length;return count?`<b>${count}</b> ${count===1?'responsabilidad tuya':'responsabilidades tuyas'}`:'Tu equipo y tus encuentros';}if(m.id==='campamento'){const count=upcoming().filter(e=>['camp','campamento'].includes(e.kind)).length;return count?`<b>${count}</b> ${count===1?'evento próximo':'eventos próximos'}`:'Todo para el campamento';}if(m.id==='glosario'){const count=state.files.filter(f=>f.module==='glosario').length;return count?`<b>${count}</b> recursos compartidos`:'Tu biblioteca';}return U.esc(access(m.id));}
function eventCard(e) {
 const taskIds=new Set(state.tasks.filter(t=>t.event_id===e.id).map(t=>t.id));
 const assigned=[...new Set(state.assignees.filter(a=>taskIds.has(a.task_id)&&a.assignment_status!=='declined').map(a=>a.person_id))];
 const coordinators=[...new Set(state.members.filter(m=>m.event_id===e.id&&m.event_role==='organizer').map(m=>m.person_id))];
 const ids=[...new Set([...coordinators,...assigned])],names=coordinators.map(id=>U.personName(state.accounts.find(a=>a.person_id===id)?.nickname||state.people.find(p=>p.id===id)?.full_name||'Persona TNT'));
 const team=ids.length?`<div class="hub-event-people">${U.avatarStack(ids,state.people,state.accounts,TNT.person.id,4)}<div class="hub-team-copy">${names.length?`<small>${names.length===1?'Coordina':'Coordinan'}</small><span>${names.map(U.esc).join(' · ')}</span>`:'<small>Equipo de la actividad</small>'}<small>${ids.length} ${ids.length===1?'persona en el equipo':'personas en el equipo'}</small></div></div>`:'<div class="hub-event-people hub-team-empty">Equipo por definir</div>';
 return `<a class="hub-event" href="/organizacion/?view=schedule&event=${encodeURIComponent(e.id)}"><div class="event-date"><b>${U.date(e.start_date,{day:'numeric'})}</b><span>${U.date(e.start_date,{month:'short'})}</span></div><div class="hub-event-copy"><small>${e.kind==='saturday'?'Sábado TNT':['camp','campamento'].includes(e.kind)?'Campamento':'Encuentro'}</small><h3>${U.esc(e.name)}</h3><p>${U.esc(e.location||'Encuentro TNT')}</p></div><span class="hub-event-arrow">${U.icon('arrow')}</span>${team}</a>`;
}
function summary(mineCount,notesCount){return `<section class="hub-summary"><div class="hub-eyebrow">TU SEMANA EN TNT</div><h2>Un equipo.<br>Muchas cosas buenas.</h2><div class="summary-counts"><div><b>${mineCount}</b><span>Responsabilidades</span></div><div><b>${notesCount}</b><span>Sin leer</span></div></div></section>`;}
function render(){
 if(!TNT.isStaff&&!TNT.isAdmin)return renderCommunity();
 const next=upcoming(),notes=unread(),visible=modules.filter(m=>can(m.id));
 const mc=!state.hasActivities&&state.pending.has('activities')?'…':state.errors.includes('activities')?'—':personalActivities().length,nc=state.pending.has('notes')?'…':state.errors.includes('notes')?'—':notes.length;
 app.innerHTML=`<div class="hub"><header class="hub-top"><a class="hub-brand" href="/" style="text-decoration:none"><span class="tnt-mark">tnt.</span>Trastornadores</a><span class="spacer"></span><button class="hub-icon" id="theme" aria-label="Cambiar modo claro u oscuro">${U.icon(document.documentElement.dataset.tntTheme==='dark'?'sun':'moon')}</button><button class="hub-icon" id="notifications" aria-label="Ver notificaciones">${U.icon('bell')}</button><button class="hub-icon" id="account" aria-label="Mi cuenta">${personalAvatar()}</button></header><div class="hub-greeting"><div><span class="hub-eyebrow">${U.esc(U.date(U.dateKey(),{weekday:'long',day:'numeric',month:'long'}))}</span><h1>Hola, ${U.esc(TNT.displayName().split(' ')[0])}<span aria-hidden="true">.</span></h1><p>Tu equipo, tus actividades y lo que viene.</p></div><form class="hub-search" id="hub-search"><label for="hub-query" class="sr-only">Buscar módulos, personas o actividades</label><input id="hub-query" type="search" placeholder="Buscar en TNT…"><button aria-label="Buscar">${U.icon('search')}</button></form></div>${state.errors.length?'<div class="tnt-error" role="alert">No pudimos actualizar algunos datos. <button class="tnt-button" id="reload">Reintentar</button></div>':''}<div class="hub-mobile-summary">${U.icon('tasks')}<div><h2>${mc} ${mc===1?'actividad tuya':'actividades tuyas'}</h2><p>${nc} ${nc===1?'notificación':'notificaciones'} sin leer · ${next.length} ${next.length===1?'próximo evento':'próximos eventos'}</p></div></div>${activitiesSection()}<div class="hub-layout"><section><button class="tnt-button hub-access" id="hub-request-access">Solicitar acceso a otro módulo</button><div class="hub-section"><h2>Tus espacios</h2><span class="tnt-pill">${visible.length} disponibles</span></div><div class="module-grid" data-space-track aria-label="Espacios de TNT">${visible.map(m=>`<div class="module-stack" data-space="${m.id}" style="--module-color:${m.color}"><a class="module-card" href="${m.href||'/'+m.id+'/'}"><div class="module-art">${U.icon(m.icon)}<span class="module-stat">${m.id==='admin'?'Tu equipo y sus accesos':stat(m)}</span></div><div class="module-bottom"><div><h3>${m.name}</h3><p>${m.desc}</p></div><span class="module-open">${U.icon('up')}</span></div></a></div>`).join('')}</div></section><aside class="hub-side">${summary(mc,nc)}<section class="hub-upnext"><h2>Lo que viene</h2>${next.slice(0,3).map(eventCard).join('')||(state.pending.has('activities')?'<p role="status">Buscando los próximos encuentros…</p>':'<p style="color:var(--tnt-muted);font-size:14px">Todavía no hay eventos próximos.</p>')}${next.length>3?'<a class="tnt-button" href="/organizacion/?view=calendar">Ver calendario</a>':''}</section></aside></div></div>`;
 document.getElementById('theme').onclick=()=>{TNT.toggleTheme();render();};document.getElementById('account').onclick=showAccount;document.getElementById('hub-request-access').onclick=()=>TNT.showAccess();document.getElementById('notifications').onclick=showNotifications;document.getElementById('hub-search').onsubmit=e=>{e.preventDefault();search(document.getElementById('hub-query').value);};document.getElementById('reload')?.addEventListener('click',load);
 decorateHome(true);
}
function search(query){
 const q=norm(query);if(!q)return;const rows=[];
 const spaces=[...modules,...(TNT.isAdmin?[{id:'admin',name:'Administración',desc:'Usuarios, permisos y configuración',icon:'settings'}]:[])];
 const aliases={asistencia:'efe sabados lista presentes ausentes',organizacion:'cronograma actividades calendario sabados',buffet:'comida caja ventas menu stock',glosario:'biblia predicas recursos',perfiles:'personas datos perfil',chat:'conversaciones mensajes',campamento:'campa camp inscripciones pagos'};
 for(const m of spaces.filter(m=>can(m.id))){const cfg=TNTExperience.module(m.id),name=cfg.title||m.name;
  if(norm(name+' '+(cfg.description||m.desc)+' '+(aliases[m.id]||'')).includes(q))rows.push({title:name,sub:cfg.description||m.desc,href:m.href||'/'+m.id+'/',icon:m.icon});}
 if(can('perfiles'))for(const p of [...new Map(state.people.map(p=>[p.id,p])).values()].sort((a,b)=>(b.id===TNT.person.id)-(a.id===TNT.person.id)))if(p.active!==false&&norm(p.full_name).includes(q))rows.push({title:p.full_name,sub:p.id===TNT.person.id?'Tu perfil':'Perfil de TNT',href:'/perfiles/datos/?person='+encodeURIComponent(p.id),person:p});
 if(can('organizacion')){
  for(const e of state.events)if(e.status!=='cancelled'&&norm(e.name).includes(q))rows.push({title:e.name,sub:'Encuentro · '+U.date(e.start_date),href:'/organizacion/?event='+encodeURIComponent(e.id),icon:'calendar'});
  for(const t of state.tasks)if(!U.completed(t)&&norm(t.title).includes(q))rows.push({title:t.title,sub:'Actividad de TNT',href:'/organizacion/?task='+encodeURIComponent(t.id),icon:'tasks'});
 }
 const dialog=U.modal('Buscar en TNT','<div class="hub-search-summary"><span>'+rows.length+' '+(rows.length===1?'resultado':'resultados')+'</span><p>Para <b>“'+U.esc(query)+'”</b></p></div><div class="hub-results hub-search-results">'+(rows.map(x=>'<a class="hub-result hub-search-result" href="'+U.esc(x.href)+'">'+(x.person?U.avatar(x.person,state.accounts.find(a=>a.person_id===x.person.id)||{}):'<span class="hub-search-symbol">'+U.icon(x.icon)+'</span>')+'<span class="hub-result-copy"><b>'+U.esc(x.title)+'</b><small>'+U.esc(x.sub)+'</small></span><span class="hub-result-arrow">'+U.icon('arrow')+'</span></a>').join('')||'<div class="hub-search-empty">'+U.icon('search')+'<h3>No encontramos coincidencias</h3><p>Probá con el nombre de una persona, un módulo o una actividad.</p></div>')+'</div>');
 dialog.classList.add('hub-search-dialog');
}
function showAccount(){return TNTAccounts.openMenu();}
function showNotifications(){if(window.TNTNotifications)return TNTNotifications.open();const notes=state.notes.filter(n=>!n.person_id||n.person_id===TNT.person.id);const d=U.modal('Notificaciones',`<div class="hub-results">${notes.map(n=>`<button class="hub-result" type="button" data-note="${U.esc(n.id)}" style="text-align:left;color:inherit"><b>${U.esc(n.title)}</b><small>${U.esc(n.body)}</small><small>${n.read_at?'Leída':'Sin leer'} · ${U.date(n.created_at)}</small></button>`).join('')||'<div class="tnt-empty">No hay notificaciones.</div>'}</div>`);d.querySelectorAll('[data-note]').forEach(b=>b.onclick=async()=>{const n=notes.find(n=>n.id===b.dataset.note);if(n.person_id===TNT.person.id){const r=await TNT.sb.from('tnt_notifications').update({read_at:new Date().toISOString()}).eq('id',n.id);if(r.error)return U.toast('No pudimos marcarla como leída.',true);n.read_at=new Date().toISOString();}const href=U.safeUrl(n.href);if(href)location.href=href;else{U.closeModal(d);render();}});}
function renderProfileGate(){
 app.innerHTML=`<div class="profile-gate"><header class="hub-top"><a class="hub-brand" href="/"><span class="tnt-mark">tnt.</span><span>TRASTORNADORES<small>HAY UN LUGAR PARA VOS</small></span></a><span class="spacer"></span><button class="hub-icon" id="theme" aria-label="Cambiar tema">${U.icon('sun')}</button><button class="tnt-button" id="logout">Salir</button></header><div class="profile-gate-layout"><section class="profile-gate-intro"><span class="hub-eyebrow">ANTES DE EMPEZAR</span><h1>Tu historia<br>también es<br><em>TNT.</em></h1><p>Hola, ${U.esc(TNT.displayName().split(' ')[0])}. Queremos conocerte un poco más y hacer lugar a lo que te gusta, tus ideas y tus sueños.</p><div class="profile-gate-note">${U.icon('people')}<span>Completá los campos obligatorios para entrar. Tus datos guardados ya aparecen cargados.</span></div></section><section class="profile-gate-form"><h2>Armemos tu perfil</h2><p>La configuración de TNT define qué datos necesitás completar.</p><div id="profile-completion"></div></section></div></div>`;
 document.getElementById('theme').onclick=()=>TNT.toggleTheme();document.getElementById('logout').onclick=TNT.logout;TNT.mountProfileCompletion(document.getElementById('profile-completion'));
}
async function loadCommunity(){
 if(!TNT.profileComplete)return renderProfileGate();
 state.communityLoading=true;renderCommunity();
 try{const r=await TNT.sb.rpc('tnt_community_home');if(r.error)throw r.error;state.community=r.data;state.communityError=false;}
 catch(e){state.communityError=true;console.warn('Comunidad',e);}
 state.communityLoading=false;refreshHome();
}
function renderCommunity(){
 if(!TNT.profileComplete)return renderProfileGate();
 const c=state.community||{},v=TNT.profileContext.values,pending=TNT.account.staff_status==='pending',events=c.events||[],notes=c.notes||[],news=(Array.isArray(c.news)?c.news:[]).filter(n=>n.title&&(!n.until||n.until>=U.dateKey())),interests=Array.isArray(v.interests)?v.interests:[];
 app.innerHTML=`<div class="hub community-home"><header class="hub-top"><a class="hub-brand" href="/"><span class="tnt-mark">tnt.</span><span>TRASTORNADORES<small>COMUNIDAD EN MOVIMIENTO</small></span></a><span class="spacer"></span><button class="hub-icon" id="theme" aria-label="Cambiar tema">${U.icon(document.documentElement.dataset.tntTheme==='dark'?'sun':'moon')}</button><button class="hub-icon" id="community-notes" aria-label="Mis novedades">${U.icon('bell')}${notes.some(n=>!n.read_at)?'<i class="notification-dot"></i>':''}</button><button class="hub-icon" id="account" aria-label="Mi cuenta">${personalAvatar()}</button></header><section class="community-hero"><div class="community-hero-copy"><span class="community-kicker">TU LUGAR EN TNT</span><h1>Hola, ${U.esc(TNT.displayName().split(' ')[0])}<span>.</span><br><em>Qué bueno<br>encontrarnos.</em></h1><p>Tu comunidad, lo que viene y todo eso que te hace vos.</p><button class="tnt-button hero-button" id="profile">Mi perfil ${U.icon('arrow')}</button></div><div class="community-brand-art" aria-hidden="true"><span>tnt.</span><small>FE · COMUNIDAD · PROPÓSITO</small><i class="art-orbit"></i></div></section>${pending?`<section class="community-review">${U.icon('clock')}<div><b>Tu solicitud de staff está en revisión</b><p>Pediste participar como ${U.esc(TNT.account.requested_ministry_role)}. Te avisamos cuando se confirme.</p></div></section>`:''}${state.communityError?'<div class="tnt-error" role="alert">No pudimos actualizar las novedades. <button class="tnt-button" id="retry-community">Reintentar</button></div>':''}<div class="community-grid"><section class="community-efe"><span class="hub-eyebrow">TU GRUPO · TU COMUNIDAD</span><div class="community-card-title">${U.icon('people')}<h2>${U.esc(c.efe?.name||'Hay un EFE para vos')}</h2></div><p>${c.efe?`Este es el grupo que figura en tu perfil.${c.efe.leader?' Tu referente: '+U.esc(c.efe.leader)+'.':''}`:'Podés indicar a qué EFE vas o actualizar tu grupo desde tu perfil.'}</p><button class="tnt-button" id="edit-efe">${U.icon('edit')} ${c.efe?'Actualizar mi EFE':'Elegir mi EFE'}</button><span class="community-card-number" aria-hidden="true">01</span></section><section class="community-you"><span class="hub-eyebrow">LO QUE TE HACE VOS</span><h2>Hay lugar para tus ideas.</h2><div class="community-interest-tags">${interests.slice(0,6).map(x=>`<span>${U.esc(x)}</span>`).join('')}</div>${v.dreams?`<p class="community-dream">“${U.esc(v.dreams)}”</p>`:'<p>Contanos qué te gusta hacer y qué soñás. Queremos conocerte.</p>'}<button class="community-text-link" id="edit-interests">Editar mis intereses ${U.icon('arrow')}</button></section><section class="community-calendar"><div class="hub-section"><h2>Nos encontramos</h2><span class="tnt-pill">${state.communityLoading?'Actualizando…':events.length?'Próximamente':'Agenda TNT'}</span></div>${state.communityLoading&&!state.community?'<p role="status">Buscando los próximos encuentros…</p>':events.length?events.slice(0,4).map(e=>`<button class="community-event" data-community-event="${e.id}"><span class="event-day"><b>${U.date(e.start_date,{day:'numeric'})}</b><small>${U.date(e.start_date,{month:'short'})}</small></span><span><b>${U.esc(e.name)}</b><small>${U.esc(e.location||U.date(e.start_date,{weekday:'long'}))}</small></span>${U.icon('arrow')}</button>`).join(''):`<div class="community-empty">${U.icon('calendar')}<h3>Lo próximo empieza acá.</h3><p>Las actividades que TNT publique para la comunidad aparecerán en este espacio.</p></div>`}</section><section class="community-news"><div class="hub-section"><h2>En comunidad</h2>${U.icon('bell')}</div>${news.length?news.slice(0,5).map(n=>`<article><span class="hub-eyebrow">NOVEDAD TNT</span><h3>${U.esc(n.title)}</h3><p>${U.esc(n.body||'')}</p>${U.safeUrl(n.href)?`<a class="community-text-link" href="${U.esc(U.safeUrl(n.href))}">${U.esc(n.link_label||'Ver más')} ${U.icon('arrow')}</a>`:''}</article>`).join(''):`<article><span class="hub-eyebrow">ESTE ES TU ESPACIO</span><h3>Conocernos también es crecer.</h3><p>Tu perfil nos ayuda a acompañarte y a hacer lugar a tus talentos y proyectos.</p></article>`}</section></div><section class="community-shortcuts"><button id="my-attendance">${U.icon('check')}<span><b>Mi camino en TNT</b><small>Mis asistencias</small></span>${U.icon('arrow')}</button><button id="community-notifications">${U.icon('bell')}<span><b>Mis avisos</b><small>Novedades para mí</small></span>${U.icon('arrow')}</button></section><footer class="community-footer"><span>TRASTORNADORES · HAY UN LUGAR PARA VOS</span><button class="community-text-link" id="community-access">Mi cuenta ${U.icon('arrow')}</button></footer></div>`;
 document.getElementById('theme').onclick=()=>{TNT.toggleTheme();renderCommunity();};document.getElementById('profile').onclick=TNT.editProfile;document.getElementById('edit-efe').onclick=TNT.editProfile;document.getElementById('edit-interests').onclick=TNT.editProfile;document.getElementById('account').onclick=showCommunityAccount;document.getElementById('my-attendance').onclick=TNT.showMyAttendance;document.getElementById('community-notifications').onclick=()=>TNTNotifications.open();document.getElementById('community-access').onclick=showCommunityAccount;document.getElementById('membership')?.addEventListener('click',TNT.configureMembership);document.getElementById('retry-community')?.addEventListener('click',loadCommunity);
 document.getElementById('community-notes').onclick=()=>window.TNTNotifications?TNTNotifications.open():U.modal('Tus novedades',`<div class="hub-results">${notes.map(n=>`<article class="hub-result"><b>${U.esc(n.title)}</b><p>${U.esc(n.body)}</p><small>${U.date(n.created_at)}</small></article>`).join('')||'<div class="tnt-empty">Todo al día. Las novedades para vos van a aparecer acá.</div>'}</div>`);
 app.querySelectorAll('[data-community-event]').forEach(b=>b.onclick=()=>{const e=events.find(x=>x.id===b.dataset.communityEvent);U.modal(e.name,`<div class="community-event-detail">${U.icon('calendar')}<h3>${U.date(e.start_date,{weekday:'long',day:'numeric',month:'long'})}</h3>${e.end_date!==e.start_date?`<p>Hasta el ${U.date(e.end_date)}</p>`:''}<p>${U.esc(e.location||'El lugar se confirmará próximamente.')}</p><p>Consultá con tu referente de TNT para saber cómo participar.</p></div>`);});
 decorateHome(false);
}
function showCommunityAccount(){return TNTAccounts.openMenu();}

function login(message=''){
 app.innerHTML=`<section class="login"><div class="login-intro"><div class="tnt-login-art">${TNTExperience.logo(true)}<span>HACEMOS TNT.</span></div><div class="hub-brand"><span class="tnt-mark" style="background:#213024;color:#d6edb4">tnt.</span>Trastornadores</div><div><h1>Fe que se vive.<br>Comunidad que transforma.</h1><p>Un lugar para encontrarnos, crecer y hacer que nuestras ideas se conviertan en algo real.</p></div><div class="login-tags"><span>Actividades</span><span>Equipo</span><span>Comunidad</span></div></div><div class="login-form-wrap"><div class="login-card"><button class="hub-icon login-theme" id="theme" aria-label="Cambiar modo claro u oscuro">${U.icon('sun')}</button><span class="hub-eyebrow">TU CUENTA TNT</span><h2>Qué bueno verte.</h2><p>Entrá con Google para encontrarte con tu equipo y vivir TNT.</p><button class="tnt-button google submit" id="google"><svg class="google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.7 2.9-4.2 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1a6 6 0 0 1-5.6-4.2H3v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3a10 10 0 0 0 0 9l3.4-2.6Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A10 10 0 0 0 3 7.5l3.4 2.6A6 6 0 0 1 12 5.9Z"/></svg>Continuar con Google</button><p class="login-google-help">Tu primera vez también empieza con Google. Usá siempre la misma cuenta para conservar tu perfil.</p><div class="login-message" id="login-message" role="status">${U.esc(message)}</div></div></div></section>`;
 if(window.TNTPush&&!TNTPush.installState().installed&&!TNTPush.installState().mobile){const button=document.createElement('button');button.type='button';button.className='tnt-button submit tnt-install-entry';button.textContent='Instalar TNT en mi teléfono';button.onclick=()=>TNTPush.openInstall();document.querySelector('.login-card').append(button);}
 document.getElementById('theme').onclick=()=>TNT.toggleTheme();const report=e=>document.getElementById('login-message').textContent=e;
 document.getElementById('google').onclick=async()=>{const b=document.getElementById('google');b.disabled=true;try{const r=await TNT.sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/',queryParams:{prompt:'select_account'}}});if(r.error)throw r.error;}catch(e){report('No pudimos iniciar el ingreso. '+e.message);b.disabled=false;}};

}
let hubFlight=null,homeRefreshQueued=false;
// Capture the view when data arrives, not when the request started. A slow
// response must not undo typing, card selection or scrolling performed meanwhile.
function refreshHome(){
 const view=U.snapshotView?.(),input=document.getElementById('hub-query'),query=input?.value,focused=document.activeElement===input;
 const daily=app.querySelector('[data-community-home]'),keepDaily=daily?.querySelector('.daily-carousel');
 const anchor=scrollY>0?['[data-space-track]','.hub-activities','.hub-upnext'].map(selector=>({selector,el:app.querySelector(selector)})).find(x=>x.el&&x.el.getBoundingClientRect().top<innerHeight&&x.el.getBoundingClientRect().bottom>0):null;
 const top=anchor?.el.getBoundingClientRect().top;
 render();
 if(keepDaily)app.querySelector('[data-community-home]')?.replaceWith(daily);
 const next=document.getElementById('hub-query');if(next&&query!==undefined){next.value=query;if(focused)next.focus({preventScroll:true});}
 if(view&&anchor){const updated=app.querySelector(anchor.selector);if(updated)view.y+=updated.getBoundingClientRect().top-top;}
 U.restoreView?.(view);
}
function load(){
 if(hubFlight)return hubFlight;
 hubFlight=loadHome().finally(()=>{hubFlight=null;if(homeRefreshQueued){homeRefreshQueued=false;load();}});return hubFlight;
}
async function loadHome(){
 state.errors=[];state.pending=new Set(['activities','notes','news','files']);refreshHome();
 const section=async(key,request,apply)=>{try{const result=await request();if(result?.error)throw result.error;apply(result?.data);}
 catch(error){state.errors.push(key);console.warn('Hub: '+key,error);}
 finally{state.pending.delete(key);if(TNT.profileComplete&&(TNT.isStaff||TNT.isAdmin))refreshHome();}};
 await Promise.all([
  section('activities',()=>TNT.sb.rpc('tnt_home_context'),data=>{
   if(!Array.isArray(data?.events)||!Array.isArray(data?.people))throw Error('No pudimos actualizar tus actividades.');
   for(const key of ['events','tasks','assignees','days','items','responsibles','people','accounts','members'])state[key]=data[key]||[];
   state.people=state.people.map(p=>({...p,full_name:U.personName(p.full_name)}));state.hasActivities=true;
  }),
  section('notes',async()=>window.TNTNotifications?{data:await TNTNotifications.load()}:await TNT.sb.from('tnt_notifications').select('*').order('created_at',{ascending:false}).limit(50),rows=>state.notes=rows||[]),
  section('news',()=>TNT.sb.from('tnt_settings').select('value').eq('key','community_news').maybeSingle(),data=>state.news=Array.isArray(data?.value)?data.value:[]),
  section('files',()=>TNT.sb.from('tnt_library_items').select('module'),rows=>state.files=rows||[])
 ]);
}
async function boot(){await TNT.ready;if(!TNT.identity)return login(TNT.error?.message||'');if(!TNT.profileComplete){renderProfileGate();return;}if(!TNT.isStaff&&!TNT.isAdmin){await loadCommunity();if(new URLSearchParams(location.search).has('profile'))TNT.editProfile();return;}if(new URLSearchParams(location.search).has('profile'))TNT.editProfile();const next=new URLSearchParams(location.search).get('next');if(next&&/^\/(?![\/\\])/.test(next)){location.replace(next);return;}await load();}

function featuredNews(staff){
 const raw=staff?state.news:state.community?.news,news=(Array.isArray(raw)?raw:[]).map((n,i)=>({...n,_key:window.TNTProfileSettings?.newsKey(n,i)||n.id})).filter(n=>n.title&&(!n.until||n.until>=U.dateKey())&&(n.audience!=='staff'||staff)&&(n.audience!=='community'||!staff));
 if(!news.length)return TNT.isAdmin?'<section class="tnt-home-news tnt-news-empty-inline"><span>Novedades para tu equipo</span><button class="tnt-button" id="publish-news">'+U.icon('plus')+'Publicar novedad</button></section>':'';
 return `<section class="tnt-home-news" aria-label="Novedades de TNT"><div class="hub-section"><h2 data-tnt-copy="home.news.title">Lo que está pasando</h2>${TNT.isAdmin?'<button class="tnt-button" id="publish-news">'+U.icon('plus')+' Publicar novedad</button>':''}</div>${news.length?`<div class="tnt-home-news-list">${news.map((n,i)=>{const image=TNTExperience.image(n.image||'');return `<details class="community-news-feature tnt-news-fold ${image?'has-cover':''}" data-tnt-collapse="news-${U.esc(n._key)}" data-tnt-record ${i===0?'open':''} ${image?'style="background-image:url(&quot;'+U.esc(image)+'&quot;)"':''}><summary><span class="hub-eyebrow">NOVEDAD TNT</span><h3>${U.esc(n.title)}</h3></summary><div class="tnt-news-content"><p>${U.esc(n.body||'')}</p><div class="tnt-news-actions">${U.safeUrl(n.href)?`<a class="tnt-button" href="${U.esc(U.safeUrl(n.href))}">${U.esc(n.link_label||'Ir a ver')} ${U.icon('arrow')}</a>`:''}${TNT.isAdmin?`<button class="tnt-button danger" data-delete-home-news="${U.esc(n._key)}" aria-label="Eliminar ${U.esc(n.title)}">${U.icon('trash')}Eliminar</button>`:''}</div></div></details>`;}).join('')}</div>`:`<div class="tnt-news-empty">${U.icon('bell')}<span>${TNT.isAdmin?'Publicá acá lo que todo TNT necesita saber.':'Las novedades del equipo van a aparecer acá, en primera plana.'}</span></div>`}</section>`;
}
function decorateHome(staff){
 if(!window.TNTExperience)return;
 const E=TNTExperience,hero=app.querySelector(staff?'.hub-greeting':'.community-hero');
 app.querySelectorAll('.tnt-mark').forEach(m=>{m.innerHTML='<img src="/icons/dynamite-app.svg?v=20261013" alt="TNT">';});
 if(hero){
  hero.classList.add('hub-greeting');
  const heading=hero.querySelector('h1');heading.dataset.tntDynamic='';heading.textContent='Hola, '+TNT.displayName().split(' ')[0]+'.';
  hero.querySelector('.community-brand-art')?.remove();
  hero.querySelector('.hero-button')?.remove();
  hero.querySelector('p').textContent='Tu equipo, tus actividades y lo que viene.';
  const eyebrow=hero.querySelector('.hub-eyebrow,.community-kicker');if(eyebrow)eyebrow.textContent=U.date(U.dateKey(),{weekday:'long',day:'numeric',month:'long'});
 }
 app.querySelector('.community-grid>.community-news')?.remove();
 app.querySelectorAll('.module-stack').forEach((el,index)=>{
  const a=el.querySelector('a'),id=el.dataset.space;if(!id)return;const cfg=E.module(id);
  if(cfg.title)el.querySelector('h3').textContent=cfg.title;if(cfg.description)el.querySelector('.module-bottom p').textContent=cfg.description;
  if(/^#[\da-f]{6}$/i.test(cfg.accent||''))el.style.setProperty('--module-color',cfg.accent);
  const cover=E.image(cfg.cover||modules.find(m=>m.id===id)?.cover||(id==='admin'?'/assets/covers/equipo.jpg':''));
  if(cover){const img=document.createElement('img');img.className='tnt-space-cover';img.alt='';img.src=cover;img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>{img.remove();el.classList.remove('has-cover');},{once:true});a.prepend(img);el.classList.add('has-cover');}
  el.style.setProperty('--card-order',String(index));
 });
 setupSpaces();
 const track=app.querySelector('[data-space-track]'),search=app.querySelector('.hub-search');
 if(track&&search)app.querySelector('.tnt-space-controls').after(search);
 const activities=app.querySelector('.hub-activities');if(activities)activities.insertAdjacentHTML('afterend',featuredNews(staff));
 else if(hero)hero.insertAdjacentHTML('afterend',featuredNews(staff));
 if(staff&&can('organizacion')){const saturday=upcoming().find(e=>e.kind==='saturday');if(saturday&&activities)activities.insertAdjacentHTML('afterend',`<a class="hub-saturday-shortcut" href="/organizacion/?view=schedule&event=${encodeURIComponent(saturday.id)}&program=1">${U.icon('calendar')}<span><b>Cronograma del próximo sábado</b><small>${U.esc(U.date(saturday.start_date,{weekday:'long',day:'numeric',month:'long'}))}</small></span>${U.icon('arrow')}</a>`);}
 window.TNTCommunity?.home();
 const upnext=staff&&app.querySelector('.hub-upnext'),layout=app.querySelector('.hub-layout');
 if(upnext&&layout){
  const heading=upnext.querySelector('h2'),head=document.createElement('div'),grid=document.createElement('div');
  head.className='hub-upnext-heading';heading.id='hub-upnext-title';upnext.setAttribute('aria-labelledby',heading.id);
  head.append(heading);const calendar=upnext.querySelector('a.tnt-button');if(calendar)head.append(calendar);
  grid.className='hub-upnext-grid';upnext.querySelectorAll('.hub-event').forEach(card=>grid.append(card));
  if(!grid.children.length){const empty=upnext.querySelector('p');if(empty)grid.append(empty);}
  upnext.replaceChildren(head,grid);layout.after(upnext);
 }
 window.TNTNavigation?.mount();
 document.getElementById('publish-news')?.addEventListener('click',async()=>{if(!window.TNTProfileSettings)return;const r=await TNT.sb.from('tnt_settings').select('*').eq('key','community_news');if(r.error)return U.toast(r.error.message,true);const o=U.modal('Publicar en la portada','<div id="tnt-home-news-editor"></div>',true);TNTProfileSettings.mountNews(o.querySelector('#tnt-home-news-editor'),r.data||[]);});
 app.querySelectorAll('[data-delete-home-news]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await TNTProfileSettings.removeNews(b.dataset.deleteHomeNews);}catch(error){U.toast(error.message,true);b.disabled=false;}});
 window.TNTNotifications?.badges();E.paint();
}
function bindHeroEncounter(hero,staff){
 const events=staff?upcoming():state.community?.events||[],button=hero.querySelector('[data-hero-event]');if(!button||!events.length)return;
 let index=0;const show=()=>{const e=events[index];button.querySelector('b').textContent=e.name;button.querySelector('small').textContent=U.date(e.start_date,{day:'numeric',month:'long'})+(e.location?' · '+e.location:'');button.setAttribute('aria-label','Ver '+e.name);};
 button.onclick=()=>{const e=events[index];if(staff&&can('organizacion'))location.href='/organizacion/?view=schedule&event='+encodeURIComponent(e.id);else{const data=events.find(x=>x.id===e.id);const d=U.modal(data.name,'<p>'+U.esc(U.date(data.start_date,{weekday:'long',day:'numeric',month:'long'}))+'</p><p>'+U.esc(data.location||'Encuentro TNT')+'</p><p>'+U.esc(data.description||'Nos encontramos para compartir juntos.')+'</p>');}};
 if(events.length>1){const controls=document.createElement('div');controls.className='tnt-hero-controls';controls.innerHTML='<button type="button" data-hero-prev aria-label="Encuentro anterior">'+U.icon('back')+'</button><span data-hero-position>1 / '+events.length+'</span><button type="button" data-hero-next aria-label="Encuentro siguiente">'+U.icon('arrow')+'</button>';hero.querySelector('.tnt-hero-art').append(controls);const move=dir=>{index=(index+dir+events.length)%events.length;show();controls.querySelector('[data-hero-position]').textContent=(index+1)+' / '+events.length;!matchMedia('(prefers-reduced-motion: reduce)').matches&&button.animate?.([{opacity:.3,transform:'translateX(18px) scale(.98)'},{opacity:1,transform:'none'}],{duration:170});};controls.querySelector('[data-hero-prev]').onclick=()=>move(-1);controls.querySelector('[data-hero-next]').onclick=()=>move(1);let start=null,swiped=false;button.style.touchAction='pan-y';button.addEventListener('pointerdown',event=>{start={x:event.clientX,y:event.clientY};swiped=false;});button.addEventListener('pointerup',event=>{if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.abs(dx)>35&&Math.abs(dx)>Math.abs(dy)*1.2){swiped=true;move(dx<0?1:-1);}});button.addEventListener('pointercancel',()=>start=null);button.addEventListener('click',event=>{if(swiped){event.preventDefault();event.stopImmediatePropagation();swiped=false;}},true);}
 show();
}
function setupSpaces(){const track=app.querySelector('[data-space-track]');if(track)window.TNTModuleDeck?.bind(track);}
let homeRefreshTimer;
document.addEventListener('tnt:data',event=>{
 const tables=event.detail?.tables;if(tables&&!tables.some(t=>['tnt_settings','tnt_events','tnt_tasks','tnt_task_assignees','tnt_schedule_days','tnt_schedule_items','tnt_schedule_responsibles','tnt_people','tnt_accounts','tnt_event_members','tnt_library_items'].includes(t)))return;
 clearTimeout(homeRefreshTimer);homeRefreshTimer=setTimeout(()=>{if(!TNT.profileComplete)return;if(TNT.isStaff||TNT.isAdmin){if(hubFlight)homeRefreshQueued=true;else load();}else loadCommunity();},150);
});
document.addEventListener('tnt:config',()=>{if(TNT.profileComplete){if(TNT.isStaff||TNT.isAdmin)render();else renderCommunity();}});

// Invalidate only old application caches; personal data and the sign-in session stay intact.
 document.addEventListener('tnt:profile',()=>TNT.isStaff||TNT.isAdmin?render():loadCommunity());document.addEventListener('tnt:membership',()=>{if(!TNT.profileComplete)renderProfileGate();else if(TNT.isStaff||TNT.isAdmin)load();else loadCommunity();});boot();
})();
