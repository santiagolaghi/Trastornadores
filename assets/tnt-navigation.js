/* One navigation bar, shared by every signed-in TNT screen. */
(() => {
 'use strict';
 const N=window.TNTNavigation={mount};
 function mount(){
  const T=window.TNT,U=window.TNTUI;if(!T?.identity||!T.profileComplete){document.getElementById('tnt-main-nav')?.remove();document.body.classList.remove('has-tnt-navigation');return;}
  document.getElementById('tnt-home-bottom')?.remove();
  let nav=document.getElementById('tnt-main-nav');if(!nav){nav=document.createElement('nav');nav.id='tnt-main-nav';nav.className='tnt-main-nav';nav.setAttribute('aria-label','Navegación principal');document.body.append(nav);}
  const path=location.pathname,org=T.hasAccess('organizacion'),chat=T.hasAccess('chat'),me=path.startsWith('/perfiles')&&new URLSearchParams(location.search).has('me');
  const rows=[['/','home','Inicio',path==='/'],[org?'/organizacion/?view=saturdays':'/#agenda','calendar','Agenda',path.startsWith('/organizacion')],...(chat?[['/chat/','chat','Chat',path.startsWith('/chat')]]:[]),['/perfiles/datos/?me=1','people','Mi perfil',me]];
  nav.innerHTML=rows.map(([href,icon,label,active])=>'<a href="'+href+'" '+(active?'aria-current="page"':'')+'>'+U.icon(icon)+'<span>'+label+'</span></a>').join('');
  document.body.classList.add('has-tnt-navigation');
  document.querySelector('.community-calendar')?.setAttribute('id','agenda');
 }
 document.addEventListener('tnt:ready',mount);document.addEventListener('tnt:membership',mount);document.addEventListener('tnt:permissions',mount);
})();
