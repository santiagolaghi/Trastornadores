/* Existing members answer only missing questions; matching profiles continue in place. */
(() => {
 'use strict';
 const O=window.TNTOnboarding={missing,bindClaim};
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
  const U=TNTUI,section=document.createElement('section');section.className='tnt-profile-match';section.setAttribute('aria-live','polite');form.querySelector('.profile-section')?.append(section);let timer,version=0;
  async function show(candidate){
   if(!candidate)return;const name=candidate.full_name||'Este perfil';
   section.innerHTML='<article class="profile-claim"><span class="tnt-pill">YA ESTÁS EN TNT</span><h3>¿Sos '+U.esc(name)+'?</h3><p>Continuá tu perfil existente y conservá tus datos e historial. Confirmá tu fecha de nacimiento y tu WhatsApp o DNI para vincular esta cuenta Google.</p><div class="tnt-form"><label>Fecha de nacimiento<input type="date" data-claim-birthday value="'+U.esc(form.elements.birthday?.value||ctx.values.birthday||'')+'"></label><label>WhatsApp<input type="tel" data-claim-phone value="'+U.esc(form.elements.phone?.value||'')+'" autocomplete="tel"></label><label>DNI <small>Podés usarlo si tu WhatsApp cambió</small><input inputmode="numeric" data-claim-dni maxlength="10"></label><div class="tnt-studio-actions"><button type="button" class="tnt-button primary" data-claim>Es mi perfil · continuar</button><button type="button" class="tnt-button" data-not-me>No soy yo</button></div><p role="status"></p></div></article>';
   section.querySelector('[data-not-me]').onclick=()=>{localStorage.setItem('tnt:profile-match-skipped:'+TNT.session?.user?.id,'true');TNT.profileCandidate=null;section.innerHTML='';if(form.classList.contains('profile-match-review'))U.closeModal(form.closest('dialog'));};
   section.querySelector('[data-claim]').onclick=async event=>{const b=event.currentTarget,status=section.querySelector('[role=status]'),v={birthday:section.querySelector('[data-claim-birthday]').value,phone:section.querySelector('[data-claim-phone]').value,dni:section.querySelector('[data-claim-dni]').value};b.disabled=true;status.textContent='Vinculando tu cuenta…';
    try{const r=await TNT.sb.rpc('tnt_continue_profile',{p_target:candidate.id,p_values:v,p_confirm:true});if(r.error)throw r.error;if(!r.data?.linked)throw Error(r.data?.error||'No pudimos confirmar la coincidencia. Revisá los datos.');TNT.profileContinued=true;TNT.profileCandidate=null;await TNT.refreshIdentity();remount();U.toast('Seguís con tu perfil de TNT. Historial conservado.');}
    catch(error){status.textContent=error.message;b.disabled=false;}
   };
  }
  async function lookup(){if(skipped())return;const seq=++version,name=[form.elements.first_name?.value,form.elements.last_name?.value].filter(Boolean).join(' ');if(name.length<7)return;try{const r=await TNT.sb.rpc('tnt_match_profile_names',{p_name:name,p_birthday:form.elements.birthday?.value||null});if(r.error)throw r.error;if(seq!==version||!form.isConnected)return;const rows=Array.isArray(r.data)?r.data:[];if(rows.length===1)show(rows[0]);}catch{}}
  ['first_name','last_name','birthday'].forEach(key=>form.elements[key]?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(lookup,350);}));
  if(!skipped()){if(TNT.profileCandidate)show(TNT.profileCandidate);else setTimeout(lookup,100);}
 }
 document.addEventListener('tnt:ready',()=>{if(!window.TNT?.profileCandidate||!TNT.account?.onboarding_completed_at||skipped())return;const U=TNTUI,o=U.modal('Continuá tu perfil de TNT','<form class="profile-match-review" novalidate><fieldset class="profile-section"></fieldset></form>');bindClaim(o.querySelector('form'),TNT.profileContext,async()=>{await U.closeModal(o);document.dispatchEvent(new CustomEvent('tnt:membership'));document.dispatchEvent(new CustomEvent('tnt:permissions'));if(TNT.module&&!TNT.profileComplete)location.replace('/?onboarding=1');});});
 document.addEventListener('tnt:profile',()=>{if(!window.TNT?.profileComplete||!document.querySelector('.profile-missing'))return;TNT.blocked=false;document.dispatchEvent(new CustomEvent('tnt:membership'));});
})();
