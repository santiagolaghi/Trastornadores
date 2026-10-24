const {test}=require('node:test');
const assert=require('node:assert/strict');
test('La conexión bíblica valida catálogo, capítulos, licencias y créditos sin revelar la clave',async t=>{
 const {GET}=await import('../api/bible.mjs'),originalFetch=global.fetch,originalKey=process.env.YOUVERSION_APP_KEY;
 const secret='synthetic-test-key';process.env.YOUVERSION_APP_KEY=secret;
 const defaults=[{id:147,title:'Reina-Valera Antigua',abbreviation:'RVES'},{id:3291,title:'Versión Biblia Libre',abbreviation:'VBL'},{id:3365,title:'Palabra de Dios para ti',abbreviation:'PdDpt'}];
 let auth=true,enabled=true,upstreamStatus=200,catalogStatus=200,fullCatalogStatus=200,credit='Créditos de prueba',promo='',calls=[],licensed=defaults,paginated=false,repeatPage=false,leakyCss=false,knownMetadata=false;
 global.fetch=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('/auth/v1/user'))return Response.json({id:'test-user'},{status:auth?200:401});
  if(url.includes('/rest/v1/tnt_accounts'))return Response.json([{enabled}]);
  assert.equal(options.headers['X-YVP-App-Key'],secret);
  const u=new URL(url),id=Number(u.pathname.split('/')[3]);
  if(u.pathname==='/v1/bibles'){
   const all=u.searchParams.get('all_available')==='true',status=all?fullCatalogStatus:catalogStatus;
   assert.equal(u.searchParams.get('language_ranges[]'),'es');assert.equal(u.searchParams.get('page_size'),'99');
   if(status!==200)return Response.json({}, {status});
   if(all)return Response.json({data:[...licensed,{id:128,title:'NVI 2025'},{id:2664,title:'NVI 2015'}]});
   const token=u.searchParams.get('page_token');
   if(paginated)return Response.json({data:token?[...licensed.slice(1),licensed[0]]:[licensed[0]],next_page_token:!token||repeatPage?'second-page':undefined});
   return Response.json({data:licensed});
  }
  if(u.pathname.includes('/fonts/'))return new Response(leakyCss?secret:'@font-face {font-family:Test;src:url(https://cdn.youversion.com/test.woff2)}');
  if(upstreamStatus!==200&&!(knownMetadata&&/^\/v1\/bibles\/128$/.test(u.pathname)))return Response.json({}, {status:upstreamStatus});
  if(u.pathname.includes('/passages/'))return Response.json({id:'JHN.3',reference:'Juan 3',content:'<p>Contenido sintético</p>'});
  if(u.pathname.includes('/index'))return Response.json({books:[{id:'GEN',chapters:[{id:'1'},{id:'2'}]}],text_direction:'ltr'});
  return Response.json({id,title:licensed.find(v=>Number(v.id)===id)?.title,copyright:credit,promotional_content:promo});
 };
 const request=(query='',signed=true)=>GET(new Request('https://tnt.example/api/bible?'+query,{headers:signed?{Authorization:'Bearer synthetic.test.token'}:{}}));
 try{
  await t.test('Rechaza visitantes, tokens vencidos y cuentas deshabilitadas antes de usar YouVersion',async()=>{
   assert.equal((await request('',false)).status,401);assert.equal(calls.length,0);
   auth=false;assert.equal((await request()).status,401);auth=true;
   enabled=false;assert.equal((await request()).status,403);enabled=true;
   assert(!calls.some(c=>c.url.includes('youversion')));
  });
  await t.test('Conserva todas las traducciones habilitadas y diferencia licencias de versiones no ofrecidas',async()=>{
   const response=await request(),data=await response.json();assert.equal(response.status,200);
   assert.deepEqual(data.versions.map(v=>v.id),[147,3291,3365]);assert.equal(data.preferred,147);
   assert.equal(data.unavailable.find(v=>v.id===128).code,'LICENSE_REQUIRED');assert.equal(data.unavailable.find(v=>v.id===127).code,'VERSION_UNAVAILABLE');
   for(const id of [147,3291,3365]){assert.equal((await request('action=index&version='+id)).status,200);assert.equal((await request('action=passage&passage=JHN.3&version='+id)).status,200);}
  });
  await t.test('Recorre las páginas, normaliza IDs de texto y admite nuevas versiones autorizadas',async()=>{
   licensed=[defaults[0],{...defaults[1],id:'3291'},defaults[2],{id:81234,title:'Nueva traducción autorizada',abbreviation:'PRUEBA'}];paginated=true;
   const response=await request(),data=await response.json();assert.deepEqual(data.versions.map(v=>v.id),[147,3291,3365,81234]);
   assert.equal((await request('action=passage&passage=JHN.3&version=81234')).status,200);
   licensed=defaults;paginated=false;await request();
  });
  await t.test('No acepta URLs, rangos enormes, IDs fuera del catálogo ni acciones arbitrarias',async()=>{
   for(const query of ['action=passage&passage=https://other.example','action=passage&passage=GEN.1-GEN.50','action=index&version=999','action=index&version=3291.5','action=anything'])assert.equal((await request(query)).status,400);
   assert(!calls.some(c=>c.url.startsWith('https://other.example')));
  });
  await t.test('Distingue licencia pendiente, versión no ofrecida, pasaje inexistente y clave rechazada',async()=>{
   upstreamStatus=403;let response=await request('action=passage&passage=JHN.3&version=128');assert.equal(response.status,403);assert.equal((await response.json()).code,'LICENSE_REQUIRED');
   upstreamStatus=404;response=await request('action=passage&passage=JHN.3&version=127');assert.equal((await response.json()).code,'VERSION_UNAVAILABLE');
   response=await request('action=passage&passage=JHN.999&version=3291');assert.equal((await response.json()).code,'PASSAGE_NOT_FOUND');
   upstreamStatus=401;response=await request('action=passage&passage=JHN.3&version=3291');assert.equal(response.status,503);assert.equal((await response.json()).code,'BIBLE_KEY_INVALID');upstreamStatus=200;
  });
  await t.test('Una licencia nueva comprueba el texto sin depender del catálogo anterior o interrumpido',async()=>{
   calls=[];catalogStatus=503;let response=await request('action=passage&passage=JHN.3&version=128');assert.equal(response.status,200);assert.equal((await response.json()).copyright,credit);
   assert(!calls.some(c=>new URL(c.url).pathname==='/v1/bibles'));assert(calls.some(c=>c.url.includes('/bibles/128/passages/')));
   upstreamStatus=403;response=await request('action=passage&passage=JHN.3&version=128');assert.equal(response.status,403);assert.equal((await response.json()).code,'LICENSE_REQUIRED');
   catalogStatus=200;upstreamStatus=404;knownMetadata=true;response=await request('action=passage&passage=JHN.999&version=128');assert.equal((await response.json()).code,'PASSAGE_NOT_FOUND');knownMetadata=false;upstreamStatus=200;
  });
  await t.test('Cada pasaje obtiene créditos actuales; RVES con campos nulos conserva edición y fuente sin inventar copyright',async()=>{
   calls=[];const response=await request('action=passage&passage=JHN.3&version=3291');assert.equal(response.status,200);const data=await response.json();assert.equal(data.copyright,credit);assert(calls.some(c=>c.url.endsWith('/bibles/3291')));assert(!JSON.stringify(data).includes(secret));
   credit=' ';promo='Créditos promocionales';assert.equal((await (await request('action=passage&passage=JHN.3&version=147')).json()).copyright,promo);
   promo='';const rves=await request('action=passage&passage=JHN.3&version=147');assert.equal(rves.status,200);assert.match((await rves.json()).copyright,/Reina-Valera Antigua \(RVES\).*YouVersion/);
   const missing=await request('action=passage&passage=JHN.3&version=3291');assert.equal(missing.status,502);assert.equal((await missing.json()).content,undefined);credit='Créditos';
  });
  await t.test('Un fallo del catálogo completo conserva las versiones habilitadas; los errores de conexión no se presentan como licencias',async()=>{
   fullCatalogStatus=503;let response=await request(),data=await response.json();assert.equal(response.status,200);assert.equal(data.versions.length,3);assert(data.unavailable.every(v=>v.code==='ACCESS_UNKNOWN'));fullCatalogStatus=200;
   for(const [status,code] of [[401,'BIBLE_KEY_INVALID'],[403,'BIBLE_ACCESS_DENIED'],[429,'BIBLE_RATE_LIMIT'],[503,'BIBLE_CONNECTION_ERROR']]){catalogStatus=status;response=await request();assert.equal((await response.json()).code,code);}
   catalogStatus=200;await request();
  });
  await t.test('Una paginación repetida termina con error en vez de bloquear el lector',async()=>{
   paginated=true;repeatPage=true;const response=await request();assert.equal(response.status,503);repeatPage=false;paginated=false;await request();
  });
  await t.test('Las fuentes y errores nunca publican la credencial y el texto no se cachea',async()=>{
   let response=await request('action=fonts');assert.equal(response.headers.get('cache-control'),'private, no-store');assert(!JSON.stringify(await response.json()).includes(secret));
   leakyCss=true;response=await request('action=fonts');assert.equal((await response.json()).css,'');leakyCss=false;
   response=await request('action=passage&passage=JHN.3&version=3291');assert.equal(response.headers.get('cache-control'),'private, no-store');
   delete process.env.YOUVERSION_APP_KEY;const missing=await request();assert.equal(missing.status,503);assert.equal((await missing.json()).code,'BIBLE_NOT_CONFIGURED');
  });
 }finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.YOUVERSION_APP_KEY;else process.env.YOUVERSION_APP_KEY=originalKey;}
});
