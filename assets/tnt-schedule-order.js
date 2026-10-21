(() => {
 'use strict';
 const API=window.TNTScheduleOrder={busy:false,bind,validOrder,ordered,overlaps};
 function validOrder(items){let previous='';for(const item of items){const time=item.starts_at;if(!time)continue;if(previous&&time<previous)return false;previous=time;}return true;}
 function ordered(items){
  const rows=[...items].sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||a.id.localeCompare(b.id));
  // Keep flexible cards in their slots, including when a coordinator edits a time.
  const timed=rows.filter(i=>i.starts_at).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)||(a.sort_order??0)-(b.sort_order??0)||a.id.localeCompare(b.id));let n=0;
  return rows.map(i=>i.starts_at?timed[n++]:i);
 }
 function overlaps(a,b){
  if(!a.planned_start||!b.planned_start||!a.duration_minutes||!b.duration_minutes)return false;
  const start=Date.parse(a.planned_start),other=Date.parse(b.planned_start);
  return Number.isFinite(start)&&Number.isFinite(other)&&start<other+Number(b.duration_minutes)*60000&&other<start+Number(a.duration_minutes)*60000;
 }
 function bind(list,{snapshot=()=>[],validate=()=>true,onBlocked,onSave,onError,onSettled}={}){
  if(list.dataset.orderBound)return;list.dataset.orderBound='true';let drag,frame;
  const rows=()=>[...list.children].filter(el=>el.dataset.scheduleOrderItem);
  const ids=()=>rows().map(el=>el.dataset.scheduleOrderItem);
  const restore=order=>{for(const id of order){const row=rows().find(el=>el.dataset.scheduleOrderItem===id);if(row)list.append(row);}};
  async function save(initial,before,focusId){
   const next=ids();if(next.join('|')===initial.join('|')){API.busy=false;onSettled?.();return;}
   if(!validate(next)){restore(initial);API.busy=false;onBlocked?.();onSettled?.();return;}
   list.classList.add('is-order-saving');list.setAttribute('aria-busy','true');
   try{await onSave(next,before);}catch(error){restore(initial);await onError?.(error);}
   finally{API.busy=false;list.classList.remove('is-order-saving');list.removeAttribute('aria-busy');onSettled?.();if(focusId)document.querySelector('[data-schedule-drag="'+focusId+'"]')?.focus({preventScroll:true});}
  }
  function move(){
   if(!drag)return;
   drag.ghost.style.transform='translateY('+(drag.y-drag.startY)+'px)';
   const other=rows().filter(row=>row!==drag.row),target=other.find(row=>{const r=row.getBoundingClientRect();return drag.y<r.top+r.height/2});
   const candidate=other.map(row=>row.dataset.scheduleOrderItem);candidate.splice(target?other.indexOf(target):other.length,0,drag.row.dataset.scheduleOrderItem);
   if(!validate(candidate)){drag.ghost.classList.add('is-order-blocked');if(!drag.blocked){onBlocked?.();drag.blocked=true;}return;}
   drag.ghost.classList.remove('is-order-blocked');drag.blocked=false;
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
   const before=snapshot(),order=[...initial];[order[index],order[next]]=[order[next],order[index]];if(!validate(order)){onBlocked?.();return;}restore(order);API.busy=true;save(initial,before,handle.dataset.scheduleDrag);
  });
 }
})();
