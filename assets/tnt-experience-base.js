/* Shared TNT configuration, visual editing, tutorials and live updates. */
(() => {
 'use strict';
 const E=window.TNTExperience={revision:0,config:{},draft:null,editing:false}, moduleId=()=>canonical(window.TNT?.module||document.body.dataset.tntSurface||'home');
 const canonical=id=>['efe','lista-sabados'].includes(id)?'asistencia':id;
 const esc=s=>window.TNTUI.esc(s), clone=x=>JSON.parse(JSON.stringify(x)), emit=(name,detail)=>document.dispatchEvent(new CustomEvent(name,{detail}));
 const MODULES=E.modules=[
  ['home','Inicio','Tu comunidad en primera plana','#ff7948'],['organizacion','Organización','Cada encuentro, cada actividad, cada responsable.','#b9a5f4'],
  ['chat','Chat TNT','El equipo, más cerca.','#c8e89b'],['asistencia','Asistencia','Cada persona cuenta.','#efb5cc'],
  ['campamento','Campamento','Una experiencia para compartir.','#a8d8eb'],['glosario','Prédicas y glosario','Ideas que nos acompañan.','#b9a5f4'],
  ['buffet','Buffet','Todo listo para servir.','#ffb484'],['perfiles','Perfiles','Nombres, historias y sueños.','#c8e89b']
 ];
 const key=id=>'tnt-tutorial:'+TNT.person.id+':'+id+':2';
 const config=()=>E.editing&&E.draft?E.draft:E.config;
 E.module=id=>({enabled:true,...(config().modules?.[canonical(id)]||{})});
 E.enabled=id=>E.module(id).enabled!==false;
 E.text=(id,fallback)=>config().copy?.[id]??fallback;
 E.image=url=>{if(!String(url||'').trim())return '';try{const u=new URL(String(url).trim(),location.origin);return ['https:','http:'].includes(u.protocol)&&(u.protocol==='https:'||u.origin===location.origin)?u.href:'';}catch{return '';}};
 E.logo=(animated=false)=>`<span class="tnt-dynamite ${animated?'is-burning':''}" aria-hidden="true"><img src="/icons/dynamite.svg" alt=""><i class="tnt-fuse-spark"></i></span>`;
 E.loader=(label='Encendiendo TNT…')=>`<div class="tnt-ignition" role="status">${E.logo(true)}<span>${esc(label)}</span></div>`;
 E.load=async sb=>{const r=await sb.from('tnt_experience').select('config,revision').eq('id',true).maybeSingle();if(r.error)throw r.error;E.config=r.data?.config||{};E.revision=Number(r.data?.revision||0);E.paint();return E.config;};
 E.paint=()=>{
  const c=config(),m=E.module(moduleId()),accent=m.accent||c.brand?.accent||'#ff7948';
  if(/^#[\da-f]{6}$/i.test(accent)){document.documentElement.style.setProperty('--tnt-accent',accent);document.documentElement.style.setProperty('--tnt-focus',accent);}
  const shell=document.querySelector('.tnt-shell-brand b');if(shell&&m.title)shell.textContent=m.title;applyCopy(true);paintCover(); document.body.dataset.tntEditing=String(E.editing);
 };
 function paintCover(){
  const id=moduleId(),m=E.module(id),url=E.image(m.cover||''),existing=document.getElementById('tnt-module-cover');
  if(id==='home'||id==='admin'||!url){existing?.remove();return;}
  const app=document.querySelector('#app,#camp-app,#attendance-app');if(!app||!TNT.profileComplete||TNT.blocked)return;
  const d=existing||document.createElement('section');d.id='tnt-module-cover';d.dataset.tntRecord='true';
  d.style.setProperty('--tnt-cover',`url("${url.replaceAll('"','%22')}")`);d.innerHTML=`<span>TNT · ${esc(MODULES.find(x=>x[0]===id)?.[1]||id)}</span><h1>${esc(m.title||MODULES.find(x=>x[0]===id)?.[1]||'TNT')}</h1><p>${esc(m.description||'')}</p>`;
  if(!existing)app.before(d);
 }
 E.undo=(message,action)=>{
  const d=document.createElement('div');d.className='tnt-undo';d.setAttribute('role','status');d.append(document.createTextNode(message));
  const b=document.createElement('button');b.textContent='Deshacer';d.append(b);document.body.append(d);
  const timer=setTimeout(()=>d.remove(),12000);b.onclick=async()=>{b.disabled=true;try{await action();clearTimeout(timer);d.remove();}catch(e){TNTUI.toast(e.message,true);b.disabled=false;}};
 };
 function blockedModule(){
  if(!window.TNT?.identity||!TNT.profileComplete||!TNT.module||TNT.isAdmin||E.enabled(TNT.module)){document.getElementById('tnt-module-paused')?.remove();return;}
  if(document.getElementById('tnt-module-paused'))return;
  const d=document.createElement('div');d.id='tnt-module-paused';d.innerHTML=`<section>${E.logo()}<h1>Este espacio está en pausa</h1><p>El equipo de TNT lo volverá a habilitar cuando esté listo.</p><a class="tnt-button primary" href="/">Volver al inicio</a></section>`;document.body.append(d);TNT.blocked=true;
 }
 E.openSettings=async(id=moduleId())=>{
  if(!TNT.isAdmin)return;id=canonical(id);if(!MODULES.some(m=>m[0]===id))id='home';
  const r=await TNT.sb.from('tnt_experience_drafts').select('*').eq('person_id',TNT.person.id).maybeSingle();if(r.error)return TNTUI.toast(r.error.message,true);
  E.draft=clone(r.data?.config||E.config);E.draftBase=Number(r.data?.base_revision??E.revision);
  const o=TNTUI.modal('Estudio TNT',`<p>Probá cambios en un borrador. Publicalos cuando estén listos para todos.</p><div class="tnt-studio-modules">${MODULES.map(([v,n])=>`<button data-studio-module="${v}" class="${v===id?'is-active':''}">${esc(n)}</button>`).join('')}</div><form id="tnt-module-config"><div id="tnt-config-fields"></div><p role="status" aria-live="polite"></p><div class="tnt-studio-actions"><button type="button" class="tnt-button" data-save-draft>Guardar borrador</button><button type="button" class="tnt-button" data-visual-edit>Editar en la pantalla</button><button type="submit" class="tnt-button primary">Publicar cambios</button></div><button type="button" class="tnt-text-button" data-current-version>Usar la versión publicada como borrador</button><button type="button" class="tnt-text-button" data-history>Restaurar una versión publicada</button></form>`);
  const form=o.querySelector('form'),fields=o.querySelector('#tnt-config-fields');
  function capture(){const f=form.elements;E.draft.modules||={};E.draft.modules[id]={...E.draft.modules[id],enabled:f.enabled?.checked??true,title:f.title?.value.trim()||'',description:f.description?.value.trim()||'',cover:f.cover?.value.trim()||'',accent:f.accent?.value||'#ff7948'};}
  function paintFields(){const m={enabled:true,...E.draft.modules?.[id]},def=MODULES.find(x=>x[0]===id);fields.innerHTML=`<div class="tnt-studio-heading"><span>${esc(def[1])}</span><label class="tnt-toggle-label"><input name="enabled" type="checkbox" ${m.enabled?'checked':''} ${id==='home'?'disabled':''}> Módulo habilitado</label></div><p class="tnt-config-help">${id==='home'?'El inicio siempre está disponible.':'Al pausarlo, desaparece del inicio y se bloquea el acceso por enlace. Sus datos quedan guardados. Los administradores pueden revisarlo.'}</p><label>Título del espacio<input name="title" value="${esc(m.title||def[1])}" maxlength="100" required></label><label>Descripción<textarea name="description" maxlength="400">${esc(m.description||def[2])}</textarea></label><div class="tnt-config-grid"><label>Color del espacio<input name="accent" type="color" value="${esc(/^#[\da-f]{6}$/i.test(m.accent||'')?m.accent:def[3])}"></label><label>Portada · enlace a una foto<input name="cover" type="url" value="${esc(m.cover||'')}" placeholder="https://…"><small>También podés subir una foto del equipo.</small></label></div><label class="tnt-upload-label">Subir portada<input type="file" data-cover-file accept="image/jpeg,image/png,image/webp"></label>${id==='organizacion'?'<p class="tnt-config-help">Editar un encuentro requiere el permiso de la acción y ser coordinador de ese encuentro. Los administradores tienen acceso completo.</p>':''}<details><summary>Textos del tutorial</summary>${(TUTORIALS[id]||[]).map((s,i)=>`<label>Título del paso ${i+1}<input data-tutorial-copy="tutorial.${id}.${i}.title" maxlength="100" value="${esc(E.draft.copy?.['tutorial.'+id+'.'+i+'.title']??s[0])}"></label><label>Explicación<textarea data-tutorial-copy="tutorial.${id}.${i}" maxlength="1500">${esc(E.draft.copy?.['tutorial.'+id+'.'+i]??s[1])}</textarea></label>`).join('')}</details>`;
   fields.querySelector('[data-cover-file]').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024)return TNTUI.toast('Usá una imagen de hasta 5 MB.',true);if(!['image/jpeg','image/png','image/webp'].includes(file.type))return TNTUI.toast('Usá una foto JPG, PNG o WebP.',true);const status=form.querySelector('[role=status]');status.textContent='Subiendo portada…';try{const path=TNT.person.id+'/'+crypto.randomUUID()+'.'+({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]);const r=await TNT.sb.storage.from('tnt-brand').upload(path,file,{contentType:file.type,upsert:false});if(r.error)throw r.error;form.elements.cover.value=TNT.sb.storage.from('tnt-brand').getPublicUrl(path).data.publicUrl;capture();status.textContent='Portada subida al borrador.';}catch(e){status.textContent=e.message;}};
   fields.querySelectorAll('[data-tutorial-copy]').forEach(t=>t.oninput=()=>{E.draft.copy||={};E.draft.copy[t.dataset.tutorialCopy]=t.value;});
  }
  paintFields();if(E.draftBase!==E.revision)form.querySelector('[role=status]').textContent='Este borrador parte de una versión anterior. Podés tomar la última versión publicada antes de seguir.';o.querySelector('[data-current-version]').onclick=()=>{E.draft=clone(E.config);E.draftBase=E.revision;paintFields();form.querySelector('[role=status]').textContent='Borrador actualizado con la versión publicada.';};o.querySelectorAll('[data-studio-module]').forEach(b=>b.onclick=()=>{capture();id=b.dataset.studioModule;o.querySelectorAll('[data-studio-module]').forEach(x=>x.classList.toggle('is-active',x===b));paintFields();});
  o.querySelector('[data-save-draft]').onclick=async()=>{capture();await saveDraft(form.querySelector('[role=status]'));};
  o.querySelector('[data-visual-edit]').onclick=async()=>{capture();if(!await saveDraft(form.querySelector('[role=status]')))return;await TNTUI.closeModal(o);E.startEditing();};
  form.onsubmit=async e=>{e.preventDefault();capture();const b=form.querySelector('[type=submit]');b.disabled=true;try{await publish();await TNTUI.closeModal(o);TNTUI.toast('La nueva versión de TNT ya está publicada.');}catch(e){form.querySelector('[role=status]').textContent=e.message;}finally{b.disabled=false;}};
  o.querySelector('[data-history]').onclick=()=>historyModal();
 };
 async function saveDraft(status){try{const r=await TNT.sb.from('tnt_experience_drafts').upsert({person_id:TNT.person.id,config:E.draft,base_revision:E.draftBase,updated_at:new Date().toISOString()});if(r.error)throw r.error;if(status)status.textContent='Borrador guardado. Todavía no lo ve el equipo.';return true;}catch(e){if(status)status.textContent=e.message;return false;}}
 async function publish(){const r=await TNT.sb.rpc('tnt_publish_experience',{p_config:E.draft,p_revision:E.draftBase});if(r.error)throw r.error;E.config=clone(E.draft);E.revision=Number(r.data);E.draftBase=E.revision;E.stopEditing();emit('tnt:config',E.config);emit('tnt:data',{tables:['tnt_experience']});}
 async function historyModal(){const r=await TNT.sb.from('tnt_experience_versions').select('revision,created_at,config').order('revision',{ascending:false}).limit(15);if(r.error)return TNTUI.toast(r.error.message,true);const o=TNTUI.modal('Versiones publicadas',`<p>Elegí una versión para llevarla al borrador. Podés revisarla antes de publicarla.</p><div class="tnt-version-list">${(r.data||[]).map(x=>`<button data-version="${x.revision}"><b>Versión ${x.revision}</b><small>${esc(TNTUI.date(x.created_at))}</small></button>`).join('')||'<p>Todavía no hay versiones anteriores.</p>'}</div>`);o.querySelectorAll('[data-version]').forEach(b=>b.onclick=async()=>{E.draft=clone(r.data.find(x=>String(x.revision)===b.dataset.version).config);E.draftBase=E.revision;await saveDraft();await TNTUI.closeModal(o);E.startEditing();TNTUI.toast('Versión recuperada en el borrador.');});}
 /* Store plain text only; configurable content never becomes HTML. */
 const originals=new WeakMap(),attributes=new WeakMap();let applying=false,observer,timer;
 function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return(n>>>0).toString(36);}
 function copyKey(text){return 'ui.'+moduleId()+'.'+hash(text);}
 const exclude='.room-heading,.event-card,.saturday-card,.encounter-card,.tnt-program,.tnt-program-hero,[data-tnt-dynamic],[data-tnt-record],#tnt-studio-toolbar,#tnt-copy-editor,#tnt-tutorial,.tnt-select-dialog,script,style,textarea,input,[contenteditable],.chat-message,.bubble,.task-card,.person-card,.user,.tnt-profile-head,.profile-detail-grid,.hub-event,.community-event,.member,.chat-thread,.community-news-feature,.hub-result,[data-task-open],[data-item-open],[data-person-open],[data-person],[data-community-event]';
 function eligible(el){if(el?.hasAttribute('data-tnt-copy')&&!el.closest('[data-tnt-record],#tnt-studio-toolbar,#tnt-copy-editor,#tnt-module-config'))return true;return el&&!el.closest(exclude)&&!el.closest('#tnt-module-config')&&el.matches('h1,h2,h3,label,button,a.tnt-button,a.btn,summary,legend,.tnt-empty,.empty,.tnt-error,.tiny,.meta,p,[data-tnt-copy]');}
 function usable(text){const s=text.trim();return s.length>=2&&s.length<=1500&&!/https?:|@|\d{5,}|^[\d\W]+$/.test(s)&&(!window.TNT?.identity||![TNT.displayName(),TNT.identity.email].some(x=>x&&s.includes(x)));}
 function textNodes(el){const result=[],walk=document.createTreeWalker(el,4);let node;while(node=walk.nextNode())if(!node.parentElement.closest('svg,script,style,input,textarea,[data-tnt-record]'))result.push(node);return result;}
 function applyCopy(force=false){if(applying||(!force&&!E.editing&&!Object.keys(config().copy||{}).length))return;applying=true;try{
  const roots=document.querySelectorAll('h1,h2,h3,label,button,a.tnt-button,a.btn,summary,legend,.tnt-empty,.empty,.tnt-error,p,[data-tnt-copy]');
  for(const el of roots){if(!eligible(el))continue;for(const node of textNodes(el)){const before=originals.get(node)||node.nodeValue;if(!usable(before))continue;originals.set(node,before);const name=el.dataset.tntCopy||copyKey(before.trim()),value=config().copy?.[name];const next=value===undefined?before:before.match(/^\s*/)[0]+value+before.match(/\s*$/)[0];if(node.nodeValue!==next)node.nodeValue=next;}}
  document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(el=>{if(el.closest('#tnt-module-config,#tnt-copy-editor'))return;const before=attributes.get(el)||el.placeholder;attributes.set(el,before);const next=config().copy?.[copyKey('placeholder:'+before)]??before;if(el.placeholder!==next)el.placeholder=next;});
 }finally{applying=false;}}
 E.startEditing=()=>{
  if(!TNT.isAdmin)return;E.draft||=clone(E.config);E.draftBase??=E.revision;E.editing=true;E.paint();emit('tnt:config',E.draft);document.getElementById('tnt-studio-toolbar')?.remove();
  const d=document.createElement('aside');d.id='tnt-studio-toolbar';d.innerHTML=`<div><b>Modo desarrollo</b><small>Tocá un texto para editarlo. El equipo sigue viendo la versión publicada.</small></div><button data-preview>Vista previa</button><button data-save>Guardar</button><button data-publish>Publicar</button><button data-cancel aria-label="Salir sin publicar">${TNTUI.icon('close')}</button>`;document.body.append(d);
  d.querySelector('[data-preview]').onclick=()=>{E.preview=!E.preview;d.querySelector('[data-preview]').textContent=E.preview?'Volver a editar':'Vista previa';document.body.dataset.tntPreview=String(E.preview);};
  d.querySelector('[data-save]').onclick=async()=>{if(await saveDraft())TNTUI.toast('Borrador guardado.');};
  d.querySelector('[data-publish]').onclick=async e=>{e.target.disabled=true;try{await publish();TNTUI.toast('Cambios publicados.');}catch(err){TNTUI.toast(err.message,true);e.target.disabled=false;}};
  d.querySelector('[data-cancel]').onclick=()=>{E.stopEditing();emit('tnt:config',E.config);};
 };
 E.stopEditing=()=>{E.editing=false;E.preview=false;delete document.body.dataset.tntPreview;document.getElementById('tnt-studio-toolbar')?.remove();E.paint();};
 document.addEventListener('click',e=>{
  if(!E.editing||E.preview||e.target.closest('#tnt-studio-toolbar,#tnt-module-config,#tnt-copy-editor,#tnt-experience-tools'))return;
  const el=e.target.closest('h1,h2,h3,label,button,a.tnt-button,a.btn,summary,legend,p,[data-tnt-copy],input[placeholder],textarea[placeholder]');
  if(!el)return;const placeholder=el.matches('input[placeholder],textarea[placeholder]');if(!placeholder&&!eligible(el))return;
  const node=textNodes(el).find(n=>usable(originals.get(n)||n.nodeValue));const before=placeholder?(attributes.get(el)||el.placeholder):node&&(originals.get(node)||node.nodeValue).trim();if(!before)return;
  e.preventDefault();e.stopImmediatePropagation();const id=el.dataset.tntCopy||copyKey(placeholder?'placeholder:'+before:before);
  const o=TNTUI.modal('Editar texto',`<form id="tnt-copy-editor"><label>Texto que verá el equipo<textarea name="text" maxlength="1500" required>${esc(E.draft.copy?.[id]??before)}</textarea></label><p>Original: ${esc(before)}</p><div class="tnt-studio-actions"><button class="tnt-button" data-default type="button">Restaurar original</button><button class="tnt-button primary">Aplicar al borrador</button></div></form>`);
  o.querySelector('[data-default]').onclick=()=>o.querySelector('textarea').value=before;
  o.querySelector('form').onsubmit=async event=>{event.preventDefault();E.draft.copy||={};E.draft.copy[id]=o.querySelector('textarea').value.trim();E.paint();await TNTUI.closeModal(o);};
 },true);
 const TUTORIALS=E.tutorials={
 "admin": [
  [
   "Tu equipo",
   "Acá gestionás personas, roles, accesos y solicitudes. Cada cambio queda registrado.",
   ".hero h1"
  ],
  [
   "Personas y permisos",
   "Elegí una persona para revisar su rol, los permisos heredados y las excepciones. Editar un sábado también requiere coordinar ese encuentro.",
   "[data-tab=users]",
   "[data-tab=users]"
  ],
  [
   "Solicitudes",
   "Revisá los pedidos pendientes y verificá la identidad antes de vincular una cuenta de Google con un perfil existente.",
   "[data-tab=requests]",
   "[data-tab=requests]"
  ],
  [
   "Configuración por módulo",
   "Desde Configuración abrís Estudio TNT: módulos habilitados, portadas, colores, textos y tutoriales.",
   "[data-tab=settings]",
   "[data-tab=settings]"
  ],
  [
   "Borradores y publicación",
   "Editar en la pantalla abre el modo desarrollo. Guardar conserva el borrador; Publicar lo aplica al equipo. Podés recuperar versiones anteriores.",
   "[data-tab=settings]"
  ],
  [
   "Auditoría",
   "Consultá quién cambió un permiso o una configuración y cuándo.",
   "[data-tab=audit]",
   "[data-tab=audit]"
  ]
 ],
 "home": [
  [
   "Tu comunidad",
   "Esta es la portada de TNT. Las novedades, los próximos encuentros y tus responsabilidades tienen su lugar.",
   ".hub-greeting,.community-hero"
  ],
  [
   "Novedades",
   "Los anuncios publicados por el equipo aparecen acá. Abrilos para conocer los detalles.",
   ".tnt-home-news"
  ],
  [
   "Tu próximo encuentro",
   "Encontrá la fecha, el lugar y el equipo responsable. El staff puede ir al cronograma.",
   ".hub-upnext,.community-calendar"
  ],
  [
   "Tus espacios",
   "Deslizá las tarjetas o usá las flechas para recorrer los módulos que tenés habilitados.",
   "[data-spaces-heading],.community-shortcuts"
  ],
  [
   "Tu cuenta",
   "Desde tu foto podés editar tus datos, ver tu participación, cambiar el tema y volver a iniciar estos tutoriales.",
   "#account"
  ]
 ],
 "organizacion": [
  [
   "Organización",
   "Encuentros, actividades y responsabilidades, en un mismo espacio.",
   ".org-heading"
  ],
  [
   "Elegí un sábado",
   "Tocá un sábado para abrir su cronograma. Podés pasar al anterior o al siguiente dentro de la agenda.",
   ".saturday-card,.saturday-list",
   "[data-view=saturdays]"
  ],
  [
   "Cronograma visual",
   "Cronograma rápido muestra horarios, detalles y responsables. Elegí un encuentro para ver su programa.",
   "[data-quick-schedule]"
  ],
  [
   "Actividades",
   "Cada tarjeta abre un encuentro con sus actividades. Podés cargar una desde cero y guardar otra sin salir del formulario.",
   ".encounter-card,.activity-tools",
   "[data-view=activities]"
  ],
  [
   "Deslizá para actuar",
   "Dentro del cronograma, deslizá una actividad para editarla o eliminarla. También tenés un botón de opciones.",
   ".encounter-card,.activity-tools"
  ],
  [
   "Tu responsabilidad",
   "Acá aparecen tus asignaciones. Confirmalas, pedí un cambio y actualizá el avance.",
   ".my-summary",
   "[data-view=my]"
  ],
  [
   "Trabajá en equipo",
   "Chat abre la conversación del encuentro. Los accesos siguen los permisos y la participación de cada persona.",
   "[data-open-chat]"
  ]
 ],
 "chat": [
  [
   "Conversaciones",
   "Tus chats de encuentros y equipos aparecen en esta lista.",
   "#chat-threads"
  ],
  [
   "Abrí un chat",
   "Tocá una conversación para leer los mensajes. El contador muestra los que todavía no leíste.",
   ".chat-thread,#chat-search"
  ],
  [
   "El equipo",
   "Las fotos vienen de los perfiles de TNT. En la cabecera de un chat podés consultar sus participantes.",
   "#chat-room-head,#chat-team"
  ],
  [
   "Escribí y respondé",
   "Escribí, adjuntá archivos o grabá un audio. Responder conserva el contexto del mensaje.",
   "#chat-composer"
  ],
  [
   "A quién llega",
   "Revisá el destino antes de enviar. Algunas conversaciones permiten elegir personas dentro del equipo.",
   "#chat-audience,#chat-room-head"
  ],
  [
   "Administrar conversaciones",
   "Crear y gestionar depende de tus permisos. Si el chat de un sábado ya existe, se abre esa conversación.",
   "#new-chat"
  ],
  [
   "Avisos en tu teléfono",
   "Activá los avisos desde tu cuenta. También podés volver a estos tutoriales desde ahí.",
   ".chat-title-row"
  ]
 ],
 "asistencia": [
  [
   "Cada persona cuenta",
   "Elegí EFE o sábados. Solo aparecen los espacios que tenés habilitados.",
   ".mode-switch"
  ],
  [
   "Elegí fecha y grupo",
   "Revisá el grupo y la reunión antes de pasar lista. Las personas se toman de Perfiles.",
   ".date-panel"
  ],
  [
   "Marcá asistencia",
   "Modo swipe muestra una persona por tarjeta, con su foto. Deslizá o tocá Faltó y Vino; el guardado se realiza mientras avanzás.",
   ".take-attendance"
  ],
  [
   "Corregí un registro",
   "Usá la lista para corregir una marca. Dentro del swipe, Deshacer vuelve a la tarjeta anterior.",
   ".person-row,.attendance-toolbar"
  ],
  [
   "Seguimiento",
   "Las pestañas permiten revisar integrantes, historial y seguimiento según tus permisos.",
   ".attendance-tabs"
  ]
 ],
 "perfiles": [
  [
   "Una persona, una historia",
   "Buscá primero por nombre, apellido, teléfono o Instagram para evitar duplicados.",
   "#searchInput"
  ],
  [
   "Datos e intereses",
   "Abrí una ficha para ver sus datos, intereses, estudios, sueños y EFE. Los campos obligatorios se configuran en Administración.",
   ".person-card,.person-cell"
  ],
  [
   "Foto y cuenta",
   "Quienes ya tienen cuenta muestran su foto de perfil acá y en los selectores de otros módulos.",
   ".person-card-head .tnt-person-avatar,.person-cell .tnt-person-avatar"
  ],
  [
   "Archivar",
   "Desde una ficha podés archivar a una persona y conservar su historia. Los filtros permiten encontrar los perfiles archivados.",
   "#openFiltersBtn"
  ],
  [
   "Duplicados",
   "Revisá nombre y datos antes de eliminar un duplicado. Eliminar lo lleva a Papelera y permite restaurarlo.",
   "#profileDuplicates,#openFiltersBtn"
  ]
 ],
 "campamento": [
  [
   "Todo el campamento",
   "Trabajá con una edición, sus inscripciones, pagos y logística.",
   ".camp-head,.camp-empty-state"
  ],
  [
   "Inscripciones",
   "Revisá quiénes completaron el formulario y los datos pendientes de cada inscripción.",
   ".camp-section-head",
   "[data-main=registrations]"
  ],
  [
   "Pagos",
   "Cada cobro conserva la fecha y el responsable. Revisá el saldo antes de registrar un pago.",
   ".camp-section-head",
   "[data-main=payments]"
  ],
  [
   "Logística",
   "Organizá transporte, habitaciones y equipos con los datos confirmados.",
   ".camp-section-head",
   "[data-main=logistics]"
  ],
  [
   "Comunicaciones y accesos",
   "Más reúne otras herramientas. Cada acción depende de tus permisos para la edición.",
   ".camp-section-head,[data-main=more]",
   "[data-main=more]"
  ]
 ],
 "glosario": [
  [
   "Ideas que nos acompañan",
   "Buscá por tema, emoción, título o palabra para encontrar recursos.",
   "#search"
  ],
  [
   "Abrí un recurso",
   "Las tarjetas abren el contenido, las referencias y los archivos del recurso.",
   ".topic,.topic-card,.bookmap"
  ],
  [
   "Tu biblioteca",
   "Consultá las prédicas guardadas y publicadas desde Biblioteca.",
   "[data-nav=library]",
   "[data-nav=library]"
  ],
  [
   "Crear y editar",
   "Con el permiso correspondiente podés preparar una prédica, guardarla como borrador y publicarla cuando esté lista.",
   "[data-nav=create]"
  ]
 ],
 "buffet": [
  [
   "Todo listo para servir",
   "Elegí la jornada antes de trabajar con productos, pedidos y caja.",
   "#shift-history"
  ],
  [
   "Registrar una venta",
   "Tocá productos, revisá las cantidades y el importe, y recién después confirmá el cobro.",
   ".product,.section-title,.hero",
   "[data-tab=sale]"
  ],
  [
   "Menú y existencias",
   "En Menú configurás productos, precios y cantidades disponibles para esta jornada.",
   "[data-tab=menu]",
   "[data-tab=menu]"
  ],
  [
   "Cierre y seguimiento",
   "Caja reúne los movimientos del día. Revisalos antes de cerrar la jornada.",
   ".stats,.hero,[data-tab=cash]",
   "[data-tab=cash]"
  ]
 ]
};
 let tutorial,highlight,tourObserver,tourFrame=0,tourVersion=0,tourPadding='';
 // Keep the callout separate from its target. Scrolling and resizing reuse the
 // same placement calculation, including mobile safe areas and app navigation.
 E.tourPlacement=(rect,panel,view)=>{
  const gap=16,edge=12,top=view.top||12,bottom=view.height-(view.bottom||12),width=Math.min(panel.width,view.width-edge*2);
  let x=Math.min(Math.max(edge,rect.left),view.width-width-edge),y;
  if(view.width-rect.right>=width+gap+edge){x=rect.right+gap;y=Math.max(top,Math.min(rect.top,bottom-panel.height));}
  else if(rect.bottom+gap+panel.height<=bottom)y=rect.bottom+gap;
  else if(rect.top-gap-panel.height>=top)y=rect.top-gap-panel.height;
  else y=bottom-panel.height;
  return {x,y:Math.max(top,y),width,overlaps:y<rect.bottom&&y+panel.height>rect.top&&x<rect.right&&x+width>rect.left};
 };
 function tourSteps(id){
  const steps=(TUTORIALS[id]||[]).map((x,i)=>Object.assign([...x],{copyIndex:i}));
  if(id==='home'){
   const modules=[...document.querySelectorAll('[data-space]')].map(el=>{
    const id=el.dataset.space,def=MODULES.find(m=>m[0]===id);
    return [el.querySelector('h3')?.textContent||def?.[1]||'Administración',def?.[2]||'Personas, accesos y configuración del equipo.', '[data-space="'+id+'"]'];
   });
   const idx=steps.findIndex(x=>x[0]==='Tus espacios');steps.splice(idx+1,0,...modules);
  }
  return steps;
 }
 function visibleTarget(selector){
  const elements=selector?[...document.querySelectorAll(selector)]:[];
  return elements.find(el=>{if(el.closest('[hidden]'))return false;for(let p=el;p;p=p.parentElement){const style=getComputedStyle(p);if(style.display==='none'||style.visibility==='hidden')return false;}return true;})||null;
 }
 E.startTutorial=(id=moduleId(),first=false)=>{
  if(!TNT.profileComplete)return;id=canonical(id);if(!TUTORIALS[id])return;finishTutorial(false);
  let saved={};try{saved=JSON.parse(localStorage.getItem(key(id))||'{}');}catch{}
  const steps=tourSteps(id);tourPadding=document.body.style.paddingBottom;const base=parseFloat(getComputedStyle(document.body).paddingBottom)||0;document.body.style.paddingBottom=(base+innerHeight)+'px';tutorial={id,steps,step:saved.done?0:Math.min(saved.step||0,steps.length-1),first};paintTutorial();
 };
 function finishTutorial(done){
  if(!tutorial)return;const t=tutorial;if(done)localStorage.setItem(key(t.id),JSON.stringify({done:true,step:t.step}));
  tourVersion++;cancelAnimationFrame(tourFrame);tourObserver?.disconnect();tourObserver=null;
  document.getElementById('tnt-tutorial')?.remove();document.getElementById('tnt-tour-focus')?.remove();
  document.body.classList.remove('tnt-touring');document.body.style.paddingBottom=tourPadding;highlight?.classList.remove('tnt-tutorial-highlight');highlight=null;tutorial=null;
 }
 function positionTutorial(scroll=false){
  if(!tutorial)return;const d=document.getElementById('tnt-tutorial'),focus=document.getElementById('tnt-tour-focus');if(!d||!focus)return;
  const s=tutorial.steps[tutorial.step];let target=visibleTarget(s[2]);
  d.style.width=Math.min(360,(window.visualViewport?.width||innerWidth)-24)+'px';
  if(highlight!==target){highlight?.classList.remove('tnt-tutorial-highlight');highlight=target;highlight?.classList.add('tnt-tutorial-highlight');}
  const vp=window.visualViewport,view={width:vp?.width||innerWidth,height:vp?.height||innerHeight,
   top:(document.getElementById('tnt-shell')?.getBoundingClientRect().bottom||0)+12,
   bottom:document.getElementById('tnt-home-bottom')?88:16};
  if(!target){focus.hidden=true;d.style.left='12px';d.style.top=Math.max(view.top,view.height-d.offsetHeight-view.bottom)+'px';d.style.width=Math.min(360,view.width-24)+'px';return;}
  if(scroll){
   const track=target.closest('[data-space-track]');if(track)track.scrollTo?.({left:target.offsetLeft-(track.clientWidth-target.offsetWidth)/2,behavior:'instant'});
   let rect=target.getBoundingClientRect(),reserve=d.offsetHeight+24,maxTarget=Math.max(80,view.height-view.top-view.bottom-reserve);
   const desired=view.top+Math.max(0,(maxTarget-Math.min(rect.height,maxTarget))/2);
   const amount=rect.top-desired;
   // Scroll the nearest real scroll container as well as the page when needed.
   let parent=target.parentElement;
   while(parent&&parent!==document.body){const style=getComputedStyle(parent);
    if(/auto|scroll/.test(style.overflowY)&&parent.scrollHeight>parent.clientHeight+2){parent.scrollTop+=amount;break;}parent=parent.parentElement;
   }
   const remaining=target.getBoundingClientRect().top-desired;
   window.scrollTo?.({top:Math.max(0,scrollY+remaining),behavior:'instant'});
  }
  let rect=target.getBoundingClientRect();const panel={width:Math.min(360,view.width-24),height:d.offsetHeight};
  let placement=E.tourPlacement(rect,panel,view);
  if(placement.overlaps){
   const anchor=[...target.querySelectorAll('h1,h2,h3,b,input,button')].find(el=>{const r=el.getBoundingClientRect();return r.height>0&&r.top>=view.top&&r.bottom<view.height-view.bottom-panel.height-16;});
   if(anchor){rect=anchor.getBoundingClientRect();placement=E.tourPlacement(rect,panel,view);}
  }
  d.style.width=placement.width+'px';d.style.left=placement.x+'px';d.style.top=placement.y+'px';d.dataset.placement=placement.overlaps?'reserved':'adjacent';
  const top=Math.max(view.top,rect.top),bottom=Math.min(view.height-view.bottom,rect.bottom),left=Math.max(8,rect.left),right=Math.min(view.width-8,rect.right);
  focus.hidden=bottom<=top||right<=left;focus.style.cssText='left:'+left+'px;top:'+top+'px;width:'+Math.max(0,right-left)+'px;height:'+Math.max(0,bottom-top)+'px';
  if(placement.overlaps){focus.style.height=Math.max(0,placement.y-gapForTour()-top)+'px';}
 }
 function gapForTour(){return 14;}
 function queueTour(){cancelAnimationFrame(tourFrame);tourFrame=requestAnimationFrame(()=>positionTutorial());}
 function paintTutorial(){
  const t=tutorial;if(!t)return;const steps=t.steps,s=steps[t.step];tourVersion++;
  // Only navigation controls are activated by a tutorial. No save, delete, send
  // or attendance action ever runs automatically.
  if(s[3]){const nav=document.querySelector(s[3]);if(nav&&!nav.disabled&&nav.getAttribute('aria-current')!=='page'&&!nav.classList.contains('on'))nav.click();}
  const old=document.getElementById('tnt-tutorial');old?.remove();document.getElementById('tnt-tour-focus')?.remove();
  const focus=document.createElement('div');focus.id='tnt-tour-focus';focus.setAttribute('aria-hidden','true');document.body.append(focus);
  const d=document.createElement('aside');d.id='tnt-tutorial';d.setAttribute('role','dialog');d.setAttribute('aria-modal','false');d.setAttribute('aria-label','Tutorial de '+(MODULES.find(m=>m[0]===t.id)?.[1]||'TNT'));
  d.innerHTML='<header><span>CONOCÉ TNT · '+(t.step+1)+' DE '+steps.length+'</span><button data-skip aria-label="Omitir tutorial">'+TNTUI.icon('close')+'</button></header><progress value="'+(t.step+1)+'" max="'+steps.length+'"></progress><h2>'+esc(s.copyIndex===undefined?s[0]:E.text('tutorial.'+t.id+'.'+s.copyIndex+'.title',s[0]))+'</h2><p>'+esc(s.copyIndex===undefined?s[1]:E.text('tutorial.'+t.id+'.'+s.copyIndex,s[1]))+'</p><footer><button data-skip>Omitir</button><span></span>'+(t.step?'<button data-back aria-label="Paso anterior">Atrás</button>':'')+'<button class="primary" data-next>'+(t.step===steps.length-1?'Listo':'Siguiente')+' '+TNTUI.icon('arrow')+'</button></footer>';
  document.body.append(d);document.body.classList.add('tnt-touring');d.dataset.step=String(t.step);
  localStorage.setItem(key(t.id),JSON.stringify({done:false,step:t.step}));
  d.querySelectorAll('[data-skip]').forEach(b=>b.onclick=()=>finishTutorial(true));
  d.querySelector('[data-back]')?.addEventListener('click',()=>{t.step--;paintTutorial();});
  d.querySelector('[data-next]').onclick=()=>{if(t.step===steps.length-1)finishTutorial(true);else{t.step++;paintTutorial();}};
  positionTutorial(true);const version=tourVersion;
  requestAnimationFrame(()=>{if(version===tourVersion){positionTutorial(true);d.querySelector('[data-next]')?.focus({preventScroll:true});}});
  tourObserver?.disconnect();tourObserver=new MutationObserver(records=>{
   if(records.some(r=>!r.target.closest?.('#tnt-tutorial,#tnt-tour-focus')))queueTour();
  });tourObserver.observe(document.querySelector('#app,#camp-app,#attendance-app,#dashboardView')||document.body,{childList:true,subtree:true});
 }
 window.addEventListener('resize',queueTour);window.addEventListener('scroll',queueTour,true);
 window.visualViewport?.addEventListener('resize',queueTour);
 function tools(){document.getElementById('tnt-experience-tools')?.remove();document.querySelectorAll('.tnt-inline-tools').forEach(el=>el.remove());}
 let channel,queued=new Set(),liveTimer,identityBusy=false;
 E.subscribe=()=>{
  if(!TNT.sb.channel||!TNT.identity||channel)return;
  const tables=['tnt_experience','tnt_settings','tnt_events','tnt_event_members','tnt_tasks','tnt_task_assignees','tnt_schedule_days','tnt_schedule_items','tnt_schedule_responsibles','tnt_notifications','tnt_notification_state','tnt_chat_threads','tnt_chat_members','tnt_chat_messages','tnt_chat_reactions','tnt_people','tnt_accounts','tnt_access_grants','tnt_role_permission_presets','tnt_person_permission_overrides','tnt_profile_answers','tnt_camp_editions','tnt_camp_registrations','tnt_camp_payments','tnt_camp_settings','tnt_camp_resources','tnt_camp_assignments','tnt_camp_form_fields','tnt_camp_messages','tnt_camp_payment_plans','tnt_camp_plan_installments','tnt_camp_payment_exceptions','tnt_camp_sponsorships','tnt_efe_groups','tnt_efe_memberships','tnt_efe_meetings','tnt_efe_wednesday_attendance','tnt_saturday_members','tnt_saturday_attendance','sermons','topics','sermon_files','tnt_products','tnt_shifts','tnt_sales','tnt_orders','tnt_menu_items','tnt_expenses','tnt_debts','tnt_cash_closures','tnt_camp_churches','tnt_camp_penalties','tnt_camp_sponsors','tnt_camp_notification_templates','tnt_camp_outbox','tnt_access_requests','tnt_role_requests','tnt_profile_change_requests','tnt_profile_link_requests','tnt_profile_public_requests','tnt_audit_log'];
  channel=TNT.sb.channel('tnt-live-'+TNT.person.id+'-'+crypto.randomUUID());
  for(const table of tables)channel.on('postgres_changes',{event:'*',schema:'public',table},()=>{queued.add(table);clearTimeout(liveTimer);liveTimer=setTimeout(flushLive,180);});
  channel.subscribe(status=>{document.body.dataset.tntConnection=status==='SUBSCRIBED'?'live':'connecting';});
  window.addEventListener('pagehide',()=>{clearTimeout(liveTimer);TNT.sb.removeChannel(channel);channel=null;},{once:true});
 };
 async function flushLive(){const tables=[...queued];queued.clear();try{if(tables.includes('tnt_experience')){await E.load(TNT.sb);emit('tnt:config',E.config);blockedModule();}if(tables.some(t=>['tnt_accounts','tnt_access_grants','tnt_role_permission_presets','tnt_person_permission_overrides','tnt_people','tnt_profile_answers','tnt_settings'].includes(t))&&!identityBusy){identityBusy=true;try{await TNT.refreshIdentity();emit('tnt:permissions');blockedModule();if(TNT.module&&!TNT.profileComplete){TNT.blocked=true;location.replace('/?onboarding=1');}else if(TNT.module&&!TNT.isAdmin&&!TNT.hasAccess(TNT.module,TNT.scope||'*')){TNT.blocked=true;location.replace('/');}}finally{identityBusy=false;}}emit('tnt:data',{tables});}catch(e){console.warn('TNT live update',e);if(tables.includes('tnt_accounts')){TNT.blocked=true;location.replace('/');}}}
 document.addEventListener('tnt:ready',()=>{document.getElementById('tnt-entry-animation')?.remove();if(!window.TNT?.identity)return;E.paint();tools();blockedModule();E.subscribe();observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(applyCopy,100);});observer.observe(document.body,{childList:true,subtree:true});const id=moduleId();if(TNT.profileComplete&&TUTORIALS[id]&&TNT.module&&TNT.module!=='admin'&&!localStorage.getItem(key(id)))setTimeout(()=>{if(!document.querySelector('dialog[open],#modal.on')&&!TNT.blocked)E.startTutorial(id,true);},1200);});
 document.addEventListener('tnt:membership',()=>{tools();E.subscribe();});
 document.addEventListener('tnt:error',()=>document.getElementById('tnt-entry-animation')?.remove());
 document.addEventListener('tnt:config',()=>{E.paint();blockedModule();});
 if(document.body.dataset.tntModule){const entry=document.createElement('div');entry.id='tnt-entry-animation';entry.innerHTML=E.loader();document.body.append(entry);}
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tutorial)finishTutorial(true);});
})();
