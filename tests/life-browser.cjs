/* Runs the published HTML parser and the official Supabase SDK against synthetic HTTP responses.
   TNT_TEST_BROWSER points to a Chromium executable; TNT_TEST_SDK to the exact UMD version in vercel.json. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),servedRoot=process.env.TNT_TEST_ROOT||path.join(root,'public'),out=process.env.TNT_TEST_OUTPUT||path.resolve(root,'../tnt-tools/screenshots');
const phoneMode=process.env.TNT_TEST_PHONE==='1';
const mockPhoneOS=process.env.TNT_TEST_MOCK_NOTIFICATIONS==='1',displayed=[];
const pid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixtureScript(){return fs.readFileSync(path.join(__dirname,'fixtures/runtime.js'),'utf8').replace("if(!location.pathname.includes('/hub'))","if(false)");}
const sdk=fs.readFileSync(process.env.TNT_TEST_SDK,'utf8')+`\nconst originalClient=supabase.createClient;supabase.createClient=(...args)=>{eval(${JSON.stringify(fixtureScript())});window.__fixtureSB=TNT.sb;window.__fixtureValues={};window.__profileValues={efe_group:'varones'};const db=window.__fixtureDB;db.tnt_accounts[0].avatar_source='custom';db.tnt_accounts[0].avatar_sync=false;db.tnt_people[0].first_name='Nora';db.tnt_people[0].last_name='Pérez';db.tnt_profiles_central=db.tnt_people.map(p=>({...p,nombre:p.full_name.split(' ')[0],apellido:p.full_name.split(' ').slice(1).join(' '),fecha_nacimiento:p.birthday,genero:p.sex==='F'?'Mujer':'Varón',telefono:'1112345678',creado_en:new Date().toISOString()}));db.tnt_efe_groups=[{id:'efe-group',code:'varones',name:'EFE Varones',active:true}];db.tnt_efe_memberships=db.tnt_people.map(p=>({person_id:p.id,group_id:'efe-group',active:true}));db.tnt_efe_meetings=[{id:'efe-meeting',group_id:'efe-group',meeting_date:TNTUI.dateKey(),active:true,title:'Miércoles EFE'}];db.tnt_saturday_members=db.tnt_people.map(p=>({person_id:p.id,active:true}));db.tnt_saturday_attendance=[];db.tnt_access_grants=[...TNT.grants,{module:'perfiles',scope:'*',enabled:true,access_level:'manage'}].map(g=>({...g,person_id:db.tnt_people[0].id}));if(new URLSearchParams(location.search).has('fixture-incomplete'))window.__profileValues.health='';if(new URLSearchParams(location.search).has('fixture-onboarding'))db.tnt_accounts[0].onboarding_completed_at=null;if(new URLSearchParams(location.search).has('fixture-community')){Object.assign(db.tnt_accounts[0],{staff_status:'community',ministry_role:null,system_role:'user'});db.tnt_access_grants=[];}return originalClient(...args)};`;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(mockPhoneOS&&u.pathname==='/__preview__/phone-display'){let data='';req.on('data',part=>data+=part);req.on('end',()=>{displayed.push(JSON.parse(data));res.end('{}')});return;}
 if(mockPhoneOS&&u.pathname==='/sw.js'){res.setHeader('Content-Type','text/javascript');res.end(`self.registration.showNotification=async(title,options)=>{const response=await fetch('/__preview__/phone-display',{method:'POST',body:JSON.stringify({title,options})});if(!response.ok)throw new Error('Display failed')};\n`+fs.readFileSync(path.join(servedRoot,'sw.js'),'utf8'));return;}
 if(u.pathname==='/supabase-lite.js'){res.setHeader('Content-Type','text/javascript');res.end(sdk);return;}
 if(u.pathname.startsWith('/__preview__/avatar/')){const i=Number(u.pathname.split('/').at(-1).split('.')[0])||0;res.setHeader('Content-Type','image/svg+xml');res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" rx="90" fill="${['#996acd','#ff7948','#a8d8eb'][i%3]}"/><circle cx="90" cy="63" r="27" fill="#f7e0cd"/><path d="M38 165v-28a52 45 0 0 1 104 0v28" fill="#34314d"/></svg>`);return;}
 let file=path.join(servedRoot,u.pathname);if(!file.startsWith(servedRoot)){res.writeHead(403);res.end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);res.end('Missing '+u.pathname);return;}
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
async function mockAPI(page){
 await (phoneMode?page.context():page).route('https://oeodnnomgiddkblnlzay.supabase.co/**',async route=>{
  try{
  const req=route.request(),url=new URL(req.url()),parts=url.pathname.split('/'),name=parts.at(-1),args=req.postDataJSON()||{};
  if(url.pathname.startsWith('/auth/')){await route.fulfill({json:{id:pid(100),email:'demo@example.test',aud:'authenticated',role:'authenticated',user_metadata:{}}});return;}
  if(url.pathname.includes('/rpc/')){
   const r=await page.evaluate(async({name,args})=>{
    if(name==='tnt_set_profile_photo'){__fixtureCalls.push({rpc:name,args});if(__fixtureFailures['rpc:'+name])return{error:{message:__fixtureFailures['rpc:'+name]}};const photo=args.p_source==='google'?'https://lh3.googleusercontent.com/synthetic-photo':'https://oeodnnomgiddkblnlzay.supabase.co/storage/v1/object/public/tnt-profile-photos/'+args.p_path;const result={avatar_url:photo,avatar_source:args.p_source,avatar_sync:!!args.p_sync,avatar_google_url:'https://lh3.googleusercontent.com/synthetic-photo'};Object.assign(__fixtureDB.tnt_accounts[0],result);return{data:result,error:null};}if(name==='tnt_push_test'){__fixtureCalls.push({rpc:name,args});window.__phoneTest={id:'00000000-0000-4000-8000-000000009900',status:'sent',attempts:1};return{data:__phoneTest,error:null};}
    if(name==='tnt_push_test_status')return{data:__phoneTest,error:null};
    if(name==='tnt_save_org_template'){
     if(__fixtureFailures['rpc:'+name])return{error:{message:__fixtureFailures['rpc:'+name]}};
     __fixtureCalls.push({rpc:name,args});const db=__fixtureDB,id=args.p_id||crypto.randomUUID();let t=db.tnt_templates.find(t=>t.id===id);if(t)Object.assign(t,args.p_values,{version:(t.version||0)+1});else db.tnt_templates.push({id,...args.p_values,version:1});db.tnt_template_items=db.tnt_template_items.filter(i=>i.template_id!==id).concat(args.p_items.map((i,n)=>({...i,template_id:id,sort_order:n})));return{data:id,error:null};
    }
    return __fixtureSB.rpc(name,args);
   },{name,args});
   await route.fulfill({status:r.error?400:200,json:r.error?{code:'P0001',message:r.error.message}:r.data??null});return;
  }
  const result=await page.evaluate(({name,method,args,params,object})=>{
   const db=__fixtureDB;__fixtureCalls.push({table:name,action:method,value:args});const failure=__fixtureFailures[name]||__fixtureFailures[name+':'+({GET:'read',POST:'insert',PATCH:'update',DELETE:'delete'}[method])];if(failure)return{error:{message:failure}};
   let all=db[name]||[],rows=all.filter(row=>params.every(([key,value])=>{
    if(['select','order','limit','offset','on_conflict'].includes(key))return true;
    if(value.startsWith('eq.'))return String(row[key])===value.slice(3);
    if(value.startsWith('neq.'))return String(row[key])!==value.slice(4);
    if(value.startsWith('is.'))return value.slice(3)==='null'?row[key]==null:String(row[key])===value.slice(3);
    if(value.startsWith('in.'))return value.slice(4,-1).split(',').includes(String(row[key]));return true;
   }));
   if(method==='POST'){db[name]||=[];rows=(Array.isArray(args)?args:[args]).map(v=>({id:crypto.randomUUID(),...v}));db[name].push(...rows);}
   if(method==='PATCH')rows.forEach(r=>Object.assign(r,args));
   if(method==='DELETE')db[name]=all.filter(r=>!rows.includes(r));
   return{data:object?rows[0]||null:rows,error:null};
  },{name,method:req.method(),args,params:[...url.searchParams],object:req.headers().accept?.includes('object')});
  await route.fulfill({status:result.error?403:200,json:result.error?{code:'42501',message:result.error.message}:result.data});
 }catch(error){if(/Execution context was destroyed|has been closed|Target page/.test(error.message)){await route.abort('aborted').catch(()=>{});return;}throw error;}
 });
 if(page.routeWebSocket)await page.routeWebSocket(/supabase\.co/,ws=>ws.close());
}

(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.TNT_TEST_BROWSER,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block'});
 await context.addInitScript(({id,key})=>{
  if(location.protocol!=='http:')return;const enc=v=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
  const user={id,email:'demo@example.test',aud:'authenticated',role:'authenticated',user_metadata:{avatar_url:'https://lh3.googleusercontent.com/synthetic-photo'}};
  const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+86400,user_metadata:user.user_metadata})+'.test';
  localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user}));localStorage.setItem('tnt-theme','light');
 },{id:pid(100),key:'sb-oeodnnomgiddkblnlzay-auth-token'});
 const page=await context.newPage(),errors=[],storage=[],apiCalls=[];let licensed=false;
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.stack));await mockAPI(page);
 await page.route('https://cdn.youversion.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.route('https://lh3.googleusercontent.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="#007d80"/></svg>'}));
 await page.route('https://oeodnnomgiddkblnlzay.supabase.co/storage/v1/**',async route=>{
  const r=route.request(),u=new URL(r.url());storage.push({method:r.method(),url:u.pathname,type:r.headers()['content-type'],webp:r.postDataBuffer()?.includes(Buffer.from('Content-Type: image/webp'))});
  if(r.method()==='GET')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#b9e3d1"/></svg>'});
  return route.fulfill({json:r.method()==='POST'?{Id:'synthetic-file',Key:u.pathname.split('/object/')[1]}:[]});
 });
 await page.route('**/api/bible?*',async route=>{
  const r=route.request(),p=new URL(r.url()).searchParams,action=p.get('action'),id=Number(p.get('version')||128);apiCalls.push({action,auth:r.headers().authorization});
  if(action==='versions')return route.fulfill({json:{versions:licensed?[{id:128,title:'NVI 2025'},{id:2664,title:'NVI 2015'}]:[]}});
  if(action==='fonts')return route.fulfill({json:{css:''}});
  if(action==='version')return route.fulfill({json:{id,title:'NVI '+(id===128?'2025':'2015'),copyright:'Créditos sintéticos '+id}});
  if(action==='index')return route.fulfill({json:{books:[{id:'GEN',chapters:[{id:1},{id:2}]},{id:'EXO',chapters:[{id:1}]}]}});
  return route.fulfill({json:{id:p.get('passage'),content:'<p>Lectura sintética '+p.get('passage')+'</p>',copyright:'Créditos sintéticos '+id}});
 });
 async function visit(url,selector){await page.goto(base+url);await page.waitForFunction(()=>window.TNT?.identity&&!TNT.error);await page.locator(selector).first().waitFor();if(await page.locator('[data-phone-invite-later]').count())await page.locator('[data-phone-invite-later]').click();}
 async function capture(label){
  for(const theme of ['light','dark']){await page.evaluate(t=>TNT.setTheme(t),theme);for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,label+' '+theme+' '+width);assert.equal(await page.locator('#tnt-shell').count(),0);assert(await page.locator('#tnt-main-nav').evaluate(n=>{const b=n.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&Math.abs(b.left+b.width/2-innerWidth/2)<1;}),'Centered navigation '+width);if(width===390||width===1280)await page.screenshot({animations:'disabled',fullPage:true,path:path.join(out,label+'-'+theme+'-'+width+'.png')});}}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>TNT.setTheme('light'));
 }
 try{
  await visit('/comunidad','.life-community-cards');assert.equal(await page.locator('.life-community-cards>a').count(),2);assert.deepEqual(await page.locator('#tnt-main-nav a').allTextContents(),['Inicio','Comunidad','Perfil']);await capture('community');
  await visit('/perfil','.life-profile');assert(await page.locator('.life-profile h2').innerText());await capture('profile');
  await page.locator('[data-edit-profile]').click();await page.locator('.tnt-complete-editor').waitFor();assert(await page.locator('[name=first_name]').count());await page.evaluate(()=>TNTUI.closeModal(document.querySelector('.tnt-overlay')));
  await visit('/perfil?view=photo','#life-photo-form');await capture('photo');
  await page.locator('[name=source][value=custom]').check();assert.equal(await page.locator('[name=sync]').isDisabled(),true);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5c8AAAAASUVORK5CYII=','base64');
  await page.locator('#life-photo-file').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:png});await page.getByText('Tu foto está lista para guardar.').waitFor();assert((await page.locator('[data-photo-preview] img').getAttribute('src')).startsWith('blob:'));
  await page.evaluate(()=>__fixtureFailures['rpc:tnt_set_profile_photo']='Error sintético al guardar');await page.locator('#life-photo-form [type=submit]').click();await page.getByText('Error sintético al guardar').waitFor();assert(storage.some(r=>r.method==='DELETE'));assert.equal(await page.locator('#life-photo-form [type=submit]').isEnabled(),true);
  await page.evaluate(()=>delete __fixtureFailures['rpc:tnt_set_profile_photo']);await page.locator('#life-photo-form [type=submit]').click();await page.waitForURL('**/perfil');assert(storage.filter(r=>r.method==='POST').every(r=>r.url.includes('/'+pid(100)+'/')&&r.url.endsWith('.webp')&&r.webp));
  await visit('/biblia','[data-reader]');await page.getByText('Estamos habilitando las traducciones para TNT.').waitFor();licensed=true;
  await visit('/biblia','[data-reading]');await page.getByText('Lectura sintética GEN.1').waitFor();await capture('reader');
  await page.locator('[data-next]').click();await page.getByText('Lectura sintética GEN.2').waitFor();await page.locator('[data-next]').click();await page.getByText('Lectura sintética EXO.1').waitFor();
  assert.equal(await page.locator('[data-next]').isDisabled(),true);await page.locator('[data-prev]').click();await page.getByText('Lectura sintética GEN.2').waitFor();
  await page.locator('[data-version]').selectOption('2664');await page.getByText('Créditos sintéticos 2664').waitFor();assert(apiCalls.every(r=>r.auth?.startsWith('Bearer ')));
  await visit('/juegos','[data-game]');await capture('games');await page.locator('[data-game=order]').click();await page.locator('[name=difficulty][value=easy]').check();await page.locator('[data-game-setup] [type=submit]').click();await page.locator('[data-answer]').first().waitFor();await capture('order');
  const ordered=()=>page.evaluate(()=>[...document.querySelectorAll('[data-answer]')].map(b=>b.dataset.answer).sort((a,b)=>TNTBibleGames.books.find(bk=>bk.id===a).index-TNTBibleGames.books.find(bk=>bk.id===b).index));
  const first=await ordered();await page.locator('[data-answer="'+first[1]+'"]').click();await page.waitForTimeout(450);assert.equal(await page.locator('.life-hearts').getAttribute('aria-label'),'2 vidas');
  for(let round=0;round<3;round++){
   for(const id of await ordered())await page.locator('[data-answer="'+id+'"]').click();
   if(round<2){await page.locator('[data-next-round]').waitFor({state:'visible'});await page.locator('[data-pause]').click();const stopped=await page.locator('h2').innerText();assert.equal(stopped,'Un pequeño descanso');await page.locator('[data-resume]').click();await page.locator('[data-next-round]').click();}
  }
  await page.getByText('¡Lo lograste!').waitFor();assert((await page.locator('.life-game-result').innerText()).includes('150'));await capture('result');
  assert.deepEqual(errors,[]);console.log('Perfil, subida/recuperación, lectura licenciada/pendiente, navegación y juego con pausa: OK. 320/390/768/1280 px, ambos temas.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
