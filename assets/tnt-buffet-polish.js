/* Buffet UX polish: clearer cards, deliberate photo fallbacks and fast cart feedback. */
(() => {
  'use strict';
  if(!location.pathname.startsWith('/buffet'))return;

  const style=document.createElement('style');
  style.id='tnt-buffet-polish-style';
  style.textContent=`
body[data-tnt-module="buffet"] .content{max-width:760px!important}
body[data-tnt-module="buffet"] .section-title{align-items:flex-start;gap:8px}
body[data-tnt-module="buffet"] .section-title h2{font-size:22px!important;letter-spacing:-.025em;color:var(--tnt-text)!important}
body[data-tnt-module="buffet"] .section-title span{font-size:13px!important;line-height:1.4;color:var(--tnt-muted)!important;max-width:220px;text-align:right}
body[data-tnt-module="buffet"] .prodgrid{gap:12px!important}
body[data-tnt-module="buffet"] .product{min-height:188px!important;background:var(--tnt-panel)!important;color:var(--tnt-text)!important;border:1.5px solid var(--tnt-line)!important;border-radius:20px!important;box-shadow:0 6px 0 color-mix(in srgb,var(--tnt-text) 13%,transparent);overflow:hidden;transition:transform .12s ease,box-shadow .16s ease,border-color .16s ease!important}
body[data-tnt-module="buffet"] .product:not(:disabled):active{transform:translateY(2px) scale(.975)!important;box-shadow:0 2px 0 color-mix(in srgb,var(--tnt-text) 14%,transparent)!important}
body[data-tnt-module="buffet"] .product:disabled{opacity:.68!important}
body[data-tnt-module="buffet"] .pvisual{height:102px!important;position:relative;background:color-mix(in srgb,var(--tnt-peach) 18%,var(--tnt-panel2))!important;border-bottom:1px solid var(--tnt-line);font-size:44px!important;isolation:isolate}
body[data-tnt-module="buffet"] .pvisual img{display:block;width:100%!important;height:100%!important;object-fit:cover!important}
body[data-tnt-module="buffet"] .tnt-emoji-fallback{width:64px;height:64px;display:grid;place-items:center;border-radius:20px;background:var(--tnt-panel)!important;border:1px solid var(--tnt-line);font-size:38px;box-shadow:0 5px 14px #0001}
body[data-tnt-module="buffet"] .tnt-emoji-fallback::after{content:"";position:absolute;inset:12px;border:1px dashed color-mix(in srgb,var(--tnt-text) 12%,transparent);border-radius:16px;z-index:-1}
body[data-tnt-module="buffet"] .pbody{padding:12px 13px 13px!important;background:var(--tnt-panel)!important}
body[data-tnt-module="buffet"] .pname{color:var(--tnt-text)!important;font-size:16px!important;font-weight:900!important;line-height:1.18!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;min-height:38px;letter-spacing:-.018em}
body[data-tnt-module="buffet"] .pmeta{margin-top:7px!important;align-items:center!important;gap:6px!important}
body[data-tnt-module="buffet"] .price{color:var(--tnt-text)!important;font-size:18px!important;font-weight:950!important;letter-spacing:-.025em}
body[data-tnt-module="buffet"] .stock{color:var(--tnt-text)!important;background:var(--tnt-panel2);border:1px solid var(--tnt-line);border-radius:999px;padding:4px 7px;font-size:11.5px!important;font-weight:850!important;white-space:nowrap}
body[data-tnt-module="buffet"] .stock.low{color:#c8333d!important;background:color-mix(in srgb,#ff5d68 10%,var(--tnt-panel));border-color:color-mix(in srgb,#ff5d68 35%,var(--tnt-line))}
body[data-tnt-module="buffet"] .soldout{background:color-mix(in srgb,var(--tnt-bg) 82%,transparent)!important;color:var(--tnt-text)!important;backdrop-filter:blur(2px);font-size:16px!important}

body[data-tnt-module="buffet"] .cartbar{background:color-mix(in srgb,var(--tnt-peach) 24%,var(--tnt-panel))!important;color:var(--tnt-text)!important;border:1.5px solid color-mix(in srgb,var(--tnt-text) 52%,var(--tnt-line))!important;border-radius:24px!important;box-shadow:0 7px 0 color-mix(in srgb,var(--tnt-text) 13%,transparent)!important;padding:18px!important;transition:transform .18s cubic-bezier(.2,.85,.25,1.25),box-shadow .18s ease!important}
body[data-tnt-module="buffet"] .cartbar.tnt-cart-bump{animation:tntBuffetCartBump .34s cubic-bezier(.2,.9,.25,1.25)}
body[data-tnt-module="buffet"] .carthead{padding-bottom:11px;border-bottom:1px solid color-mix(in srgb,var(--tnt-text) 48%,transparent);gap:12px}
body[data-tnt-module="buffet"] .carthead strong{color:var(--tnt-text)!important;font-size:19px!important;font-weight:950!important;letter-spacing:-.025em}
body[data-tnt-module="buffet"] .carthead strong:last-child{font-size:27px!important;white-space:nowrap}
body[data-tnt-module="buffet"] .cartitem{padding:13px 0!important;border-top:0!important;border-bottom:1px solid color-mix(in srgb,var(--tnt-text) 28%,transparent)!important}
body[data-tnt-module="buffet"] .cartitem b{color:var(--tnt-text)!important;font-size:17px!important;font-weight:900!important;line-height:1.25}
body[data-tnt-module="buffet"] .cartitem .muted{color:color-mix(in srgb,var(--tnt-text) 68%,transparent)!important;font-size:15px!important;margin-top:3px}
body[data-tnt-module="buffet"] .qty{gap:8px!important}
body[data-tnt-module="buffet"] .qty b{min-width:24px;text-align:center;font-size:18px!important}
body[data-tnt-module="buffet"] .qty button{width:42px!important;height:42px!important;background:var(--tnt-panel)!important;color:var(--tnt-text)!important;border:1.5px solid color-mix(in srgb,var(--tnt-text) 45%,var(--tnt-line))!important;font-size:22px!important;box-shadow:0 2px 0 color-mix(in srgb,var(--tnt-text) 16%,transparent);transition:transform .1s ease!important}
body[data-tnt-module="buffet"] .qty button:active{transform:scale(.9)}
body[data-tnt-module="buffet"] .checkout{margin-top:16px!important;padding-top:0!important;border-top:0!important}
body[data-tnt-module="buffet"] .checkout .field label{color:var(--tnt-text)!important;opacity:.78!important;font-size:12px!important;font-weight:900!important}
body[data-tnt-module="buffet"] .checkout .input{background:var(--tnt-panel)!important;color:var(--tnt-text)!important;border:1.5px solid color-mix(in srgb,var(--tnt-text) 45%,var(--tnt-line))!important;min-height:56px!important;font-size:16px!important}
body[data-tnt-module="buffet"] .checkout .input::placeholder{color:color-mix(in srgb,var(--tnt-text) 48%,transparent)!important;opacity:1!important}
body[data-tnt-module="buffet"] .paychips{gap:8px!important;margin:14px 0!important}
body[data-tnt-module="buffet"] .paychips .chip{min-height:52px!important;background:var(--tnt-panel)!important;color:var(--tnt-text)!important;border:1.5px solid color-mix(in srgb,var(--tnt-text) 35%,var(--tnt-line))!important;border-radius:15px!important;font-size:14px!important;font-weight:900!important;opacity:1!important;transition:transform .12s ease,background .14s ease,border-color .14s ease!important}
body[data-tnt-module="buffet"] .paychips .chip:active{transform:scale(.97)}
body[data-tnt-module="buffet"] .paychips .chip.sel{background:var(--tnt-lime)!important;color:#171a17!important;border-color:#171a17!important;box-shadow:0 3px 0 #171a1730!important}
body[data-tnt-module="buffet"] #charge{min-height:60px!important;border:1.5px solid #173725!important;border-radius:17px!important;background:#32d583!important;color:#082014!important;font-size:18px!important;font-weight:950!important;letter-spacing:-.02em;box-shadow:0 4px 0 #17372530;transition:transform .11s ease,box-shadow .11s ease!important}
body[data-tnt-module="buffet"] #charge:active{transform:translateY(2px) scale(.99);box-shadow:0 1px 0 #17372530}
body[data-tnt-module="buffet"] .buffet-order-actions .btn{background:var(--tnt-panel)!important;color:var(--tnt-text)!important;border:1px solid var(--tnt-line)!important}

.tnt-buffet-fly{position:fixed;z-index:9999;pointer-events:none;display:grid;place-items:center;min-width:44px;height:44px;padding:0 11px;border-radius:999px;background:#32d583;color:#082014;border:1px solid #173725;font:900 16px/1 var(--tnt-font,system-ui);box-shadow:0 10px 30px #0004;transform:translate(-50%,-50%);animation:tntBuffetFly .62s cubic-bezier(.16,.75,.25,1) forwards}
.tnt-buffet-success{position:fixed;left:50%;top:22%;z-index:10000;pointer-events:none;transform:translate(-50%,-50%);display:grid;place-items:center;width:80px;height:80px;border-radius:50%;background:#32d583;color:#082014;border:2px solid #173725;font-size:40px;box-shadow:0 18px 60px #0004;animation:tntBuffetSuccess .72s cubic-bezier(.2,.9,.25,1) forwards}
@keyframes tntBuffetFly{0%{opacity:0;transform:translate(-50%,-35%) scale(.65)}18%{opacity:1;transform:translate(-50%,-58%) scale(1.06)}100%{opacity:0;transform:translate(-50%,-145%) scale(.9)}}
@keyframes tntBuffetCartBump{0%,100%{transform:scale(1)}45%{transform:scale(1.018)}}
@keyframes tntBuffetSuccess{0%{opacity:0;transform:translate(-50%,-50%) scale(.5)}25%{opacity:1;transform:translate(-50%,-50%) scale(1.12)}75%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-70%) scale(.9)}}
@media(max-width:520px){body[data-tnt-module="buffet"] .pvisual{height:94px!important}body[data-tnt-module="buffet"] .pname{font-size:15px!important;min-height:35px}body[data-tnt-module="buffet"] .price{font-size:17px!important}body[data-tnt-module="buffet"] .stock{font-size:11px!important;padding:3px 6px}body[data-tnt-module="buffet"] .cartbar{padding:15px!important}body[data-tnt-module="buffet"] .carthead strong{font-size:18px!important}body[data-tnt-module="buffet"] .carthead strong:last-child{font-size:24px!important}body[data-tnt-module="buffet"] .paychips{grid-template-columns:repeat(3,minmax(0,1fr))!important}body[data-tnt-module="buffet"] .paychips .chip{padding-inline:4px!important}}
@media(prefers-reduced-motion:reduce){body[data-tnt-module="buffet"] .product,body[data-tnt-module="buffet"] .cartbar,body[data-tnt-module="buffet"] .qty button,body[data-tnt-module="buffet"] .paychips .chip,body[data-tnt-module="buffet"] #charge{transition:none!important}.tnt-buffet-fly,.tnt-buffet-success{display:none!important}body[data-tnt-module="buffet"] .cartbar.tnt-cart-bump{animation:none!important}}
`;
  document.head.appendChild(style);

  function wrapFallback(visual){
    if(!visual||visual.dataset.tntVisualReady==='1')return;
    visual.dataset.tntVisualReady='1';
    const img=visual.querySelector('img');
    if(img){
      img.addEventListener('error',()=>{
        visual.textContent='';
        const span=document.createElement('span');
        span.className='tnt-emoji-fallback';span.textContent='🍽️';
        visual.appendChild(span);
      },{once:true});
      return;
    }
    const value=(visual.textContent||'🍽️').trim()||'🍽️';
    visual.textContent='';
    const span=document.createElement('span');
    span.className='tnt-emoji-fallback';span.textContent=value;
    visual.appendChild(span);
  }

  function decorate(root=document){root.querySelectorAll?.('.pvisual').forEach(wrapFallback);}
  function bumpCart(){
    let tries=0;
    const run=()=>{
      const cart=document.querySelector('.cartbar');
      if(!cart&&tries++<6){setTimeout(run,35);return;}
      if(!cart)return;
      cart.classList.remove('tnt-cart-bump');
      void cart.offsetWidth;
      cart.classList.add('tnt-cart-bump');
      setTimeout(()=>cart.classList.remove('tnt-cart-bump'),380);
    };
    setTimeout(run,12);
  }
  function flyFrom(el,text){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const r=el.getBoundingClientRect();
    const fly=document.createElement('div');
    fly.className='tnt-buffet-fly';fly.textContent=text;
    fly.style.left=(r.left+r.width/2)+'px';fly.style.top=(r.top+Math.min(r.height*.48,70))+'px';
    document.body.appendChild(fly);setTimeout(()=>fly.remove(),700);
  }
  function success(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const el=document.createElement('div');el.className='tnt-buffet-success';el.textContent='✓';document.body.appendChild(el);setTimeout(()=>el.remove(),780);
  }

  document.addEventListener('click',event=>{
    const product=event.target.closest?.('.product[data-id]:not(:disabled)');
    if(product){flyFrom(product,'+1');bumpCart();return;}
    const qty=event.target.closest?.('.qty button');
    if(qty){flyFrom(qty,qty.dataset.act==='minus'?'−1':'+1');bumpCart();}
  },true);

  let lastToast='';
  const observer=new MutationObserver(records=>{
    decorate(document);
    const toast=document.getElementById('toast');
    if(toast?.classList.contains('show')){
      const text=(toast.textContent||'').trim();
      if(text&&text!==lastToast){lastToast=text;if(/^✅|^Cobrado|Cobrado/.test(text))success();}
    }
  });
  const start=()=>{decorate(document);observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
