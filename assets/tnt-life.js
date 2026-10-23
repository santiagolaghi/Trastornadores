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
  function header(){return '<header class="life-header"><a class="life-brand" href="/" aria-label="Inicio TNT">TNT</a><div class="life-header-tools"><button class="life-icon" data-notifications aria-label="Mis avisos">'+icon('bell')+'</button><button class="life-icon" data-account aria-label="Mi cuenta">'+U.avatar(TNT.person,{...TNT.account,avatar_url:TNT.avatar()})+'</button></div></header>';}
  function title(text,href='/comunidad'){return '<div class="life-title"><a class="life-icon" href="'+href+'" aria-label="Volver">'+icon('back')+'</a><h1>'+U.esc(text)+'</h1></div>';}
  function layout(body){app.innerHTML=header()+'<main class="life-page">'+body+'</main>';app.querySelector('[data-account]').onclick=()=>TNTAccounts.openMenu();app.querySelector('[data-notifications]').onclick=()=>TNTNotifications.open();TNTNavigation.mount();}
  function goPhoto(){location.href='/perfil?view=photo';}
  function community(){
    layout('<div class="life-title"><h1>Comunidad</h1></div><p class="life-lead">Un lugar para encontrarnos y crecer juntos.</p><div class="life-community-cards"><a class="life-card life-feature" href="/biblia">'+bookArt()+'<span class="life-eyebrow">Biblia en comunidad</span><h2>Una lectura para compartir</h2><p>Elegí un libro y acercate a la Palabra, a tu ritmo.</p><span class="life-button">Abrir la Biblia '+arrow()+'</span></a><a class="life-card lilac life-feature" href="/juegos">'+symbol('play','lilac')+'<h2>Aprendemos jugando</h2><p>Ordená libros, descubrí personajes y poné a prueba lo que sabés.</p><span class="life-button outline">Ver juegos '+arrow()+'</span></a></div><p class="life-small">Los encuentros y las herramientas de tu equipo siguen en Inicio.</p>');
  }
  function profile(){
    const view=new URLSearchParams(location.search).get('view');
    if(view==='photo')return photo();
    if(view==='preferences')return preferences();
    const role=TNT.account.ministry_role||'Comunidad';
    layout(title('Perfil','/')+'<section class="life-profile">'+U.avatar(TNT.person,{...TNT.account,avatar_url:TNT.avatar()},'portrait')+'<h2>'+U.esc(TNT.displayName())+'</h2><span class="life-profile-role">'+U.esc(role)+'</span><button class="life-button outline" data-photo>'+icon('camera')+'Cambiar foto</button></section><div class="life-profile-links">'+row('people','Mis datos','Tus datos y tu historia en TNT','data-edit-profile')+row('settings','Mis preferencias','Apariencia, avisos y cuentas','data-preferences','lilac')+'</div>');
    app.querySelector('[data-photo]').onclick=goPhoto;
    app.querySelector('[data-edit-profile]').onclick=()=>TNTProfileEditor.open(TNT.person.id);
    app.querySelector('[data-preferences]').onclick=()=>location.href='/perfil?view=preferences';
    if(new URLSearchParams(location.search).has('edit')){history.replaceState(null,'','/perfil');TNTProfileEditor.open(TNT.person.id);}
  }
  function preferences(){
    layout(title('Mis preferencias','/perfil')+row('sun','Apariencia',document.documentElement.dataset.tntTheme==='dark'?'Modo oscuro':'Modo claro','data-theme','lilac')+row('bell','Avisos en mi teléfono','Elegí cómo recibir tus novedades','data-phone')+row('people','Mis cuentas','Cambiar o agregar una cuenta de Google','data-accounts')+'<button class="life-text-button" data-logout>Cerrar sesión</button>');
    app.querySelector('[data-theme]').onclick=()=>{TNT.toggleTheme();preferences();};
    app.querySelector('[data-phone]').onclick=()=>TNTNotifications.phone();
    app.querySelector('[data-accounts]').onclick=()=>TNTAccounts.open();
    app.querySelector('[data-logout]').onclick=()=>TNT.logout();
  }
  async function imageBlob(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Elegí una foto JPG, PNG o WebP.');
    if(file.size>10*1024*1024)throw Error('Elegí una foto de menos de 10 MB.');
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();img.src=url;await img.decode();
      const ratio=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));
      if(!blob||blob.size>2*1024*1024)throw Error('No pudimos preparar esta foto. Probá con otra.');
      return blob;
    }finally{URL.revokeObjectURL(url);}
  }
  function photo(){
    if(photoPreview){URL.revokeObjectURL(photoPreview);photoPreview=null;}
    const a=TNT.account,initial=a.avatar_source==='custom'?'custom':'google';let selectedFile=null;
    const google=TNT.session?.user?.user_metadata?.avatar_url||TNT.session?.user?.user_metadata?.picture||a.avatar_google_url||'';
    layout(title('Foto de perfil','/perfil')+'<div class="life-photo-preview" data-photo-preview>'+U.avatar(TNT.person,{...a,avatar_url:TNT.avatar()},'portrait')+'</div><form id="life-photo-form"><label class="life-photo-option"><input type="radio" name="source" value="custom" '+(initial==='custom'?'checked':'')+'>'+symbol('upload','lilac')+'<span><strong>Subir una foto</strong><small>Elegí una foto desde tu dispositivo</small></span></label><input type="file" id="life-photo-file" accept="image/jpeg,image/png,image/webp" hidden><button type="button" class="life-text-button" data-select-file>Elegir archivo</button><label class="life-photo-option"><input type="radio" name="source" value="google" '+(initial==='google'?'checked':'')+' '+(!google?'disabled':'')+'><span class="life-symbol life-google" aria-hidden="true">G</span><span><strong>Usar foto de Google</strong><small>'+(google?'Usar tu foto de Google actual':'Disponible al iniciar sesión con Google')+'</small></span></label><label class="life-switch"><span><b>Mantener sincronizada con Google</b><small>Actualizar al volver a iniciar sesión</small></span><input type="checkbox" name="sync" role="switch" '+(a.avatar_sync!==false?'checked':'')+'></label><p class="life-small">Tu foto se usa en tu perfil, equipos y conversaciones de TNT.</p><p class="life-status" role="status" aria-live="polite"></p><button class="life-button full" type="submit">Guardar foto</button></form>');
    const form=app.querySelector('form'),input=form.querySelector('[type=file]'),status=form.querySelector('[role=status]'),button=form.querySelector('[type=submit]');
    const preview=url=>{const host=app.querySelector('[data-photo-preview]');if(!url)return;host.replaceChildren();const wrap=document.createElement('span');wrap.className='tnt-person-avatar portrait';const img=new Image();img.alt='Vista previa de tu foto';img.src=url.startsWith('blob:')?url:U.photoUrl(url,512);img.referrerPolicy='no-referrer';wrap.append(img);host.append(wrap);};
    const adjust=()=>{const custom=form.elements.source.value==='custom';form.elements.sync.disabled=custom;form.querySelector('[data-select-file]').hidden=!custom;preview(custom?(photoPreview||a.avatar_url):google);};
    form.querySelectorAll('[name=source]').forEach(r=>r.onchange=adjust);adjust();
    form.querySelector('[data-select-file]').onclick=()=>input.click();
    input.onchange=async()=>{if(!input.files[0])return;button.disabled=true;status.textContent='Preparando tu foto…';try{selectedFile=await imageBlob(input.files[0]);if(photoPreview)URL.revokeObjectURL(photoPreview);photoPreview=URL.createObjectURL(selectedFile);preview(photoPreview);status.textContent='Tu foto está lista para guardar.';}catch(e){selectedFile=null;status.textContent=e.message;}finally{button.disabled=false;}};
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
    layout(title('Biblia en comunidad')+'<p class="life-lead">Un momento para leer, descubrir y compartir.</p><div data-reader><p class="life-reader-loading" role="status">Preparando tu lectura…</p></div>');
    const root=app.querySelector('[data-reader]');
    try{
      const versions=await api('versions');
      if(!versions.versions.length){const e=Error('Estamos habilitando las traducciones para TNT.');e.code='LICENSE_REQUIRED';throw e;}
      api('fonts').then(({css})=>{if(css&&!document.getElementById('life-bible-fonts')){const style=document.createElement('style');style.id='life-bible-fonts';style.textContent=css;document.head.append(style);}}).catch(()=>{});
      const previous=safeRead(key('reading'),{}),version=versions.versions.find(v=>v.id===previous.version)||versions.versions.find(v=>v.id===128)||versions.versions[0];
      let [meta,index]=await Promise.all([api('version',{version:version.id}),api('index',{version:version.id})]);
      let books=(index.books||[]).filter(b=>G.books.some(x=>x.id===b.id)),book=books.find(b=>b.id===previous.book)||books[0],chapter=Number(previous.chapter)||1;
      if(!book)throw Error('No pudimos cargar los libros de esta traducción.');
      const chapters=()=>book.chapters.filter(c=>Number.isInteger(c.id)&&c.id>0);
      if(!chapters().some(c=>c.id===chapter))chapter=chapters()[0].id;
      let size=Math.min(30,Math.max(17,Number(previous.size)||21));
      root.innerHTML='<div class="life-reader-toolbar"><span class="life-pill" data-version-name></span><div class="life-reader-fonts"><button class="life-icon" data-smaller aria-label="Reducir tamaño de letra">A</button><button class="life-icon" data-larger aria-label="Aumentar tamaño de letra">A</button></div></div>'+(versions.versions.length>1?'<label class="life-small">Traducción<select data-version></select></label>':'')+'<div class="life-reader-controls"><label>Libro<select data-book></select></label><label>Capítulo<select data-chapter></select></label></div><article class="life-reading" data-reading data-yv-sdk data-slot="yv-bible-renderer" aria-live="polite"></article><div class="life-chapter-nav"><button class="life-button outline" data-prev>'+icon('back')+'Anterior</button><button class="life-button outline" data-next>Siguiente '+arrow()+'</button></div><p class="life-attribution" data-attribution></p><p class="life-font-credit">Lectura provista por YouVersion.</p>';
      const bookSelect=root.querySelector('[data-book]'),chapterSelect=root.querySelector('[data-chapter]'),text=root.querySelector('[data-reading]');
      const bookLabel=b=>G.books.find(x=>x.id===b.id)?.name||b.title;
      const persist=()=>save(key('reading'),{version:meta.id,book:book.id,chapter,size});
      const paintControls=()=>{bookSelect.innerHTML=books.map(b=>'<option value="'+U.esc(b.id)+'" '+(b.id===book.id?'selected':'')+'>'+U.esc(bookLabel(b))+'</option>').join('');chapterSelect.innerHTML=chapters().map(c=>'<option value="'+c.id+'" '+(c.id===chapter?'selected':'')+'>'+c.id+'</option>').join('');root.querySelector('[data-version-name]').textContent=meta.title;root.querySelector('[data-attribution]').textContent=meta.copyright;text.style.setProperty('--reading-size',size+'px');};
      const moveTarget=direction=>{const list=chapters(),i=list.findIndex(c=>c.id===chapter)+direction;if(i>=0&&i<list.length)return {book,chapter:list[i].id};const n=books.indexOf(book)+direction;if(n<0||n>=books.length)return null;const next=books[n],cs=next.chapters.filter(c=>Number.isInteger(c.id)&&c.id>0);return{book:next,chapter:direction>0?cs[0].id:cs.at(-1).id};};
      async function read(){
        const request=++readVersion;paintControls();text.textContent='Cargando '+bookLabel(book)+' '+chapter+'…';
        const prevButton=root.querySelector('[data-prev]'),nextButton=root.querySelector('[data-next]');prevButton.disabled=!moveTarget(-1);nextButton.disabled=!moveTarget(1);
        try{const result=await api('passage',{version:meta.id,passage:book.id+'.'+chapter});if(request!==readVersion||!text.isConnected)return;root.querySelector('[data-attribution]').textContent=result.copyright;text.innerHTML=cleanPassage(result.content);text.dataset.yvTheme=document.documentElement.dataset.tntTheme==='dark'?'dark':'light';persist();}
        catch(error){if(request!==readVersion)return;text.innerHTML='<p role="alert">'+U.esc(error.message)+'</p><button class="life-button outline" data-retry-passage>Reintentar</button>';text.querySelector('button').onclick=read;}
      }
      bookSelect.onchange=()=>{book=books.find(b=>b.id===bookSelect.value);chapter=chapters()[0].id;read();};chapterSelect.onchange=()=>{chapter=Number(chapterSelect.value);read();};
      root.querySelector('[data-prev]').onclick=()=>{const to=moveTarget(-1);if(to){({book,chapter}=to);read();text.scrollIntoView({behavior:'smooth',block:'start'});}};
      root.querySelector('[data-next]').onclick=()=>{const to=moveTarget(1);if(to){({book,chapter}=to);read();text.scrollIntoView({behavior:'smooth',block:'start'});}};
      root.querySelector('[data-smaller]').onclick=()=>{size=Math.max(17,size-2);text.style.setProperty('--reading-size',size+'px');persist();};
      root.querySelector('[data-larger]').onclick=()=>{size=Math.min(30,size+2);text.style.setProperty('--reading-size',size+'px');persist();};
      const select=root.querySelector('[data-version]');if(select){select.innerHTML=versions.versions.map(v=>'<option value="'+v.id+'" '+(v.id===meta.id?'selected':'')+'>'+U.esc(v.title)+'</option>').join('');select.onchange=async()=>{select.disabled=true;try{const id=select.value;[meta,index]=await Promise.all([api('version',{version:id}),api('index',{version:id})]);books=index.books.filter(b=>G.books.some(x=>x.id===b.id));book=books.find(b=>b.id===book.id)||books[0];if(!chapters().some(c=>c.id===chapter))chapter=chapters()[0].id;await read();}catch(e){readingError(e,bible);}finally{select.disabled=false;}};}
      await read();
    }catch(error){readingError(error,bible);}
  }
  const gameDescriptions={order:{title:'Ordená los libros',copy:'Tocá los libros en el orden en que aparecen en la Biblia.',icon:'book',detail:'3 rondas · 3 vidas'},characters:{title:'¿Quién soy?',copy:'Leé las pistas y descubrí de qué personaje se trata.',icon:'people',detail:'10 preguntas · 3 vidas'},testament:{title:'¿Antiguo o Nuevo?',copy:'Ubicá cada libro en el testamento al que pertenece.',icon:'check',detail:'10 libros · 3 vidas'}};
  function games(){
    clearInterval(timer);game=null;
    layout(title('Juegos bíblicos')+'<p class="life-lead">Un poco de tiempo, tres vidas y muchas cosas por descubrir.</p><div class="life-game-library">'+Object.entries(gameDescriptions).map(([id,q],i)=>'<article class="life-card life-game-card '+(!i?'life-feature':'')+'">'+symbol(q.icon,i?'lilac':'')+'<h2>'+q.title+'</h2><span class="life-pill">'+q.detail+'</span><p>'+q.copy+'</p><button class="life-button '+(i?'outline':'')+'" data-game="'+id+'">Jugar '+icon('play')+'</button></article>').join('')+'</div>');
    app.querySelectorAll('[data-game]').forEach(button=>button.onclick=()=>setupGame(button.dataset.game));
  }
  function setupGame(kind){
    clearInterval(timer);game=null;gameKind=kind;const q=gameDescriptions[kind];
    layout(title(q.title,'/juegos')+'<section class="life-card life-feature lilac">'+symbol(q.icon,'lilac')+'<h2>¿Listo para jugar?</h2><p>'+q.copy+'</p><span class="life-pill">'+q.detail+'</span></section><form data-game-setup><fieldset class="life-difficulties"><legend>Elegí la dificultad</legend>'+Object.entries(G.levels).map(([id,l])=>'<label><input type="radio" name="difficulty" value="'+id+'" '+(id==='normal'?'checked':'')+'><span><b>'+l.label+'</b><small>'+l.seconds+' segundos'+(kind==='order'?' · '+l.count+' libros por ronda':'')+'</small></span></label>').join('')+'</fieldset><button class="life-button full" type="submit">Empezar '+icon('play')+'</button></form>');
    app.querySelector('form').onsubmit=e=>{e.preventDefault();difficulty=e.target.elements.difficulty.value;game=new G.Game(kind,difficulty);game.start();drawGame();timer=setInterval(clock,200);};
  }
  function stats(){return '<div class="life-game-stats"><span class="life-hearts" role="img" aria-label="'+game.lives+' vidas">'+[0,1,2].map(i=>'<span class="'+(i>=game.lives?'spent':'')+'">'+icon('heart')+'</span>').join('')+'</span><b data-clock aria-label="Tiempo restante">'+game.seconds+' s</b><button class="life-icon" data-pause aria-label="Pausar juego">'+icon('pause')+'</button></div>';}
  function clock(){if(!game)return;game.tick();if(['won','lost'].includes(game.status)){clearInterval(timer);return resultGame();}const clock=app.querySelector('[data-clock]');if(clock)clock.textContent=game.seconds+' s';}
  function drawGame(){
    const q=game.current,order=game.kind==='order',selected=order?q.answer.slice(0,game.position):[];
    layout(title(gameDescriptions[game.kind].title,'/juegos')+stats()+'<span class="life-eyebrow">'+(order?'Ronda ':'Pregunta ')+(game.round+1)+' de '+game.rounds.length+'</span><div class="life-game-progress" aria-hidden="true"><span style="width:'+Math.round((game.round/game.rounds.length)*100)+'%"></span></div><h2 class="life-game-question">'+(order?'¿En qué orden van?':U.esc(q.question))+'</h2>'+(order?'<p class="life-small">Tocá primero el libro que aparece antes en la Biblia y seguí en orden.</p><div class="life-order-slots" aria-label="Tu orden">'+q.answer.map((id,i)=>'<span class="'+(i>=game.position?'empty':'')+'">'+(i<game.position?U.esc(G.books.find(b=>b.id===id).name):i+1)+'</span>').join('')+'</div>':'')+'<div class="life-game-choices">'+q.choices.map(c=>'<button data-answer="'+U.esc(c.id)+'" '+(selected.includes(c.id)?'disabled class="correct"':'')+'>'+U.esc(c.name)+'</button>').join('')+'</div><div class="life-game-feedback" role="status" aria-live="polite"></div><button class="life-button full" data-next-round hidden>Siguiente '+arrow()+'</button>');
    app.querySelector('[data-pause]').onclick=()=>{game.pause();pausedGame();};
    app.querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>{
      if(button.disabled)return;const response=game.choose(button.dataset.answer);if(response.ignored)return;
      if(game.status==='lost'||game.status==='won'){clearInterval(timer);return resultGame();}
      const feedback=app.querySelector('[role=status]');
      if(!response.correct){button.classList.add('wrong');button.disabled=true;if(order)setTimeout(()=>{if(button.isConnected&&game.status==='playing'&&!game.pending){button.classList.remove('wrong');button.disabled=false;}},400);feedback.className='life-game-feedback bad';feedback.textContent='Probá otra vez. Te quedan '+game.lives+' '+(game.lives===1?'vida.':'vidas.');app.querySelector('.life-game-stats').outerHTML=stats();app.querySelector('[data-pause]').onclick=()=>{game.pause();pausedGame();};return;}
      button.classList.add('correct');button.disabled=true;
      if(order){const slot=app.querySelectorAll('.life-order-slots span')[game.position-1];slot.textContent=G.books.find(b=>b.id===button.dataset.answer).name;slot.classList.remove('empty');}
      feedback.className='life-game-feedback good';feedback.textContent=response.complete?(order?'¡Ese es el orden!':q.reference):'¡Bien! Elegí el siguiente libro.';
      if(response.complete){app.querySelectorAll('[data-answer]').forEach(b=>b.disabled=true);const next=app.querySelector('[data-next-round]');next.hidden=false;next.onclick=()=>{if(game.next())drawGame();else clock();};}
    });
    if(game.pending){app.querySelectorAll('[data-answer]').forEach(b=>b.disabled=true);const next=app.querySelector('[data-next-round]');next.hidden=false;next.onclick=()=>{if(game.next())drawGame();else clock();};app.querySelector('.life-game-feedback').textContent=order?'¡Ese es el orden!':q.reference;}
  }
  function pausedGame(){layout(title(gameDescriptions[game.kind].title,'/juegos')+'<section class="life-game-pause"><h2>Un pequeño descanso</h2><p class="life-lead">El tiempo está pausado. Seguimos cuando quieras.</p><button class="life-button" data-resume>'+icon('play')+'Continuar</button></section>');app.querySelector('[data-resume]').onclick=()=>{game.resume();drawGame();};}
  function resultGame(){
    if(!game)return;
    const won=game.status==='won',recordKey=key('record:'+gameKind+':'+difficulty),previous=safeRead(recordKey,0),best=Math.max(previous,game.score);save(recordKey,best);
    layout(title(gameDescriptions[game.kind].title,'/juegos')+'<section class="life-card life-game-result">'+symbol(won?'trophy':'book','lilac')+'<h2>'+(won?'¡Lo lograste!':game.reason==='time'?'Se terminó el tiempo':'Una oportunidad para aprender')+'</h2><p>'+(won?'Terminaste el desafío. ¿Probamos otra vez?':'Cada partida te ayuda a conocer un poco más la Biblia.')+'</p><strong>'+game.score+' <small>puntos</small></strong><p class="life-record">Tu mejor marca en esta dificultad: '+best+'</p><div class="life-actions"><button class="life-button" data-again>Volver a jugar</button><a class="life-button outline" href="/juegos">Otros juegos</a></div></section>');
    app.querySelector('[data-again]').onclick=()=>setupGame(gameKind);
  }
  async function boot(){
    await TNT.ready;if(!TNT.identity){location.replace('/?login=1&next='+encodeURIComponent(location.pathname+location.search));return;}
    if(!TNT.profileComplete){location.replace('/?onboarding=1');return;}
    if(area==='profile')profile();else if(area==='bible')await bible();else if(area==='games')games();else community();
  }
  window.TNTLife={boot,cleanPassage,imageBlob};
  window.addEventListener('pagehide',()=>{clearInterval(timer);if(photoPreview)URL.revokeObjectURL(photoPreview);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&game?.status==='playing')clock();});
  document.addEventListener('tnt:profile',()=>{if(area==='profile'&&!new URLSearchParams(location.search).has('view'))profile();});
  document.addEventListener('tnt:theme',()=>{const text=app.querySelector('[data-reading]');if(text)text.dataset.yvTheme=document.documentElement.dataset.tntTheme==='dark'?'dark':'light';});
  boot();
})();
