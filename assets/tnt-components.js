(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    home:'M3 10.5 12 3l9 7.5M5 9v12h5v-7h4v7h5V9',
    calendar:'M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 4h2',
    chat:'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 2V11.5a8.5 8.5 0 1 1 18 0ZM7 11h10m-10 4h6',
    people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 .13a4 4 0 0 1 0 7.75',
    check:'m5 12 4 4L19 6', tasks:'M9 5h11M9 12h11M9 19h11M3 5l1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2',
    camp:'m2 21 10-18 10 18H2Zm6 0 4-7 4 7', book:'M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3V4Zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5V4Z',
    food:'M4 3v7a3 3 0 0 0 6 0V3m-3 0v19m13 0V3c-5 3-5 10 0 10',
    arrow:'M5 12h14m-6-6 6 6-6 6', back:'M19 12H5m6-6-6 6 6 6', up:'M6 18 18 6M6 6h12v12', plus:'M12 5v14M5 12h14',
    bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    search:'M21 21l-5-5M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15',
    sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon:'M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z',
    settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v6l4 2',
    file:'M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8m-8 4h6',
    clip:'m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9',
    send:'m22 2-7 20-4-9L2 9l20-7Zm0 0L11 13',
    close:'m6 6 12 12M6 18 18 6', more:'M5 12h.01M12 12h.01M19 12h.01',
    pin:'m8 3 8 0-1 6 4 4H5l4-4-1-6Zm4 10v9',
    reply:'m9 10-5 4 5 4M4 14h9a7 7 0 0 0 7-7',
    download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    edit:'m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5',
    alert:'m12 3 10 18H2L12 3Zm0 6v5m0 3v.01',
    logout:'M9 4H3v16h6m6-13 5 5-5 5M8 12h12',
    lock:'M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2',
    help:'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    undo:'m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3',
    doublecheck:'m1 12 4 4L15 6m-5 10 4 4L24 10'
  };
  function icon(name, cls='') { return `<svg class="tnt-icon ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.calendar}"/></svg>`; }
  function safeUrl(value) { if(!String(value || '').trim())return '';try { const u = new URL(value, root.location?.origin || 'https://tnt.invalid'); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
  const initials = name => String(name || 'TNT').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();
  function photoUrl(value,size=128) {
    const safe=safeUrl(value);if(!safe)return '';
    try{const url=new URL(safe);if(/(^|\.)googleusercontent\.com$/.test(url.hostname)){
      const px=Math.min(1024,Math.max(64,Number(size)||128));
      if(url.searchParams.has('sz'))url.searchParams.set('sz',String(px));
      else url.pathname=url.pathname.replace(/=s\d+(?:-[\w-]+)?$/,'')+'=s'+px+'-c';
      return url.href;
    }}catch{}return safe;
  }
  function avatar(person={}, account={}, cls='') {
    person||={};account||={};const own=root.TNT?.person?.id===person.id?root.TNT.account||{}:{};
    const name=account.nickname || person.full_name || person.display_name || 'Persona TNT';
    const large=cls.includes('portrait'),url=photoUrl(account.avatar_url||person.avatar_url||own.avatar_url||'',large?512:128);
    return `<span class="tnt-person-avatar ${esc(cls)} ${url?'has-photo':'without-photo'}" title="${esc(name)}"><span aria-hidden="true">${esc(initials(name))}</span>${url?`<img src="${esc(url)}" alt="${esc(name)}" loading="${large?'eager':'lazy'}" decoding="async" ${large?'fetchpriority="high"':''} referrerpolicy="no-referrer">`:''}</span>`;
  }
  function avatarStack(ids, people, accounts, myId, max=5) {
    const all=[...new Set(ids)].sort((a,b)=>(b===myId)-(a===myId));
    return `<span class="tnt-avatar-stack">${all.slice(0,max).map(id=>avatar(people.find(p=>p.id===id),accounts.find(a=>a.person_id===id),id===myId?'is-you':'')).join('')}${all.length>max?`<span class="tnt-avatar-more">+${all.length-max}</span>`:''}</span>`;
  }
  function dateKey(value=new Date()) {
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    const part=k=>p.find(x=>x.type===k)?.value; return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function addDays(key, days) { const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10); }
  function date(value, options={day:'numeric',month:'short'}) { if(!value)return ''; const d=new Date(value.length===10?value+'T12:00:00Z':value);return Number.isNaN(d.valueOf())?'':new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hourCycle:'h23',...options}).format(d); }
  function time(value) { return value?date(value,{hour:'2-digit',minute:'2-digit'}):''; }
  const completed = t => ['done','completed','cancelled'].includes(typeof t==='string'?t:t?.status);
  function accessInfo(account={}, grants=[], mod, scope='*', now=Date.now(), rolePermissions=[], personPermissions=[]) {
    const none={level:'none',source:'none'};
    if(account.enabled===false)return none;
    if(account.system_role==='admin'&&mod!=='efe')return {level:'manage',source:'admin'};
    if(account.system_role!=='admin'&&account.staff_status!=='approved')return none;
    const match=rows=>rows.find(x=>x.module===mod&&x.scope===scope&&x.action==='view')||rows.find(x=>x.module===mod&&x.scope==='*'&&x.action==='view');
    const override=match(personPermissions),preset=account.staff_status==='approved'?match(rolePermissions):null;
    if(override&&!override.allowed)return {level:'none',source:'person'};
    if(!override&&preset&&!preset.allowed)return {level:'none',source:'role'};
    const exact=grants.filter(g=>g.module===mod&&g.scope===scope);
    const candidates=exact.length?exact:grants.filter(g=>g.module===mod&&g.scope==='*');
    const rank={none:0,view:1,user:1,edit:2,editor:2,manage:3,manager:3,admin:4};
    const base=candidates.filter(g=>g.enabled&&(!g.valid_from||Date.parse(g.valid_from)<=now)&&(!g.valid_until||Date.parse(g.valid_until)>=now))
      .reduce((best,g)=>rank[g.access_level]>rank[best.level]?{level:g.access_level,source:'grant'}:best,none);
    if(override||preset)return {level:base.level==='none'?'view':base.level,source:override?'person':'role'};
    if(mod==='chat'&&account.staff_status==='approved'&&base.level==='none')return {level:'view',source:'staff'};
    return base;
  }
  // A programmatic overlay close consumes its own history entry. Parent dialogs
  // and module navigation must not interpret that popstate as a second Back.
  function backOverlay() {
    return new Promise(resolve=>{
      const consume=e=>{e.stopImmediatePropagation();root.removeEventListener('popstate',consume,true);resolve();};
      root.addEventListener('popstate',consume,true);root.history.back();
    });
  }
  function modal(title, body, wide=false, {stack=false}={}) {
    const old=stack?null:[...root.document.querySelectorAll('.tnt-overlay')].at(-1),replacing=!!old;old?._tntDisposeBack?.();old?.remove();
    const previous=root.document.activeElement, dialog=root.document.createElement('dialog');
    dialog.className='tnt-overlay';dialog.setAttribute('aria-label',title);
    dialog.innerHTML=`<section class="tnt-sheet ${wide?'wide':''}"><header class="tnt-sheet-head"><h2>${esc(title)}</h2><button class="tnt-close" type="button" aria-label="Cerrar">${icon('close')}</button></header>${body}</section>`;
    root.document.body.append(dialog);
    if(stack){
      trackOverlay(dialog);
      const close=()=>dialog._tntClose();
      dialog.querySelector('.tnt-close').onclick=close;
      dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
      dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
      if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
      return dialog;
    }
    if(!replacing&&root.history?.pushState)root.history.pushState({...root.history.state,tntSharedOverlay:true},'');
    const onBack=e=>{if(e.state?.tntSharedOverlay)return;root.removeEventListener('popstate',onBack);if(dialog.isConnected){dialog.remove();previous?.focus?.();}};root.addEventListener('popstate',onBack);dialog._tntDisposeBack=()=>root.removeEventListener('popstate',onBack);
    const close=()=>{if(!dialog.isConnected)return;dialog.remove();root.removeEventListener('popstate',onBack);previous?.focus?.();if(root.history?.state?.tntSharedOverlay)return backOverlay();};
    dialog._tntClose=close;
    dialog.querySelector('.tnt-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
    return dialog;
  }
  function closeModal(dialog) { if(dialog?._tntClose)return Promise.resolve(dialog._tntClose());dialog?.remove();return Promise.resolve(); }
  function trackOverlay(node, dismiss=()=>node.remove()) {
    if(node._tntLayerActive)return;
    const id='layer-'+Date.now()+'-'+Math.random().toString(36).slice(2),previous=root.document.activeElement;
    const stack=[...(root.history.state?.tntLayerStack||[]),id];
    root.history.pushState({...root.history.state,tntLayerStack:stack},'');node._tntLayerActive=true;
    const finish=()=>{node._tntLayerActive=false;root.removeEventListener('popstate',onBack);root.document.removeEventListener('keydown',onKey);dismiss();previous?.focus?.();};
    const onBack=e=>{if(!e.state?.tntLayerStack?.includes(id))finish();};
    const close=()=>{if(!node._tntLayerActive)return;finish();if(root.history.state?.tntLayerStack?.at(-1)===id)return backOverlay();};
    const onKey=e=>{if(e.key==='Escape'&&root.history.state?.tntLayerStack?.at(-1)===id){e.preventDefault();e.stopImmediatePropagation();close();}};
    root.addEventListener('popstate',onBack);root.document.addEventListener('keydown',onKey);
    node._tntClose=close;
  }
  function ask(message, text=false) {
    return new Promise(resolve=>{
      let result=text?null:false,closing=false;
      const dialog=root.document.createElement('dialog');dialog.className='tnt-question';
      dialog.innerHTML=`<section class="tnt-sheet"><header class="tnt-sheet-head"><h2>${esc(text?'Tu respuesta':'Confirmar acción')}</h2><button class="tnt-close" type="button" aria-label="Cerrar">${icon('close')}</button></header><form class="tnt-form"><p>${esc(message)}</p>${text?'<label>Respuesta<textarea name="answer" maxlength="2000"></textarea></label>':''}<div class="tnt-actions"><button type="button" data-cancel class="tnt-button">Cancelar</button><button type="submit" class="tnt-button primary">${text?'Continuar':'Confirmar'}</button></div></form></section>`;
      root.document.body.append(dialog);trackOverlay(dialog,()=>{dialog.remove();if(!closing)resolve(result);});
      const finish=async()=>{if(closing)return;closing=true;await closeModal(dialog);resolve(result);};
      dialog.querySelector('.tnt-close').onclick=dialog.querySelector('[data-cancel]').onclick=finish;
      dialog.querySelector('form').onsubmit=e=>{e.preventDefault();result=text?dialog.querySelector('textarea').value:true;finish();};
      dialog.addEventListener('cancel',e=>{e.preventDefault();finish();});
      dialog.showModal?.();
    });
  }
  const confirm=message=>ask(message),prompt=message=>ask(message,true);
  function toast(message, error=false) {
    let t=root.document.getElementById('tnt-toast');if(!t){t=root.document.createElement('div');t.id='tnt-toast';t.setAttribute('role','status');root.document.body.append(t);}
    t.textContent=message;t.className=error?'show error':'show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),4500);
  }
  function enhanceSelects(scope=root.document) {
    const choices=scope.matches?.('select')?[scope]:[...scope.querySelectorAll?.('select')||[]];
    for(const select of choices){
      if(select.dataset.tntEnhanced){select._tntSync?.();continue;}
      if(select.multiple||select.size>1||select.closest('.tnt-select-dialog'))continue;
      select.dataset.tntEnhanced='true';select.classList.add('tnt-native-select');
      const button=root.document.createElement('button');button.type='button';button.className='tnt-select-trigger';
      const cleanLabel=node=>{if(!node)return'';const copy=node.cloneNode(true);copy.querySelectorAll('select,input,textarea,button,option,small,.field-help,.camp-help').forEach(x=>x.remove());return copy.textContent.replace(/\s+/g,' ').trim();};
      const label=select.getAttribute('aria-label')?.trim()||cleanLabel(select.labels?.[0])||cleanLabel(select.closest('.field')?.querySelector('label'))||cleanLabel(select.previousElementSibling?.matches?.('label')?select.previousElementSibling:null)||'Seleccionar';
      select.setAttribute('aria-label',label);button.setAttribute('aria-label',label);button.setAttribute('aria-haspopup','dialog');
      const sync=()=>{button.innerHTML=`<span>${esc(select.options[select.selectedIndex]?.textContent?.trim()||label)}</span><span class="tnt-select-chevron" aria-hidden="true">⌄</span>`;button.disabled=select.disabled;};
      const field=root.document.createElement('span');field.className='tnt-select-field';select.before(field);field.append(select,button);select.addEventListener('change',sync);sync();
      select._tntSync=sync;
      new root.MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','label']});
      button.onclick=()=>{
        sync();const options=[...select.options],previous=root.document.activeElement;
        const entries=options.map((option,index)=>({option,index,group:option.parentElement?.tagName==='OPTGROUP'?option.parentElement.label:''}));
        const groups=[];entries.forEach(entry=>{let group=groups.find(x=>x.label===entry.group);if(!group){group={label:entry.group,items:[]};groups.push(group);}group.items.push(entry);});
        const dialog=root.document.createElement('dialog');dialog.className='tnt-select-dialog';dialog.setAttribute('aria-label',label);
        dialog.innerHTML=`<div class="tnt-select-sheet"><header><h2>${esc(label)}</h2><button type="button" class="tnt-select-close" aria-label="Cerrar">${icon('close')}</button></header>${options.length>8?'<input type="search" class="tnt-select-search" placeholder="Buscar opción…" aria-label="Buscar opción">':''}<div class="tnt-select-list" role="listbox">${groups.map(group=>`${group.label?`<div class="tnt-select-group" role="presentation">${esc(group.label)}</div>`:''}${group.items.map(({option,index})=>`<button type="button" role="option" data-option="${index}" data-search="${esc(`${group.label} ${option.textContent.trim()}`)}" aria-selected="${option.selected}" ${option.disabled?'disabled':''}><span>${esc(option.textContent.trim())}</span>${option.selected?icon('check'):''}</button>`).join('')}`).join('')}</div></div>`;
        root.document.body.append(dialog);
        if(root.history?.pushState)root.history.pushState({...root.history.state,tntSelectOverlay:true},'');
        const onBack=()=>{dialog.remove();root.removeEventListener('popstate',onBack);previous?.focus?.();};root.addEventListener('popstate',onBack);
        let closing=false;const close=async()=>{if(closing)return;closing=true;dialog.remove();root.removeEventListener('popstate',onBack);previous?.focus?.();if(root.history?.state?.tntSelectOverlay)await backOverlay();};
        dialog.querySelector('.tnt-select-close').onclick=close;
        dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
        dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
        dialog.querySelectorAll('[data-option]').forEach(item=>item.onclick=async()=>{if(closing)return;select.selectedIndex=Number(item.dataset.option);sync();await close();if(select.isConnected)select.dispatchEvent(new root.Event('change',{bubbles:true}));});
        const search=dialog.querySelector('.tnt-select-search');if(search)search.oninput=()=>{const term=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();dialog.querySelectorAll('[data-option]').forEach(item=>{const value=(item.dataset.search||item.textContent).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();item.hidden=!value.includes(term);});};
        if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
        (search||dialog.querySelector('[aria-selected=true]')||dialog.querySelector('[data-option]'))?.focus();
      };
    }
  }
  const api={esc,icon,safeUrl,photoUrl,initials,avatar,avatarStack,dateKey,addDays,date,time,completed,modal,closeModal,trackOverlay,confirm,prompt,toast,enhanceSelects,backOverlay,accessInfo};
  root.TNTUI=api;
  if(root.document){const init=()=>{enhanceSelects();if(root.MutationObserver){new root.MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)enhanceSelects(node);}).observe(root.document.body,{childList:true,subtree:true});}};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();}
  root.document?.addEventListener('error',e=>{if(e.target?.matches?.('.tnt-person-avatar img')){const avatar=e.target.parentElement;avatar.classList.remove('has-photo');avatar.classList.add('without-photo');e.target.remove();}},true);
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
