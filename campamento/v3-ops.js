(() => {
'use strict';
const C=window.CampApp;if(!C)return;
const S=C.S,sb=TNT.sb,U=TNTUI,E=U.esc;
const kindLabel={room:'Habitaciones',bus:'Transporte',team:'Equipos'};
const kindIcon={room:'🛏',bus:'🚌',team:'⚑'};
const kindSingular={room:'Habitación',bus:'Transporte',team:'Equipo'};
const resourceCount=id=>S.assignments.filter(a=>a.resource_id===id&&C.active().some(r=>r.id===a.registration_id)).length;
const assigned=(regId,kind)=>{const a=S.assignments.find(x=>x.registration_id===regId&&x.kind===kind);return S.resources.find(r=>r.id===a?.resource_id)||null};

C.views.logistics=v=>{
 const regs=C.active();
 const unassigned=k=>regs.filter(r=>!S.assignments.some(a=>a.registration_id===r.id&&a.kind===k)).length;
 v.innerHTML=`<section class="camp-section-head"><div><span>LOGÍSTICA</span><h2>Organización del campamento</h2><p>Habitaciones, transporte, equipos e ingreso al predio.</p></div></section>
 <div class="ops-grid">
 ${['room','bus','team'].map(k=>{const rs=S.resources.filter(r=>r.camp_id===S.camp&&r.kind===k),cap=rs.reduce((n,r)=>n+Number(r.capacity||0),0);return `<button data-ops="${k}"><i>${kindIcon[k]}</i><div><b>${kindLabel[k]}</b><small>${regs.length-unassigned(k)}/${regs.length} asignados · ${cap} lugares</small></div><span>${unassigned(k)?unassigned(k)+' sin asignar':'Completo'} ›</span></button>`}).join('')}
 <button data-ops="checkin"><i>⌁</i><div><b>Ingresos</b><small>${regs.filter(r=>r.checked_in_at&&!r.checked_out_at).length} en el predio</small></div><span>${regs.filter(r=>!r.checked_in_at).length} sin ingresar ›</span></button>
 </div>`;
 v.querySelectorAll('[data-ops]').forEach(b=>b.onclick=()=>C.go({room:'rooms',bus:'buses',team:'teams',checkin:'checkin'}[b.dataset.ops]));
};

function resourcesView(v,kind){
 const regs=C.active(),rs=S.resources.filter(r=>r.camp_id===S.camp&&r.kind===kind),unassigned=regs.filter(r=>!S.assignments.some(a=>a.registration_id===r.id&&a.kind===kind));
 v.innerHTML=`<section class="camp-section-head"><div><button class="back-chip" id="back-logistics">← Logística</button><span>LOGÍSTICA</span><h2>${kindLabel[kind]}</h2><p>${unassigned.length} personas sin asignar.</p></div>${C.can('logistics')?`<div class="camp-head-actions"><button class="tnt-button" id="auto-assign">Distribuir automáticamente</button><button class="tnt-button primary" id="new-resource">+ Agregar</button></div>`:''}</section>
 <div class="resource-grid">${rs.map(r=>{const members=S.assignments.filter(a=>a.resource_id===r.id&&regs.some(x=>x.id===a.registration_id)),pct=Math.min(100,Math.round(members.length/Math.max(1,r.capacity)*100));return `<article class="resource-card"><header><span>${kindIcon[kind]}</span><div><h3>${E(r.name)}</h3><small>${members.length}/${r.capacity} ocupados</small></div><b>${pct}%</b></header><div class="camp-progress-line big"><i style="width:${pct}%"></i></div><div class="resource-members">${members.map(a=>{const reg=C.reg(a.registration_id);return `<button data-reg-open="${reg.id}">${E(C.person(reg.person_id).full_name)}</button>`}).join('')||'<em>Sin personas asignadas</em>'}</div>${C.can('logistics')?`<div class="camp-head-actions"><button class="tnt-button" data-resource-edit="${r.id}">Configurar</button><button class="tnt-button" data-resource-add="${r.id}">Asignar persona</button></div>`:''}</article>`}).join('')||'<div class="camp-empty">Todavía no cargaste '+kindLabel[kind].toLowerCase()+'.</div>'}</div>`;
 v.querySelector('#back-logistics').onclick=()=>C.go('logistics');
 v.querySelector('#new-resource')?.addEventListener('click',()=>resourceForm(null,kind));
 v.querySelector('#auto-assign')?.addEventListener('click',()=>autoAssign(kind));
 v.querySelectorAll('[data-reg-open]').forEach(b=>b.onclick=()=>C.actions.openRegistration?.(b.dataset.regOpen));
 v.querySelectorAll('[data-resource-edit]').forEach(b=>b.onclick=()=>resourceForm(S.resources.find(x=>x.id===b.dataset.resourceEdit),kind));
 v.querySelectorAll('[data-resource-add]').forEach(b=>b.onclick=()=>assignPersonToResource(S.resources.find(x=>x.id===b.dataset.resourceAdd),kind));
}
C.views.rooms=v=>resourcesView(v,'room');C.views.buses=v=>resourcesView(v,'bus');C.views.teams=v=>resourcesView(v,'team');

function resourceForm(r,kind){
 const o=C.modal(r?'Editar '+kindSingular[kind]:'Nueva '+kindSingular[kind],`<form class="camp-form">${C.field('Nombre','name',r?.name||'','text','required')}${C.field('Capacidad','capacity',r?.capacity||10,'number','min="1" required')}<button class="tnt-button primary" type="submit">Guardar</button>${r?'<button class="tnt-button danger" type="button" id="delete-resource">Eliminar</button>':''}<p role="alert"></p></form>`);
 o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,async fd=>{const row={camp_id:S.camp,kind,name:fd.get('name'),capacity:Number(fd.get('capacity'))};if(r&&resourceCount(r.id)>row.capacity)throw Error('Hay más personas asignadas que lugares.');await C.checked(r?sb.from('tnt_camp_resources').update(row).eq('id',r.id).select():sb.from('tnt_camp_resources').insert(row).select())})};
 o.querySelector('#delete-resource')?.addEventListener('click',async()=>{if(resourceCount(r.id))return U.toast('Primero quitá las personas asignadas.',true);if(!await U.confirm('¿Eliminar '+r.name+'?'))return;const q=await sb.from('tnt_camp_resources').delete().eq('id',r.id);if(q.error)return U.toast(q.error.message,true);U.closeModal(o);await C.load()});
}
function assignPersonToResource(res,kind){
 const taken=new Set(S.assignments.filter(a=>a.kind===kind).map(a=>a.registration_id));
 C.registrationPicker(r=>assignResource(r,kind,res.id),'Asignar a '+res.name,r=>!taken.has(r.id)||S.assignments.some(a=>a.registration_id===r.id&&a.kind===kind&&a.resource_id===res.id));
}
function assignResource(r,kind,preset=''){
 const options=S.resources.filter(x=>x.camp_id===S.camp&&x.kind===kind),current=S.assignments.find(a=>a.registration_id===r.id&&a.kind===kind),o=C.modal(kindSingular[kind]+' · '+C.person(r.person_id).full_name,`<form class="camp-form"><label class="camp-field"><span>Destino</span><select name="resource"><option value="">Sin asignar</option>${options.map(x=>`<option value="${x.id}" ${(preset||current?.resource_id)===x.id?'selected':''}>${E(x.name)} · ${resourceCount(x.id)}/${x.capacity}</option>`).join('')}</select></label><button class="tnt-button primary" type="submit">Guardar asignación</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(fd.get('resource')?sb.from('tnt_camp_assignments').upsert({registration_id:r.id,kind,resource_id:fd.get('resource')},{onConflict:'registration_id,kind'}).select():sb.from('tnt_camp_assignments').delete().eq('registration_id',r.id).eq('kind',kind)))};
}
async function autoAssign(kind){
 if(!C.can('logistics'))return;const count=C.active().filter(r=>!S.assignments.some(a=>a.registration_id===r.id&&a.kind===kind)).length;if(!count)return U.toast('Todos ya tienen '+kindLabel[kind].toLowerCase()+'.');if(!S.resources.some(r=>r.camp_id===S.camp&&r.kind===kind))return U.toast('Primero creá '+kindLabel[kind].toLowerCase()+'.',true);if(!await U.confirm('¿Distribuir automáticamente '+count+' personas? Las asignaciones existentes no cambian.'))return;const r=await sb.rpc('tnt_camp_auto_assign',{p_camp:S.camp,p_kind:kind});if(r.error)return U.toast(r.error.message,true);await C.load();U.toast((r.data||0)+' personas distribuidas');
}

C.views.checkin=v=>{
 const regs=C.active();
 v.innerHTML=`<section class="camp-section-head"><div><button class="back-chip" id="back-logistics">← Logística</button><span>INGRESO AL PREDIO</span><h2>Ingresos</h2><p>Buscá por nombre o DNI y registrá ingreso o salida.</p></div></section><div class="camp-search-row"><input id="check-search" type="search" placeholder="Nombre o DNI"><select id="check-filter"><option value="all">Todos</option><option value="out">Sin ingresar</option><option value="in">En el predio</option><option value="left">Ya salió</option></select></div><div id="check-list" class="check-list"></div>`;
 v.querySelector('#back-logistics').onclick=()=>C.go('logistics');
 const paint=()=>{const q=(v.querySelector('#check-search').value||'').toLowerCase(),f=v.querySelector('#check-filter').value,rows=regs.filter(r=>{const p=C.person(r.person_id),state=r.checked_in_at&&!r.checked_out_at?'in':r.checked_out_at?'left':'out';return `${p.full_name} ${r.document_no}`.toLowerCase().includes(q)&&(f==='all'||f===state)});v.querySelector('#check-list').innerHTML=rows.map(r=>{const p=C.person(r.person_id),inside=r.checked_in_at&&!r.checked_out_at;return `<article class="check-row ${inside?'inside':''}">${C.avatar(p.id)}<div><b>${E(p.full_name)}</b><small>${r.checked_out_at?'Salida '+new Date(r.checked_out_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}):r.checked_in_at?'Ingreso '+new Date(r.checked_in_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}):'Todavía no ingresó'}</small></div>${C.can('checkin')?`<button class="tnt-button ${inside?'danger':'primary'}" data-check="${r.id}">${inside?'Registrar salida':'Registrar ingreso'}</button>`:''}</article>`}).join('')||'<div class="camp-empty">Sin resultados.</div>';v.querySelectorAll('[data-check]').forEach(b=>b.onclick=()=>checkin(b.dataset.check))};
 v.querySelector('#check-search').oninput=paint;v.querySelector('#check-filter').onchange=paint;paint();
};
async function checkin(id){const r=await sb.rpc('tnt_camp_checkin',{p_registration:id});if(r.error)return U.toast(r.error.message,true);await C.load();U.toast(r.data?.state==='out'?'Salida registrada':'Ingreso registrado')}

C.views.more=v=>{
 v.innerHTML=`<section class="camp-section-head"><div><span>MÁS</span><h2>Otras herramientas</h2></div></section><div class="more-grid"><button data-more="people"><i>◎</i><div><b>Personas</b><small>Historial entre ediciones</small></div><span>›</span></button><button data-more="communications"><i>✉</i><div><b>Mensajes</b><small>Plantillas manuales</small></div><span>›</span></button><button data-more="mine"><i>☺</i><div><b>Mi ficha</b><small>Mi estado de inscripción</small></div><span>›</span></button><button data-more="trash"><i>⌫</i><div><b>Papelera</b><small>Inscripciones archivadas</small></div><span>›</span></button></div>`;
 v.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>C.go(b.dataset.more));
};

C.views.people=v=>{
 const rows=S.people.filter(p=>S.registrations.some(r=>r.person_id===p.id&&!r.deleted_at));
 v.innerHTML=`<section class="camp-section-head"><div><button class="back-chip" id="more-back">← Más</button><span>HISTORIAL</span><h2>Personas de Campamento</h2><p>Solo aparecen personas que tienen o tuvieron una inscripción de campamento.</p></div></section><div class="camp-search-row one"><input id="people-search" type="search" placeholder="Buscar persona"></div><div id="people-list" class="camp-list"></div>`;
 v.querySelector('#more-back').onclick=()=>C.go('more');
 const paint=()=>{const q=(v.querySelector('#people-search').value||'').toLowerCase();v.querySelector('#people-list').innerHTML=rows.filter(p=>`${p.full_name} ${p.phone||''}`.toLowerCase().includes(q)).map(p=>{const hist=S.registrations.filter(r=>r.person_id===p.id&&!r.deleted_at).sort((a,b)=>String(S.editions.find(e=>e.id===b.camp_id)?.start_date||'').localeCompare(String(S.editions.find(e=>e.id===a.camp_id)?.start_date||''))),current=hist.find(r=>r.camp_id===S.camp);return `<article class="camp-list-row">${C.avatar(p.id)}<div><b>${E(p.full_name)}</b><small>${hist.length} ${hist.length===1?'edición':'ediciones'} · ${E(p.phone||'Sin teléfono')}</small></div>${current?`<button class="tnt-button" data-person-current="${current.id}">Ficha actual</button>`:'<em class="muted-text">No inscripto/a este año</em>'}</article>`}).join('')||'<div class="camp-empty">Sin resultados.</div>';v.querySelectorAll('[data-person-current]').forEach(b=>b.onclick=()=>C.actions.openRegistration?.(b.dataset.personCurrent))};v.querySelector('#people-search').oninput=paint;paint();
};

C.views.communications=v=>{
 const rows=S.messages.filter(m=>m.camp_id===S.camp).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 v.innerHTML=`<section class="camp-section-head"><div><button class="back-chip" id="more-back">← Más</button><span>COMUNICACIONES</span><h2>Mensajes manuales</h2><p>Los emails automáticos se configuran desde ⚙ Configuración → Notificaciones.</p></div>${C.can('communications')?'<button class="tnt-button primary" id="new-message">+ Mensaje</button>':''}</section><div class="message-grid">${rows.map(m=>`<article class="message-card"><span>${E(m.channel==='whatsapp'?'WhatsApp':m.channel==='instagram'?'Instagram':'General')}</span><h3>${E(m.title)}</h3><p>${E(m.body)}</p><div class="camp-head-actions"><button class="tnt-button" data-copy-msg="${m.id}">Copiar</button>${C.can('communications')?`<button class="tnt-button" data-edit-msg="${m.id}">Editar</button><button class="tnt-button danger" data-del-msg="${m.id}">Eliminar</button>`:''}</div></article>`).join('')||'<div class="camp-empty">No hay mensajes guardados.</div>'}</div>`;
 v.querySelector('#more-back').onclick=()=>C.go('more');v.querySelector('#new-message')?.addEventListener('click',()=>messageForm());v.querySelectorAll('[data-copy-msg]').forEach(b=>b.onclick=()=>copyText(S.messages.find(x=>x.id===b.dataset.copyMsg)?.body||''));v.querySelectorAll('[data-edit-msg]').forEach(b=>b.onclick=()=>messageForm(S.messages.find(x=>x.id===b.dataset.editMsg)));v.querySelectorAll('[data-del-msg]').forEach(b=>b.onclick=()=>deleteMessage(b.dataset.delMsg));
};
function messageForm(m=null){const o=C.modal(m?'Editar mensaje':'Nuevo mensaje',`<form class="camp-form">${C.field('Título','title',m?.title||'','text','required')}<label class="camp-field"><span>Canal</span><select name="channel"><option value="whatsapp" ${m?.channel==='whatsapp'?'selected':''}>WhatsApp</option><option value="instagram" ${m?.channel==='instagram'?'selected':''}>Instagram</option><option value="general" ${m?.channel==='general'?'selected':''}>General</option></select></label><label class="camp-field"><span>Mensaje</span><textarea name="body" rows="8" required>${E(m?.body||'')}</textarea></label><button class="tnt-button primary" type="submit">Guardar mensaje</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(m?sb.from('tnt_camp_messages').update({title:fd.get('title'),body:fd.get('body'),channel:fd.get('channel')}).eq('id',m.id).select():sb.from('tnt_camp_messages').insert({camp_id:S.camp,title:fd.get('title'),body:fd.get('body'),channel:fd.get('channel'),created_by:TNT.person.id}).select()))}}
async function deleteMessage(id){if(!await U.confirm('¿Eliminar este mensaje?'))return;const q=await sb.from('tnt_camp_messages').delete().eq('id',id);if(q.error)return U.toast(q.error.message,true);await C.load()}
async function copyText(value){try{await navigator.clipboard.writeText(value);U.toast('Copiado')}catch{U.toast('No pudimos copiarlo.',true)}}

C.views.mine=v=>{
 const r=S.registrations.find(x=>x.camp_id===S.camp&&x.person_id===TNT.person.id&&!x.deleted_at);if(!r){v.innerHTML=`<section class="camp-section-head"><div><button class="back-chip" id="more-back">← Más</button><span>MI CAMPAMENTO</span><h2>Mi ficha</h2></div></section><div class="camp-empty">Tu cuenta TNT no está vinculada a una inscripción de esta edición.</div>`;v.querySelector('#more-back').onclick=()=>C.go('more');return}const p=C.person(r.person_id);v.innerHTML=`<section class="camp-section-head"><div><button class="back-chip" id="more-back">← Más</button><span>MI CAMPAMENTO</span><h2>${E(p.full_name)}</h2></div></section><article class="my-camp-card">${C.avatar(p.id,88)}<div class="camp-detail-grid"><div><small>Estado</small><b>${E(r.status)}</b></div><div><small>Saldo</small><b>${C.money(C.balance(r))}</b></div><div><small>Habitación</small><b>${E(assigned(r.id,'room')?.name||'—')}</b></div><div><small>Equipo</small><b>${E(assigned(r.id,'team')?.name||'—')}</b></div></div><button class="tnt-button" id="my-health">Mi ficha de salud</button><a class="tnt-button" href="/campamento/inscripcion/?token=${encodeURIComponent(r.public_token)}" target="_blank">Ver estado público</a></article>`;v.querySelector('#more-back').onclick=()=>C.go('more');v.querySelector('#my-health').onclick=()=>healthForm(r);
};

C.actions.health=healthForm;
async function healthForm(r){
 try{const q=await sb.from('tnt_camp_health').select('*').eq('registration_id',r.id).maybeSingle();if(q.error)throw q.error;const h=q.data||{},editable=TNT.isAdmin||TNT.hasAccess('campamento-salud','*','edit');const o=C.modal('Salud · '+C.person(r.person_id).full_name,`<div class="health-notice">Información sensible. Solo la ve el equipo autorizado y la persona vinculada.</div><form class="camp-form">${[['allergies','Alergias'],['medication','Medicación e indicaciones'],['dietary','Alimentación / restricciones'],['conditions','Información relevante']].map(([k,l])=>`<label class="camp-field"><span>${l}</span><textarea name="${k}" ${!editable?'readonly':''}>${E(h[k]||'')}</textarea></label>`).join('')}${C.field('Contacto de emergencia','emergency_name',h.emergency_name||'','text',!editable?'readonly':'')}${C.field('Teléfono de emergencia','emergency_phone',h.emergency_phone||'','tel',!editable?'readonly':'')}${editable?'<button class="tnt-button primary" type="submit">Guardar salud</button>':''}<p role="alert"></p></form>`);if(editable)o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(sb.from('tnt_camp_health').upsert({...Object.fromEntries(fd),registration_id:r.id,updated_at:new Date().toISOString()}).select()))}}catch(e){U.toast(e.message,true)}
}
})();
