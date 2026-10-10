/* TNT experience loader. The base stays byte-identical; the guard replaces only the realtime subscription strategy. */
(() => {
  const base='/assets/tnt-experience-base.js?v=1',guard='/assets/tnt-live-guard.js?v=2',isBuffet=location.pathname.startsWith('/buffet'),buffetStock=isBuffet?'/assets/tnt-buffet-stock.js?v=1':'',buffetPermissions=isBuffet?'/assets/tnt-buffet-permissions.js?v=1':'',buffetPolish=isBuffet?'/assets/tnt-buffet-polish.js?v=1':'',buffetOps=isBuffet?'/assets/tnt-buffet-ops.js?v=2':'';
  if(document.readyState==='loading'){
    document.write('<script src="'+base+'"><\/script><script src="'+guard+'"><\/script>'+(buffetStock?'<script src="'+buffetStock+'"><\/script><script src="'+buffetPermissions+'"><\/script><script src="'+buffetPolish+'"><\/script><script src="'+buffetOps+'"><\/script>':''));
    return;
  }
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s);});
  load(base).then(()=>load(guard)).then(()=>buffetStock&&load(buffetStock)).then(()=>buffetPermissions&&load(buffetPermissions)).then(()=>buffetPolish&&load(buffetPolish)).then(()=>buffetOps&&load(buffetOps)).catch(e=>console.error('TNT experience loader',e));
})();
