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
    lock:'M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2'
  };
  function icon(name, cls='') { return `<svg class="tnt-icon ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.calendar}"/></svg>`; }
  function safeUrl(value) { if(!String(value || '').trim())return '';try { const u = new URL(value, root.location?.origin || 'https://tnt.invalid'); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
  const initials = name => String(name || 'TNT').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();
  function avatar(person={}, account={}, cls='') {
    const name=account.nickname || person.full_name || person.display_name || 'Persona TNT';
    const url=safeUrl(account.avatar_url || person.avatar_url || '');
    return `<span class="tnt-person-avatar ${esc(cls)}" title="${esc(name)}"><span aria-hidden="true">${esc(initials(name))}</span>${url?`<img src="${esc(url)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer">`:''}</span>`;
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
  function modal(title, body, wide=false) {
    root.document.querySelector('.tnt-overlay')?.remove();
    const previous=root.document.activeElement, dialog=root.document.createElement('dialog');
    dialog.className='tnt-overlay';dialog.setAttribute('aria-label',title);
    dialog.innerHTML=`<section class="tnt-sheet ${wide?'wide':''}"><header class="tnt-sheet-head"><h2>${esc(title)}</h2><button class="tnt-close" type="button" aria-label="Cerrar">${icon('close')}</button></header>${body}</section>`;
    root.document.body.append(dialog);
    const close=()=>{dialog.remove();previous?.focus?.();};
    dialog.querySelector('.tnt-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
    return dialog;
  }
  function toast(message, error=false) {
    let t=root.document.getElementById('tnt-toast');if(!t){t=root.document.createElement('div');t.id='tnt-toast';t.setAttribute('role','status');root.document.body.append(t);}
    t.textContent=message;t.className=error?'show error':'show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),4500);
  }
  const api={esc,icon,safeUrl,initials,avatar,avatarStack,dateKey,addDays,date,time,completed,modal,toast};
  root.TNTUI=api;
  root.document?.addEventListener('error',e=>{if(e.target?.matches?.('.tnt-person-avatar img'))e.target.remove();},true);
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
