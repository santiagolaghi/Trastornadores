(() => {
'use strict';
const C=window.CampApp;
if(!C)return;
const S=C.S,sb=TNT.sb,U=TNTUI,E=U.esc;

function statusLabel(v){return ({pending:'Pendiente',confirmed:'Confirmada',cancelled:'Cancelada'})[v]||v}
function church(id){return S.churches.find(x=>x.id===id)||null}
function campPlans(){return S.plans.filter(x=>x.camp_id===S.camp).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.name.localeCompare(b.name))}
function regExceptions(id){return S.exceptions.filter(x=>x.registration_id===id&&x.active)}
function regPenalties(id){return S.penalties.filter(x=>x.registration_id===id)}
function regSponsors(id){return S.sponsorships.filter(x=>x.registration_id===id)}

C.actions.openPaymentPicker=()=>C.registrationPicker(r=>paymentForm(r),'Registrar pago · buscar inscripto',r=>r.status!=='cancelled');
C.actions.openRegistration=id=>registrationDetail(id);
C.actions.editEdition=c=>editEdition(c);

C.views.payments=v=>{
  const regs=C.active();
  const received=regs.reduce((n,r)=>n+C.paid(r.id)+C.sponsored(r.id),0);
  const due=regs.reduce((n,r)=>n+C.balance(r),0);
  const recent=S.payments.filter(p=>regs.some(r=>r.id===p.registration_id)).sort((a,b)=>String(b.paid_at).localeCompare(String(a.paid_at))).slice(0,30);
  v.innerHTML=`
    <section class="camp-section-head">
      <div><span>PAGOS</span><h2>Pagos de inscriptos</h2><p>Primero completan el formulario. Después el staff busca únicamente entre esas inscripciones.</p></div>
      ${C.can('payments')?'<button class="tnt-button primary" id="new-payment">+ Registrar pago</button>':''}
    </section>
    <div class="camp-finance-summary">
      <div><small>Recibido + padrinos</small><b>${C.money(received)}</b></div>
      <div><small>Saldo pendiente</small><b>${C.money(due)}</b></div>
      <div><small>Pago completo</small><b>${regs.filter(r=>C.balance(r)<=0).length}/${regs.length}</b></div>
    </div>
    <div class="camp-payment-actions">
      <button id="find-debt">Con saldo <b>${regs.filter(r=>C.balance(r)>0).length}</b></button>
      <button id="open-sponsors">Padrinos <b>${S.sponsors.filter(x=>x.camp_id===S.camp&&x.active).length}</b></button>
    </div>
    <section class="camp-section-head compact"><div><span>MOVIMIENTOS</span><h2>Últimos pagos</h2></div></section>
    <div class="camp-list">${recent.map(p=>{
      const r=C.reg(p.registration_id),name=C.person(r?.person_id).full_name||'Persona';
      return `<article class="camp-list-row ${p.voided_at?'muted':''}"><div><b>${E(name)}</b><small>${C.date(p.paid_at)} · ${p.voided_at?'Anulado':E({cash:'Efectivo',transfer:'Transferencia',other:'Otro'}[p.method]||p.method)} · ${E(p.reference||'')}</small></div><strong>${C.money(p.amount)}</strong><button class="tnt-button" data-open-reg="${r?.id||''}">Ficha</button></article>`
    }).join('')||'<div class="camp-empty">Todavía no hay pagos.</div>'}</div>`;
  v.querySelector('#new-payment')?.addEventListener('click',C.actions.openPaymentPicker);
  v.querySelector('#find-debt')?.addEventListener('click',()=>C.registrationPicker(r=>registrationDetail(r.id),'Personas con saldo',r=>C.balance(r)>0));
  v.querySelector('#open-sponsors')?.addEventListener('click',()=>C.go('sponsors'));
  v.querySelectorAll('[data-open-reg]').forEach(b=>b.onclick=()=>registrationDetail(b.dataset.openReg));
};

function paymentForm(r){
  if(!C.can('payments'))return;
  const o=C.modal('Registrar pago · '+C.person(r.person_id).full_name,`
    <form class="camp-form">
      <div class="finance-mini"><span>Saldo actual</span><b>${C.money(C.balance(r))}</b></div>
      ${C.field('Importe recibido','amount','','number','min="0.01" step="0.01" required')}
      <label class="camp-field"><span>Medio de pago</span><div class="choice-grid">
        <label><input type="radio" name="method" value="cash" checked><b>Efectivo</b></label>
        <label><input type="radio" name="method" value="transfer"><b>Transferencia</b></label>
        <label><input type="radio" name="method" value="other"><b>Otro</b></label>
      </div></label>
      ${C.field('Referencia / comprobante','reference')}
      <button class="tnt-button primary" type="submit">Guardar pago</button><p role="alert"></p>
    </form>`);
  o.querySelector('form').onsubmit=e=>{
    e.preventDefault();
    C.formSave(o,async fd=>{
      await C.checked(sb.from('tnt_camp_payments').insert({registration_id:r.id,amount:Number(fd.get('amount')),method:fd.get('method'),reference:fd.get('reference')||'',recorded_by:TNT.person.id}).select());
    });
  };
}

function registrationDetail(id){
  const r=C.reg(id),p=C.person(r?.person_id);if(!r||!p)return;
  const ch=church(r.church_id),pl=C.plan(r.payment_plan_id),pays=C.regPayments(id),spons=regSponsors(id),pens=regPenalties(id),excs=regExceptions(id);
  const o=C.modal(p.full_name,`
    <div class="camp-detail-head"><div class="camp-person-avatar big">${C.initials(p.full_name)}</div><div><span class="camp-reg-status ${r.status}">${statusLabel(r.status)}</span><h2>${E(p.full_name)}</h2><p>${E(r.email||'Sin email')} · ${E(p.phone||'Sin teléfono')}</p></div></div>
    <div class="camp-detail-grid"><div><small>Total actual</small><b>${C.money(C.gross(r))}</b></div><div><small>Pagos + padrinos</small><b>${C.money(C.paid(r.id)+C.sponsored(r.id))}</b></div><div class="accent"><small>Saldo</small><b>${C.money(C.balance(r))}</b></div></div>
    <div class="camp-detail-actions">
      ${C.can('payments')?'<button class="tnt-button primary" id="detail-pay">+ Pago</button><button class="tnt-button" id="detail-exception">Excepción</button><button class="tnt-button" id="detail-sponsor">Padrino</button>':''}
      ${C.can('registrations')?'<button class="tnt-button" id="detail-edit">Editar inscripción</button><button class="tnt-button danger" id="detail-archive">Papelera</button>':''}
      ${TNT.hasAccess('campamento-salud','*','view')||p.id===TNT.person.id?'<button class="tnt-button" id="detail-health">Salud</button>':''}
    </div>
    <section class="detail-section"><h3>Inscripción</h3><div class="detail-facts">
      <span><small>Iglesia</small><b>${E(ch?.name||r.congregation||'—')}</b></span>
      <span><small>Plan</small><b>${E(pl.name||'Sin plan')}</b></span>
      <span><small>DNI</small><b>${E(r.document_no||'—')}</b></span>
      <span><small>Autorización</small><b>${r.authorization?'Recibida':'Pendiente'}</b></span>
    </div>${r.admin_notes?`<div class="admin-note"><b>Nota interna</b><p>${E(r.admin_notes)}</p></div>`:''}</section>
    <section class="detail-section"><h3>Pagos</h3><div class="camp-list">${pays.map(x=>`<article class="camp-list-row ${x.voided_at?'muted':''}"><div><b>${C.money(x.amount)}</b><small>${C.date(x.paid_at)} · ${E(x.reference||x.method)}</small></div>${C.can('payments')&&!x.voided_at?`<button class="tnt-button danger" data-void-pay="${x.id}">Anular</button>`:''}</article>`).join('')||'<div class="camp-empty compact">Sin pagos.</div>'}</div></section>
    ${spons.length?`<section class="detail-section"><h3>Aportes de padrinos</h3><div class="camp-list">${spons.map(x=>{const sp=S.sponsors.find(y=>y.id===x.sponsor_id);return `<article class="camp-list-row"><div><b>${C.money(x.amount)} · ${E(sp?.name||'Padrino/a')}</b><small>${E(x.note||'')}</small></div>${C.can('payments')?`<button class="tnt-button danger" data-del-sponsor="${x.id}">Quitar</button>`:''}</article>`}).join('')}</div></section>`:''}
    ${pens.length?`<section class="detail-section"><h3>Recargos</h3><div class="camp-list">${pens.map(x=>`<article class="camp-list-row ${x.waived_at?'muted':''}"><div><b>${C.money(x.amount)} · ${E(x.reason)}</b><small>${x.waived_at?'Perdonado: '+E(x.waived_reason||''):'Activo'}</small></div>${C.can('payments')&&!x.waived_at?`<button class="tnt-button" data-waive-penalty="${x.id}">Perdonar</button>`:''}</article>`).join('')}</div></section>`:''}
    ${excs.length?`<section class="detail-section"><h3>Excepciones y notas</h3><div class="camp-list">${excs.map(x=>`<article class="camp-list-row"><div><b>${E({extension:'Extensión',waive_late_fee:'Sin multa',discount:'Descuento',note:'Nota'}[x.kind]||x.kind)}${Number(x.amount)>0?' · '+C.money(x.amount):''}</b><small>${x.until_date?'Hasta '+C.date(x.until_date)+' · ':''}${E(x.note||'')}</small></div>${C.can('payments')?`<button class="tnt-button danger" data-del-exception="${x.id}">Eliminar</button>`:''}</article>`).join('')}</div></section>`:''}
  `,true);
  o.querySelector('#detail-pay')?.addEventListener('click',()=>paymentForm(r));
  o.querySelector('#detail-exception')?.addEventListener('click',()=>exceptionForm(r));
  o.querySelector('#detail-sponsor')?.addEventListener('click',()=>sponsorAllocationPicker(r));
  o.querySelector('#detail-edit')?.addEventListener('click',()=>editRegistrationAdmin(r));
  o.querySelector('#detail-archive')?.addEventListener('click',()=>archiveRegistration(r));
  o.querySelector('#detail-health')?.addEventListener('click',()=>window.CampApp.actions.health?.(r));
  o.querySelectorAll('[data-void-pay]').forEach(b=>b.onclick=()=>voidPayment(b.dataset.voidPay));
  o.querySelectorAll('[data-del-sponsor]').forEach(b=>b.onclick=()=>deleteSponsorship(b.dataset.delSponsor));
  o.querySelectorAll('[data-waive-penalty]').forEach(b=>b.onclick=()=>waivePenalty(b.dataset.waivePenalty));
  o.querySelectorAll('[data-del-exception]').forEach(b=>b.onclick=()=>deleteException(b.dataset.delException));
}

function editRegistrationAdmin(r){
  if(!C.can('registrations'))return;
  const p=C.person(r.person_id);
  const o=C.modal('Editar inscripción · '+p.full_name,`<form class="camp-form">
    ${C.field('Email','email',r.email||'','email','required')}${C.field('DNI','document_no',r.document_no||'')}
    <label class="camp-field"><span>Iglesia</span><select name="church_id"><option value="">Sin asignar</option>${S.churches.filter(x=>x.active||x.id===r.church_id).map(x=>`<option value="${x.id}" ${x.id===r.church_id?'selected':''}>${E(x.name)}</option>`).join('')}</select></label>
    <label class="camp-field"><span>Plan de pago</span><select name="plan_id"><option value="">Sin plan</option>${campPlans().filter(x=>x.active||x.id===r.payment_plan_id).map(x=>`<option value="${x.id}" ${x.id===r.payment_plan_id?'selected':''}>${E(x.name)} · ${C.money(x.total_amount)}</option>`).join('')}</select></label>
    <label class="camp-field"><span>Estado</span><select name="status">${['pending','confirmed','cancelled'].map(k=>`<option value="${k}" ${r.status===k?'selected':''}>${statusLabel(k)}</option>`).join('')}</select></label>
    <label class="camp-check"><input type="checkbox" name="authorization" ${r.authorization?'checked':''}><span>Autorización recibida</span></label>
    <label class="camp-field"><span>Nota interna del staff</span><textarea name="admin_notes">${E(r.admin_notes||'')}</textarea></label>
    <button class="tnt-button primary" type="submit">Guardar cambios</button><p role="alert"></p></form>`);
  o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,async fd=>{
    const ch=church(fd.get('church_id')),pl=C.plan(fd.get('plan_id'));
    await C.checked(sb.from('tnt_camp_registrations').update({email:String(fd.get('email')).trim().toLowerCase(),document_no:fd.get('document_no')||'',church_id:fd.get('church_id')||null,congregation:ch?.name||'',payment_plan_id:fd.get('plan_id')||null,fee:pl.id?pl.total_amount:r.fee,status:fd.get('status'),authorization:fd.has('authorization'),admin_notes:fd.get('admin_notes')||'',updated_at:new Date().toISOString()}).eq('id',r.id).select());
  })};
}

function exceptionForm(r){
  if(!C.can('payments'))return;
  const o=C.modal('Excepción · '+C.person(r.person_id).full_name,`<form class="camp-form">
    <label class="camp-field"><span>Tipo</span><select name="kind"><option value="extension">Extender vencimientos</option><option value="waive_late_fee">No aplicar multa</option><option value="discount">Descuento</option><option value="note">Solo nota</option></select></label>
    ${C.field('Hasta qué fecha','until_date','','date')}${C.field('Importe del descuento','amount',0,'number','min="0" step="0.01"')}
    <label class="camp-field"><span>Motivo / nota</span><textarea name="note" required></textarea></label>
    <button class="tnt-button primary" type="submit">Guardar excepción</button><p role="alert"></p></form>`);
  o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(sb.from('tnt_camp_payment_exceptions').insert({registration_id:r.id,kind:fd.get('kind'),until_date:fd.get('until_date')||null,amount:Number(fd.get('amount')||0),note:fd.get('note')||'',created_by:TNT.person.id}).select()))};
}
async function deleteException(id){if(!await U.confirm('¿Eliminar esta excepción?'))return;const q=await sb.from('tnt_camp_payment_exceptions').delete().eq('id',id);if(q.error)return U.toast(q.error.message,true);await C.load();U.toast('Excepción eliminada')}
function voidPayment(id){const o=C.modal('Anular pago',`<form class="camp-form">${C.field('Motivo','reason','','text','required')}<button class="tnt-button danger" type="submit">Anular pago</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(sb.from('tnt_camp_payments').update({voided_at:new Date().toISOString(),void_reason:fd.get('reason')}).eq('id',id).select()))}}
async function waivePenalty(id){const o=C.modal('Perdonar recargo',`<form class="camp-form">${C.field('Motivo','reason','','text','required')}<button class="tnt-button primary" type="submit">Perdonar recargo</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(sb.from('tnt_camp_penalties').update({waived_at:new Date().toISOString(),waived_reason:fd.get('reason')}).eq('id',id).select()))}}
async function archiveRegistration(r){if(!await U.confirm('¿Mover esta inscripción a Papelera? El perfil y el historial se conservan.'))return;const q=await sb.from('tnt_camp_registrations').update({deleted_at:new Date().toISOString(),deleted_by:TNT.person.id}).eq('id',r.id);if(q.error)return U.toast(q.error.message,true);await C.load();U.toast('Inscripción archivada')}

C.views.sponsors=v=>{
  const rows=S.sponsors.filter(x=>x.camp_id===S.camp),alloc=S.sponsorships.filter(x=>rows.some(s=>s.id===x.sponsor_id));
  v.innerHTML=`<section class="camp-section-head"><div><button class="back-chip" id="back-payments">← Pagos</button><span>PADRINOS</span><h2>Ayudas para campamento</h2><p>Un aporte puede repartirse total o parcialmente entre distintos acampantes.</p></div>${C.can('payments')?'<button class="tnt-button primary" id="new-sponsor">+ Padrino</button>':''}</section><div class="sponsor-grid">${rows.map(s=>{const used=alloc.filter(a=>a.sponsor_id===s.id).reduce((n,a)=>n+Number(a.amount),0);return `<article class="sponsor-card ${s.active?'':'muted'}"><div class="sponsor-head"><span>♥</span><div><h3>${E(s.name)}</h3><small>${E(s.phone||s.email||'Sin contacto')}</small></div></div><div class="sponsor-money"><span>Asignado <b>${C.money(used)}</b></span>${Number(s.budget)>0?`<span>Disponible <b>${C.money(Math.max(0,Number(s.budget)-used))}</b></span>`:''}</div><div class="camp-head-actions"><button class="tnt-button" data-sponsor-allocate="${s.id}">Asignar</button><button class="tnt-button" data-sponsor-edit="${s.id}">Editar</button><button class="tnt-button danger" data-sponsor-delete="${s.id}">Eliminar</button></div></article>`}).join('')||'<div class="camp-empty">Todavía no hay padrinos.</div>'}</div>`;
  v.querySelector('#back-payments').onclick=()=>C.go('payments');
  v.querySelector('#new-sponsor')?.addEventListener('click',()=>sponsorForm());
  v.querySelectorAll('[data-sponsor-edit]').forEach(b=>b.onclick=()=>sponsorForm(S.sponsors.find(x=>x.id===b.dataset.sponsorEdit)));
  v.querySelectorAll('[data-sponsor-delete]').forEach(b=>b.onclick=()=>deleteSponsor(b.dataset.sponsorDelete));
  v.querySelectorAll('[data-sponsor-allocate]').forEach(b=>b.onclick=()=>sponsorAllocationFromSponsor(S.sponsors.find(x=>x.id===b.dataset.sponsorAllocate)));
};

function sponsorForm(s=null){
  const o=C.modal(s?'Editar padrino':'Nuevo padrino',`<form class="camp-form">${C.field('Nombre','name',s?.name||'','text','required')}${C.field('Email','email',s?.email||'','email')}${C.field('Teléfono','phone',s?.phone||'','tel')}${C.field('Aporte total disponible','budget',s?.budget||0,'number','min="0" step="0.01"')}<label class="camp-field"><span>Notas</span><textarea name="notes">${E(s?.notes||'')}</textarea></label><label class="camp-check"><input type="checkbox" name="active" ${s?.active===false?'':'checked'}><span>Activo</span></label><button class="tnt-button primary" type="submit">Guardar padrino</button><p role="alert"></p></form>`);
  o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(s?sb.from('tnt_camp_sponsors').update({name:fd.get('name'),email:fd.get('email')||'',phone:fd.get('phone')||'',budget:Number(fd.get('budget')||0),notes:fd.get('notes')||'',active:fd.has('active'),updated_at:new Date().toISOString()}).eq('id',s.id).select():sb.from('tnt_camp_sponsors').insert({camp_id:S.camp,name:fd.get('name'),email:fd.get('email')||'',phone:fd.get('phone')||'',budget:Number(fd.get('budget')||0),notes:fd.get('notes')||'',active:fd.has('active')}).select()))};
}
async function deleteSponsor(id){if(S.sponsorships.some(x=>x.sponsor_id===id))return U.toast('Primero quitá las asignaciones de este padrino.',true);if(!await U.confirm('¿Eliminar este padrino?'))return;const q=await sb.from('tnt_camp_sponsors').delete().eq('id',id);if(q.error)return U.toast(q.error.message,true);await C.load()}
function sponsorAllocationFromSponsor(s){C.registrationPicker(r=>allocateSponsor(s,r),'¿A quién querés asignar la ayuda?')}
function sponsorAllocationPicker(r){const rows=S.sponsors.filter(x=>x.camp_id===S.camp&&x.active);if(!rows.length)return U.toast('Primero cargá un padrino desde Pagos → Padrinos.',true);const o=C.modal('Asignar ayuda · '+C.person(r.person_id).full_name,`<form class="camp-form"><label class="camp-field"><span>Padrino</span><select name="sponsor">${rows.map(x=>`<option value="${x.id}">${E(x.name)}</option>`).join('')}</select></label>${C.field('Importe','amount','','number','min="0.01" step="0.01" required')}<label class="camp-field"><span>Nota</span><textarea name="note"></textarea></label><button class="tnt-button primary" type="submit">Asignar ayuda</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(sb.from('tnt_camp_sponsorships').insert({sponsor_id:fd.get('sponsor'),registration_id:r.id,amount:Number(fd.get('amount')),note:fd.get('note')||'',recorded_by:TNT.person.id}).select()))}}
function allocateSponsor(s,r){const used=S.sponsorships.filter(x=>x.sponsor_id===s.id).reduce((n,x)=>n+Number(x.amount),0),available=Number(s.budget)>0?Math.max(0,Number(s.budget)-used):null;const o=C.modal('Ayuda de '+s.name,`<form class="camp-form"><p>Para <b>${E(C.person(r.person_id).full_name)}</b>${available!==null?' · Disponible '+C.money(available):''}</p>${C.field('Importe','amount','','number',`min="0.01" step="0.01" ${available!==null?`max="${available}"`:''} required`)}<label class="camp-field"><span>Nota</span><textarea name="note"></textarea></label><button class="tnt-button primary" type="submit">Asignar</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(sb.from('tnt_camp_sponsorships').insert({sponsor_id:s.id,registration_id:r.id,amount:Number(fd.get('amount')),note:fd.get('note')||'',recorded_by:TNT.person.id}).select()))}}
async function deleteSponsorship(id){if(!await U.confirm('¿Quitar esta asignación de padrino?'))return;const q=await sb.from('tnt_camp_sponsorships').delete().eq('id',id);if(q.error)return U.toast(q.error.message,true);await C.load()}

C.views.settings=v=>{
  const c=C.edition(),s=C.cfg(),plans=campPlans(),waiting=S.outbox.filter(x=>x.camp_id===S.camp&&x.status==='waiting_provider').length;
  v.innerHTML=`<section class="camp-section-head"><div><button class="back-chip" id="settings-back">← Volver</button><span>CONFIGURACIÓN</span><h2>${E(c.name)}</h2><p>Crear, editar y configurar una edición vive acá; no molesta en el uso diario.</p></div></section><div class="settings-stack">
    <section class="settings-card"><div class="settings-head"><div><span>EDICIÓN</span><h3>Ediciones de campamento</h3></div>${C.can('manage_editions')?'<button class="tnt-button primary" id="new-edition">+ Nueva</button>':''}</div><label class="camp-field"><span>Edición que estás viendo</span><select id="edition-select">${S.editions.map(x=>`<option value="${x.id}" ${x.id===S.camp?'selected':''}>${E(x.name)} · ${C.date(x.start_date)}</option>`).join('')}</select></label>${C.can('manage_editions')?'<div class="camp-head-actions"><button class="tnt-button" id="edit-edition">Editar edición</button><button class="tnt-button" id="duplicate-edition">Duplicar edición</button></div>':''}</section>
    <section class="settings-card"><div class="settings-head"><div><span>FORMULARIO PÚBLICO</span><h3>Inscripción aislada</h3><p>Quien recibe este enlace no ve configuración, usuarios ni datos internos.</p></div><span class="state-pill ${s.form_open?'good':'bad'}">${s.form_open?'Abierto':'Cerrado'}</span></div><div class="share-link"><input value="${E(C.formLink())}" readonly><button id="copy-form-link">Copiar</button><a href="${E(C.formLink())}" target="_blank" rel="noopener">Abrir</a></div><div class="camp-head-actions"><button class="tnt-button" id="edit-public-form">Apertura y texto</button><button class="tnt-button" id="form-fields">Campos del formulario</button></div></section>
    <section class="settings-card"><div class="settings-head"><div><span>PLANES DE PAGO</span><h3>${plans.length} planes</h3><p>Importes, cuotas, vencimientos y días de gracia.</p></div>${C.can('payments')?'<button class="tnt-button primary" id="new-plan">+ Plan</button>':''}</div><div class="settings-list">${plans.map(p=>`<article class="${p.active?'':'muted'}"><div><b>${E(p.name)}</b><small>${C.money(p.total_amount)} · ${C.planInstallments(p.id).length} cuotas · ${p.active?'Visible':'Oculto'}</small></div>${C.can('payments')?`<button data-plan-edit="${p.id}">Editar</button><button class="danger" data-plan-delete="${p.id}">Eliminar</button>`:''}</article>`).join('')||'<div class="camp-empty compact">Creá al menos un plan antes de compartir el formulario.</div>'}</div></section>
    <section class="settings-card"><div class="settings-head"><div><span>IGLESIAS</span><h3>Nombres unificados</h3><p>El formulario usa opciones cerradas: CCH, “del CCH” y similares no crean iglesias distintas.</p></div>${C.can('manage_editions')?'<button class="tnt-button primary" id="new-church">+ Iglesia</button>':''}</div><div class="settings-list">${S.churches.map(ch=>`<article class="${ch.active?'':'muted'}"><div><b>${E(ch.name)}</b><small>${(ch.aliases||[]).length?E(ch.aliases.join(' · ')):'Sin alias'} · ${ch.active?'Visible':'Oculta'}</small></div>${C.can('manage_editions')?`<button data-church-edit="${ch.id}">Editar</button><button class="danger" data-church-delete="${ch.id}">Eliminar</button>`:''}</article>`).join('')}</div></section>
    <section class="settings-card"><div class="settings-head"><div><span>VENCIMIENTOS Y MULTAS</span><h3>Automatizaciones de pago</h3><p>Recordatorios, atrasos, días de gracia, extensiones y multas automáticas.</p></div>${C.can('payments')?'<button class="tnt-button" id="payment-rules">Configurar</button>':''}</div><div class="settings-facts"><span><small>Recordatorios</small><b>${s.reminders_enabled?'Activos':'Desactivados'}</b></span><span><small>Multas</small><b>${s.late_fee_enabled?(s.late_fee_type==='percent'?s.late_fee_value+'%':C.money(s.late_fee_value))+' después de '+s.late_fee_delay_days+' días':'Desactivadas'}</b></span></div></section>
    <section class="settings-card"><div class="settings-head"><div><span>NOTIFICACIONES</span><h3>Email + teléfono</h3><p>Inscripción, pago recibido, recordatorios, atrasos, padrinos y felicitación al completar.</p></div>${C.can('communications')?'<button class="tnt-button" id="templates">Editar mensajes</button>':''}</div><div class="notify-config"><button class="phone-notify" id="phone-notify">🔔 Activar avisos en este teléfono</button><div><small>Push</small><b>${s.push_enabled?'Activo':'Desactivado'}</b></div><div><small>Email</small><b>${s.email_enabled?'Automático':'Desactivado'}</b></div>${waiting?`<div class="warning"><small>Emails en espera</small><b>${waiting} pendientes del proveedor</b></div>`:''}</div></section>
  </div>`;
  v.querySelector('#settings-back').onclick=()=>C.go('dashboard');
  v.querySelector('#edition-select').onchange=e=>{S.camp=e.target.value;localStorage.setItem('tnt-camp-edition',S.camp);C.go('settings')};
  v.querySelector('#new-edition')?.addEventListener('click',()=>editEdition());
  v.querySelector('#edit-edition')?.addEventListener('click',()=>editEdition(c));
  v.querySelector('#duplicate-edition')?.addEventListener('click',()=>duplicateEdition(c));
  v.querySelector('#copy-form-link').onclick=async()=>{await navigator.clipboard.writeText(C.formLink());U.toast('Enlace copiado')};
  v.querySelector('#edit-public-form')?.addEventListener('click',editPublicFormSettings);
  v.querySelector('#form-fields')?.addEventListener('click',fieldsManager);
  v.querySelector('#new-plan')?.addEventListener('click',()=>planForm());
  v.querySelectorAll('[data-plan-edit]').forEach(b=>b.onclick=()=>planForm(S.plans.find(x=>x.id===b.dataset.planEdit)));
  v.querySelectorAll('[data-plan-delete]').forEach(b=>b.onclick=()=>deletePlan(b.dataset.planDelete));
  v.querySelector('#new-church')?.addEventListener('click',()=>churchForm());
  v.querySelectorAll('[data-church-edit]').forEach(b=>b.onclick=()=>churchForm(S.churches.find(x=>x.id===b.dataset.churchEdit)));
  v.querySelectorAll('[data-church-delete]').forEach(b=>b.onclick=()=>deleteChurch(b.dataset.churchDelete));
  v.querySelector('#payment-rules')?.addEventListener('click',paymentRulesForm);
  v.querySelector('#templates')?.addEventListener('click',templatesManager);
  v.querySelector('#phone-notify').onclick=enablePhone;
};

async function enablePhone(){const b=document.getElementById('phone-notify');if(b)b.disabled=true;try{await TNTPush.enableTNT();if(b)b.textContent='✓ Avisos activados en este teléfono';U.toast('Notificaciones del teléfono activadas')}catch(e){if(b)b.disabled=false;U.toast(e.message||'No pudimos activarlas.',true)}}

function editEdition(c=null){
  if(!C.can('manage_editions'))return;
  const o=C.modal(c?'Editar edición':'Nueva edición',`<form class="camp-form">${C.field('Nombre','name',c?.name||'','text','required')}<div class="camp-form-grid">${C.field('Comienza','start_date',c?.start_date||'','date','required')}${C.field('Termina','end_date',c?.end_date||'','date','required')}</div>${C.field('Lugar','location',c?.location||'')}${C.field('Cupo','capacity',c?.capacity||120,'number','min="1" required')}${C.field('Valor base','fee',c?.fee||0,'number','min="0" step="0.01" required')}<label class="camp-field"><span>Estado</span><select name="status">${[['planning','En preparación'],['open','Inscripciones abiertas'],['closed','Inscripciones cerradas'],['archived','Archivada']].map(([k,l])=>`<option value="${k}" ${c?.status===k?'selected':''}>${l}</option>`).join('')}</select></label><label class="camp-field"><span>Descripción</span><textarea name="description">${E(c?.description||'')}</textarea></label><button class="tnt-button primary" type="submit">Guardar edición</button><p role="alert"></p></form>`);
  o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,async fd=>{const row={name:fd.get('name'),start_date:fd.get('start_date'),end_date:fd.get('end_date'),location:fd.get('location')||'',capacity:Number(fd.get('capacity')),fee:Number(fd.get('fee')),status:fd.get('status'),description:fd.get('description')||'',created_by:c?.created_by||TNT.person.id};if(row.end_date<row.start_date)throw Error('La fecha final no puede ser anterior al inicio.');const q=c?await sb.from('tnt_camp_editions').update(row).eq('id',c.id).select().single():await sb.from('tnt_camp_editions').insert(row).select().single();if(q.error)throw q.error;if(!c)S.camp=q.data.id})};
}
function duplicateEdition(c){const o=C.modal('Duplicar edición',`<form class="camp-form">${C.field('Nombre','name',c.name+' · nueva','text','required')}<div class="camp-form-grid">${C.field('Comienza','start','','date','required')}${C.field('Termina','end','','date','required')}</div><p>Se copia configuración, campos y logística. No se copian inscriptos ni pagos.</p><button class="tnt-button primary" type="submit">Duplicar edición</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,async fd=>{const q=await sb.rpc('tnt_camp_duplicate_edition',{p_camp:c.id,p_name:fd.get('name'),p_start:fd.get('start'),p_end:fd.get('end')});if(q.error)throw q.error;S.camp=q.data})}}
function editPublicFormSettings(){const s=C.cfg(),o=C.modal('Formulario público',`<form class="camp-form"><label class="camp-check"><input type="checkbox" name="form_open" ${s.form_open?'checked':''}><span>Formulario abierto</span></label>${C.field('Título','form_title',s.form_title||'Inscripción al campamento')}<label class="camp-field"><span>Texto de bienvenida</span><textarea name="form_intro">${E(s.form_intro||'')}</textarea></label>${C.field('Fecha límite','registration_deadline',s.registration_deadline||'','date')}<button class="tnt-button primary" type="submit">Guardar</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(sb.from('tnt_camp_settings').update({form_open:fd.has('form_open'),form_title:fd.get('form_title'),form_intro:fd.get('form_intro')||'',registration_deadline:fd.get('registration_deadline')||null,updated_at:new Date().toISOString()}).eq('camp_id',S.camp).select()))}}

function planForm(p=null){
  let rows=p?C.planInstallments(p.id).map(i=>({label:i.label,amount:i.amount,due_date:i.due_date,grace_days:i.grace_days})):[];
  const o=C.modal(p?'Editar plan':'Nuevo plan',`<form class="camp-form">${C.field('Nombre del plan','name',p?.name||'','text','required')}${C.field('Total','total_amount',p?.total_amount||C.edition().fee,'number','min="0" step="0.01" required')}<label class="camp-field"><span>Descripción</span><textarea name="description">${E(p?.description||'')}</textarea></label><label class="camp-check"><input type="checkbox" name="active" ${p?.active===false?'':'checked'}><span>Disponible en el formulario</span></label><div class="installment-editor"><div class="settings-head"><div><span>CUOTAS</span><h3>Vencimientos</h3></div><button type="button" class="tnt-button" id="add-installment">+ Cuota</button></div><div id="installment-rows"></div></div><button class="tnt-button primary" type="submit">Guardar plan</button><p role="alert"></p></form>`,true);
  const host=o.querySelector('#installment-rows');
  const paint=()=>{host.innerHTML=rows.map((i,idx)=>`<div class="installment-row"><span>${idx+1}</span><input data-i-label="${idx}" value="${E(i.label||'Cuota '+(idx+1))}" placeholder="Cuota ${idx+1}"><input data-i-amount="${idx}" type="number" min="0" step="0.01" value="${E(i.amount||0)}"><input data-i-date="${idx}" type="date" value="${E(i.due_date||'')}"><input data-i-grace="${idx}" type="number" min="0" value="${E(i.grace_days||0)}" title="Días de gracia"><button type="button" data-i-remove="${idx}">×</button></div>`).join('')||'<div class="camp-empty compact">Agregá cuotas con importe y fecha.</div>';host.querySelectorAll('[data-i-remove]').forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.iRemove),1);paint()})};
  o.querySelector('#add-installment').onclick=()=>{rows.push({label:'Cuota '+(rows.length+1),amount:0,due_date:'',grace_days:0});paint()};paint();
  o.querySelector('form').onsubmit=e=>{e.preventDefault();rows=rows.map((x,idx)=>({label:o.querySelector(`[data-i-label="${idx}"]`)?.value||x.label,amount:Number(o.querySelector(`[data-i-amount="${idx}"]`)?.value||0),due_date:o.querySelector(`[data-i-date="${idx}"]`)?.value||'',grace_days:Number(o.querySelector(`[data-i-grace="${idx}"]`)?.value||0)}));C.formSave(o,async fd=>{if(rows.some(x=>!x.due_date))throw Error('Todas las cuotas necesitan fecha.');const row={camp_id:S.camp,name:fd.get('name'),total_amount:Number(fd.get('total_amount')),description:fd.get('description')||'',active:fd.has('active'),updated_at:new Date().toISOString()};let id=p?.id;if(p){const q=await sb.from('tnt_camp_payment_plans').update(row).eq('id',p.id).select().single();if(q.error)throw q.error}else{const q=await sb.from('tnt_camp_payment_plans').insert(row).select().single();if(q.error)throw q.error;id=q.data.id}const d=await sb.from('tnt_camp_plan_installments').delete().eq('plan_id',id);if(d.error)throw d.error;if(rows.length){const ins=await sb.from('tnt_camp_plan_installments').insert(rows.map((x,idx)=>({plan_id:id,installment_no:idx+1,label:x.label,amount:x.amount,due_date:x.due_date,grace_days:x.grace_days})));if(ins.error)throw ins.error}})};
}
async function deletePlan(id){if(S.registrations.some(r=>r.payment_plan_id===id&&!r.deleted_at))return U.toast('Hay inscripciones usando este plan. Ocultalo en vez de eliminarlo.',true);if(!await U.confirm('¿Eliminar este plan?'))return;const q=await sb.from('tnt_camp_payment_plans').delete().eq('id',id);if(q.error)return U.toast(q.error.message,true);await C.load()}

function churchForm(ch=null){const o=C.modal(ch?'Editar iglesia':'Nueva iglesia',`<form class="camp-form">${C.field('Nombre oficial','name',ch?.name||'','text','required')}<label class="camp-field"><span>Alias / formas antiguas</span><textarea name="aliases" placeholder="CCH\nCentro Cristiano Hurlingham">${E((ch?.aliases||[]).join('\n'))}</textarea><small>El formulario siempre guarda el nombre oficial.</small></label><label class="camp-check"><input type="checkbox" name="active" ${ch?.active===false?'':'checked'}><span>Visible en el formulario</span></label><button class="tnt-button primary" type="submit">Guardar iglesia</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(ch?sb.from('tnt_camp_churches').update({name:fd.get('name'),aliases:String(fd.get('aliases')||'').split(/\n+/).map(x=>x.trim()).filter(Boolean),active:fd.has('active'),updated_at:new Date().toISOString()}).eq('id',ch.id).select():sb.from('tnt_camp_churches').insert({name:fd.get('name'),aliases:String(fd.get('aliases')||'').split(/\n+/).map(x=>x.trim()).filter(Boolean),active:fd.has('active')}).select()))}}
async function deleteChurch(id){if(S.registrations.some(r=>r.church_id===id))return U.toast('Esta iglesia ya aparece en inscripciones. Podés ocultarla, pero no borrarla.',true);if(!await U.confirm('¿Eliminar esta iglesia?'))return;const q=await sb.from('tnt_camp_churches').delete().eq('id',id);if(q.error)return U.toast(q.error.message,true);await C.load()}

function paymentRulesForm(){const s=C.cfg(),before=(s.reminder_days_before||[]).join(', '),after=(s.overdue_reminder_days||[]).join(', '),o=C.modal('Vencimientos, recordatorios y multas',`<form class="camp-form"><label class="camp-check"><input type="checkbox" name="reminders_enabled" ${s.reminders_enabled?'checked':''}><span>Recordatorios automáticos</span></label>${C.field('Avisar X días antes','before',before)}${C.field('Volver a avisar X días después','after',after)}<label class="camp-check"><input type="checkbox" name="late_fee_enabled" ${s.late_fee_enabled?'checked':''}><span>Aplicar multa automáticamente</span></label>${C.field('Aplicar después de X días','late_fee_delay_days',s.late_fee_delay_days||0,'number','min="0"')}<label class="camp-field"><span>Tipo de multa</span><select name="late_fee_type"><option value="fixed" ${s.late_fee_type==='fixed'?'selected':''}>Importe fijo</option><option value="percent" ${s.late_fee_type==='percent'?'selected':''}>Porcentaje de la cuota</option></select></label>${C.field('Valor de la multa','late_fee_value',s.late_fee_value||0,'number','min="0" step="0.01"')}<label class="camp-check"><input type="checkbox" name="email_enabled" ${s.email_enabled?'checked':''}><span>Enviar email</span></label><label class="camp-check"><input type="checkbox" name="push_enabled" ${s.push_enabled?'checked':''}><span>Enviar notificación al teléfono</span></label><button class="tnt-button primary" type="submit">Guardar reglas</button><p role="alert"></p></form>`);const arr=x=>String(x||'').split(',').map(v=>Number(v.trim())).filter(v=>Number.isFinite(v)&&v>=0);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,fd=>C.checked(sb.from('tnt_camp_settings').update({reminders_enabled:fd.has('reminders_enabled'),reminder_days_before:arr(fd.get('before')),overdue_reminder_days:arr(fd.get('after')),late_fee_enabled:fd.has('late_fee_enabled'),late_fee_delay_days:Number(fd.get('late_fee_delay_days')||0),late_fee_type:fd.get('late_fee_type'),late_fee_value:Number(fd.get('late_fee_value')||0),email_enabled:fd.has('email_enabled'),push_enabled:fd.has('push_enabled'),updated_at:new Date().toISOString()}).eq('camp_id',S.camp).select()))}}

function fieldsManager(){const rows=S.formFields.filter(x=>x.camp_id===S.camp).sort((a,b)=>a.sort_order-b.sort_order),o=C.modal('Campos del formulario',`<div class="settings-head"><div><p>Nombre, nacimiento, email, WhatsApp, DNI, iglesia y plan ya vienen incluidos.</p></div><button class="tnt-button primary" id="new-field">+ Campo</button></div><div class="settings-list">${rows.map(f=>`<article class="${f.active?'':'muted'}"><div><b>${E(f.label)}</b><small>${E(f.field_type)} · ${f.required?'Obligatorio':'Opcional'} · ${f.active?'Visible':'Oculto'}</small></div><button data-field-edit="${f.id}">Editar</button><button class="danger" data-field-delete="${f.id}">Eliminar</button></article>`).join('')||'<div class="camp-empty compact">No hay campos extra.</div>'}</div>`,true);o.querySelector('#new-field').onclick=()=>fieldForm(null,o);o.querySelectorAll('[data-field-edit]').forEach(b=>b.onclick=()=>fieldForm(S.formFields.find(x=>x.id===b.dataset.fieldEdit),o));o.querySelectorAll('[data-field-delete]').forEach(b=>b.onclick=async()=>{if(!await U.confirm('¿Eliminar este campo? Las respuestas históricas se conservan.'))return;await sb.from('tnt_camp_form_fields').delete().eq('id',b.dataset.fieldDelete);U.closeModal(o);await C.load();fieldsManager()})}
function fieldForm(f,parent){const o=C.modal(f?'Editar campo':'Nuevo campo',`<form class="camp-form">${C.field('Etiqueta','label',f?.label||'','text','required')}<label class="camp-field"><span>Tipo</span><select name="type">${[['text','Texto'],['textarea','Texto largo'],['date','Fecha'],['number','Número'],['select','Opciones'],['checkbox','Sí / No']].map(([k,l])=>`<option value="${k}" ${f?.field_type===k?'selected':''}>${l}</option>`).join('')}</select></label><label class="camp-field"><span>Opciones, una por línea</span><textarea name="options">${E(Array.isArray(f?.options)?f.options.join('\n'):'')}</textarea></label><label class="camp-check"><input type="checkbox" name="required" ${f?.required?'checked':''}><span>Obligatorio</span></label><label class="camp-check"><input type="checkbox" name="active" ${f?.active===false?'':'checked'}><span>Visible</span></label><button class="tnt-button primary" type="submit">Guardar campo</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,async fd=>{const label=String(fd.get('label')).trim(),row={camp_id:S.camp,label,field_key:f?.field_key||label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')+'_'+Date.now().toString(36),field_type:fd.get('type'),required:fd.has('required'),active:fd.has('active'),options:String(fd.get('options')||'').split(/\n+/).map(x=>x.trim()).filter(Boolean),sort_order:f?.sort_order??S.formFields.filter(x=>x.camp_id===S.camp).length,updated_at:new Date().toISOString()};await C.checked(f?sb.from('tnt_camp_form_fields').update(row).eq('id',f.id).select():sb.from('tnt_camp_form_fields').insert(row).select());if(parent)U.closeModal(parent)})}}

function templatesManager(){const rows=S.templates.filter(x=>x.camp_id===S.camp),labels={registration_received:'Felicitación por inscribirse',payment_received:'Pago recibido',payment_reminder:'Recordatorio antes de vencer',overdue:'Pago vencido',paid_complete:'Felicitación por terminar de pagar',sponsorship_received:'Ayuda de padrino'};const o=C.modal('Mensajes automáticos',`<p>Variables: <code>{nombre}</code>, <code>{campamento}</code>, <code>{saldo}</code>, <code>{cuota}</code>, <code>{vencimiento}</code>.</p><div class="settings-list">${rows.map(t=>`<article><div><b>${E(labels[t.kind]||t.kind)}</b><small>${E(t.subject)} · ${t.active?'Activo':'Desactivado'}</small></div><button data-template-edit="${t.id}">Editar</button></article>`).join('')}</div>`,true);o.querySelectorAll('[data-template-edit]').forEach(b=>b.onclick=()=>templateForm(S.templates.find(x=>x.id===b.dataset.templateEdit),o))}
function templateForm(t,parent){const o=C.modal('Editar mensaje automático',`<form class="camp-form">${C.field('Asunto','subject',t.subject,'text','required')}<label class="camp-field"><span>Mensaje</span><textarea name="body" rows="7" required>${E(t.body)}</textarea></label><label class="camp-check"><input type="checkbox" name="active" ${t.active?'checked':''}><span>Activo</span></label><button class="tnt-button primary" type="submit">Guardar mensaje</button><p role="alert"></p></form>`);o.querySelector('form').onsubmit=e=>{e.preventDefault();C.formSave(o,async fd=>{await C.checked(sb.from('tnt_camp_notification_templates').update({subject:fd.get('subject'),body:fd.get('body'),active:fd.has('active'),updated_at:new Date().toISOString()}).eq('id',t.id).select());if(parent)U.closeModal(parent)})}}
})();