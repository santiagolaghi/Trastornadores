/* Account-owned preferences and reference-only reader data. Never stores permissions. */
(() => {
 'use strict';
 const owner=()=>window.TNT?.account?.auth_user_id||window.TNT?.person?.id||'';
 const cacheKey=()=> 'tnt:personal:'+owner();
 const read=()=>{try{return JSON.parse(localStorage.getItem(cacheKey()))||{};}catch{return {};}};
 const remember=value=>{try{localStorage.setItem(cacheKey(),JSON.stringify(value));}catch{}};
 let tail=Promise.resolve();
 const P=window.TNTPersonal={preferences,load,action,flush,birthdayCalendar};
 function preferences(){return {...(window.TNT?.personalPreferences||{favorite_version:128,shortcuts:[],extra_versions:[]}),...(read().pendingPreferences||{})};}
 function accept(data,who){if(who!==owner())return false;if(data?.preferences){const before=Date.parse(TNT.personalPreferences?.updated_at||''),incoming=Date.parse(data.preferences.updated_at||'');if(Number.isFinite(before)&&(!Number.isFinite(incoming)||incoming<before))return true;TNT.personalPreferences=data.preferences;document.dispatchEvent(new CustomEvent('tnt:personal',{detail:{preferences:data.preferences}}));}return true;}
 async function load(book=null,chapter=null){
  const who=owner();if(!who)throw Error('Iniciá sesión para ver tu progreso.');
  const r=await TNT.sb.rpc('tnt_personal_context',{p_book:book,p_chapter:chapter});if(r.error)throw r.error;
  if(!accept(r.data,who))throw Error('La cuenta cambió. Volvé a abrir la lectura.');return r.data;
 }
 function action(name,data={}){
  const who=owner();if(!who)return Promise.reject(Error('Iniciá sesión para guardar tu progreso.'));
  const send=async()=>{if(who!==owner())throw Error('La cuenta cambió.');const r=await TNT.sb.rpc('tnt_personal_action',{p_action:name,p_data:data});if(r.error)throw r.error;if(!accept(r.data,who))throw Error('La cuenta cambió.');return r.data;};
  if(name==='preferences'){const cache=read();cache.pendingPreferences={...cache.pendingPreferences,...data};remember(cache);}
  const result=tail.then(send,send);tail=result.catch(()=>{});
  return result.then(value=>{if(who===owner()&&name==='preferences'){const cache=read();for(const [k,v] of Object.entries(data))if(JSON.stringify(cache.pendingPreferences?.[k])===JSON.stringify(v))delete cache.pendingPreferences[k];remember(cache);}return value;});
 }
 async function flush(){if(!owner())return;const pending=read().pendingPreferences;if(pending&&Object.keys(pending).length)await action('preferences',pending);}
 function birthdayCalendar(people){
  const U=TNTUI,E=U.esc,[year,month,day]=U.dateKey().split('-').map(Number),today=Date.UTC(year,month-1,day,12),oneDay=86400000;
  const entries=people.map(p=>{const parts=String(p.birthday||'').split('-').map(Number),m=Number(p.month||parts[1]),d=Number(p.day||parts[2]),y=Number(p.year||parts[0])||null;if(!(m>=1&&m<=12&&d>=1&&d<=31))return null;let next=Date.UTC(year,m-1,d,12);if(next<today)next=Date.UTC(year+1,m-1,d,12);let recent=Date.UTC(year,m-1,d,12);if(recent>today)recent=Date.UTC(year-1,m-1,d,12);return {...p,id:p.person_id||p.id,name:p.name||p.full_name,month:m,day:d,year:y,next,recent};}).filter(Boolean);
  const turning=(p,at)=>p.year?new Date(at).getUTCFullYear()-p.year:null;
  const row=(p,at,when)=>{const age=turning(p,at);return '<article class="c-birthday">'+U.avatar({full_name:p.name},{avatar_url:p.avatar_url||''})+'<div><h3>'+E(p.name)+'</h3><small>'+E(U.date(new Date(at).toISOString(),{day:'numeric',month:'long'}))+(age!==null&&age>=0&&age<125?' · '+(at<today?'Cumplió ':'Cumple ')+age+' años':'')+'</small></div>'+(when?'<span class="birthday-tag">'+E(when)+'</span>':'')+'</article>';};
  const next=[...entries].sort((a,b)=>a.next-b.next).slice(0,3),recent=entries.filter(p=>p.recent<today&&today-p.recent<=14*oneDay).sort((a,b)=>b.recent-a.recent);
  const months=Array.from({length:12},(_,i)=>{const rows=entries.filter(p=>p.month===i+1).sort((a,b)=>a.day-b.day),name=new Intl.DateTimeFormat('es-AR',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(year,i,1)));return '<details class="birthday-month" '+(i+1===month?'open':'')+'><summary><b>'+E(name)+'</b><span>'+rows.length+'</span></summary>'+rows.map(p=>row(p,Date.UTC(year,i,p.day,12),'')).join('')+(rows.length?'':'<p class="life-small">Todavía no hay cumpleaños cargados para este mes.</p>')+'</details>';}).join('');
  return '<section class="birthday-next"><h2>Los próximos abrazos</h2>'+next.map(p=>row(p,p.next,p.next===today?'¡Hoy!':'En '+Math.round((p.next-today)/oneDay)+' días')).join('')+(!entries.length?'<p>Todavía no hay cumpleaños cargados.</p>':'')+'</section>'+(recent.length?'<section class="birthday-recent"><h2>Celebramos hace poquito</h2>'+recent.map(p=>row(p,p.recent,'Hace '+Math.round((today-p.recent)/oneDay)+' días')).join('')+'</section>':'')+'<section class="birthday-calendar"><h2>Un año para celebrar</h2>'+months+'</section>';
 }
 window.addEventListener('online',()=>flush().catch(()=>{}));
})();
