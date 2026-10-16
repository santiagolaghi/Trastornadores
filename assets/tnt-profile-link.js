(() => {
 'use strict';
 const empty=v=>v===null||v===undefined||(typeof v==='string'&&!v.trim())||(Array.isArray(v)&&!v.length)||(typeof v==='object'&&!Object.keys(v).length);
 window.TNTProfileLinks={review};
 async function review(request,onDone=()=>{}){
  const U=TNTUI,r=await TNT.sb.rpc('tnt_profile_link_preview',{p_request:request});if(r.error)throw r.error;
  const {source,target,history,revision}=r.data,fields=TNTProfiles.config(r.data.fields),merged={},automatic=[];
  const value=(key,v)=>key==='sex'?({M:'Varón',F:'Mujer'}[v]||v):Array.isArray(v)?v.join(', '):typeof v==='object'?Object.entries(v||{}).map(([area,n])=>area+': '+n+'%').join(' · '):v;
  for(const [key,f] of Object.entries(fields)){
   const a=source[key],b=target[key];
   if(empty(a)&&empty(b))continue;
   merged[key]=empty(a)?b:a;
   if(empty(a)&&!empty(b))automatic.push(f.label);
  }
  const name=[source.first_name,source.last_name].filter(Boolean).join(' ')||source.full_name;
  const oldName=[target.first_name,target.last_name].filter(Boolean).join(' ')||target.full_name;
  const historyRows=Object.entries(history||{}).filter(([,n])=>n>0);
  const o=U.modal('Vincular cuenta Google','<div class="profile-link-summary"><span class="tnt-pill">CUENTA GOOGLE</span><h3>'+U.esc(name)+'</h3><p>Se usarán automáticamente los datos de esta cuenta. Conserva su foto, su rol y sus permisos.</p><small>Historial que se incorpora: <b>'+U.esc(oldName)+'</b></small></div><form class="tnt-form profile-link-choices">'+(automatic.length?'<p>Los campos vacíos se completan con el perfil existente: '+automatic.map(U.esc).join(', ')+'.</p>':'')+'<details class="tnt-fold"><summary>Datos que se van a guardar</summary><dl class="profile-link-result">'+Object.entries(merged).map(([k,v])=>'<div><dt>'+U.esc(fields[k].label)+'</dt><dd>'+U.esc(value(k,v))+'</dd></div>').join('')+'</dl></details>'+(historyRows.length?'<details class="tnt-fold"><summary>Historial que se conserva</summary><div class="tnt-fold-content">'+historyRows.map(([k,n])=>'<p><b>'+n+'</b> '+({saturdays:'asistencias de sábados',efe:'asistencias de EFE',camps:'inscripciones a campamento',messages:'mensajes'}[k]||k)+'</p>').join('')+'</div></details>':'')+'<label class="profile-consent"><input type="checkbox" name="same_person" required><span>Los dos registros son de la misma persona.</span></label><p role="status" aria-live="polite"></p><div class="tnt-studio-actions"><button type="submit" class="tnt-button primary">Vincular y conservar historial</button><button type="button" class="tnt-button danger" data-reject>Son personas distintas</button></div></form>');
  const form=o.querySelector('form'),status=form.querySelector('[role=status]');
  async function save(approved){
   if(approved&&!form.reportValidity())return;
   const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='Guardando la revisión…';
   try{const saved=await TNT.sb.rpc('tnt_resolve_profile_link',{p_request:request,p_approve:approved,p_choices:{},p_revision:revision});if(saved.error)throw saved.error;await U.closeModal(o);await onDone();U.toast(approved?'Cuenta Google vinculada. Historial conservado.':'Los perfiles se conservan separados.');}
   catch(error){status.textContent=error.message||'No se pudo guardar. Podés reintentar.';buttons.forEach(b=>b.disabled=false);}
  }
  form.onsubmit=e=>{e.preventDefault();save(true);};form.querySelector('[data-reject]').onclick=()=>save(false);
 }
})();
