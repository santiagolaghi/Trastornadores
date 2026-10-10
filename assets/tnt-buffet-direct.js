/* Direct Buffet critical fixes. Loaded from buffet/index.html so it cannot depend on older loader caches. */
(() => {
  'use strict';
  if(!location.pathname.startsWith('/buffet')) return;
  if(window.__TNT_BUFFET_DIRECT_FIX__) return;
  window.__TNT_BUFFET_DIRECT_FIX__ = true;

  let exactMode = false;
  let products = [];
  let timer = 0;

  const style = document.createElement('style');
  style.textContent = `
body[data-tnt-module="buffet"] .paychips{grid-template-columns:repeat(2,minmax(0,1fr))!important}
body[data-tnt-module="buffet"] #tnt-pay-exact.sel{background:#ffe083!important;color:#211a05!important;border-color:#6a5511!important;box-shadow:0 3px 0 #6a551125!important}
body[data-tnt-module="buffet"] .tnt-exact-note{margin:-2px 0 12px;padding:11px 13px;border-radius:14px;background:#e5f8ed;border:1px solid #45aa78;color:#103d27;font-weight:900}
body[data-tnt-module="buffet"] .pvisual img[data-direct-photo],body[data-tnt-module="buffet"] .emoji img[data-direct-photo]{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important}
`;
  document.head.appendChild(style);

  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const totalNow = () => Number(String(document.querySelector('.carthead strong:last-child')?.textContent || '').replace(/[^0-9-]/g,'')) || 0;

  async function fetchProducts(){
    if(!window.TNT?.sb) return;
    try{
      const {data,error} = await TNT.sb.from('tnt_products').select('id,name,emoji,image_url,active').eq('active',true);
      if(error) throw error;
      products = data || [];
      schedule();
    }catch(e){ console.warn('Buffet direct products',e); }
  }

  function productForCard(card){
    const name = norm(card.querySelector('.pname')?.textContent);
    return products.find(p => norm(p.name) === name) || null;
  }

  function forcePhoto(box,p){
    if(!box || !p?.image_url) return;
    const img = box.querySelector('img');
    if(img && img.getAttribute('src') === p.image_url){
      img.dataset.directPhoto='1';
      return;
    }
    box.textContent='';
    const next = document.createElement('img');
    next.dataset.directPhoto='1';
    next.alt = p.name || 'Producto';
    next.decoding = 'async';
    next.src = p.image_url;
    next.addEventListener('error',()=>{
      box.textContent = p.emoji || '🍽️';
    },{once:true});
    box.appendChild(next);
  }

  function fixPhotos(){
    if(!products.length) return;
    document.querySelectorAll('.product').forEach(card=>{
      const p = productForCard(card);
      if(p) forcePhoto(card.querySelector('.pvisual'),p);
    });
    document.querySelectorAll('.menurow[data-product]').forEach(row=>{
      const p = products.find(x=>String(x.id)===String(row.dataset.product));
      if(p) forcePhoto(row.querySelector('.emoji'),p);
    });
  }

  function setReceivedExact(){
    if(!exactMode) return;
    const received = document.getElementById('received');
    if(!received) return;
    const total = totalNow();
    if(String(received.value) !== String(total)){
      received.value = String(total);
      received.dispatchEvent(new Event('input',{bubbles:true}));
      received.dispatchEvent(new Event('change',{bubbles:true}));
    }
    received.readOnly = true;
    let note = document.querySelector('.tnt-exact-note');
    if(!note){
      note = document.createElement('div');
      note.className = 'tnt-exact-note';
      received.closest('.field')?.insertAdjacentElement('afterend',note);
    }
    note.textContent = `✅ Pago justo · se cargó automáticamente $${total.toLocaleString('es-AR')}`;
  }

  function clearExactVisual(){
    const received = document.getElementById('received');
    if(received) received.readOnly = false;
    document.querySelector('.tnt-exact-note')?.remove();
    document.getElementById('tnt-pay-exact')?.classList.remove('sel');
  }

  function ensureExactButton(){
    const chips = document.querySelector('.paychips');
    if(!chips) return;
    let b = document.getElementById('tnt-pay-exact');
    if(!b){
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'tnt-pay-exact';
      b.className = 'chip';
      b.textContent = '✅ Pago justo';
      chips.insertBefore(b, chips.children[1] || null);
      b.addEventListener('click',()=>{
        exactMode = true;
        const cash = chips.querySelector('[data-pay="cash"]');
        cash?.click();
        setTimeout(()=>{
          const btn=document.getElementById('tnt-pay-exact');
          btn?.classList.add('sel');
          setReceivedExact();
        },0);
      });
    }
    if(exactMode){
      b.classList.add('sel');
      setReceivedExact();
    }
  }

  function enhance(){
    ensureExactButton();
    if(exactMode) setReceivedExact();
    fixPhotos();
  }
  function schedule(){ clearTimeout(timer); timer=setTimeout(enhance,20); }

  document.addEventListener('click',e=>{
    const pay = e.target.closest?.('.paychips [data-pay]');
    if(pay && !e.target.closest('#tnt-pay-exact')){
      exactMode = false;
      setTimeout(clearExactVisual,0);
    }
  },true);

  const observer = new MutationObserver(schedule);
  const start = () => {
    observer.observe(document.body,{childList:true,subtree:true});
    schedule();
    if(window.TNT?.sb) fetchProducts();
    else document.addEventListener('tnt:ready',fetchProducts,{once:true});
    window.addEventListener('focus',()=>{fetchProducts();schedule();});
    setInterval(()=>{ if(!document.hidden) fetchProducts(); },20000);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
