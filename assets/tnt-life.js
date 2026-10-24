/* Small personal spaces: a real reader, three Bible games, and the approved profile/photo flow. */
(() => {
  'use strict';
  const U=window.TNTUI, G=window.TNTBibleGames, app=document.getElementById('app');
  const area=document.body.dataset.lifeArea;
  let timer=null, game=null, difficulty='normal', gameKind='order', readVersion=0, photoPreview=null;
  const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
  const key=name=>'tnt:life:'+TNT.person.id+':'+name;
  const icons={camera:'<path d="M14 5l-1-2H7L6 5H3a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2z"/><circle cx="11" cy="12" r="4"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8z"/>',play:'<path d="M8 4l12 8-12 8z"/>',pause:'<path d="M8 4v16M16 4v16"/>',trophy:'<path d="M7 3h10v6a5 5 0 01-10 0zM7 5H3v3a4 4 0 004 4m10-7h4v3a4 4 0 01-4 4m-5 2v5m-4 2h8"/>'};
  const icon=n=>icons[n]?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[n]+'</svg>':U.icon(n);
  const symbol=(name,tone='')=>'<span class="life-symbol '+tone+'">'+icon(name)+'</span>';
  const arrow=()=>icon('arrow');
  const row=(name,title,description,attrs,tone='')=>'<button type="button" class="life-row" '+attrs+'>'+symbol(name,tone)+'<span><b>'+U.esc(title)+'</b>'+(description?'<small>'+U.esc(description)+'</small>':'')+'</span>'+arrow()+'</button>';
  function bookArt(){return '<svg class="life-book-art" viewBox="0 0 360 220" role="img" aria-label="Una Biblia abierta"><ellipse cx="179" cy="159" rx="145" ry="52" fill="currentColor" opacity=".045"/><path d="M37 150C-3 51 109 10 177 54c85-65 164 21 144 109z" fill="#b9e3d1" opacity=".55"/><path d="M290 177c2-50 4-90-17-130m15 84c33-12 46-35 36-54-20 6-35 27-36 54zm-3-29c-32-5-42-23-33-41 21 3 31 20 33 41z" fill="#609d87"/><path d="M45 174l27-93c41-15 73-3 105 17 35-20 74-23 109-9l22 91-131-14z" fill="#386c61"/><path d="M56 161l24-88c41-16 71-4 98 18v78c-38-21-78-28-122-8z" fill="#fffdf6"/><path d="M178 169V91c29-23 62-27 100-14l17 90c-43-17-78-16-117 2z" fill="#f5f0e4"/><path d="M178 91v78" stroke="#d6cdbc" stroke-width="3"/><g fill="none" stroke="#d8d2c5" stroke-width="3" stroke-linecap="round"><path d="M93 92c25-8 45-2 66 11m-71 6c26-8 47-2 70 10m-75 7c29-8 51-1 75 9m-78 7c29-7 52 0 78 8M198 104c24-13 44-13 65-6m-65 21c24-12 45-12 68-5m-68 20c26-12 46-12 71-5m-71 20c26-12 47-12 74-4"/></g></svg>';}
  function header(){const label={community:'Comunidad',profile:'Perfil',bible:'Biblia',games:'Juegos'}[area]||'TNT';return '<header class="life-header"><a class="life-brand" href="/" aria-label="Inicio TNT"><img src="/icons/dynamite-app.svg?v=20261013" alt="TNT"><span>'+label+'</span></a><div class="life-header-tools">'+(TNT.isAdmin?'<a class="life-icon" data-life-admin href="/admin/?tab=settings" aria-label="Configuración de TNT">'+icon('settings')+'</a>':'')+'<button class="life-icon" data-life-theme aria-label="Cambiar tema">'+icon(document.documentElement.dataset.tntTheme==='dark'?'sun':'moon')+'</button><button class="life-icon" data-notifications aria-label="Mis avisos">'+icon('bell')+'</button><button class="life-icon" data-account data-tnt-user aria-label="Mi cuenta">'+U.avatar(TNT.person,{...TNT.account,avatar_url:TNT.avatar()})+'</button></div></header>';}
  function title(text,href='/comunidad'){return '<div class="life-title"><a class="life-icon" href="'+href+'" aria-label="Volver">'+icon('back')+'</a><h1>'+U.esc(text)+'</h1></div>';}
  function layout(body){app.innerHTML=header()+'<main class="life-page">'+body+'</main>';app.querySelector('[data-account]').onclick=()=>TNTAccounts.openMenu();app.querySelector('[data-life-theme]').onclick=()=>{TNT.toggleTheme();app.querySelector('[data-life-theme]').innerHTML=icon(document.documentElement.dataset.tntTheme==='dark'?'sun':'moon');};app.querySelector('[data-notifications]').onclick=()=>TNTNotifications.open();TNTNavigation.mount();window.TNTNotifications?.badges();}
  function goPhoto(){location.href='/perfil?view=photo';}
  function community(){return TNTCommunity.mount();}
  function profile(){
    const view=new URLSearchParams(location.search).get('view');
    if(view==='photo')return photo();if(view==='preferences')return preferences();
    const role=(TNT.account.ministry_role||'Comunidad')+(TNT.isAdmin?' · Administrador':'');
    layout(title('Perfil','/')+'<section class="life-profile">'+U.avatar(TNT.person,{...TNT.account,avatar_url:TNT.avatar()},'portrait')+'<h2>'+U.esc(U.personName(TNT.person.full_name||TNT.displayName()))+'</h2><span class="life-profile-role">'+U.esc(role)+'</span><button class="life-button outline" data-photo>'+icon('camera')+'Cambiar foto</button></section><div class="life-profile-links">'+row('people','Mis datos','Tus datos y tu historia en TNT','data-edit-profile')+((TNT.isStaff||TNT.isAdmin)?row('calendar','Mis responsabilidades','Encuentros y equipos','data-my-activities'):row('check','Mi camino en TNT','Mis asistencias','data-my-attendance'))+row('bell','Avisos y notificaciones','En la app y en tu celular','data-phone')+row('edit','Apariencia de TNT','Elegí tu paleta y modo de pantalla','data-appearance')+row('help','Cómo se usa','Una guía paso a paso','data-guide')+row('settings','Mis preferencias','Contenido diario y cuentas','data-preferences','lilac')+'</div>');
    app.querySelector('[data-photo]').onclick=goPhoto;
    app.querySelector('[data-edit-profile]').onclick=()=>TNTProfileEditor.open(TNT.person.id);
    app.querySelector('[data-preferences]').onclick=()=>location.href='/perfil?view=preferences';
    app.querySelector('[data-phone]').onclick=()=>TNTNotifications.phone();
    app.querySelector('[data-appearance]').onclick=()=>TNTAppearance.open();
    app.querySelector('[data-guide]').onclick=()=>TNTExperience.startTutorial();
    app.querySelector('[data-my-activities]')?.addEventListener('click',()=>location.href='/organizacion?view=my');
    app.querySelector('[data-my-attendance]')?.addEventListener('click',()=>TNT.showMyAttendance());
    if(new URLSearchParams(location.search).has('edit')){history.replaceState(null,'','/perfil');TNTProfileEditor.open(TNT.person.id);}
  }
  function preferences(){
    layout(title('Mis preferencias','/perfil')+row('sun','Apariencia',document.documentElement.dataset.tntTheme==='dark'?'Modo oscuro':'Modo claro','data-theme','lilac')+row('bell','Avisos en mi teléfono','Elegí cómo recibir tus novedades','data-phone')+row('heart','En comunidad','Cumpleaños, contenido diario y recordatorios','data-community-prefs')+row('people','Mis cuentas','Cambiar o agregar una cuenta de Google','data-accounts')+'<button class="life-text-button" data-logout>Cerrar sesión</button>');
    app.querySelector('[data-theme]').onclick=()=>TNTAppearance.open();
    app.querySelector('[data-phone]').onclick=()=>TNTNotifications.phone();
    app.querySelector('[data-community-prefs]').onclick=()=>TNTCommunity.preferences();
    app.querySelector('[data-accounts]').onclick=()=>TNTAccounts.open();
    app.querySelector('[data-logout]').onclick=()=>TNT.logout();
  }
  async function imageBlob(file){
    if(!file||!file.size)throw Error('No recibimos una foto. Elegí el archivo otra vez.');
    if(file.size>15*1024*1024)throw Error('Elegí una foto de menos de 15 MB.');
    const buffer=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('No pudimos abrir el archivo. Elegilo otra vez desde Fotos o Galería.'));r.readAsArrayBuffer(file);});
    const bytes=new Uint8Array(buffer),isJpeg=bytes[0]===255&&bytes[1]===216,isPng=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,isWebp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if(!isJpeg&&!isPng&&!isWebp)throw Error('Esta foto no se puede abrir en tu navegador. Elegí una copia JPG, PNG o WebP desde la galería.');
    const source=new Blob([buffer],{type:isJpeg?'image/jpeg':isPng?'image/png':'image/webp'});
    let picture,objectUrl=null;
    try{
      if(window.createImageBitmap){try{picture=await createImageBitmap(source,{imageOrientation:'from-image'});}catch{}}
      if(!picture){
        const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>img.naturalWidth?resolve(img):reject(Error('decode'));img.onerror=()=>reject(Error('decode'));img.src=src;});
        objectUrl=URL.createObjectURL(source);try{picture=await load(objectUrl);}catch{
          const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(source);});picture=await load(data);
        }
      }
      const w=picture.naturalWidth||picture.width,h=picture.naturalHeight||picture.height;
      if(!w||!h)throw Error('decode');
      const ratio=Math.min(1,1024/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
      const context=canvas.getContext('2d');context.drawImage(picture,0,0,canvas.width,canvas.height);
      let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));
      if(!blob)blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
      if(!blob||blob.size>2*1024*1024)throw Error('size');return blob;
    }catch{throw Error('No pudimos preparar esta imagen. Probá otra foto o guardá una copia JPG desde tu galería.');}
    finally{picture?.close?.();if(objectUrl)URL.revokeObjectURL(objectUrl);}
  }
  function photo(){
    if(photoPreview){URL.revokeObjectURL(photoPreview);photoPreview=null;}
    const a=TNT.account,initial=a.avatar_source==='custom'?'custom':'google';let selectedFile=null,selection=0;
    const google=TNT.session?.user?.user_metadata?.avatar_url||TNT.session?.user?.user_metadata?.picture||a.avatar_google_url||'';
    layout(title('Foto de perfil','/perfil')+'<div class="life-photo-preview" data-photo-preview>'+U.avatar(TNT.person,{...a,avatar_url:TNT.avatar()},'portrait')+'</div><form id="life-photo-form"><label class="life-photo-option"><input type="radio" name="source" value="custom" '+(initial==='custom'?'checked':'')+'>'+symbol('upload','lilac')+'<span><strong>Subir una foto</strong><small>Elegí una foto desde tu dispositivo</small></span></label><input type="file" id="life-photo-file" accept="image/*" hidden><button type="button" class="life-text-button" data-select-file>Elegir archivo</button><label class="life-photo-option"><input type="radio" name="source" value="google" '+(initial==='google'?'checked':'')+' '+(!google?'disabled':'')+'><span class="life-symbol life-google" aria-hidden="true">G</span><span><strong>Usar foto de Google</strong><small>'+(google?'Usar tu foto de Google actual':'Disponible al iniciar sesión con Google')+'</small></span></label><label class="life-switch"><span><b>Mantener sincronizada con Google</b><small>Actualizar al volver a iniciar sesión</small></span><input type="checkbox" name="sync" role="switch" '+(a.avatar_sync!==false?'checked':'')+'></label><p class="life-small">Tu foto se usa en tu perfil, equipos y conversaciones de TNT.</p><p class="life-status" role="status" aria-live="polite"></p><button class="life-button full" type="submit">Guardar foto</button></form>');
    const form=app.querySelector('form'),input=form.querySelector('[type=file]'),status=form.querySelector('[role=status]'),button=form.querySelector('[type=submit]');
    const preview=url=>{const host=app.querySelector('[data-photo-preview]');if(!url)return;host.replaceChildren();const wrap=document.createElement('span');wrap.className='tnt-person-avatar portrait';const img=new Image();img.alt='Vista previa de tu foto';img.src=url.startsWith('blob:')?url:U.photoUrl(url,512);img.referrerPolicy='no-referrer';wrap.append(img);host.append(wrap);};
    const adjust=()=>{const custom=form.elements.source.value==='custom';form.elements.sync.disabled=custom;form.querySelector('[data-select-file]').hidden=!custom;preview(custom?(photoPreview||a.avatar_url):google);};
    form.querySelectorAll('[name=source]').forEach(r=>r.onchange=adjust);adjust();
    form.querySelector('[data-select-file]').onclick=()=>input.click();
    input.onchange=async()=>{if(!input.files[0])return;const request=++selection;button.disabled=true;status.classList.remove('error');status.textContent='Preparando tu foto…';try{const ready=await imageBlob(input.files[0]);if(request!==selection)return;selectedFile=ready;if(photoPreview)URL.revokeObjectURL(photoPreview);photoPreview=URL.createObjectURL(selectedFile);preview(photoPreview);status.textContent='Tu foto está lista para guardar.';}catch(e){if(request===selection){selectedFile=null;status.textContent=e.message;status.classList.add('error');}}finally{if(request===selection)button.disabled=false;}};
    form.onsubmit=async event=>{
      event.preventDefault();if(button.disabled)return;button.disabled=true;status.classList.remove('error');status.textContent='Guardando tu foto…';let uploaded=null;
      try{
        const source=form.elements.source.value;let path=null;
        if(source==='custom'){
          if(selectedFile){
            const extension=selectedFile.type==='image/webp'?'webp':selectedFile.type==='image/jpeg'?'jpg':'png';
            path=TNT.session.user.id+'/'+crypto.randomUUID()+'.'+extension;
            const r=await TNT.sb.storage.from('tnt-profile-photos').upload(path,selectedFile,{contentType:selectedFile.type,cacheControl:'3600',upsert:false});
            if(r.error)throw r.error;uploaded=path;
          }else{
            const marker='/storage/v1/object/public/tnt-profile-photos/';
            path=a.avatar_source==='custom'&&a.avatar_url?.includes(marker)?a.avatar_url.split(marker)[1]:null;
            if(!path&&a.avatar_source!=='custom')throw Error('Elegí una foto antes de guardar.');
          }
        }
        const r=await TNT.sb.rpc('tnt_set_profile_photo',{p_source:source,p_path:path,p_sync:source==='google'&&form.elements.sync.checked});
        if(r.error)throw r.error;uploaded=null;
        await TNT.refreshIdentity();document.dispatchEvent(new CustomEvent('tnt:profile',{detail:{personId:TNT.person.id}}));
        U.toast('Tu foto se actualizó en TNT.');location.href='/perfil';
      }catch(e){if(uploaded)await TNT.sb.storage.from('tnt-profile-photos').remove([uploaded]).catch(()=>{});status.textContent=e.message||'No pudimos guardar tu foto. Volvé a intentar.';status.classList.add('error');button.disabled=false;}
    };
  }
  async function api(action,values={}){
    const session=await TNT.sb.auth.getSession(),token=session.data?.session?.access_token||TNT.session?.access_token;
    if(!token)throw Error('Volvé a iniciar sesión para leer la Biblia.');
    const response=await fetch('/api/bible?'+new URLSearchParams({action,...values}),{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(20000)});
    const data=await response.json();if(!response.ok){const error=Error(data.error||'No pudimos cargar la lectura.');error.code=data.code;throw error;}return data;
  }
  function cleanPassage(html){
    const template=document.createElement('template');template.innerHTML=String(html||'');
    template.content.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta,svg,math').forEach(n=>n.remove());
    template.content.querySelectorAll('*').forEach(n=>{for(const attribute of [...n.attributes]){if(attribute.name.startsWith('on')||['srcdoc','style'].includes(attribute.name)||(attribute.name==='href'&&!U.safeUrl(attribute.value)))n.removeAttribute(attribute.name);}});
    return template.innerHTML;
  }
  function readingError(error,retry){
    const root=app.querySelector('[data-reader]');if(!root)return;
    root.innerHTML='<div class="life-state" role="alert"><h2>La lectura está en preparación</h2><p>'+U.esc(error.message)+'</p>'+(TNT.isAdmin&&['LICENSE_REQUIRED','BIBLE_NOT_CONFIGURED'].includes(error.code)?'<p class="life-small">Administración: falta habilitar la conexión o la licencia de esta traducción.</p>':'')+'<button class="life-button outline" data-retry>Reintentar</button></div>';
    root.querySelector('[data-retry]').onclick=retry;
  }
  async function bible(){
    layout(title('Biblia en comunidad')+'<p class="life-lead">Elegí tu lectura. Retomá donde te quedaste.</p><div data-reader><p class="life-reader-loading" role="status">Preparando tu lectura…</p></div>');
    const root=app.querySelector('[data-reader]'),requested=[{id:1909,title:'Reina-Valera 1909',short:'RVR 1909'},{id:149,title:'Reina-Valera 1960',short:'RVR 1960'},{id:1782,title:'Reina Valera Actualizada 2015',short:'RVA 2015'},{id:127,title:'Nueva Traducción Viviente',short:'NTV'},{id:128,title:'Nueva Versión Internacional 2025',short:'NVI 2025'},{id:2664,title:'Nueva Versión Internacional 2015',short:'NVI 2015'}];
    let previous=safeRead(key('reading'),{}),available=[],unavailable=[],translations=[...requested],catalogError=false;
    function catalog(data){
      available=(data.versions||[]).map(v=>({id:Number(v.id),title:String(v.title||''),short:String(v.abbreviation||v.title||'')})).filter(v=>Number.isInteger(v.id)&&v.id>0&&v.id!==1909);
      unavailable=data.unavailable||[];translations=[requested[0],...available,...requested.slice(1).filter(v=>!available.some(a=>a.id===v.id))];catalogError=false;
    }
    try{const [result,community]=await Promise.allSettled([api('versions'),TNTCommunity.load()]);if(result.status==='fulfilled')catalog(result.value);else catalogError=true;if(community.status==='fulfilled'&&community.value.preferences?.reading?.book)previous={...previous,...community.value.preferences.reading};}catch{catalogError=true;}
    if(!root.isConnected)return;
    const params=new URLSearchParams(location.search),ref=params.get('ref'),parts=ref?.split('.')||[];
    let version=translations.find(v=>v.id===Number(params.get('v')||previous.version))||translations.find(v=>v.id===1909),books=G.books.map(b=>({...b,chapters:Array.from({length:b.chapters},(_,i)=>({id:i+1}))})),book=books.find(b=>b.id===(parts[0]||previous.book))||books[0],chapter=Number(parts[1]||previous.chapter)||1,verse=parts[2]||'',size=Math.min(30,Math.max(17,Number(previous.size)||21)),credit='',serial=0,persistTimer;
    if(!book.chapters.some(c=>c.id===chapter))chapter=1;
    const inline=id=>id===1909||available.some(v=>v.id===id);
    const access=id=>unavailable.find(v=>v.id===id)?.code||'ACCESS_UNKNOWN';
    function versionOptions(){
      const option=v=>'<option value="'+v.id+'" '+(version.id===v.id?'selected':'')+'>'+U.esc(v.short+' · '+v.title)+'</option>';
      return '<optgroup label="Leer dentro de TNT">'+translations.filter(v=>inline(v.id)).map(option).join('')+'</optgroup><optgroup label="Lectura oficial en Bible.com">'+translations.filter(v=>!inline(v.id)).map(option).join('')+'</optgroup>';
    }
    const passage=()=>book.id+'.'+chapter+(verse?'.'+verse:'');
    const external=()=>TNTCommunity.readLink(passage(),version.id);
    function canonicalIndex(){books=G.books.map(b=>({...b,chapters:Array.from({length:b.chapters},(_,i)=>({id:i+1}))}));book=books.find(b=>b.id===book.id)||books[0];if(!book.chapters.some(c=>c.id===chapter))chapter=1;}
    const persist=()=>{const value={version:version.id,book:book.id,chapter,size};save(key('reading'),value);clearTimeout(persistTimer);persistTimer=setTimeout(()=>TNTCommunity.action('preferences',{reading:value}).catch(()=>{}),600);};
    root.innerHTML='<div class="life-reader-toolbar"><span class="life-pill" data-version-name></span><div class="life-reader-fonts"><button class="life-icon" data-smaller aria-label="Reducir tamaño de letra">A</button><button class="life-icon" data-larger aria-label="Aumentar tamaño de letra">A</button></div></div><label class="c-reader-version">Traducción<select data-version>'+versionOptions()+'</select></label><div class="life-reader-controls"><label>Libro<select data-book></select></label><label>Capítulo<select data-chapter></select></label></div><form class="c-reader-jump"><label class="sr-only" for="reader-reference">Ir a una referencia</label><input id="reader-reference" name="reference" placeholder="Ir a Juan 3:16" autocomplete="off"><button class="life-button outline" type="submit">Ir</button></form><p class="life-status" data-jump-status role="status"></p><article class="life-reading" data-reading data-yv-sdk data-slot="yv-bible-renderer" aria-live="polite"></article><div class="life-chapter-nav"><button class="life-button outline" data-prev>'+icon('back')+'Anterior</button><button class="life-button outline" data-next>Siguiente '+arrow()+'</button></div><p class="life-attribution" data-attribution></p>';
    const bookSelect=root.querySelector('[data-book]'),chapterSelect=root.querySelector('[data-chapter]'),text=root.querySelector('[data-reading]');
    function target(direction){const i=book.chapters.findIndex(c=>c.id===chapter)+direction;if(i>=0&&i<book.chapters.length)return{book,chapter:book.chapters[i].id};const b=books[books.indexOf(book)+direction];return b?{book:b,chapter:direction>0?b.chapters[0].id:b.chapters.at(-1).id}:null;}
    function controls(){bookSelect.innerHTML=books.map(b=>'<option value="'+b.id+'" '+(b.id===book.id?'selected':'')+'>'+U.esc(b.name)+'</option>').join('');chapterSelect.innerHTML=book.chapters.map(c=>'<option value="'+c.id+'" '+(c.id===chapter?'selected':'')+'>'+c.id+'</option>').join('');root.querySelector('[data-version-name]').textContent=version.short;root.querySelector('[data-prev]').disabled=!target(-1);root.querySelector('[data-next]').disabled=!target(1);text.style.setProperty('--reading-size',size+'px');root.querySelector('[data-attribution]').textContent=credit;}
    function fallback(error){
      const code=error?.code||access(version.id),message=code==='VERSION_UNAVAILABLE'?'Esta versión se lee en Bible.com. YouVersion no ofrece su texto para la conexión de TNT.':code==='LICENSE_REQUIRED'?'Esta traducción necesita que se habilite su licencia para leerla dentro de TNT. Podés abrir este mismo pasaje en Bible.com.':code==='PASSAGE_NOT_FOUND'?'No encontramos ese pasaje en esta traducción. Probá otra referencia o abrilo en Bible.com.':'No pudimos conectar la lectura. Podés intentar de nuevo o abrir el pasaje en Bible.com.';
      text.innerHTML='<div class="c-reader-external"><span class="life-symbol">'+icon('book')+'</span><span class="life-eyebrow">'+U.esc(version.short)+'</span><h2>'+U.esc(book.name+' '+chapter+(verse?':'+verse:''))+'</h2><p>'+message+'</p><a class="life-button" href="'+external()+'" target="_blank" rel="noopener noreferrer">Leer en Bible.com '+arrow()+'</a><button class="life-button outline" data-reader-local>Leer acá en RVR 1909</button><button class="life-text-button" data-reader-retry>Revisar conexión</button>'+(TNT.isAdmin&&code==='LICENSE_REQUIRED'?'<a class="life-text-button" href="https://platform.youversion.com/" target="_blank" rel="noopener noreferrer">Revisar licencia en YouVersion</a>':'')+'<small>La lectura se abre fuera de TNT. Tu lugar queda guardado acá.</small></div>';
      text.querySelector('[data-reader-local]').onclick=()=>{version=translations.find(v=>v.id===1909);root.querySelector('[data-version]').value='1909';root.querySelector('[data-version]').dispatchEvent(new Event('change',{bubbles:true}));};
      text.querySelector('[data-reader-retry]').onclick=async e=>{const selected=version.id;e.target.disabled=true;try{catalog(await api('versions'));if(!root.isConnected||version.id!==selected)return;version=translations.find(v=>v.id===selected)||version;root.querySelector('[data-version]').innerHTML=versionOptions();}catch{catalogError=true;}if(root.isConnected&&version.id===selected)changeVersion();};root.querySelector('[data-attribution]').textContent='Acceso a la lectura oficial en YouVersion / Bible.com.';
    }
    async function read(){
      const request=++serial;credit='';controls();persist();
      if(!inline(version.id)){fallback(catalogError?Error('connection'):null);return;}
      text.textContent='Cargando '+book.name+' '+chapter+'…';
      try{const result=version.id===1909?await TNTBibleText.passage(passage()):await api('passage',{version:version.id,passage:passage()});if(request!==serial||!text.isConnected)return;text.innerHTML=cleanPassage(result.content);text.dataset.yvTheme=document.documentElement.dataset.tntTheme==='dark'?'dark':'light';credit=result.copyright;root.querySelector('[data-attribution]').textContent=credit;
       if(version.id!==1909&&!document.getElementById('life-bible-fonts'))api('fonts').then(({css})=>{if(!css||document.getElementById('life-bible-fonts'))return;const style=document.createElement('style');style.id='life-bible-fonts';style.textContent=css;document.head.append(style);}).catch(()=>{});
      }catch(e){if(request===serial)fallback(e);}
    }
    async function changeVersion(){const request=++serial;root.querySelector('[data-version]').disabled=true;credit='';controls();text.textContent='Preparando '+version.short+'…';
      try{if(version.id!==1909&&inline(version.id)){const index=await api('index',{version:version.id});if(request!==serial)return;const list=(index.books||[]).map(b=>({...b,name:G.books.find(x=>x.id===b.id)?.name,chapters:(b.chapters||[]).map(c=>({...c,id:Number(c.id)})).filter(c=>Number.isInteger(c.id)&&c.id>0)})).filter(b=>b.name&&b.chapters.length);if(list.length){books=list;book=books.find(b=>b.id===book.id)||books[0];if(!book.chapters.some(c=>c.id===chapter))chapter=book.chapters[0].id;}}
       else canonicalIndex();
      }catch{if(request===serial)canonicalIndex();/* An index timeout does not revoke a translation's license. */}finally{root.querySelector('[data-version]').disabled=false;}if(request===serial)await read();
    }
    root.querySelector('[data-version]').onchange=e=>{version=translations.find(v=>v.id===Number(e.target.value));changeVersion();};
    bookSelect.onchange=()=>{book=books.find(b=>b.id===bookSelect.value);chapter=book.chapters[0].id;verse='';read();};chapterSelect.onchange=()=>{chapter=Number(chapterSelect.value);verse='';read();};
    for(const [selector,dir] of [['[data-prev]',-1],['[data-next]',1]])root.querySelector(selector).onclick=()=>{const to=target(dir);if(to){({book,chapter}=to);verse='';read();text.scrollIntoView({behavior:'smooth',block:'start'});}};
    root.querySelector('[data-smaller]').onclick=()=>{size=Math.max(17,size-2);text.style.setProperty('--reading-size',size+'px');persist();};root.querySelector('[data-larger]').onclick=()=>{size=Math.min(30,size+2);text.style.setProperty('--reading-size',size+'px');persist();};
    root.querySelector('form').onsubmit=e=>{e.preventDefault();const parsed=TNTCommunity.reference(e.target.elements.reference.value),[id,c,v]=parsed.split('.'),found=books.find(b=>b.id===id),status=root.querySelector('[data-jump-status]');if(!found||!found.chapters.some(ch=>ch.id===Number(c))){status.textContent='Revisá la referencia. Por ejemplo: Juan 3:16.';return;}status.textContent='';book=found;chapter=Number(c);verse=v||'';read();};
    await changeVersion();
  }
  const gameDescriptions={order:{title:'Ordená los libros',copy:'Armá el recorrido de los libros, uno por uno. Cada ronda suma un nuevo tramo.',icon:'book',detail:'3 rondas · orden bíblico',how:'Tocá primero el libro que aparece antes en la Biblia. Seguimos con el próximo hasta completar la fila.'},characters:{title:'¿Quién soy?',copy:'Historias, decisiones y personas que dejaron huella. Descubrí a quién pertenece cada pista.',icon:'people',detail:'10 historias · 4 opciones',how:'Leé la pista y elegí un personaje. Después de acertar, vas a encontrar la referencia para conocer su historia.'},testament:{title:'¿Antiguo o Nuevo?',copy:'Recorré los 66 libros y descubrí a qué parte de la Biblia pertenece cada uno.',icon:'check',detail:'10 libros · dos caminos',how:'El Antiguo Testamento tiene 39 libros; el Nuevo, 27. Ubicá cada libro y conocé un poco más de él.'},pairs:{title:'Historias que se encuentran',copy:'Una persona, un objeto, un momento. Uní cada personaje con su historia.',icon:'heart',detail:'3 tableros · parejas bíblicas',how:'Elegí dos tarjetas que estén relacionadas. Por ejemplo, Noé y un arca. Cada pareja correcta queda marcada.'},timeline:{title:'El hilo de la historia',copy:'Ordená los acontecimientos y descubrí cómo se conectan a lo largo de la Biblia.',icon:'clock',detail:'3 recorridos · 5 momentos',how:'Tocá los acontecimientos desde el que sucedió primero hasta el más reciente. No hace falta saber las fechas.'},quiz:{title:'Las preguntas del equipo',copy:'Un desafío preparado por quienes comparten tu camino en TNT.',icon:'help',detail:'Preguntas de Comunidad',how:'Elegí una respuesta y descubrí la explicación que preparó el equipo.'}};
  let customQuiz=null,runId=null,runStored=false,gameStarted=0,feedbackMessage='';
  async function syncRuns(){const queue=safeRead(key('pending-games'),[]);let remaining=[...queue];for(const run of queue){try{await TNTCommunity.action('save_game',run);remaining=remaining.filter(r=>r.id!==run.id);save(key('pending-games'),remaining);}catch{break;}}return remaining.length;}
  async function games(){
    clearInterval(timer);game=null;customQuiz=null;
    try{await TNTCommunity.load();}catch{}
    syncRuns().catch(()=>{});
    const bank=TNTCommunity.gameBank(),quizId=new URLSearchParams(location.search).get('quiz');if(quizId){customQuiz=bank.find(q=>q.id===quizId);if(customQuiz)return setupGame('quiz');}
    const records=TNTCommunity.data?.games||[],wins=records.reduce((n,r)=>n+Number(r.wins),0),plays=records.reduce((n,r)=>n+Number(r.plays),0);
    layout(title('Juegos bíblicos')+'<p class="life-lead">Jugá, descubrí una historia y llevate algo nuevo.</p><section class="g-journey"><span class="life-symbol lilac">'+icon('trophy')+'</span><div><b>Tu recorrido</b><small>'+plays+' '+(plays===1?'partida':'partidas')+' · '+wins+' '+(wins===1?'desafío completado':'desafíos completados')+'</small></div><span class="g-journey-stamp">TNT</span></section><div class="life-game-library">'+Object.entries(gameDescriptions).filter(([id])=>id!=='quiz').map(([id,q],i)=>{const best=Math.max(0,...records.filter(r=>r.kind===id).map(r=>r.best));return '<article class="life-card life-game-card '+(!i?'life-feature':'')+'"><div class="g-card-top">'+symbol(q.icon,i%2?'lilac':'')+'<span class="g-game-number">0'+(i+1)+'</span></div><span class="life-eyebrow">'+q.detail+'</span><h2>'+q.title+'</h2><p>'+q.copy+'</p>'+(best?'<small class="g-best">Tu marca: '+best+' puntos</small>':'')+'<button class="life-button '+(i?'outline':'')+'" data-game="'+id+'">Jugar '+icon('play')+'</button></article>';}).join('')+'</div>'+(bank.length?'<h2 class="c-section-title">Preparados por tu equipo</h2>'+bank.map(q=>'<button class="c-content-card" data-custom-quiz="'+q.id+'"><div><span class="life-eyebrow">Comunidad · '+q.config.questions.length+' preguntas</span><h3>'+U.esc(q.title)+'</h3><p>'+U.esc(q.description)+'</p></div>'+arrow()+'</button>').join(''):'')+'<p class="life-small">Tus marcas son personales. Las pistas y explicaciones te ayudan a seguir aprendiendo, a tu ritmo.</p>');
    app.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>setupGame(b.dataset.game));app.querySelectorAll('[data-custom-quiz]').forEach(b=>b.onclick=()=>{customQuiz=bank.find(q=>q.id===b.dataset.customQuiz);setupGame('quiz');});
  }
  const gameTitle=()=>gameKind==='quiz'?customQuiz?.title||gameDescriptions.quiz.title:gameDescriptions[gameKind].title;
  function setupGame(kind){
    clearInterval(timer);game=null;gameKind=kind;const q=gameDescriptions[kind],settings=TNTCommunity.gameSettings();
    layout(title(gameTitle(),'/juegos')+'<section class="life-card life-feature '+(kind==='pairs'||kind==='characters'?'lilac':'')+'"><div class="g-setup-art" aria-hidden="true">'+icon(q.icon)+'<i>✦</i><span>'+({order:'01 → 66',characters:'¿Quién?',testament:'39 + 27',pairs:'Vos + historia',timeline:'Antes → después',quiz:'Pensá + elegí'}[kind])+'</span></div><h2>Un nuevo desafío</h2><p>'+q.how+'</p><div class="g-rules"><span>'+icon('heart')+(settings.lives||3)+' vidas</span><span>'+icon('clock')+'Con tiempo</span><span>'+icon('help')+'Una pista</span></div></section><form data-game-setup><fieldset class="life-difficulties"><legend>Elegí tu próximo paso</legend>'+Object.entries(G.levels).map(([id,l])=>'<label><input type="radio" name="difficulty" value="'+id+'" '+(id==='normal'?'checked':'')+'><span><b>'+l.label+'</b><small>'+(settings[id+'_seconds']||l.seconds)+' segundos'+(kind==='order'?' · '+l.count+' libros':kind==='pairs'?' · '+l.pairs+' parejas por tablero':'')+'</small></span></label>').join('')+'</fieldset><p class="life-small">Al acertar, el reloj se detiene para que puedas leer la explicación. Podés pausar cuando necesites.</p><button class="life-button full" type="submit">Empezar '+icon('play')+'</button></form>');
    app.querySelector('form').onsubmit=e=>{e.preventDefault();difficulty=e.target.elements.difficulty.value;game=new G.Game(kind,difficulty,{seconds:settings[difficulty+'_seconds'],lives:settings.lives,questions:customQuiz?.config.questions});runId=crypto.randomUUID();runStored=false;feedbackMessage='';gameStarted=Date.now();game.start();drawGame();timer=setInterval(clock,200);};
  }
  function stats(){return '<div class="life-game-stats"><span class="life-hearts" role="img" aria-label="'+game.lives+' vidas">'+Array.from({length:game.maxLives},(_,i)=>'<span class="'+(i>=game.lives?'spent':'')+'">'+icon('heart')+'</span>').join('')+'</span><span class="g-clock '+(game.seconds<20?'urgent':'')+'">'+icon('clock')+'<b data-clock aria-label="Tiempo restante">'+game.seconds+' s</b></span><button class="life-icon" data-pause aria-label="Pausar juego">'+icon('pause')+'</button></div>';}
  function clock(){if(!game)return;game.tick();if(['won','lost'].includes(game.status)){clearInterval(timer);return resultGame();}const clock=app.querySelector('[data-clock]');if(clock){clock.textContent=game.seconds+' s';clock.parentElement.classList.toggle('urgent',game.seconds<20);}}
  function drawGame(){
    const q=game.current,order=game.ordered,pairs=game.kind==='pairs',selected=order?q.answer.slice(0,game.position):[],name=id=>q.choices.find(c=>c.id===id)?.name||id;
    layout(title(gameTitle(),'/juegos')+stats()+'<div class="g-round-heading"><span class="life-eyebrow">'+(order||pairs?'Ronda ':'Historia ')+(game.round+1)+' de '+game.rounds.length+'</span><span>'+game.score+' puntos</span></div><div class="life-game-progress" aria-hidden="true"><span style="width:'+Math.round((game.round/game.rounds.length)*100)+'%"></span></div><h2 class="life-game-question">'+U.esc(q.question)+'</h2>'+(order?'<p class="life-small">'+(game.kind==='timeline'?'Primero lo que pasó antes. Seguí el hilo hasta el final.':'Empezá por el libro que aparece antes y seguí en orden.')+'</p><div class="life-order-slots" aria-label="Tu orden">'+q.answer.map((id,i)=>'<span class="'+(i>=game.position?'empty':'')+'">'+(i<game.position?U.esc(name(id)):i+1)+'</span>').join('')+'</div>':pairs?'<p class="life-small">Tocá dos tarjetas relacionadas entre sí.</p>':'')+'<div class="life-game-choices '+(pairs?'g-pair-board':'')+'">'+q.choices.map(c=>{const matched=pairs&&game.matched.includes(c.id);return '<button data-answer="'+U.esc(c.id)+'" '+(selected.includes(c.id)||matched?'disabled class="correct"':pairs&&game.flipped.includes(c.id)?'class="g-selected"':'')+'>'+(pairs?'<small>'+ (c.id[0]==='p'?'Persona':'Su historia')+'</small>':'')+U.esc(c.name)+(matched?icon('check'):'')+'</button>';}).join('')+'</div><div class="life-game-feedback" role="status" aria-live="polite">'+U.esc(feedbackMessage)+'</div><div class="g-bottom-tools"><button class="life-text-button" data-hint '+(game.hintUsed||game.pending?'disabled':'')+'>'+icon('help')+(game.hintUsed?'Pista usada':'Dame una pista')+'</button><small>El reloj se pausa al completar cada ronda.</small></div><button class="life-button full" data-next-round '+(game.pending?'':'hidden')+'>Siguiente '+arrow()+'</button>');
    app.querySelector('[data-pause]').onclick=()=>{game.pause();pausedGame();};
    const next=app.querySelector('[data-next-round]');next.onclick=()=>{feedbackMessage='';if(game.next())drawGame();else clock();};
    app.querySelector('[data-hint]').onclick=e=>{const answer=game.hint();if(!answer)return;const hint=q.choices.find(c=>c.id===answer);app.querySelectorAll('[data-answer]').forEach(b=>{const c=q.choices.find(c=>c.id===b.dataset.answer);if(b.dataset.answer===answer||pairs&&c.match===hint.match)b.classList.add('g-hint');});e.currentTarget.disabled=true;app.querySelector('[role=status]').textContent=pairs?'Estas tarjetas cuentan una misma historia.':order?'Este es el próximo paso.':'Esta opción te acerca a la respuesta.';};
    app.querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>{
      if(button.disabled)return;const response=game.choose(button.dataset.answer);if(response.ignored)return;
      if(game.status==='lost'||game.status==='won'){clearInterval(timer);return resultGame();}
      if(pairs){feedbackMessage=response.preview?'Elegí la tarjeta que se relaciona con esta persona o historia.':response.correct?response.explanation||q.explanation:'Esas tarjetas cuentan historias diferentes. Mirá las que quedan y probá otra vez.';drawGame();if(!response.preview&&!response.correct)setTimeout(()=>{if(game?.kind==='pairs'&&game.status==='playing'){game.releasePair();drawGame();}},800);return;}
      const feedback=app.querySelector('[role=status]');
      if(!response.correct){button.classList.add('wrong');button.disabled=true;if(order)setTimeout(()=>{if(button.isConnected&&game.status==='playing'&&!game.pending){button.classList.remove('wrong');button.disabled=false;}},450);feedback.className='life-game-feedback bad';feedback.textContent='Todavía no. Te quedan '+game.lives+' '+(game.lives===1?'vida.':'vidas.');app.querySelector('.life-game-stats').outerHTML=stats();app.querySelector('[data-pause]').onclick=()=>{game.pause();pausedGame();};return;}
      button.classList.add('correct');button.disabled=true;if(order){const slot=app.querySelectorAll('.life-order-slots span')[game.position-1];slot.textContent=name(button.dataset.answer);slot.classList.remove('empty');}
      feedback.className='life-game-feedback good';feedback.textContent=response.complete?'¡Bien! '+response.explanation+' '+(order?'':response.reference):'¡Bien! Elegí el siguiente paso.';feedbackMessage=feedback.textContent;
      if(response.complete){app.querySelectorAll('[data-answer]').forEach(b=>b.disabled=true);app.querySelector('[data-hint]').disabled=true;next.hidden=false;}
    });
    if(game.pending){app.querySelectorAll('[data-answer]').forEach(b=>b.disabled=true);app.querySelector('.life-game-feedback').classList.add('good');app.querySelector('.life-game-feedback').textContent='¡Ronda completa! '+q.explanation+(q.reference?' · '+q.reference:'');}
  }
  function pausedGame(){layout(title(gameTitle(),'/juegos')+'<section class="life-game-pause">'+symbol('pause','lilac')+'<h2>Un pequeño descanso</h2><p class="life-lead">Tu tiempo y tu progreso te esperan acá.</p><button class="life-button" data-resume>'+icon('play')+'Continuar</button><a class="life-text-button" href="/juegos">Salir del juego</a></section>');app.querySelector('[data-resume]').onclick=()=>{game.resume();drawGame();};}
  function resultGame(){
    if(!game)return;
    const won=game.status==='won',recordKey=key('record:'+gameKind+':'+difficulty),previous=safeRead(recordKey,0),remote=TNTCommunity.data?.games?.find(r=>r.kind===gameKind&&r.difficulty===difficulty)?.best||0,best=Math.max(previous,remote,game.score),accuracy=Math.round(game.correct/(game.attempts||1)*100),review=[...game.history];if(!won)review.push({question:game.current.question,explanation:game.current.explanation,reference:game.current.reference});save(recordKey,best);
    const stars=won?(accuracy>=95?3:accuracy>=75?2:1):0;
    layout(title(gameTitle(),'/juegos')+'<section class="life-card life-game-result">'+symbol(won?'trophy':'book','lilac')+'<div class="g-stars" aria-label="'+stars+' estrellas">'+[0,1,2].map(i=>'<span class="'+(i<stars?'earned':'')+'">★</span>').join('')+'</div><h2>'+(won?'¡Lo lograste!':game.reason==='time'?'El tiempo voló':'Seguimos aprendiendo')+'</h2><p>'+(won?'Completaste el recorrido. Hay más historias para descubrir.':'Cada intento suma. Repasá lo que descubriste y volvé cuando quieras.')+'</p><strong>'+game.score+' <small>puntos</small></strong><div class="g-result-numbers"><span><b>'+accuracy+'%</b><small>de aciertos</small></span><span><b>'+best+'</b><small>tu mejor marca</small></span></div><p class="life-status" data-game-sync role="status">Guardando tu partida…</p><div class="life-actions"><button class="life-button" data-again>Volver a jugar</button><a class="life-button outline" href="/juegos">Otros juegos</a></div></section><h2 class="c-section-title">Lo que nos llevamos</h2>'+review.map(r=>'<details class="g-review"><summary>'+U.esc(r.question)+'</summary><p>'+U.esc(r.explanation)+'</p><small>'+U.esc(r.reference)+'</small></details>').join(''));
    app.querySelector('[data-again]').onclick=()=>setupGame(gameKind);
    if(!runStored){runStored=true;const run={id:runId,kind:gameKind,difficulty,score:game.score,won,lives:game.lives,duration:Math.min(3600,Math.round((game.level.seconds*1000-game.remainingMs)/1000))};const queue=safeRead(key('pending-games'),[]);if(!queue.some(r=>r.id===runId))save(key('pending-games'),[...queue,run].slice(-30));}
    syncRuns().then(remaining=>{const status=app.querySelector('[data-game-sync]');if(status)status.textContent=remaining?'Partida guardada en este dispositivo. La sincronizamos al volver a conectar.':'Tu partida y tu marca quedaron guardadas en tu cuenta.';}).catch(()=>{const status=app.querySelector('[data-game-sync]');if(status)status.textContent='Guardada en este dispositivo. La sincronizamos al volver a conectar.';});
  }
  async function boot(){
    await TNT.ready;if(!TNT.identity){location.replace('/?login=1&next='+encodeURIComponent(location.pathname+location.search));return;}
    if(!TNT.profileComplete){location.replace('/?onboarding=1');return;}
    if(area==='profile')profile();else if(area==='bible')await bible();else if(area==='games')games();else community();
  }
  window.TNTLife={boot,cleanPassage,imageBlob,layout,title,bookArt};
  window.addEventListener('pagehide',()=>{clearInterval(timer);if(photoPreview)URL.revokeObjectURL(photoPreview);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&game?.status==='playing'){game.pause();pausedGame();}else if(game?.status==='playing')clock();});
  document.addEventListener('tnt:profile',()=>{if(area==='profile'&&!new URLSearchParams(location.search).has('view'))profile();});
  document.addEventListener('tnt:theme',()=>{const text=app.querySelector('[data-reading]');if(text)text.dataset.yvTheme=document.documentElement.dataset.tntTheme==='dark'?'dark':'light';});
  boot();
})();
