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
  let account=own?T.account:{};
  if(!own){const r=await T.sb.from('tnt_accounts').select('nickname,bio,skills,service_areas,availability_days,avatar_url,ministry_role').eq('person_id',personId).maybeSingle();if(r.error)return U().toast(r.error.message,true);account=r.data||{};}
  const role=account.ministry_role||values._ministry_role||'';
  const o=U().modal('Editar perfil completo',`<form class="tnt-form tnt-complete-editor" novalidate>${P.render(fields,values,ctx.groups,{role})}${own?`<fieldset class="profile-section"><legend>Mi presentación</legend><div class="tnt-profile-head">${U().avatar(T.person,{...account,avatar_url:T.avatar()})}<label>Cómo querés que te llamemos<input name="nickname" maxlength="80" value="${U().esc(account.nickname||T.person.full_name)}" required></label></div><label>Sobre vos<textarea name="bio" maxlength="500">${U().esc(account.bio||'')}</textarea></label><label>Foto de perfil<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>${T.isStaff||T.isAdmin?`<label>Habilidades y talentos<input name="skills" maxlength="500" value="${U().esc((account.skills||[]).join(', '))}" placeholder="Separados por coma"></label><label>Áreas donde participás<input name="service_areas" maxlength="500" value="${U().esc((account.service_areas||[]).join(', '))}"></label><details class="tnt-fold"><summary>Disponibilidad habitual</summary><div class="tnt-check-grid">${['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(day=>`<label><input type="checkbox" name="days" value="${day}" ${(account.availability_days||[]).includes(day)?'checked':''}>${day}</label>`).join('')}</div></details>`:''}</fieldset><p class="tnt-help">Intereses, salud y presentación se guardan al instante. Los cambios de identidad quedan a revisión del administrador.</p>`:''}<p role="status" aria-live="polite"></p><button class="tnt-button primary" type="submit">Guardar perfil</button></form>`,true,{stack:!!document.querySelector('#detailSheet.open')});
  const form=o.querySelector('form');P.bind(form,fields,values,ctx.groups);
  form.onsubmit=async e=>{
   e.preventDefault();if(!P.validate(form,fields))return;
   const button=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');button.disabled=true;status.textContent='Guardando tu perfil…';
   try{
    const answers=P.collect(form,fields);let saved;
    if(own){
     const fd=new FormData(form),presentation={nickname:String(fd.get('nickname')||'').trim(),bio:String(fd.get('bio')||'').trim()};
     if(T.isStaff||T.isAdmin)Object.assign(presentation,{skills:String(fd.get('skills')||'').split(',').map(x=>x.trim()).filter(Boolean),service_areas:String(fd.get('service_areas')||'').split(',').map(x=>x.trim()).filter(Boolean),availability_days:fd.getAll('days')});
     const photo=fd.get('photo');if(photo?.size){
      if(photo.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(photo.type))throw Error('Elegí una foto JPG, PNG o WebP de hasta 5 MB.');
      const path=personId+'/'+crypto.randomUUID()+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[photo.type]);
      const upload=await T.sb.storage.from('tnt-avatars').upload(path,photo,{upsert:false,contentType:photo.type});if(upload.error)throw upload.error;
      presentation.avatar_url=T.sb.storage.from('tnt-avatars').getPublicUrl(path).data.publicUrl;
     }
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
