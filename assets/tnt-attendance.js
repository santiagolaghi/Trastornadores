(() => {
'use strict';
const U=TNTUI,sb=TNT.sb,E=U.esc,app=document.getElementById('attendance-app');
const qs=new URLSearchParams(location.search);
const S={mode:qs.get('mode')||'',people:[],groups:[],members:[],events:[],attendance:[],followups:[],audit:[],group:null,date:'',tab:'attendance',query:'',filter:'all',loading:false,busy:new Set(),deck:null};
const labels={present:'Presente',absent:'Ausente',pending:'Sin registrar'};
const followLabels={pending:'Pendiente',contacted:'Le hablé',waiting:'Esperando respuesta',talking:'Conversando',no_response:'No respondió',resolved:'Cerrado'};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const person=id=>S.people.find(p=>p.id===id)||{};
const group=()=>S.groups.find(g=>g.id===S.group);
const currentMod=()=>S.mode==='efe'?'efe':'lista-sabados';
const currentScope=()=>S.mode==='efe'?(group()?.code||'__none__'):'*';
const can=(action)=>TNT.isAdmin||!!TNT.canAction?.(currentMod(),action,currentScope());
const has=(mod,scope='*')=>TNT.isAdmin||TNT.hasAccess(mod,scope,'view')||!!TNT.canAction?.(mod,'attendance',scope);
const canProfiles=()=>TNT.isAdmin||!!TNT.hasAccess?.('perfiles','*','view');
const age=(p,date=S.date)=>{if(!p.birthday)return null;const d=new Date(p.birthday+'T12:00:00'),at=new Date((date||U.dateKey())+'T12:00:00');let n=at.getFullYear()-d.getFullYear();if(at.getMonth()<d.getMonth()||(at.getMonth()===d.getMonth()&&at.getDate()<d.getDate()))n--;return n};
const status=id=>S.attendance.find(a=>a.person_id===id)?.status||'pending';
const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const phoneUrl=p=>{let d=String(p.phone||'').replace(/\D/g,'');if(!d)return'';if(d.startsWith('54'))d=d.slice(2);if(d.startsWith('9')&&d.length>10)d=d.slice(1);while(d.startsWith('0'))d=d.slice(1);if(d.length===10)d='549'+d;return d.length>=11?'https://wa.me/'+d:''};
async function checked(q){const r=await q;if(r.error)throw r.error;return r.data||[]}
function latestWednesday(){const d=new Date();const delta=(d.getDay()-3+7)%7;d.setDate(d.getDate()-delta);return U.dateKey(d)}
function saturdayDates(){return [...S.events].filter(e=>e.kind==='saturday'&&e.status!=='cancelled').sort((a,b)=>a.start_date.localeCompare(b.start_date))}
function defaultSaturday(){const dates=saturdayDates(),today=U.dateKey();return dates.find(e=>e.start_date>=today)?.start_date||dates.at(-1)?.start_date||today}
function eligiblePeople(){
 if(S.mode==='sabados')return S.people.filter(p=>p.active);
 if(!S.group)return[];
 const ids=new Set(S.members.filter(m=>m.group_id===S.group&&m.active).map(m=>m.person_id));
 return S.people.filter(p=>p.active&&ids.has(p.id));
}
function modeAllowed(mode){
 if(mode==='sabados')return has('lista-sabados','*');
 return S.groups.some(g=>has('efe',g.code));
}
async function loadBase(){
 await TNT.ready;
 if(!TNT.identity){location.replace('/?login=1&next='+encodeURIComponent('/asistencia/'+location.search));return}
 const [people,groups,members,events]=await Promise.all([
   checked(sb.from('tnt_people').select('*').order('full_name')),
   checked(sb.from('tnt_efe_groups').select('*').order('name')),
   checked(sb.from('tnt_efe_memberships').select('*')),
   checked(sb.from('tnt_events').select('*').eq('kind','saturday').order('start_date'))
 ]);
 S.people=people;S.groups=groups;S.members=members;S.events=events;
 if(!S.mode||!['efe','sabados'].includes(S.mode)||!modeAllowed(S.mode))S.mode=modeAllowed('efe')?'efe':modeAllowed('sabados')?'sabados':'';
 if(!S.mode){renderNoAccess();return}
 if(S.mode==='efe'){
   const requested=qs.get('group');
   S.group=S.groups.find(g=>g.code===requested&&has('efe',g.code))?.id||S.groups.find(g=>has('efe',g.code))?.id||null;
   S.date=qs.get('date')||latestWednesday();
 }else S.date=qs.get('date')||defaultSaturday();
 await loadDate();render();
}
async function loadDate(){
 S.loading=true;S.attendance=[];S.followups=[];S.audit=[];
 if(S.mode==='efe'&&!S.group){S.loading=false;return}
 try{
   let q=sb.from(S.mode==='efe'?'tnt_efe_wednesday_attendance':'tnt_saturday_attendance').select('*').eq(S.mode==='efe'?'wednesday_date':'saturday_date',S.date);
   if(S.mode==='efe')q=q.eq('group_id',S.group);
   const jobs=[checked(q)];
   if(S.mode==='efe'&&can('history'))jobs.push(checked(sb.from('tnt_efe_followups').select('*').eq('group_id',S.group).eq('wednesday_date',S.date)));
   else jobs.push(Promise.resolve([]));
   if(can('history')){
     let aq=sb.from('tnt_attendance_audit').select('*').eq('mode',S.mode).eq('attendance_date',S.date).order('created_at',{ascending:false}).limit(120);
     if(S.mode==='efe')aq=aq.eq('group_id',S.group);
     jobs.push(checked(aq));
   }else jobs.push(Promise.resolve([]));
   [S.attendance,S.followups,S.audit]=await Promise.all(jobs);
 }finally{S.loading=false}
}
function setMode(mode){
 if(!modeAllowed(mode))return U.toast('No tenés acceso a ese submódulo.',true);
 S.mode=mode;S.tab='attendance';S.query='';S.filter='all';
 if(mode==='efe'){S.group=S.groups.find(g=>has('efe',g.code))?.id||null;S.date=latestWednesday()}
 else S.date=defaultSaturday();
 const url=new URL(location.href);url.searchParams.set('mode',mode);url.searchParams.delete('group');url.searchParams.delete('date');history.replaceState(null,'',url);
 loadDate().then(render);
}
function renderNoAccess(){app.innerHTML='<div class="att-noaccess"><h1>Asistencia TNT</h1><p>No tenés habilitado EFE ni Lista Sábados.</p><a class="tnt-button" href="/">Volver a TNT</a></div>'}
function topShell(inner){
 return `<div class="attendance-shell mode-${S.mode}">
 <header class="attendance-top">
   <a href="/" class="att-back" aria-label="Volver">←</a>
   <div><span class="att-kicker">ASISTENCIA TNT</span><h1>Seguimiento de personas</h1></div>
   <a href="/perfiles/datos/" class="att-profile-link" ${canProfiles()?'':'hidden'}>Perfiles</a>
 </header>
 <nav class="mode-switch" aria-label="Submódulo">
   <button class="mode-card efe ${S.mode==='efe'?'on':''}" data-mode="efe" ${modeAllowed('efe')?'':'disabled'}><span>MIÉRCOLES</span><b>EFE</b><small>Grupos + seguimiento</small></button>
   <button class="mode-card sabados ${S.mode==='sabados'?'on':''}" data-mode="sabados" ${modeAllowed('sabados')?'':'disabled'}><span>SÁBADO</span><b>TNT</b><small>Lista general</small></button>
 </nav>${inner}</div>`;
}
function render(){
 if(!S.mode)return renderNoAccess();
 const rows=eligiblePeople(),counts={present:0,absent:0,pending:0};rows.forEach(p=>counts[status(p.id)]++);
 const pct=rows.length?Math.round((counts.present+counts.absent)/rows.length*100):0;
 const context=S.mode==='efe'?group()?.name||'EFE':'Sábado TNT';
 const dateOptions=S.mode==='sabados'?saturdayDates():[];
 app.innerHTML=topShell(`
 <section class="attendance-hero">
   <div class="hero-copy"><span class="context-pill">${S.mode==='efe'?'Encuentro EFE':'Encuentro general'}</span><h2>${E(context)}</h2><p>${S.mode==='efe'?'Acompañamiento, asistencia y contacto.':'Todos los perfiles TNT en una sola lista.'}</p></div>
   <div class="hero-progress" style="--p:${pct}"><b>${pct}%</b><small>registrado</small></div>
 </section>
 <section class="date-panel">
   ${S.mode==='efe'?groupChooser():''}
   <label><span>${S.mode==='efe'?'Miércoles':'Sábado'}</span>${S.mode==='sabados'&&dateOptions.length?`<select id="att-event">${dateOptions.map(e=>`<option value="${e.start_date}" ${e.start_date===S.date?'selected':''}>${E(e.name)} · ${U.date(e.start_date+'T12:00:00-03:00',{day:'numeric',month:'short'})}</option>`).join('')}</select>`:`<input id="att-date" type="date" value="${S.date}">`}</label>
 </section>
 <section class="stats-row">
   <button data-filter-stat="present"><b>${counts.present}</b><span>Presentes</span></button>
   <button data-filter-stat="absent"><b>${counts.absent}</b><span>Ausentes</span></button>
   <button data-filter-stat="pending"><b>${counts.pending}</b><span>Sin marcar</span></button>
 </section>
 <section class="take-attendance">
   <div><span class="att-kicker">PASAR LISTA</span><h3>${counts.pending?'Te faltan '+counts.pending:'Lista completa'}</h3><p>Usá tarjetas para hacerlo rápido o la lista para corregir.</p></div>
   <button class="start-deck" id="startDeck" ${!can('attendance')||!rows.length?'disabled':''}>▶ Modo swipe</button>
 </section>
 <nav class="attendance-tabs">${tabs().map(([id,label])=>`<button data-tab="${id}" class="${S.tab===id?'on':''}">${label}</button>`).join('')}</nav>
 <div class="attendance-toolbar"><input id="att-search" type="search" placeholder="Buscar persona..." value="${E(S.query)}"><select id="att-filter"><option value="all">Todos</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${S.filter===k?'selected':''}>${v}</option>`).join('')}</select></div>
 <section id="attendanceContent"></section>`);
 bindBase();paintContent();
}
function groupChooser(){
 const allowed=S.groups.filter(g=>has('efe',g.code));
 return `<label><span>Grupo</span><select id="att-group">${allowed.map(g=>`<option value="${g.id}" ${g.id===S.group?'selected':''}>${E(g.name)}</option>`).join('')}</select></label>`;
}
function tabs(){
 const out=[['attendance','Asistencia'],['people',S.mode==='efe'?'Integrantes':'Personas']];
 if(S.mode==='efe'&&can('history'))out.push(['followups','Seguimiento']);
 if(can('history'))out.push(['history','Historial']);
 out.push(['birthdays','Cumpleaños']);return out;
}
function bindBase(){
 app.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
 app.querySelector('#att-group')?.addEventListener('change',async e=>{S.group=e.target.value;S.tab='attendance';const url=new URL(location.href);url.searchParams.set('group',group()?.code||'');history.replaceState(null,'',url);await loadDate();render()});
 app.querySelector('#att-event')?.addEventListener('change',async e=>{S.date=e.target.value;await loadDate();render()});
 app.querySelector('#att-date')?.addEventListener('change',async e=>{S.date=e.target.value;await loadDate();render()});
 app.querySelector('#att-search').oninput=e=>{S.query=e.target.value;paintContent()};
 app.querySelector('#att-filter').onchange=e=>{S.filter=e.target.value;paintContent()};
 app.querySelectorAll('[data-filter-stat]').forEach(b=>b.onclick=()=>{S.tab='attendance';S.filter=b.dataset.filterStat;render()});
 app.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab;paintContent();app.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x.dataset.tab===S.tab))});
 app.querySelector('#startDeck')?.addEventListener('click',startDeck);
}
function filteredRows(){
 let rows=eligiblePeople();
 if(S.tab==='birthdays')return rows.filter(p=>p.birthday).sort((a,b)=>a.birthday.slice(5).localeCompare(b.birthday.slice(5)));
 if(S.tab==='followups')rows=rows.filter(p=>status(p.id)==='absent'||S.followups.some(f=>f.person_id===p.id));
 const q=norm(S.query);if(q)rows=rows.filter(p=>norm(p.full_name+' '+(p.phone||'')+' '+(p.instagram||'')+' '+membership(p.id)?.leader_name).includes(q));
 if(S.tab==='attendance'&&S.filter!=='all')rows=rows.filter(p=>status(p.id)===S.filter);
 return rows;
}
function membership(id){return S.members.find(m=>m.person_id===id&&m.group_id===S.group)}
function paintContent(){
 const host=app.querySelector('#attendanceContent');if(!host)return;
 if(S.loading){host.innerHTML='<div class="att-loading">Cargando encuentro…</div>';return}
 if(S.tab==='history'){paintHistory(host);return}
 if(S.tab==='people'){paintPeople(host);return}
 if(S.tab==='birthdays'){paintBirthdays(host);return}
 if(S.tab==='followups'){paintFollowups(host);return}
 const rows=filteredRows();
 host.innerHTML=`<div class="people-list">${rows.map(p=>attendanceRow(p)).join('')||'<div class="att-empty">No hay personas para este filtro.</div>'}</div>`;
 host.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>mark(b.dataset.person,b.dataset.status));
 host.querySelectorAll('[data-wa]').forEach(b=>b.onclick=()=>window.open(b.dataset.wa,'_blank','noopener'));
}
function attendanceRow(p){
 const st=status(p.id),a=age(p),m=membership(p.id);
 return `<article class="person-row status-${st}">
  <div class="person-avatar">${initials(p.full_name)}</div>
  <div class="person-copy"><b>${E(p.full_name)}</b><small>${a===null?'Edad sin cargar':a+' años'}${S.mode==='efe'?' · '+E(m?.leader_name?'Resp. '+m.leader_name:'Sin responsable'):''}</small></div>
  <div class="status-actions">
   <button data-status="absent" data-person="${p.id}" class="no" aria-pressed="${st==='absent'}" ${!can('attendance')?'disabled':''}>Faltó</button>
   <button data-status="present" data-person="${p.id}" class="yes" aria-pressed="${st==='present'}" ${!can('attendance')?'disabled':''}>Vino</button>
  </div>
 </article>`;
}
async function mark(id,value){
 if(!can('attendance')||S.busy.has(id))return;S.busy.add(id);
 const old=status(id);const idx=S.attendance.findIndex(a=>a.person_id===id);
 if(idx>=0)S.attendance[idx]={...S.attendance[idx],status:value};else S.attendance.push({person_id:id,status:value});
 paintContent();
 const r=await sb.rpc('tnt_mark_attendance',{p_mode:S.mode,p_person:id,p_date:S.date,p_status:value,p_group:S.mode==='efe'?S.group:null});
 if(r.error){if(idx>=0)S.attendance[idx].status=old;else S.attendance=S.attendance.filter(a=>a.person_id!==id);U.toast(r.error.message,true)}else if(can('history'))await loadAuditOnly();
 S.busy.delete(id);paintContent();
}
async function loadAuditOnly(){
 let q=sb.from('tnt_attendance_audit').select('*').eq('mode',S.mode).eq('attendance_date',S.date).order('created_at',{ascending:false}).limit(120);
 if(S.mode==='efe')q=q.eq('group_id',S.group);const r=await q;if(!r.error)S.audit=r.data||[];
}
function startDeck(){
 const rows=eligiblePeople(),pending=rows.filter(p=>status(p.id)==='pending'),marked=rows.filter(p=>status(p.id)!=='pending');
 S.deck={queue:[...pending,...marked],index:0,history:[],original:new Map(rows.map(p=>[p.id,status(p.id)]))};renderDeck();
}
function renderDeck(){
 const d=S.deck,p=d?.queue[d.index];if(!d)return render();
 if(!p){const host=document.createElement('div');host.className='deck-screen';host.innerHTML='<div class="deck-finish"><div>✓</div><h2>Lista terminada</h2><p>Los cambios quedaron guardados en TNT.</p><button id="deckDone">Ver resumen</button></div>';document.body.append(host);host.querySelector('#deckDone').onclick=()=>{host.remove();S.deck=null;render()};return}
 const old=document.querySelector('.deck-screen');old?.remove();
 const host=document.createElement('div');host.className='deck-screen '+S.mode;const st=status(p.id),pct=Math.round(d.index/d.queue.length*100);
 host.innerHTML=`<header class="deck-head"><button id="deckClose">×</button><div><b>${S.mode==='efe'?E(group()?.name):'Sábado TNT'}</b><small>${d.index+1} de ${d.queue.length}</small></div><button id="deckUndo" ${!d.history.length?'disabled':''}>↶</button></header><div class="deck-bar"><i style="width:${pct}%"></i></div><main class="deck-stage"><article class="swipe-card" id="swipeCard"><div><div class="big-avatar">${initials(p.full_name)}</div><h2>${E(p.full_name)}</h2><div class="person-tags"><span>${age(p)??'—'} años</span>${S.mode==='efe'?'<span>'+E(membership(p.id)?.leader_name||'Sin responsable')+'</span>':''}${st!=='pending'?'<span>Antes: '+E(labels[st])+'</span>':''}</div></div><footer><span>← faltó</span><b>${E(p.phone||'Sin teléfono')}</b><span>vino →</span></footer></article></main><div class="deck-buttons"><button class="deck-no" data-deck-answer="absent">← Faltó</button><button class="deck-yes" data-deck-answer="present">Vino →</button></div>`;
 document.body.append(host);
 host.querySelector('#deckClose').onclick=()=>{host.remove();S.deck=null;render()};
 host.querySelector('#deckUndo').onclick=async()=>{const h=d.history.pop();if(!h)return;d.index=Math.max(0,d.index-1);await mark(h.id,h.prev);host.remove();renderDeck()};
 host.querySelectorAll('[data-deck-answer]').forEach(b=>b.onclick=()=>answerDeck(p,b.dataset.deckAnswer,host));
 bindSwipe(host.querySelector('#swipeCard'),p,host);
}
async function answerDeck(p,value,host){
 const prev=status(p.id);S.deck.history.push({id:p.id,prev});await mark(p.id,value);S.deck.index++;host.remove();renderDeck();
}
function bindSwipe(card,p,host){
 let sx=0,x=0,drag=false;card.onpointerdown=e=>{drag=true;sx=e.clientX;card.setPointerCapture(e.pointerId)};
 card.onpointermove=e=>{if(!drag)return;x=e.clientX-sx;card.style.transform=`translate3d(${x}px,0,0) rotate(${x/28}deg)`;card.dataset.dir=x>0?'yes':'no'};
 const end=()=>{if(!drag)return;drag=false;if(Math.abs(x)>72)answerDeck(p,x>0?'present':'absent',host);else{card.style.transform='';delete card.dataset.dir}x=0};
 card.onpointerup=end;card.onpointercancel=end;
}
function paintPeople(host){
 const rows=filteredRows();
 const add=S.mode==='efe'&&can('edit_people')?'<button class="section-action" id="addEfePerson">+ Agregar desde Perfiles</button>':'';
 host.innerHTML=`<div class="section-title"><div><span class="att-kicker">${S.mode==='efe'?'INTEGRANTES':'BASE CENTRAL'}</span><h3>${rows.length} personas</h3></div>${add}</div><div class="people-list">${rows.map(p=>`<article class="person-row"><div class="person-avatar">${initials(p.full_name)}</div><div class="person-copy"><b>${E(p.full_name)}</b><small>${E(p.phone||'Sin teléfono')} · ${E(p.instagram||'Sin Instagram')}${S.mode==='efe'?' · '+E(membership(p.id)?.leader_name||'Sin responsable'):''}</small></div>${S.mode==='efe'&&can('edit_people')?`<button class="mini-action" data-member-edit="${p.id}">Editar EFE</button>`:canProfiles()?`<a class="mini-action" href="/perfiles/datos/">Perfil</a>`:''}</article>`).join('')}</div>`;
 host.querySelector('#addEfePerson')?.addEventListener('click',addEfePersonModal);
 host.querySelectorAll('[data-member-edit]').forEach(b=>b.onclick=()=>editMembershipModal(b.dataset.memberEdit));
}
function addEfePersonModal(){
 const current=new Set(eligiblePeople().map(p=>p.id)),available=S.people.filter(p=>p.active&&!current.has(p.id));
 const o=U.modal('Agregar a '+(group()?.name||'EFE'),`<div class="picker-search"><input id="profilePickSearch" type="search" placeholder="Buscar en Perfiles..."></div><div class="profile-picker" id="profilePicker">${available.map(p=>profilePickRow(p)).join('')||'<div class="att-empty">Todas las personas activas ya están en este EFE.</div>'}</div>`);
 const paint=()=>{const q=norm(o.querySelector('#profilePickSearch').value);o.querySelector('#profilePicker').innerHTML=available.filter(p=>!q||norm(p.full_name+' '+(p.phone||'')).includes(q)).map(p=>profilePickRow(p)).join('')||'<div class="att-empty">Sin resultados.</div>';o.querySelectorAll('[data-profile-pick]').forEach(b=>b.onclick=()=>saveMembership(b.dataset.profilePick,true,'' ,o))};
 o.querySelector('#profilePickSearch').oninput=paint;paint();
}
function profilePickRow(p){return `<button class="profile-pick" data-profile-pick="${p.id}"><span class="person-avatar">${initials(p.full_name)}</span><span><b>${E(p.full_name)}</b><small>${E(p.phone||'Sin teléfono')}</small></span><i>＋</i></button>`}
function editMembershipModal(id){
 const p=person(id),m=membership(id),o=U.modal('Integrante EFE',`<form class="tnt-form"><p><b>${E(p.full_name)}</b><br><small>Los datos personales se editan en Perfiles.</small></p><label>Responsable de acompañamiento<input name="leader" value="${E(m?.leader_name||'')}"></label><div class="tnt-actions"><button class="tnt-button primary" type="submit">Guardar</button><button class="tnt-button danger" type="button" id="removeMember">Quitar de este EFE</button></div><p role="alert"></p></form>`);
 o.querySelector('form').onsubmit=async e=>{e.preventDefault();await saveMembership(id,true,e.target.elements.leader.value,o)};
 o.querySelector('#removeMember').onclick=async()=>{if(await U.confirm('¿Quitar a '+p.full_name+' de este EFE? Su perfil y su historial no se borran.'))await saveMembership(id,false,m?.leader_name||'',o)};
}
async function saveMembership(id,active,leader,o){
 const r=await sb.rpc('tnt_set_efe_membership',{p_person:id,p_group:S.group,p_active:active,p_leader:leader||null});
 if(r.error){U.toast(r.error.message,true);return}U.closeModal(o);const m=await checked(sb.from('tnt_efe_memberships').select('*'));S.members=m;render();
}
function paintFollowups(host){
 const rows=filteredRows();host.innerHTML=`<div class="section-title"><div><span class="att-kicker">AUSENTES</span><h3>Seguimiento del miércoles</h3></div></div><div class="people-list">${rows.map(p=>{const f=S.followups.find(x=>x.person_id===p.id),wa=phoneUrl(p);return`<article class="follow-row"><div class="person-avatar">${initials(p.full_name)}</div><div><b>${E(p.full_name)}</b><small>${E(followLabels[f?.status]||'Pendiente')} · ${E(f?.note||'Sin nota')}</small></div><div class="follow-actions">${wa?`<button data-wa="${wa}">WhatsApp</button>`:''}<button data-follow="${p.id}">Seguimiento</button></div></article>`}).join('')||'<div class="att-empty">No hay ausentes para seguir.</div>'}</div>`;
 host.querySelectorAll('[data-wa]').forEach(b=>b.onclick=()=>window.open(b.dataset.wa,'_blank','noopener'));
 host.querySelectorAll('[data-follow]').forEach(b=>b.onclick=()=>followModal(b.dataset.follow));
}
function followModal(id){
 const p=person(id),f=S.followups.find(x=>x.person_id===id),o=U.modal('Seguimiento · '+p.full_name,`<form class="tnt-form"><label>Estado<select name="status">${Object.entries(followLabels).map(([k,v])=>`<option value="${k}" ${f?.status===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Nota<textarea name="note" rows="4">${E(f?.note||'')}</textarea></label><button class="tnt-button primary">Guardar seguimiento</button><p role="alert"></p></form>`);
 o.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),payload={person_id:id,group_id:S.group,wednesday_date:S.date,status:fd.get('status'),note:fd.get('note')||'',updated_by:TNT.displayName(),updated_at:new Date().toISOString()};let q=f?sb.from('tnt_efe_followups').update(payload).eq('id',f.id):sb.from('tnt_efe_followups').insert(payload);const r=await q.select().single();if(r.error){e.target.querySelector('[role=alert]').textContent=r.error.message;return}U.closeModal(o);await loadDate();render()};
}
function paintHistory(host){
 const names=new Map(S.people.map(p=>[p.id,p.full_name]));
 host.innerHTML=`<div class="section-title"><div><span class="att-kicker">HISTORIAL</span><h3>Quién cambió qué</h3></div></div><div class="audit-list">${S.audit.map(a=>`<article><span class="audit-dot ${a.to_status}"></span><div><b>${E(names.get(a.person_id)||'Persona')}</b><small>${E(a.from_status?labels[a.from_status]||a.from_status:'Sin registrar')} → ${E(labels[a.to_status]||a.to_status)} · ${new Date(a.created_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></div></article>`).join('')||'<div class="att-empty">Todavía no hay cambios registrados para este encuentro.</div>'}</div>`;
}
function paintBirthdays(host){
 const rows=filteredRows(),month=new Date().getMonth()+1;host.innerHTML=`<div class="section-title"><div><span class="att-kicker">CUMPLEAÑOS</span><h3>Fechas de tu gente</h3></div></div><div class="people-list">${rows.map(p=>`<article class="person-row ${Number(p.birthday?.slice(5,7))===month?'birthday-now':''}"><div class="person-avatar">🎂</div><div class="person-copy"><b>${E(p.full_name)}</b><small>${U.date(p.birthday+'T12:00:00-03:00',{day:'numeric',month:'long'})}</small></div></article>`).join('')||'<div class="att-empty">No hay cumpleaños cargados.</div>'}</div>`;
}
loadBase().catch(e=>{console.error(e);app.innerHTML='<div class="tnt-error"><b>No pudimos cargar Asistencia TNT.</b><p>'+E(e.message)+'</p><button class="tnt-button" onclick="location.reload()">Reintentar</button></div>'});
})();