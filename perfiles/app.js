(async function(){
'use strict';
const U=TNTUI,P=TNTProfiles,container=document.getElementById('profile-form-content'),submit=document.getElementById('submitBtn'),status=document.getElementById('message');
let ctx;
document.querySelector('[aria-label="Volver al inicio"]').innerHTML=U.icon('back');
const themeButton=document.getElementById('theme'),updateThemeIcon=()=>themeButton.innerHTML=U.icon(document.documentElement.dataset.tntTheme==='dark'?'sun':'moon');
updateThemeIcon();document.addEventListener('tnt:theme',updateThemeIcon);
async function load(){
 submit.disabled=true;container.innerHTML='<div class="tnt-skeleton"><div><div class="tnt-loader"></div>Preparando tu perfil…</div></div>';
 try{const r=await TNT.sb.rpc('tnt_public_profile_form');if(r.error)throw r.error;ctx=r.data;container.innerHTML=P.render(ctx.fields,{},ctx.groups);P.bind(document.getElementById('profileForm'),ctx.fields,{},ctx.groups);submit.disabled=false;status.textContent='';}
 catch(err){container.innerHTML='<div class="tnt-error">No pudimos cargar las preguntas. <button class="tnt-button" type="button" id="retry-profile">Reintentar</button></div>';document.getElementById('retry-profile').onclick=load;}
}
document.getElementById('profileForm').onsubmit=async e=>{
 e.preventDefault();const form=e.target;status.textContent='';if(!ctx||!P.validate(form,ctx.fields))return;if(document.getElementById('website').value)return;
 submit.disabled=true;submit.textContent='Guardando tu perfil…';
 try{const values=P.collect(form,ctx.fields);const r=await TNT.sb.rpc('tnt_submit_public_profile',{p_values:values,p_consent:document.getElementById('consentimiento').checked});if(r.error)throw r.error;document.getElementById('successName').textContent=values.first_name||'tu perfil';document.getElementById('formCard').hidden=true;document.getElementById('successCard').hidden=false;window.scrollTo({top:0,behavior:'smooth'});}
 catch(err){status.textContent=err.message||'No pudimos guardar. Tus respuestas siguen en el formulario.';}
 finally{submit.disabled=false;submit.innerHTML='Guardar mi perfil '+U.icon('arrow');}
};
document.getElementById('anotherBtn').onclick=()=>{document.getElementById('profileForm').reset();document.getElementById('formCard').hidden=false;document.getElementById('successCard').hidden=true;load();};
document.getElementById('theme').onclick=()=>TNT.toggleTheme();await load();
})();
