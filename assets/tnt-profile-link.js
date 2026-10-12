(() => {
 'use strict';
 const empty=v=>v===null||v===undefined||v===''||(Array.isArray(v)&&!v.length)||(typeof v==='object'&&!Object.keys(v).length);
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 window.TNTProfileLinks={review};
 async function review(request,onDone=()=>{}){
  const U=TNTUI,r=await TNT.sb.rpc('tnt_profile_link_preview',{p_request:request});if(r.error)throw r.error;
  const {source,target,history,revision}=r.data,fields=TNTProfiles.config(r.data.fields),conflicts=[],automatic=[];
  const value=(key,v)=>key==='sex'?({M:'Varón',F:'Mujer'}[v]||v):Array.isArray(v)?v.join(', '):typeof v==='object'?Object.entries(v||{}).map(([area,n])=>area+': '+n+'%').join(' · '):v;
  for(const [key,f] of Object.entries(fields)){
   const a=source[key],b=target[key];
   if(empty(a)&&empty(b))continue;
   if(empty(a)||empty(b)){automatic.push({label:f.label,value:value(key,empty(a)?b:a)});continue;}
   if(equal(a,b))continue;
   if(f.type==='leadership'){for(const area of new Set([...Object.keys(a),...Object.keys(b)])){if(empty(a[area])||empty(b[area]))continue;if(a[area]!==b[area])conflicts.push({key:key+'.'+area,label:area,a:a[area]+'%',b:b[area]+'%'});}continue;}
   conflicts.push({key,label:f.label,a:value(key,a),b:value(key,b),combine:f.type==='multiselect'});
  }
  const name=[target.first_name,target.last_name].filter(Boolean).join(' ')||target.full_name;
  const o=U.modal('Vincular y conservar historial','<p>Revisás dos registros de <b>'+U.esc(name)+'</b>. La cuenta conserva su rol, su foto y sus permisos.</p><form class="tnt-form profile-link-choices">'+(conflicts.length?'<h3>Elegí cada dato diferente</h3>'+conflicts.map((f,i)=>'<fieldset class="profile-merge-field"><legend>'+U.esc(f.label)+'</legend><div class="profile-merge-options"><label><input type="radio" name="choice-'+i+'" value="source" data-merge-key="'+U.esc(f.key)+'" required><span><small>CUENTA GOOGLE</small><b>'+U.esc(f.a)+'</b></span></label><label><input type="radio" name="choice-'+i+'" value="target" data-merge-key="'+U.esc(f.key)+'" required><span><small>PERFIL EXISTENTE</small><b>'+U.esc(f.b)+'</b></span></label>'+(f.combine?'<label><input type="radio" name="choice-'+i+'" value="combine" data-merge-key="'+U.esc(f.key)+'"><span><b>Combinar ambas listas</b></span></label>':'')+'</div></fieldset>').join(''):'<p class="tnt-pill good">No hay datos diferentes para elegir.</p>')+(automatic.length?'<details class="tnt-fold"><summary>Datos que se combinan automáticamente <span>'+automatic.length+'</span></summary><dl class="tnt-fold-content">'+automatic.map(f=>'<dt>'+U.esc(f.label)+'</dt><dd>'+U.esc(f.value)+'</dd>').join('')+'</dl></details>':'')+'<details class="tnt-fold"><summary>Historial que se conserva</summary><div class="tnt-fold-content">'+Object.entries(history||{}).filter(([,n])=>n>0).map(([k,n])=>'<p><b>'+n+'</b> '+({saturdays:'asistencias de sábados',efe:'asistencias de EFE',camps:'inscripciones a campamento',messages:'mensajes'}[k]||k)+'</p>').join('')+'</div></details><label class="profile-consent"><input type="checkbox" name="same_person" required><span>Verifiqué que los dos registros son de la misma persona.</span></label><p role="status" aria-live="polite"></p><div class="tnt-studio-actions"><button type="submit" class="tnt-button primary">Vincular y conservar historial</button><button type="button" class="tnt-button danger" data-reject>Son personas distintas</button></div></form>',true);
  const form=o.querySelector('form'),status=form.querySelector('[role=status]');
  async function save(approved){
   if(approved&&!form.reportValidity())return;
   const choices=Object.fromEntries([...form.querySelectorAll('[data-merge-key]:checked')].map(input=>[input.dataset.mergeKey,input.value]));
   const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='Guardando la revisión…';
   try{const saved=await TNT.sb.rpc('tnt_resolve_profile_link',{p_request:request,p_approve:approved,p_choices:choices,p_revision:revision});if(saved.error)throw saved.error;await U.closeModal(o);await onDone();U.toast(approved?'Cuenta vinculada. Datos e historial conservados.':'Los perfiles se conservan separados.');}
   catch(error){status.textContent=error.message||'No se pudo guardar. Podés reintentar.';buttons.forEach(b=>b.disabled=false);}
  }
  form.onsubmit=e=>{e.preventDefault();save(true);};form.querySelector('[data-reject]').onclick=()=>save(false);
 }
})();
