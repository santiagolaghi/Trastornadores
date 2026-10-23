/* Shared launch state and community refresh, without changing the TNT identity. */
(() => {
 'use strict';
 const app=document.getElementById('app');
 const markup='<div class="tnt-startup" role="status"><span class="tnt-startup-orbit"><img src="/icons/dynamite-app.svg" alt=""></span><b>Hay un lugar para vos.</b><p>Preparando tu espacio en TNT</p><i aria-hidden="true"></i></div>';
 if(app&&(!app.textContent.trim()||app.querySelector('.tnt-skeleton')||app.textContent.trim()==='Preparando tu espacio…'))app.innerHTML=markup;
 const timer=setTimeout(()=>{const state=app?.querySelector('.tnt-startup');if(!state)return;state.querySelector('p').textContent='La conexión está tardando un poco. Tu espacio sigue en preparación.';const button=document.createElement('button');button.className='life-button outline';button.textContent='Volver a intentar';button.onclick=()=>location.reload();state.append(button);},18000);
 document.addEventListener('tnt:ready',()=>clearTimeout(timer),{once:true});
 document.addEventListener('tnt:community-change',()=>{if(location.pathname==='/')window.TNTCommunity?.home();});
})();
