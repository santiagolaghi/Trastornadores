/* Existing members answer only missing questions; matching profiles continue in place. */
(() => {
 'use strict';
 const O=window.TNTOnboarding={missing,bindClaim,open};
 const skipped=()=>!!localStorage.getItem('tnt:profile-match-skipped:'+window.TNT?.session?.user?.id);
 function missing(container){
  const T=TNT,P=TNTProfiles,U=TNTUI,ctx=T.profileContext,keys=new Set((ctx.missing||[]).map(f=>f.key)),fields=Object.fromEntries(Object.entries(ctx.fields).filter(([key])=>keys.has(key)));
  container.innerHTML='<div class="profile-missing-heading"><h3>Un momento, '+U.esc(T.displayName().split(' ')[0])+'.</h3><p>Te '+(keys.size===1?'falta completar un dato':'faltan completar '+keys.size+' datos')+' para continuar. El resto de tu perfil ya está guardado.</p><div class="profile-missing-actions"><button class="tnt-button" type="button" data-edit-existing>'+U.icon('edit')+'Editar mi perfil</button></div></div><form class="tnt-form profile-completion profile-missing" novalidate>'+P.render(fields,ctx.values,ctx.groups,{role:T.account.ministry_role||ctx.values._ministry_role})+'<p role="status" aria-live="polite"></p><button type="submit" class="tnt-button primary">Guardar y continuar '+U.icon('arrow')+'</button></form>';
  const form=container.querySelector('form');P.bind(form,fields,ctx.values,ctx.groups);container.querySelector('[data-edit-existing]').onclick=()=>TNTProfileEditor.open();
  form.onsubmit=async event=>{event.preventDefault();if(!P.validate(form,fields))return;const button=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');button.disabled=true;status.textContent='Guardando tus datos…';
   try{const r=await T.sb.rpc('tnt_complete_profile',{p_values:P.collect(form,fields)});if(r.error)throw r.error;await T.refreshIdentity();if(!T.profileComplete){missing(container);container.querySelector('[role=status]').textContent='Completá estos datos para continuar.';return;}T.blocked=false;document.dispatchEvent(new CustomEvent('tnt:membership'));U.toast('Perfil listo. Ya podés continuar.');}
   catch(error){status.textContent=error.message;button.disabled=false;}
  };
 }
 function bindClaim(form,ctx,remount){
  const U=TNTUI,section=document.createElement('section');section.className='tnt-profile-match';section.setAttribute('aria-live','polite');form.querySelector('.profile-section')?.append(section);let timer,version=0,passSubmit=false,checking=false;const rejected=new Set();
  const name=()=>[form.elements.first_name?.value,form.elements.last_name?.value].filter(Boolean).join(' ')||TNT.person.full_name;
  const reveal=()=>{for(let n=0;n<3&&section.closest('.profile-section')?.hidden;n++)form.querySelector('[data-previous]')?.click();if(section.closest('.profile-section')?.hidden)section.closest('.profile-section').hidden=false;section.scrollIntoView?.({block:'center',behavior:'smooth'});};
  const report=message=>{reveal();section.innerHTML='<p class="profile-claim-status" role="status">'+U.esc(message)+'</p>';};
  function show(candidate){
   if(!candidate)return;
   section.innerHTML='<article class="profile-claim"><span class="tnt-pill">YA ESTÁS EN TNT</span><h3>¿Sos '+U.esc(candidate.full_name||'esta persona')+'?</h3><p>Conservá tu perfil y su historial. Confirmá tu nacimiento y tu WhatsApp o DNI.</p><div class="tnt-form"><label>Fecha de nacimiento<input type="date" data-claim-birthday value="'+U.esc(form.elements.birthday?.value||ctx.values.birthday||'')+'"></label><label>WhatsApp<input type="tel" data-claim-phone value="'+U.esc(form.elements.phone?.value||ctx.values.phone||'')+'" autocomplete="tel"></label><label>DNI <small>Podés usarlo si tu WhatsApp cambió</small><input inputmode="numeric" data-claim-dni maxlength="10"></label><div class="tnt-studio-actions"><button type="button" class="tnt-button primary" data-claim>Es mi perfil · continuar</button><button type="button" class="tnt-button" data-not-me>No soy yo</button></div><p role="status"></p></div></article>';
   section.querySelector('[data-not-me]').onclick=()=>{rejected.add(candidate.id);try{localStorage.setItem('tnt:profile-match-skipped:'+TNT.session?.user?.id,'true');}catch{}TNT.profileCandidate=null;section.innerHTML='';if(form.classList.contains('profile-match-review'))U.closeModal(form.closest('dialog'));};
   section.querySelector('[data-claim]').onclick=async event=>{const b=event.currentTarget,status=section.querySelector('[role=status]'),v={first_name:form.elements.first_name?.value||ctx.values.first_name||'',last_name:form.elements.last_name?.value||ctx.values.last_name||'',birthday:section.querySelector('[data-claim-birthday]').value,phone:section.querySelector('[data-claim-phone]').value,dni:section.querySelector('[data-claim-dni]').value};b.disabled=true;status.textContent='Vinculando tu cuenta…';
    try{const r=await TNT.sb.rpc('tnt_continue_profile',{p_target:candidate.id,p_values:v,p_confirm:true});if(r.error)throw r.error;if(!r.data?.linked)throw Error(r.data?.error||'No pudimos confirmar la coincidencia. Revisá los datos.');TNT.profileContinued=true;TNT.profileCandidate=null;try{localStorage.removeItem('tnt:profile-match-skipped:'+TNT.session?.user?.id);}catch{}await TNT.refreshIdentity();await remount();U.toast('Seguís con tu perfil de TNT. Historial conservado.');}
    catch(error){status.textContent=error.message;b.disabled=false;}
   };
  }
  async function lookup(){
   const seq=++version,query=name();if(query.trim().length<7){section.innerHTML='';return[];}
   const r=await TNT.sb.rpc('tnt_match_profile_names',{p_name:query,p_birthday:null});if(r.error)throw r.error;
   const rows=(Array.isArray(r.data)?r.data:[]).filter(p=>!rejected.has(p.id));if(seq!==version||!form.isConnected)return rows;
   if(rows.length===1)show(rows[0]);else if(rows.length>1){section.innerHTML='<article class="profile-claim"><h3>Hay perfiles con ese nombre</h3><p>Elegí el tuyo para confirmar la identidad y conservar el historial.</p><div class="profile-claim-options">'+rows.map(p=>'<button type="button" class="tnt-button" data-claim-choice="'+U.esc(p.id)+'">'+U.esc(p.full_name)+'</button>').join('')+'</div></article>';section.querySelectorAll('[data-claim-choice]').forEach(b=>b.onclick=()=>show(rows.find(p=>p.id===b.dataset.claimChoice)));}else section.innerHTML='';return rows;
  }
  const delayed=()=>{clearTimeout(timer);timer=setTimeout(()=>lookup().catch(()=>report('No pudimos buscar tu perfil. Volvé a intentar al guardar.')),350);};
  ['first_name','last_name','birthday'].forEach(key=>form.elements[key]?.addEventListener('input',delayed));
  // The final submit waits for matching even if the name lookup is still in flight.
  // A previous “No soy yo” only dismisses that candidate in this form.
  if(!form.classList.contains('profile-match-review'))form.addEventListener('submit',async event=>{
   if(passSubmit){passSubmit=false;return;}event.preventDefault();event.stopImmediatePropagation();if(checking)return;checking=true;clearTimeout(timer);
   try{const rows=await lookup();if(rows.length){reveal();section.querySelector('input,button')?.focus();return;}passSubmit=true;form.requestSubmit(event.submitter||undefined);}
   catch{report('No pudimos comprobar si ya tenés un perfil. Tus datos siguen acá; volvé a guardar para reintentar.');}
   finally{checking=false;}
  },true);
  if(TNT.profileCandidate&&!rejected.has(TNT.profileCandidate.id))show(TNT.profileCandidate);else setTimeout(()=>lookup().catch(()=>{}),100);
 }
 function open(){
  const U=TNTUI,v=TNT.profileContext.values;try{localStorage.removeItem('tnt:profile-match-skipped:'+TNT.session?.user?.id);}catch{}
  const o=U.modal('Continuar mi perfil existente','<form class="tnt-form profile-match-review" novalidate><fieldset class="profile-section"><label>Nombre<input name="first_name" value="'+U.esc(v.first_name||'')+'"></label><label>Apellido<input name="last_name" value="'+U.esc(v.last_name||'')+'"></label></fieldset></form>');
  bindClaim(o.querySelector('form'),TNT.profileContext,async()=>{await U.closeModal(o);document.dispatchEvent(new CustomEvent('tnt:membership'));document.dispatchEvent(new CustomEvent('tnt:permissions'));});return o;
 }
 document.addEventListener('tnt:ready',()=>{if(!window.TNT?.profileCandidate||!TNT.account?.onboarding_completed_at||skipped())return;const U=TNTUI,o=U.modal('Continuá tu perfil de TNT','<form class="profile-match-review" novalidate><fieldset class="profile-section"></fieldset></form>');bindClaim(o.querySelector('form'),TNT.profileContext,async()=>{await U.closeModal(o);document.dispatchEvent(new CustomEvent('tnt:membership'));document.dispatchEvent(new CustomEvent('tnt:permissions'));if(TNT.module&&!TNT.profileComplete)location.replace('/?onboarding=1');});});
 document.addEventListener('tnt:profile',()=>{if(!window.TNT?.profileComplete||!document.querySelector('.profile-missing'))return;TNT.blocked=false;document.dispatchEvent(new CustomEvent('tnt:membership'));});
})();
