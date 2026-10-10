/* Buffet permission compatibility: map the legacy generic edit check to the configured action for the active Buffet workspace. */
(() => {
  'use strict';
  let patched=false;
  function activeAction(){
    const tab=document.querySelector('.nav button.active')?.dataset?.tab;
    if(tab==='menu')return 'edit_stock';
    if(tab==='cash')return 'reports';
    if(tab==='kitchen')return 'sell';
    return 'sell';
  }
  function patch(){
    const T=window.TNT;
    if(patched||!T?.hasAccess)return;
    const original=T.hasAccess.bind(T);
    T.hasAccess=(module,scope='*',action='view')=>{
      if(module==='buffet'&&action==='edit'){
        if(original(module,scope,action))return true;
        return original(module,scope,activeAction());
      }
      return original(module,scope,action);
    };
    patched=true;
  }
  patch();
  document.addEventListener('tnt:ready',patch);
  document.addEventListener('tnt:membership',patch);
})();
