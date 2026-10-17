(function(root){
'use strict';
const U=root.TNTUI;
const baseKeys=['first_name','last_name','birthday','sex','phone','instagram','dni'];
const defaults={
 first_name:{label:'Nombre',type:'text'},last_name:{label:'Apellido',type:'text'},
 birthday:{label:'Fecha de nacimiento',type:'date'},sex:{label:'Sexo',type:'select',options:['M','F']},
 phone:{label:'WhatsApp',type:'tel'},instagram:{label:'Instagram',type:'text'},dni:{label:'DNI',type:'text'},
 interests:{label:'¿Qué te gusta hacer?',type:'multiselect',options:['Música','Dibujar','Cantar','Bailar','Deportes','Leer','Tecnología','Crear contenido','Todavía estoy descubriéndolo']},
 studies:{label:'¿Qué estudiás o a qué te dedicás?',type:'text'},dreams:{label:'¿Cuáles son tus sueños?',type:'textarea'},
 health:{label:'¿Tenés alguna enfermedad, alergia o condición de salud que debamos conocer?',type:'textarea'},
 leadership_strengths:{label:'Habilidades para acompañar jóvenes y adolescentes',type:'leadership',required:true,roles:['Admin','Líder','Pastor/a','Timoteo','Colaborador'],default:50},
 efe_group:{label:'¿A qué EFE vas?',type:'efe'},efe_service_role:{label:'Mi lugar en este EFE',type:'select',required:true,roles:['Admin','Pastor/a','Líder','Timoteo','Colaborador'],options:['Participo','Soy líder de este EFE','Soy Timoteo de este EFE']}
};
function config(fields){const order=Object.keys(defaults);return Object.fromEntries(Object.entries(fields||defaults).sort(([a],[b])=>(order.includes(a)?order.indexOf(a):100)-(order.includes(b)?order.indexOf(b):100)).map(([k,f])=>[k,{visible:true,...defaults[k],...f,required:f.visible!==false}]));}
function applies(f,role='',roles=[]){return !f.roles?.length||f.roles.includes(role||'Comunidad')||roles.some(r=>f.roles.includes(r));}
function field(key,f,v='',groups=[],locked=false){
 if(f.visible===false)return '';
 const name=U.esc(key),label=U.esc(f.label||key),required=f.required?'required':'',hint=f.required?'Obligatorio':'Opcional',id='profile-'+name;
 const lock=locked&&baseKeys.includes(key)&&v!==''&&v!=null;
 const attrs=`name="${name}" id="${id}" ${required} ${lock?'readonly aria-readonly="true"':''}`;
 const help=key==='instagram'?'Si no tenés, escribí “No tengo”.':key==='dreams'?'Puede ser algo grande, un proyecto o algo que te gustaría aprender.':key==='studies'?'Contanos qué estudiás, si trabajás o en qué etapa estás.':'';
 let input;
 if(f.type==='multiselect'){
  const selected=Array.isArray(v)?v:[],known=f.options||[],extra=selected.filter(x=>!known.includes(x));
  input=`<div class="profile-interests">${known.map(x=>`<label><input type="checkbox" name="${name}" value="${U.esc(x)}" ${selected.includes(x)?'checked':''}><span>${U.esc(x)}</span></label>`).join('')}</div><input name="${name}_other" value="${U.esc(extra.join(', '))}" maxlength="300" placeholder="Otros intereses, separados por coma" aria-label="Otros intereses"><small class="profile-field-error" data-error="${name}" role="alert"></small>`;
 }else if(f.type==='leadership'){
  const areas=['Acompañar jóvenes','Acompañar adolescentes','Enseñar','Escuchar','Organizar equipos','Comunicar'];const scores=v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const initial=Number.isFinite(Number(f.default))?Number(f.default):50;
  input=`<div class="profile-leadership">${areas.map(area=>{const score=scores[area]===undefined?initial:Number(scores[area]);return `<label>${U.esc(area)}<input type="range" name="${name}" data-area="${U.esc(area)}" min="0" max="100" step="5" value="${score}" style="--profile-score:${score}%" aria-label="${U.esc(area)}"><output>${score}%</output></label>`;}).join('')}</div><small>Revisá cada habilidad. Los porcentajes expresan cómo te sentís hoy.</small><label class="profile-strength-confirm"><input type="checkbox" name="${name}_confirmed" ${Object.keys(scores).length?'checked':''} ${f.required?'required':''}>Revisé mis habilidades y estos porcentajes me representan.</label><small class="profile-field-error" data-error="${name}" role="alert"></small>`;
 }else if(f.type==='efe'||f.type==='select'){
  const options=f.type==='efe'?[...groups.map(g=>[g.code,g.name]),['none','Todavía no voy a un EFE']]:(f.options||[]).map(x=>[x,key==='sex'?({M:'Varón',F:'Mujer'}[x]||x):x]);
  input=`<select ${attrs.replace('readonly aria-readonly="true"','disabled')} aria-label="${label}"><option value="">Elegí una opción</option>${options.map(([value,text])=>`<option value="${U.esc(value)}" ${v===value?'selected':''}>${U.esc(text)}</option>`).join('')}</select>${lock?`<input type="hidden" name="${name}" value="${U.esc(v)}">`:''}${f.type==='efe'?'<small data-efe-hint>Tu grupo actual se conserva. Podés elegir otro si corresponde.</small>':''}`;
 }else if(f.type==='textarea'){
  input=`<textarea ${attrs} rows="4" maxlength="2000" placeholder="Contanos con tus palabras…">${U.esc(v)}</textarea>`;
 }else{
  input=`<input ${attrs} type="${f.type==='date'?'date':f.type==='tel'?'tel':'text'}" value="${U.esc(v)}" ${key==='birthday'?`max="${U.dateKey()}" min="1900-01-01" autocomplete="bday"`:''} ${key==='dni'?'inputmode="numeric" pattern="[0-9]{6,10}" maxlength="10"':'maxlength="'+(baseKeys.includes(key)?100:2000)+'"'} ${key==='first_name'?'autocomplete="given-name"':key==='last_name'?'autocomplete="family-name"':key==='phone'?'autocomplete="tel"':''}>`;
 }
 return `<div class="profile-field ${f.type==='multiselect'||f.type==='textarea'?'profile-field-wide':''}"><label ${f.type==='multiselect'?'':`for="${id}"`}>${label}<span class="profile-requirement">${hint}</span></label>${input}${help?`<small>${help}</small>`:''}${lock?'<small>Dato guardado. Podés solicitar su corrección desde Mi perfil.</small>':''}</div>`;
}
function render(fields,values={},groups=[],{mode='all',locked=false,role=''}={}){
 const entries=Object.entries(config(fields)).filter(([k,f])=>f.visible!==false&&applies(f,role,values._profile_roles||[])&&(mode==='all'||(mode==='base'?baseKeys.includes(k):!baseKeys.includes(k))));
 const base=entries.filter(([k])=>baseKeys.includes(k)),extra=entries.filter(([k])=>!baseKeys.includes(k)&&!['efe_group','efe_service_role'].includes(k)),efeFields=entries.filter(([k])=>['efe_group','efe_service_role'].includes(k));
 return `${base.length?`<fieldset class="profile-section"><legend>01 · Tus datos</legend><div class="profile-grid">${base.map(([k,f])=>field(k,f,values[k]||'',groups,locked)).join('')}</div></fieldset>`:''}${extra.length?`<fieldset class="profile-section"><legend>${base.length?'02 · ':' '}Lo que te hace vos</legend><p>Queremos conocerte, acompañarte y hacer lugar a tus ideas.</p><div class="profile-grid">${extra.map(([k,f])=>field(k,f,values[k]||'',groups)).join('')}</div></fieldset>`:''}${efeFields.length?`<fieldset class="profile-section"><legend>Tu EFE</legend><div class="profile-grid">${efeFields.map(([k,f])=>field(k,f,values[k]||'',groups)).join('')}</div></fieldset>`:''}`;
}
function collect(form,fields){
 const fd=new FormData(form),out={};
 for(const [k,f] of Object.entries(config(fields))){
  if(f.visible===false||!form.querySelector(`[name="${k}"]`)||form.querySelector(`[name="${k}"]`).disabled)continue;
  if(f.type==='multiselect')out[k]=[...new Set([...fd.getAll(k),...String(fd.get(k+'_other')||'').split(',').map(x=>x.trim()).filter(Boolean)])];
  else if(f.type==='leadership'){if(form.querySelector(`[name="${k}_confirmed"]`)?.checked)out[k]=Object.fromEntries([...form.querySelectorAll(`[name="${k}"][data-area]`)].map(el=>[el.dataset.area,Number(el.value)]));}
  else out[k]=String(fd.get(k)||'').trim();
 }
 return out;
}
function validate(form,fields){
 const v=collect(form,fields);
 for(const [k,f] of Object.entries(config(fields))){
  const el=form.querySelector(`[name="${k}"]`);if(!el||f.visible===false)continue;
  if(f.type==='multiselect'||f.type==='leadership'){
   const error=form.querySelector(`[data-error="${k}"]`),missing=f.required&&!v[k]?.length;
   const reallyMissing=f.type==='leadership'?f.required&&Object.keys(v[k]||{}).length===0:missing;
   if(error)error.textContent=reallyMissing?'Elegí al menos una opción.':'';
   if(reallyMissing){el.focus();return false;}
  }
 }
 return form.reportValidity();
}
function suggest(birthday,sex,today=U.dateKey()){
 if(sex==='M')return 'varones';if(sex!=='F'||!birthday||birthday>today)return '';
 let age=Number(today.slice(0,4))-Number(birthday.slice(0,4));if(today.slice(5)<birthday.slice(5))age--;
 return age>=18?'mujeres18':age>=15?'mujeres15_17':age>=12?'mujeres12_14':'';
}
function bind(form,fields,values={},groups=[]){
 form.querySelectorAll('.profile-leadership input[type=range]').forEach(input=>input.oninput=()=>{input.nextElementSibling.textContent=input.value+'%';input.style.setProperty('--profile-score',input.value+'%');});
 const efe=form.querySelector('[name="efe_group"]');let manual=!!values.efe_group;
 const update=()=>{if(!efe||manual)return;const code=suggest(form.querySelector('[name="birthday"]')?.value||values.birthday,form.querySelector('[name="sex"]')?.value||values.sex);if(code&&groups.some(g=>g.code===code)){efe.value=code;const hint=form.querySelector('[data-efe-hint]');if(hint)hint.textContent='Sugerido por tu edad y sexo. Podés cambiarlo.';U.enhanceSelects(form);}};
 const service=form.querySelector('[name=efe_service_role]');const syncService=()=>{if(!service||service.closest('[data-efe-service-role]'))return;const group=efe?.value??values.efe_group;const show=!!group&&group!=='none';service.closest('.profile-field').hidden=!show;service.disabled=!show;};
 efe?.addEventListener('change',()=>{manual=true;syncService();});syncService();form.querySelector('[name="birthday"]')?.addEventListener('change',update);form.querySelector('[name="sex"]')?.addEventListener('change',update);update();U.enhanceSelects(form);
}
root.TNTProfiles={defaults,baseKeys,config,field,render,collect,validate,suggest,bind,applies};
if(typeof module==='object'&&module.exports)module.exports=root.TNTProfiles;
})(typeof window==='object'?window:globalThis);
