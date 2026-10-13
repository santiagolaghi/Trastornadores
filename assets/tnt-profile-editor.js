/* One complete profile editor, shared by account, people and team screens. */
(() => {
 'use strict';
 const U=()=>window.TNTUI;
 window.TNTProfileEditor={open};
 async function open(personId=window.TNT.person.id){
  const T=window.TNT,P=window.TNTProfiles,own=personId===T.person.id;
  const result=await T.sb.rpc(own?'tnt_profile_context':'tnt_profile_detail',own?{}:{p_person:personId});
  if(result.error)return U().toast(result.error.message,true);
  const ctx=result.data,fields={...ctx.fields},values=ctx.values;
  if(!own&&!T.isAdmin){delete fields.health;delete fields.dni;}
  const account=own?T.account:{};
  const role=account.ministry_role||values._ministry_role||'';
  const o=U().modal('Editar perfil',`<form class="tnt-form tnt-complete-editor" novalidate>${P.render(fields,values,ctx.groups,{role})}<p class="tnt-help">Tus intereses, habilidades y datos del EFE se guardan acá. Los cambios de identidad quedan a revisión del administrador.</p><p role="status" aria-live="polite"></p><button class="tnt-button primary" type="submit">Guardar perfil</button></form>`,true);
  const form=o.querySelector('form');P.bind(form,fields,values,ctx.groups);
  form.onsubmit=async e=>{
   e.preventDefault();if(!P.validate(form,fields))return;
   const button=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');button.disabled=true;status.textContent='Guardando tu perfil…';
   try{
    const answers=P.collect(form,fields);let saved;
    if(own){
     const presentation={};
     saved=await T.sb.rpc('tnt_save_my_profile',{p_values:answers,p_presentation:presentation});
    }else saved=await T.sb.rpc('tnt_save_central_profile',{p_person:personId,p_values:answers});
    if(saved.error)throw saved.error;
    if(own)await T.refreshIdentity();
    await U().closeModal(o);
    document.dispatchEvent(new CustomEvent('tnt:profile',{detail:{personId}}));
    document.dispatchEvent(new CustomEvent('tnt:data',{detail:{tables:['tnt_people','tnt_accounts','tnt_profile_answers']}}));
    U().toast(saved.data?.identity_pending?'Perfil guardado. Los cambios de identidad están en revisión.':'Perfil actualizado.');
   }catch(error){status.textContent=error.message||'No pudimos guardar. Tus respuestas siguen acá.';button.disabled=false;}
  };
 }
})();
