const {test}=require('node:test');
const assert=require('node:assert/strict');
test('La conexión bíblica valida sesión, cuenta, rutas, licencia y créditos sin revelar la clave',async t=>{
 const {GET}=await import('../api/bible.mjs'),originalFetch=global.fetch,originalKey=process.env.YOUVERSION_APP_KEY;
 const secret='synthetic-test-key';process.env.YOUVERSION_APP_KEY=secret;
 let auth=true,enabled=true,upstreamStatus=200,credit='Créditos de prueba',calls=[];
 global.fetch=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('/auth/v1/user'))return Response.json({id:'test-user'},{status:auth?200:401});
  if(url.includes('/rest/v1/tnt_accounts'))return Response.json([{enabled}]);
  assert.equal(options.headers['X-YVP-App-Key'],secret);
  if(upstreamStatus!==200)return Response.json({}, {status:upstreamStatus});
  if(url.includes('/fonts/'))return new Response('@font-face {font-family:Test;src:url(https://cdn.youversion.com/test.woff2)}');
  if(url.includes('/passages/'))return Response.json({id:'JHN.3',reference:'Juan 3',content:'<p>Contenido sintético</p>'});
  if(url.includes('/index'))return Response.json({books:[],text_direction:'ltr'});
  if(url.includes('page_size'))return Response.json({data:[{id:128,title:'NVI 2025'},{id:2664,title:'NVI 2015'},{id:999,title:'Otra'}]});
  return Response.json({id:128,title:'NVI 2025',copyright:credit});
 };
 const request=(query='',signed=true)=>GET(new Request('https://tnt.example/api/bible?'+query,{headers:signed?{Authorization:'Bearer synthetic.test.token'}:{}}));
 try{
  await t.test('Rechaza visitantes, tokens vencidos y cuentas deshabilitadas antes de usar YouVersion',async()=>{
   assert.equal((await request('',false)).status,401);assert.equal(calls.length,0);
   auth=false;assert.equal((await request()).status,401);auth=true;
   enabled=false;assert.equal((await request()).status,403);enabled=true;
   assert(!calls.some(c=>c.url.includes('youversion')));
  });
  await t.test('Devuelve solo las traducciones solicitadas y evita pasajes arbitrarios',async()=>{
   const result=await request();assert.deepEqual((await result.json()).versions.map(v=>v.id),[128,2664]);
   for(const query of ['action=passage&passage=https://other.example','action=passage&passage=GEN.1-GEN.50','action=index&version=999','action=anything'])assert.equal((await request(query)).status,400);
  });
  await t.test('La licencia pendiente da un error comprensible y no texto sustituto',async()=>{
   upstreamStatus=403;const response=await request('action=passage&passage=JHN.3');assert.equal(response.status,403);assert.equal((await response.json()).code,'LICENSE_REQUIRED');upstreamStatus=200;
  });
  await t.test('Cada pasaje obtiene sus créditos actuales y falla si faltan',async()=>{
   calls=[];const response=await request('action=passage&passage=JHN.3');assert.equal(response.status,200);const data=await response.json();assert.equal(data.copyright,credit);assert(calls.some(c=>c.url.endsWith('/bibles/128')));assert(!JSON.stringify(data).includes(secret));
   credit=' ';const missing=await request('action=passage&passage=JHN.3');assert.equal(missing.status,502);assert.equal((await missing.json()).content,undefined);credit='Créditos';
  });
  await t.test('Las fuentes y errores nunca publican la credencial y nada se cachea',async()=>{
   const response=await request('action=fonts');assert.equal(response.headers.get('cache-control'),'private, no-store');assert(!JSON.stringify(await response.json()).includes(secret));
   delete process.env.YOUVERSION_APP_KEY;const missing=await request();assert.equal(missing.status,503);assert.equal((await missing.json()).code,'BIBLE_NOT_CONFIGURED');
  });
 }finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.YOUVERSION_APP_KEY;else process.env.YOUVERSION_APP_KEY=originalKey;}
});
