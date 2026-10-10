/* Buffet stock editor: mirrors the current shift stock inside Edit product without duplicating Buffet state. */
(() => {
  'use strict';
  let context=null,pending=null,applyTimer=0,applyAttempts=0;

  const toInt=value=>Math.max(0,Math.trunc(Number(value)||0));
  const productRow=id=>{
    if(!id)return null;
    try{return document.querySelector(`.menurow[data-product="${CSS.escape(String(id))}"]`);}catch{return document.querySelector('.menurow[data-product="'+String(id).replaceAll('"','\\"')+'"]');}
  };

  document.addEventListener('click',event=>{
    const edit=event.target.closest?.('.edit-product[data-p]');
    if(edit){
      const row=edit.closest('.menurow');
      context={productId:edit.dataset.p,row};
      pending=null;applyAttempts=0;clearTimeout(applyTimer);
      return;
    }
    if(event.target.closest?.('#new-product')){
      context=null;pending=null;applyAttempts=0;clearTimeout(applyTimer);
    }
  },true);

  function enhanceProductForm(){
    const form=document.getElementById('prod-form');
    if(!form||form.dataset.tntStockEnhanced==='1'||!context?.productId)return;
    const row=context.row?.isConnected?context.row:productRow(context.productId);
    const qty=row?.querySelector('.mi-qty'),rem=row?.querySelector('.mi-rem'),active=row?.querySelector('.mi-active');
    const editable=!!(qty&&rem&&active?.checked&&!rem.disabled);
    const block=document.createElement('div');
    block.dataset.tntStockFields='1';
    if(editable){
      block.innerHTML=`<div class="field" style="margin-top:4px;margin-bottom:8px"><label>Stock de esta jornada</label><small class="muted" style="line-height:1.35">Podés corregir acá lo preparado y cuántos quedan hoy.</small></div><div class="mini-grid"><div class="field"><label>Preparados</label><input class="input" id="pstock-initial" type="number" inputmode="numeric" min="0" step="1" value="${toInt(qty.value)}" required></div><div class="field"><label>Quedan</label><input class="input" id="pstock-remaining" type="number" inputmode="numeric" min="0" step="1" value="${toInt(rem.value)}" required></div></div>`;
    }else{
      block.innerHTML='<div class="field" style="margin-top:4px"><label>Stock de esta jornada</label><div class="muted" style="padding:11px 12px;border:1px solid var(--line);border-radius:13px;background:var(--panel2);font-size:13px;line-height:1.35">Este producto todavía no está activo para esta jornada. Activá “Vender este sábado” en Menú para cargar cuántos quedan.</div></div>';
    }
    const photo=form.querySelector('#pimg')?.closest('.field');
    form.insertBefore(block,photo||form.querySelector('.switchline')||form.lastElementChild);
    form.dataset.tntStockEnhanced='1';
    if(!editable)return;
    let dirty=false;
    const initial=block.querySelector('#pstock-initial'),remaining=block.querySelector('#pstock-remaining');
    [initial,remaining].forEach(input=>input.addEventListener('input',()=>{dirty=true;}));
    form.addEventListener('submit',()=>{
      if(!dirty)return;
      pending={productId:context.productId,initial:toInt(initial.value),remaining:toInt(remaining.value)};
      applyAttempts=0;
    },true);
  }

  function applyPendingStock(){
    clearTimeout(applyTimer);
    if(!pending)return;
    const form=document.getElementById('prod-form');
    if(form){applyTimer=setTimeout(applyPendingStock,80);return;}
    const row=productRow(pending.productId);
    if(!row){
      if(++applyAttempts<20)applyTimer=setTimeout(applyPendingStock,80);
      return;
    }
    const qty=row.querySelector('.mi-qty'),rem=row.querySelector('.mi-rem'),active=row.querySelector('.mi-active');
    if(!qty||!rem||!active?.checked||rem.disabled){
      window.TNTUI?.toast?.('El producto ya no está activo para esta jornada; el stock no se modificó.',true);
      pending=null;return;
    }
    qty.value=String(pending.initial);
    rem.value=String(pending.remaining);
    const changed=rem;
    pending=null;
    changed.dispatchEvent(new Event('change',{bubbles:true}));
  }

  const observer=new MutationObserver(()=>{
    enhanceProductForm();
    if(pending&&!document.getElementById('prod-form'))applyPendingStock();
    if(context&&!document.getElementById('prod-form')&&!pending){
      const overlay=document.querySelector('.order-alert #prod-form');
      if(!overlay)context=null;
    }
  });
  const start=()=>{observer.observe(document.body,{childList:true,subtree:true});enhanceProductForm();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
