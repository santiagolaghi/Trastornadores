/* Finger-controlled module deck, with keyboard and reduced-motion support. */
(() => {
 'use strict';
 window.TNTModuleDeck={bind};
 function bind(track){
  if(track.dataset.deckBound)return;track.dataset.deckBound='true';track.tabIndex=0;track.setAttribute('aria-roledescription','carrusel');
  const cards=[...track.querySelectorAll('[data-space]')],key='tnt:module-deck:'+TNT.person.id;if(!cards.length)return;
  let index=Math.max(0,cards.findIndex(c=>c.dataset.space===sessionStorage.getItem(key))),position=index,start=null,dragging=false,suppress=0;
  const controls=document.createElement('div');controls.className='tnt-space-controls';controls.innerHTML='<span>Deslizá para elegir · tocá para entrar</span><div><button type="button" data-space-prev aria-label="Módulo anterior">'+TNTUI.icon('back')+'</button><b data-space-position></b><button type="button" data-space-next aria-label="Módulo siguiente">'+TNTUI.icon('arrow')+'</button></div>';track.after(controls);
  const step=()=>innerWidth<761?192:218;
  function paint(){
   cards.forEach((card,i)=>{let delta=i-position;if(cards.length>2){delta=((delta+cards.length*1.5)%cards.length)-cards.length/2;}const distance=Math.abs(delta);card.style.setProperty('--deck-offset',delta);card.style.setProperty('--deck-depth',distance);card.style.setProperty('--deck-tilt',Math.max(-1,Math.min(1,delta)));card.style.setProperty('--deck-opacity',distance>2?0:Math.max(.2,1-distance*.15));card.style.setProperty('--deck-layer',String(30-Math.round(distance*10)));card.style.setProperty('--deck-events',distance>1.7?'none':'auto');card.dataset.deckActive=String(i===index);const link=card.querySelector('a');link.tabIndex=i===index?0:-1;link.setAttribute('aria-label',card.querySelector('h3').textContent+' · '+(i+1)+' de '+cards.length);});
   controls.querySelector('[data-space-position]').textContent=(index+1)+' / '+cards.length;controls.querySelector('[data-space-prev]').disabled=cards.length===1;controls.querySelector('[data-space-next]').disabled=cards.length===1;
  }
  function select(next){index=((next%cards.length)+cards.length)%cards.length;position=index;sessionStorage.setItem(key,cards[index].dataset.space);paint();}
  controls.querySelector('[data-space-prev]').onclick=()=>select(index-1);controls.querySelector('[data-space-next]').onclick=()=>select(index+1);
  track.addEventListener('pointerdown',e=>{if(e.isPrimary===false||e.button>0)return;start={x:e.clientX,y:e.clientY,pointer:e.pointerId,index};dragging=false;});
  track.addEventListener('pointermove',e=>{if(!start||e.pointerId!==start.pointer)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;
   if(!dragging&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){start=null;return;}
   if(!dragging&&Math.abs(dx)>9&&Math.abs(dx)>Math.abs(dy)*1.1){dragging=true;track.classList.add('is-deck-dragging');track.setPointerCapture?.(e.pointerId);}
   if(dragging){e.preventDefault();position=start.index-dx/step();paint();}
  });
  function finish(e,cancel=false){if(!start||e.pointerId!==start.pointer)return;const initial=start.index;start=null;track.classList.remove('is-deck-dragging');if(dragging){suppress=Date.now()+450;select(cancel?initial:Math.round(position));e.preventDefault();}dragging=false;}
  track.addEventListener('pointerup',e=>finish(e));track.addEventListener('pointercancel',e=>finish(e,true));track.addEventListener('lostpointercapture',e=>finish(e,true));
  track.addEventListener('click',e=>{const card=e.target.closest('[data-space]');if(!card)return;if(Date.now()<suppress){e.preventDefault();e.stopImmediatePropagation();return;}const next=cards.indexOf(card);if(next!==index){e.preventDefault();select(next);return;}if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!matchMedia('(prefers-reduced-motion:reduce)').matches)card.querySelector('a')?.animate?.([{opacity:1,transform:'scale(1)'},{opacity:.55,transform:'scale(1.04)'}],{duration:160});},true);
  track.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();select(index+(e.key==='ArrowLeft'?-1:1));cards[index].querySelector('a').focus({preventScroll:true});}});
  paint();
 }
})();
