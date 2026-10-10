/* Buffet operational UX: preparation contrast, exact cash, change alerts, photo priority and safe test-order deletion. */
(() => {
  'use strict';
  if(!location.pathname.startsWith('/buffet'))return;

  let exactMode=false;
  let settingExact=false;
  let allowChargeOnce=false;
  let enhanceTimer=0;
  let productsById=new Map();
  let productsByName=new Map();
  let refreshingProducts=false;

  const style=document.createElement('style');
  style.id='tnt-buffet-ops-style';
  style.textContent=`
body[data-tnt-module="buffet"] .prep-pill{background:#dff7e8!important;color:#103d27!important;border-color:#2d9e68!important;box-shadow:0 2px 0 #1e684522!important}
body[data-tnt-module="buffet"] .prep-strip{background:#e6f8ed!important;color:#103d27!important;border-color:#63b98c!important;box-shadow:0 4px 0 #1e684516!important}
body[data-tnt-module="buffet"] .prep-strip b{color:#103d27!important;font-weight:950!important}
body[data-tnt-module="buffet"] .prep-strip small{color:#365f49!important;font-weight:700!important}
body[data-tnt-module="buffet"] .prep-dot{background:#15945b!important;box-shadow:0 0 0 5px #15945b22!important}
body[data-tnt-module="buffet"] .paychips{grid-template-columns:repeat(2,minmax(0,1fr))!important}
body[data-tnt-module="buffet"] #tnt-exact-pay.sel{background:#ffe083!important;color:#211a05!important;border-color:#6a5511!important;box-shadow:0 3px 0 #6a551125!important}
body[data-tnt-module="buffet"] .tnt-change-card{margin:-2px 0 14px;padding:14px 15px;border-radius:16px;border:1.5px solid var(--tnt-line);background:var(--tnt-panel);color:var(--tnt-text);display:grid;gap:3px}
body[data-tnt-module="buffet"] .tnt-change-card small{font-size:12px;font-weight:850;color:var(--tnt-muted)}
body[data-tnt-module="buffet"] .tnt-change-card strong{font-size:23px;line-height:1.05;font-weight:950;letter-spacing:-.03em}
body[data-tnt-module="buffet"] .tnt-change-card.good{background:#e5f8ed!important;border-color:#45aa78!important;color:#103d27!important}
body[data-tnt-module="buffet"] .tnt-change-card.warn{background:#fff0d9!important;border-color:#d99435!important;color:#5a3608!important}
body[data-tnt-module="buffet"] .tnt-change-card.bad{background:#ffe3e5!important;border-color:#d85b65!important;color:#651a20!important}
body[data-tnt-module="buffet"] .tnt-change-confirm{position:fixed;inset:0;z-index:12000;background:#111827dd;backdrop-filter:blur(8px);display:grid;place-items:center;padding:20px}
body[data-tnt-module="buffet"] .tnt-change-confirm-card{width:min(480px,100%);background:#fff7df;color:#241900;border:2px solid #352805;border-radius:26px;padding:24px;box-shadow:0 24px 80px #0007;text-align:center}
body[data-tnt-module="buffet"] .tnt-change-confirm-card small{font-size:13px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.7}
body[data-tnt-module="buffet"] .tnt-change-confirm-card strong{display:block;font-size:clamp(42px,12vw,72px);line-height:1;margin:10px 0 8px;letter-spacing:-.055em}
body[data-tnt-module="buffet"] .tnt-change-confirm-card p{margin:0 0 18px;font-size:15px;font-weight:750}
body[data-tnt-module="buffet"] .tnt-change-confirm-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:9px}
body[data-tnt-module="buffet"] .tnt-change-confirm-actions button{min-height:54px;border-radius:15px;border:1.5px solid #352805;font-weight:950;font-size:15px}
body[data-tnt-module="buffet"] .tnt-change-confirm-actions .ok{background:#32d583;color:#082014}
body[data-tnt-module="buffet"] .tnt-change-confirm-actions .cancel{background:#fff;color:#241900}
body[data-tnt-module="buffet"] .tnt-order-delete{width:100%;margin-top:8px!important;background:#fff0f1!important;color:#7a2028!important;border:1.5px solid #d96871!important;min-height:46px!important}
body[data-tnt-module="buffet"] .tnt-order-delete:active{transform:scale(.985)}
body[data-tnt-module="buffet"] .pvisual img[data-tnt-product-photo],body[data-tnt-module="buffet"] .emoji img[data-tnt-product-photo]{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}
@media(max-width:430px){body[data-tnt-module="buffet"] .tnt-change-confirm-card{padding:20px 16px}body[data-tnt-module="buffet"] .tnt-change-confirm-actions{grid-template-columns:1fr}}
`;
  document.head.appendChild(style);

  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const parseMoney=text=>Number(String(text||'').replace(/[^0-9-]/g,''))||0;
  const fmt=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Math.round(Number(n)||0)).replace('ARS','$');
  const toast=(text,error=false)=>window.TNTUI?.toast?.(text,error);

  function totalNow(){return parseMoney(document.querySelector('.carthead strong:last-child')?.textContent)}
  function selectedCash(){return !!document.querySelector('.paychips [data-pay="cash"].sel')}

  async function refreshProducts(){
    if(refreshingProducts||!window.TNT?.sb)return;
    refreshingProducts=true;
    try{
      const {data,error}=await TNT.sb.from('tnt_products').select('id,name,emoji,image_url,updated_at').eq('active',true);
      if(error)throw error;
      productsById=new Map((data||[]).map(p=>[String(p.id),p]));
      productsByName=new Map((data||[]).map(p=>[norm(p.name),p]));
      scheduleEnhance();
    }catch(e){console.warn('Buffet photos',e)}
    finally{refreshingProducts=false;}
  }

  function fallbackVisual(box,p){
    if(!box)return;
    box.textContent='';
    const span=document.createElement('span');
    span.className='tnt-emoji-fallback';
    span.textContent=p?.emoji||'🍽️';
    box.appendChild(span);
    box.dataset.tntForcedProduct=p?.id||'';
  }

  function forcePhoto(box,p){
    if(!box||!p)return;
    if(!p.image_url){
      if(!box.querySelector('img'))fallbackVisual(box,p);
      return;
    }
    const current=box.querySelector('img');
    if(current&&current.getAttribute('src')===p.image_url){
      current.dataset.tntProductPhoto='1';
      box.dataset.tntForcedProduct=String(p.id);
      return;
    }
    box.textContent='';
    const img=document.createElement('img');
    img.dataset.tntProductPhoto='1';
    img.alt=p.name||'Producto';
    img.decoding='async';
    img.src=p.image_url;
    img.addEventListener('error',()=>fallbackVisual(box,p),{once:true});
    box.appendChild(img);
    box.dataset.tntForcedProduct=String(p.id);
  }

  function enhanceProductPhotos(){
    if(!productsByName.size)return;
    document.querySelectorAll('.product').forEach(card=>{
      const p=productsByName.get(norm(card.querySelector('.pname')?.textContent));
      if(p)forcePhoto(card.querySelector('.pvisual'),p);
    });
    document.querySelectorAll('.menurow[data-product]').forEach(row=>{
      const p=productsById.get(String(row.dataset.product));
      if(p)forcePhoto(row.querySelector('.emoji'),p);
    });
  }

  function injectExactPayment(){
    const chips=document.querySelector('.paychips');
    if(!chips)return;
    let exact=chips.querySelector('#tnt-exact-pay');
    if(!exact){
      exact=document.createElement('button');
      exact.type='button';
      exact.id='tnt-exact-pay';
      exact.className='chip';
      exact.textContent='✅ Pago justo';
      exact.addEventListener('click',()=>{
        exactMode=true;
        settingExact=true;
        const cash=document.querySelector('.paychips [data-pay="cash"]');
        cash?.click();
        settingExact=false;
        setTimeout(()=>{applyExactPayment();scheduleEnhance();},0);
      });
      chips.appendChild(exact);
    }
    exact.classList.toggle('sel',exactMode&&selectedCash());
    if(exactMode&&selectedCash())document.querySelector('.paychips [data-pay="cash"]')?.classList.remove('sel');
  }

  function ensureChangeCard(){
    const received=document.getElementById('received');
    if(!received)return;
    const field=received.closest('.field');
    if(exactMode&&selectedCash()){
      field.style.display='none';
    }else{
      field.style.display='';
    }
    let card=document.querySelector('.tnt-change-card');
    if(!card){
      card=document.createElement('div');
      card.className='tnt-change-card';
      field.insertAdjacentElement('afterend',card);
    }
    const update=()=>{
      const total=totalNow();
      const raw=Number(received.value||0);
      card.classList.remove('good','warn','bad');
      if(exactMode&&selectedCash()){
        card.classList.add('good');
        card.innerHTML='<small>PAGO JUSTO</small><strong>Sin cambio</strong>';
        return;
      }
      if(!received.value){
        card.innerHTML='<small>EFECTIVO</small><strong>Ingresá cuánto te dieron</strong>';
        return;
      }
      const diff=raw-total;
      if(diff>0){card.classList.add('warn');card.innerHTML=`<small>DAR DE CAMBIO</small><strong>${fmt(diff)}</strong>`;}
      else if(diff===0){card.classList.add('good');card.innerHTML='<small>EFECTIVO</small><strong>Pago exacto</strong>';}
      else{card.classList.add('bad');card.innerHTML=`<small>FALTA PARA COMPLETAR</small><strong>${fmt(Math.abs(diff))}</strong>`;}
    };
    if(received.dataset.tntChangeBound!=='1'){
      received.dataset.tntChangeBound='1';
      received.addEventListener('input',update);
    }
    update();
  }

  function applyExactPayment(){
    if(!exactMode||!selectedCash())return;
    const received=document.getElementById('received');
    if(!received)return;
    const total=totalNow();
    if(Number(received.value)!==total){
      received.value=String(total);
      received.dispatchEvent(new Event('input',{bubbles:true}));
    }
  }

  function showChangeConfirm(change,total,received,charge){
    if(document.querySelector('.tnt-change-confirm'))return;
    const overlay=document.createElement('div');
    overlay.className='tnt-change-confirm';
    overlay.innerHTML=`<div class="tnt-change-confirm-card"><small>Antes de cobrar</small><strong>${fmt(change)}</strong><p>Tenés que dar de cambio.<br>Recibís ${fmt(received)} por una compra de ${fmt(total)}.</p><div class="tnt-change-confirm-actions"><button class="cancel" type="button">Volver</button><button class="ok" type="button">Cobrar y dar cambio</button></div></div>`;
    document.body.appendChild(overlay);
    const close=()=>overlay.remove();
    overlay.querySelector('.cancel').onclick=close;
    overlay.querySelector('.ok').onclick=()=>{close();allowChargeOnce=true;charge.click();};
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  }

  function orderIdFromCard(order){
    const b=order.querySelector('[data-claim],[data-ready],[data-deliver]');
    return b?.dataset.claim||b?.dataset.ready||b?.dataset.deliver||'';
  }

  function canDeleteOrders(){
    return !!(window.TNT?.isAdmin||window.TNT?.canAction?.('buffet','reports','*'));
  }

  async function deleteOrder(button,orderId,card){
    if(!window.TNT?.sb||!orderId)return;
    const ok=await window.TNTUI?.confirm?.('¿Eliminar esta orden? Se anula la venta asociada y se devuelve el stock. Usalo para pruebas o errores reales.');
    if(!ok)return;
    button.disabled=true;button.textContent='Eliminando…';
    try{
      const {data:order,error:readError}=await TNT.sb.from('tnt_orders').select('id,sale_id,order_no,status').eq('id',orderId).maybeSingle();
      if(readError)throw readError;
      if(!order?.sale_id)throw new Error('La orden ya no existe o no tiene una venta asociada.');
      const who=TNT.displayName?.()||TNT.identity?.display_name||'Equipo';
      const {error}=await TNT.sb.rpc('tnt_delete_sale',{p_sale_id:order.sale_id,p_staff:`${who} · orden #${order.order_no||''} eliminada desde Preparación`});
      if(error)throw error;
      card?.remove();
      const count=document.querySelector('.section-title span');
      if(count){const n=document.querySelectorAll('.orders .order').length;count.textContent=String(n);}
      toast('🗑️ Orden eliminada · venta, stock y caja revertidos');
    }catch(e){
      toast(e?.message||'No se pudo eliminar la orden',true);
      button.disabled=false;button.textContent='🗑️ Eliminar orden / prueba';
    }
  }

  function enhanceOrders(){
    if(!canDeleteOrders())return;
    document.querySelectorAll('.orders .order').forEach(card=>{
      if(card.querySelector('.tnt-order-delete'))return;
      const id=orderIdFromCard(card);if(!id)return;
      const b=document.createElement('button');
      b.type='button';b.className='btn tnt-order-delete';b.textContent='🗑️ Eliminar orden / prueba';
      b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void deleteOrder(b,id,card);});
      card.appendChild(b);
    });
  }

  function enhance(){
    injectExactPayment();
    if(exactMode&&selectedCash())applyExactPayment();
    ensureChangeCard();
    enhanceProductPhotos();
    enhanceOrders();
  }
  function scheduleEnhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhance,25);}

  document.addEventListener('click',event=>{
    const pay=event.target.closest?.('.paychips [data-pay]');
    if(pay&&!settingExact){exactMode=false;setTimeout(scheduleEnhance,0);}

    const charge=event.target.closest?.('#charge');
    if(!charge)return;
    if(allowChargeOnce){allowChargeOnce=false;return;}
    if(exactMode||!selectedCash())return;
    const received=document.getElementById('received');
    const total=totalNow(),amount=Number(received?.value||0),change=amount-total;
    if(change<=0)return;
    event.preventDefault();event.stopImmediatePropagation();
    showChangeConfirm(change,total,amount,charge);
  },true);

  const observer=new MutationObserver(()=>scheduleEnhance());
  const start=()=>{
    observer.observe(document.body,{childList:true,subtree:true});
    scheduleEnhance();
    const boot=()=>{refreshProducts();scheduleEnhance();};
    if(window.TNT?.sb)boot();else document.addEventListener('tnt:ready',boot,{once:true});
    window.addEventListener('focus',refreshProducts);
    setInterval(()=>{if(!document.hidden)refreshProducts();},20000);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
