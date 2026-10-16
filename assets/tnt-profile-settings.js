(() => {
 'use strict';
 const U=TNTUI,P=TNTProfiles,roles=['Admin','Pastor/a','Líder','Timoteo','Colaborador','Comunidad'];
 const types={text:'Texto',textarea:'Respuesta extensa',date:'Fecha',tel:'Teléfono',select:'Una opción',multiselect:'Varias opciones',efe:'Grupo EFE',leadership:'Habilidades con porcentajes'};
 function mount(container,settings){
  let fields=P.config(settings.find(s=>s.key==='profile_fields')?.value);
  function draw(){
   container.innerHTML='<h2>Un perfil para todo TNT</h2><p>Elegí qué se pregunta y a quién. Todo campo visible es obligatorio para esos roles. Se aplica a personas nuevas y existentes. Las respuestas obligatorias pendientes deben completarse antes de entrar a los módulos.</p><form id="profile-field-settings">'+Object.entries(fields).map(([k,f])=>'<div class="profile-setting-row"><div><b>'+U.esc(f.label)+'</b><small>'+types[f.type]+' · '+(f.roles?.length?U.esc(f.roles.join(', ')):'Todos los roles')+'</small><button class="community-text-link" type="button" data-field-edit="'+k+'">Configurar pregunta y roles</button></div><div class="profile-setting-toggles"><label><input type="checkbox" name="'+k+'_visible" '+(f.visible!==false?'checked':'')+'>Mostrar</label><span class="tnt-pill">Obligatorio si se muestra</span></div></div>').join('')+'<div class="profile-setting-actions"><button class="tnt-button" type="button" data-add-field>'+U.icon('plus')+'Agregar pregunta</button><button class="tnt-button primary" type="submit">Guardar configuración</button></div><p role="status"></p></form>';
   const form=container.querySelector('form');
   const capture=()=>{const fd=new FormData(form);for(const [k,f] of Object.entries(fields)){f.visible=fd.has(k+'_visible');f.required=f.visible;}};
   for(const k of Object.keys(fields))form.elements[k+'_visible'].onchange=()=>{fields[k].visible=form.elements[k+'_visible'].checked;fields[k].required=fields[k].visible;};
   function edit(key){
    capture();const f=fields[key]||{label:'',type:'text',visible:true,required:true},builtin=!!P.defaults[key];
    const o=U.modal(key?'Configurar pregunta':'Agregar pregunta','<form class="tnt-form"><label>Pregunta<input name="label" maxlength="120" value="'+U.esc(f.label)+'" required></label>'+(!builtin?'<label>Tipo de respuesta<select name="type">'+['text','textarea','date','select','multiselect'].map(v=>'<option value="'+v+'" '+(f.type===v?'selected':'')+'>'+types[v]+'</option>').join('')+'</select></label>':'')+(!builtin||['select','multiselect'].includes(f.type)&&key!=='sex'?'<label data-options>Opciones<textarea name="options" rows="4" placeholder="Una opción por línea">'+U.esc((f.options||[]).join('\n'))+'</textarea></label>':'')+'<fieldset><legend>¿A quién se le pregunta?</legend><p>Sin selección, se muestra a todos.</p><div class="tnt-check-grid">'+roles.map(r=>'<label><input type="checkbox" name="roles" value="'+r+'" '+(f.roles?.includes(r)?'checked':'')+'>'+r+'</label>').join('')+'</div></fieldset>'+(f.type==='leadership'?'<label>Porcentaje inicial de cada barra<input type="number" name="default" min="0" max="100" step="5" value="'+(f.default??50)+'" required></label><small>La persona debe revisar y confirmar las habilidades para completar el perfil.</small>':'')+'<button class="tnt-button primary" type="submit">Aplicar al borrador</button><p role="status"></p></form>',false,{stack:true});
    const ef=o.querySelector('form'),adjust=()=>{const opts=ef.querySelector('[data-options]');if(opts)opts.hidden=!['select','multiselect'].includes(ef.elements.type?.value||f.type);};ef.elements.type?.addEventListener('change',adjust);adjust();
    ef.onsubmit=async e=>{e.preventDefault();const type=ef.elements.type?.value||f.type,options=ef.elements.options?.value.split('\n').map(x=>x.trim()).filter(Boolean);
     if(['select','multiselect'].includes(type)&&key!=='sex'&&!options?.length){ef.querySelector('[role=status]').textContent='Agregá al menos una opción.';return;}
     const id=key||'question_'+crypto.randomUUID().replaceAll('-','').slice(0,12);
     fields[id]={...f,label:ef.elements.label.value.trim(),type,roles:new FormData(ef).getAll('roles'),...(options?{options}:{}),...(ef.elements.default?{default:Number(ef.elements.default.value)}:{})};
     await U.closeModal(o);draw();container.querySelector('form').dataset.tntDirty='true';
    };
   }
   form.querySelectorAll('[data-field-edit]').forEach(b=>b.onclick=()=>edit(b.dataset.fieldEdit));form.querySelector('[data-add-field]').onclick=()=>edit(null);
   form.onsubmit=async e=>{e.preventDefault();capture();const b=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');b.disabled=true;
    try{const r=await TNT.sb.rpc('tnt_save_profile_fields',{p_fields:fields});if(r.error)throw r.error;const found=settings.find(s=>s.key==='profile_fields');if(found)found.value=fields;else settings.push({key:'profile_fields',value:fields});delete form.dataset.tntDirty;
     status.textContent='Configuración guardada. Se aplica a todos los perfiles.';await TNT.refreshIdentity();document.dispatchEvent(new CustomEvent('tnt:data',{detail:{tables:['tnt_settings']}}));if(!TNT.profileComplete)location.replace('/?onboarding=1');
    }catch(err){status.textContent=err.message;}finally{b.disabled=false;}
   };
  }draw();
 }
 function newsKey(n,index=0){if(n.id)return n.id;let hash=2166136261;for(const c of JSON.stringify([n.title,n.body,n.href,n.until]))hash=Math.imul(hash^c.charCodeAt(0),16777619);return 'legacy-'+(hash>>>0).toString(36)+'-'+index;}
 async function saveNews(news,expected){const r=await TNT.sb.rpc('tnt_save_news',{p_news:news,p_expected:expected});if(r.error)throw r.error;document.dispatchEvent(new CustomEvent('tnt:data',{detail:{tables:['tnt_settings']}}));}
 async function removeNews(key){
  const r=await TNT.sb.from('tnt_settings').select('value').eq('key','community_news').maybeSingle();if(r.error)throw r.error;
  const current=Array.isArray(r.data?.value)?r.data.value:[],index=current.findIndex((n,i)=>newsKey(n,i)===key);if(index<0)throw Error('Esta novedad ya cambió. Actualizamos el inicio.');
  const removed=current[index],next=current.filter((_,i)=>i!==index);await saveNews(next,current);
  TNTExperience.undo('Novedad eliminada',async()=>{const fresh=await TNT.sb.from('tnt_settings').select('value').eq('key','community_news').maybeSingle();if(fresh.error)throw fresh.error;const items=Array.isArray(fresh.data?.value)?fresh.data.value:[],restored=[...items];restored.splice(Math.min(index,items.length),0,removed);await saveNews(restored,items);});
 }
 function mountNews(container,settings){
  let expected=settings.find(s=>s.key==='community_news')?.value||[],news=structuredClone(Array.isArray(expected)?expected:[]);news.forEach(n=>n.id||=crypto.randomUUID());
  function draw(){
   container.innerHTML='<h2>Novedades en la portada</h2><p>Se muestran en el inicio del staff, la comunidad o todo TNT. Podés plegarlas, agregar y eliminar varias antes de publicar.</p><form class="community-news-edit">'+news.map((n,i)=>'<details class="tnt-fold" data-news="'+n.id+'" '+(n.title?'':'open')+'><summary>'+U.esc(n.title||'Nueva novedad')+'<span>Novedad '+(i+1)+'</span></summary><div class="tnt-fold-content"><label>Título<input name="title" maxlength="120" value="'+U.esc(n.title||'')+'" required></label><label>Mensaje<textarea name="body" maxlength="2000">'+U.esc(n.body||'')+'</textarea></label><label>Enlace opcional<input name="href" value="'+U.esc(n.href||'')+'" placeholder="https://…"></label><label>Foto de portada<input name="image" type="url" value="'+U.esc(n.image||'')+'" placeholder="https://…"></label><label>Botón del anuncio<input name="link_label" maxlength="60" value="'+U.esc(n.link_label||'Ir a ver')+'"></label><label>Quién lo ve<select name="audience">'+[['all','Todo TNT'],['staff','Solo staff'],['community','Solo comunidad']].map(([v,l])=>'<option value="'+v+'" '+(n.audience===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Mostrar hasta<input name="until" type="date" value="'+U.esc(n.until||'')+'"></label><button class="tnt-button danger" type="button" data-remove-news="'+n.id+'">'+U.icon('trash')+'Eliminar novedad</button></div></details>').join('')+'<div class="tnt-studio-actions"><button class="tnt-button" type="button" data-add-news>'+U.icon('plus')+'Agregar novedad</button><button class="tnt-button primary" type="submit">Publicar cambios</button></div><p role="status"></p></form>';
   const form=container.querySelector('form'),capture=()=>{news=[...form.querySelectorAll('[data-news]')].map(f=>({...news.find(n=>n.id===f.dataset.news),...Object.fromEntries([...f.querySelectorAll('[name]')].map(x=>[x.name,x.value.trim()]))}));};
   form.querySelector('[data-add-news]').onclick=()=>{capture();news.push({id:crypto.randomUUID(),audience:'all'});draw();container.querySelector('form').dataset.tntDirty='true';};
   form.querySelectorAll('[data-remove-news]').forEach(b=>b.onclick=()=>{capture();const index=news.findIndex(n=>n.id===b.dataset.removeNews),removed=news.splice(index,1)[0];draw();container.querySelector('form').dataset.tntDirty='true';TNTExperience.undo('Novedad quitada del borrador',async()=>{capture();news.splice(index,0,removed);draw();});});
   form.onsubmit=async e=>{e.preventDefault();capture();const status=form.querySelector('[role=status]'),b=form.querySelector('[type=submit]');b.disabled=true;try{
    if(news.some(n=>n.href&&!U.safeUrl(n.href)))throw Error('Revisá los enlaces de las novedades.');
    await saveNews(news,expected);expected=structuredClone(news);const found=settings.find(s=>s.key==='community_news');if(found)found.value=news;else settings.push({key:'community_news',value:news});delete form.dataset.tntDirty;
    const modal=container.closest('dialog');if(modal)await U.closeModal(modal);else status.textContent='Novedades publicadas.';U.toast('Novedades actualizadas en el inicio de TNT.');
   }catch(err){status.textContent=err.message;}finally{b.disabled=false;}};
  }draw();
 }
 window.TNTProfileSettings={mount,mountNews,newsKey,removeNews};
})();
