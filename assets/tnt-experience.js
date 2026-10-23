/* Shared application layer; classic scripts are kept in dependency order. */
(() => {
 const files=['tnt-experience-base.js?v=20261017r3','tnt-template-builder.js?v=20261021','tnt-profile-view.js?v=20261021r4','tnt-profile-editor.js?v=20261021r4','tnt-profile-link.js?v=20261016','tnt-navigation.js?v=20261023b','tnt-appearance.js?v=20261023c','tnt-accounts.js?v=20261023c','tnt-module-deck.js?v=20261023c','tnt-onboarding.js?v=20261017r3','tnt-live-guard.js?v=20261021r4','tnt-bible-games.js?v=20261023c','tnt-community.js?v=20261023c','tnt-unified.js?v=20261023c'].map(f=>'/assets/'+f);
 if(location.pathname.startsWith('/buffet'))files.push('/assets/tnt-buffet-stock.js?v=1','/assets/tnt-buffet-permissions.js?v=1','/assets/tnt-buffet-polish.js?v=1','/assets/tnt-buffet-ops.js?v=2');
 if(document.readyState==='loading'){document.write(files.map(src=>'<script src="'+src+'"><\/script>').join(''));return;}
 const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s);});
 files.reduce((p,src)=>p.then(()=>load(src)),Promise.resolve()).catch(e=>console.error('TNT shared layer',e));
})();
