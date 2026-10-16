(() => {
 'use strict';
 const API=window.TNTScheduleOrder={busy:false,bind};
 function bind(list,{snapshot,onSave,onError,onSettled}={}){
  if(list.dataset.orderBound)return;list.dataset.orderBound='true';let drag,frame;
  const rows=()=>[...list.children].filter(el=>el.dataset.scheduleOrderItem);
  const ids=()=>rows().map(el=>el.dataset.scheduleOrderItem);
  const restore=order=>{for(const id of order){const row=rows().find(el=>el.dataset.scheduleOrderItem===id);if(row)list.append(row);}};
  async function save(initial,before,focusId){
   const next=ids();if(next.join('|')===initial.join('|')){API.busy=false;return;}
   list.classList.add('is-order-saving');list.setAttribute('aria-busy','true');
   try{await onSave(next,before);}catch(error){restore(initial);await onError?.(error);}
   finally{API.busy=false;list.classList.remove('is-order-saving');list.removeAttribute('aria-busy');onSettled?.();if(focusId)document.querySelector('[data-schedule-drag="'+focusId+'"]')?.focus({preventScroll:true});}
  }
  function move(){
   if(!drag)return;
   drag.ghost.style.transform='translateY('+(drag.y-drag.startY)+'px)';
   const other=rows().filter(row=>row!==drag.row),target=other.find(row=>{const r=row.getBoundingClientRect();return drag.y<r.top+r.height/2});
   if(target)list.insertBefore(drag.row,target);else list.append(drag.row);
  }
  function scroll(){if(!drag)return;const edge=90,top=110,bottom=innerHeight-edge;let dy=0;
   if(drag.y<top)dy=-Math.min(18,Math.max(3,(top-drag.y)/4));else if(drag.y>bottom)dy=Math.min(18,Math.max(3,(drag.y-bottom)/4));
   if(dy){window.scrollBy(0,dy);move();}frame=requestAnimationFrame(scroll);
  }
  function finish(event,cancelled=false){
   if(!drag||event.pointerId!==drag.pointer)return;const current=drag;drag=null;cancelAnimationFrame(frame);
   current.ghost.remove();current.row.classList.remove('is-order-placeholder');document.body.classList.remove('is-schedule-dragging');
   if(list.hasPointerCapture?.(event.pointerId))list.releasePointerCapture(event.pointerId);
   event.preventDefault();event.stopPropagation();
   if(cancelled){restore(current.initial);API.busy=false;onSettled?.();document.querySelector('[data-schedule-drag="'+current.row.dataset.scheduleOrderItem+'"]')?.focus({preventScroll:true});return;}
   save(current.initial,current.before,current.row.dataset.scheduleOrderItem);
  }
  list.addEventListener('pointerdown',event=>{
   const handle=event.target.closest('[data-schedule-drag]');if(!handle||API.busy||event.isPrimary===false||event.button>0)return;
   const row=handle.closest('[data-schedule-order-item]');if(!row)return;
   event.preventDefault();event.stopPropagation();handle.focus({preventScroll:true});
   const rect=row.getBoundingClientRect(),ghost=row.cloneNode(true);ghost.classList.add('schedule-order-ghost');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
   Object.assign(ghost.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px'});document.body.append(ghost);
   API.busy=true;drag={row,ghost,pointer:event.pointerId,startY:event.clientY,y:event.clientY,initial:ids(),before:snapshot()};
   row.classList.add('is-order-placeholder');document.body.classList.add('is-schedule-dragging');list.setPointerCapture?.(event.pointerId);frame=requestAnimationFrame(scroll);
  },true);
  list.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointer)return;event.preventDefault();event.stopPropagation();drag.y=event.clientY;move();},true);
  list.addEventListener('pointerup',event=>finish(event),true);list.addEventListener('pointercancel',event=>finish(event,true),true);
  list.addEventListener('lostpointercapture',event=>finish(event,true));
  list.addEventListener('keydown',event=>{
   const handle=event.target.closest('[data-schedule-drag]');if(!handle)return;
   if(event.key==='Escape'&&drag){finish({pointerId:drag.pointer,preventDefault(){},stopPropagation(){}},true);event.preventDefault();return;}
   if(!['ArrowUp','ArrowDown'].includes(event.key)||API.busy)return;event.preventDefault();event.stopPropagation();
   const initial=ids(),index=initial.indexOf(handle.dataset.scheduleDrag),next=index+(event.key==='ArrowUp'?-1:1);if(next<0||next>=initial.length)return;
   const before=snapshot(),order=[...initial];[order[index],order[next]]=[order[next],order[index]];restore(order);API.busy=true;save(initial,before,handle.dataset.scheduleDrag);
  });
 }
})();
