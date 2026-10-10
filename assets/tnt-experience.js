/* TNT experience loader. The base stays byte-identical; the guard replaces only the realtime subscription strategy. */
(() => {
  const base='/assets/tnt-experience-base.js?v=1',guard='/assets/tnt-live-guard.js?v=1';
  if(document.readyState==='loading'){
    document.write('<script src="'+base+'"><\/script><script src="'+guard+'"><\/script>');
    return;
  }
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s);});
  load(base).then(()=>load(guard)).catch(e=>console.error('TNT experience loader',e));
})();
