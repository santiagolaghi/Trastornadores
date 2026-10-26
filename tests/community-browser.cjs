/* Runs the published HTML parser and the official Supabase SDK against synthetic HTTP responses.
   TNT_TEST_BROWSER points to a Chromium executable; TNT_TEST_SDK to the exact UMD version in vercel.json. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const {database}=require('./fixtures/community-db.cjs');let pg,transaction=Promise.resolve();const serial=fn=>{const next=transaction.then(fn);transaction=next.catch(()=>{});return next;};
const root=path.resolve(__dirname,'..'),servedRoot=process.env.TNT_TEST_ROOT||path.join(root,'public'),out=process.env.TNT_TEST_OUTPUT||path.resolve(root,'../tnt-tools/screenshots');
const phoneMode=process.env.TNT_TEST_PHONE==='1';
const mockPhoneOS=process.env.TNT_TEST_MOCK_NOTIFICATIONS==='1',displayed=[];
const pid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixtureScript(){return fs.readFileSync(path.join(__dirname,'fixtures/runtime.js'),'utf8').replace("if(!location.pathname.includes('/hub'))","if(false)");}
const sdk=fs.readFileSync(process.env.TNT_TEST_SDK,'utf8')+`\nconst originalClient=supabase.createClient;supabase.createClient=(...args)=>{eval(${JSON.stringify(fixtureScript())});window.__fixtureSB=TNT.sb;window.__fixtureValues={};window.__profileValues={efe_group:'varones'};const db=window.__fixtureDB;db.tnt_accounts[0].avatar_source='custom';db.tnt_accounts[0].avatar_sync=false;db.tnt_people[0].first_name='Nora';db.tnt_people[0].last_name='Pérez';db.tnt_profiles_central=db.tnt_people.map(p=>({...p,nombre:p.full_name.split(' ')[0],apellido:p.full_name.split(' ').slice(1).join(' '),fecha_nacimiento:p.birthday,genero:p.sex==='F'?'Mujer':'Varón',telefono:'1112345678',creado_en:new Date().toISOString()}));db.tnt_efe_groups=[{id:'efe-group',code:'varones',name:'EFE Varones',active:true}];db.tnt_efe_memberships=db.tnt_people.map(p=>({person_id:p.id,group_id:'efe-group',active:true}));db.tnt_efe_meetings=[{id:'efe-meeting',group_id:'efe-group',meeting_date:TNTUI.dateKey(),active:true,title:'Miércoles EFE'}];db.tnt_saturday_members=db.tnt_people.map(p=>({person_id:p.id,active:true}));db.tnt_saturday_attendance=[];db.tnt_access_grants=[...TNT.grants,{module:'perfiles',scope:'*',enabled:true,access_level:'manage'}].map(g=>({...g,person_id:db.tnt_people[0].id}));const person=Number(new URLSearchParams(location.search).get('fixture-person')||1);db.tnt_accounts.forEach((a,i)=>{a.staff_status=i<2?'approved':'community';a.ministry_role=i<2?'Líder':null});db.tnt_accounts.sort((a,b)=>(a.person_id===pidFor(person)?-1:b.person_id===pidFor(person)?1:0));db.tnt_people.sort((a,b)=>(a.id===pidFor(person)?-1:b.id===pidFor(person)?1:0));function pidFor(n){return '00000000-0000-4000-8000-'+String(n).padStart(12,'0')}if(new URLSearchParams(location.search).has('fixture-incomplete'))window.__profileValues.health='';if(new URLSearchParams(location.search).has('fixture-onboarding'))db.tnt_accounts[0].onboarding_completed_at=null;if(new URLSearchParams(location.search).has('fixture-community')){Object.assign(db.tnt_accounts[0],{staff_status:'community',ministry_role:null,system_role:'user'});db.tnt_access_grants=[];}return originalClient(...args)};`;
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
async function mockAPI(page,actor=1){
 await (phoneMode?page.context():page).route('https://oeodnnomgiddkblnlzay.supabase.co/**',async route=>{
  try{
  const req=route.request(),url=new URL(req.url()),parts=url.pathname.split('/'),name=parts.at(-1),args=req.postDataJSON()||{};
  if(url.pathname.startsWith('/auth/')){await route.fulfill({json:{id:pid(99+actor),email:'demo@example.test',aud:'authenticated',role:'authenticated',user_metadata:{}}});return;}
  if(url.pathname.includes('/rpc/')){
   if(name==='tnt_personal_context'||name==='tnt_personal_action'){
    const result=await serial(async()=>{await pg.db.exec(`reset role;set request.jwt.claim.sub='${pid(99+actor)}';set role authenticated;`);try{return{data:(await pg.db.query(name==='tnt_personal_action'?'select public.tnt_personal_action($1,$2::jsonb) result':'select public.tnt_personal_context($1,$2) result',name==='tnt_personal_action'?[args.p_action,JSON.stringify(args.p_data)]:[args.p_book,args.p_chapter])).rows[0].result};}catch(e){return{error:{message:e.message}};}});await route.fulfill({status:result.error?400:200,json:result.error||result.data});return;
   }
   if(name.startsWith('tnt_community_')&&name!=='tnt_community_home'){
    const failure=await page.evaluate(()=>window.__communityFailure||'');if(failure&&name==='tnt_community_action'){await page.evaluate(()=>window.__communityFailure='');await route.fulfill({status:400,json:{message:failure}});return;}
    const allowed=['tnt_community_bootstrap','tnt_community_action','tnt_community_delivery_status'];if(!allowed.includes(name))throw Error('Unexpected community RPC '+name);
    const result=await serial(async()=>{await pg.db.exec(`reset role;set request.jwt.claim.sub='${pid(99+actor)}';set role authenticated;`);try{return{data:(await pg.db.query(name==='tnt_community_action'?'select public.tnt_community_action($1,$2::jsonb) result':'select public.'+name+'() result',name==='tnt_community_action'?[args.p_action,JSON.stringify(args.p_data)]:[])).rows[0].result};}catch(e){return{error:{message:e.message}};}});
    await route.fulfill({status:result.error?400:200,json:result.error||result.data});return;
   }

   const personal=name==='tnt_startup_context'?await serial(async()=>{await pg.db.exec(`reset role;set request.jwt.claim.sub='${pid(99+actor)}';set role authenticated;`);return(await pg.db.query('select public.tnt_personal_context() result')).rows[0].result.preferences;}):null;
   const r=await page.evaluate(async({name,args,personal})=>{
    if(name==='tnt_set_profile_photo'){__fixtureCalls.push({rpc:name,args});if(__fixtureFailures['rpc:'+name])return{error:{message:__fixtureFailures['rpc:'+name]}};const photo=args.p_source==='google'?'https://lh3.googleusercontent.com/synthetic-photo':'https://oeodnnomgiddkblnlzay.supabase.co/storage/v1/object/public/tnt-profile-photos/'+args.p_path;const result={avatar_url:photo,avatar_source:args.p_source,avatar_sync:!!args.p_sync,avatar_google_url:'https://lh3.googleusercontent.com/synthetic-photo'};Object.assign(__fixtureDB.tnt_accounts[0],result);return{data:result,error:null};}if(name==='tnt_push_test'){__fixtureCalls.push({rpc:name,args});window.__phoneTest={id:'00000000-0000-4000-8000-000000009900',status:'sent',attempts:1};return{data:__phoneTest,error:null};}
    if(name==='tnt_push_test_status')return{data:__phoneTest,error:null};
    if(name==='tnt_save_org_template'){
     if(__fixtureFailures['rpc:'+name])return{error:{message:__fixtureFailures['rpc:'+name]}};
     __fixtureCalls.push({rpc:name,args});const db=__fixtureDB,id=args.p_id||crypto.randomUUID();let t=db.tnt_templates.find(t=>t.id===id);if(t)Object.assign(t,args.p_values,{version:(t.version||0)+1});else db.tnt_templates.push({id,...args.p_values,version:1});db.tnt_template_items=db.tnt_template_items.filter(i=>i.template_id!==id).concat(args.p_items.map((i,n)=>({...i,template_id:id,sort_order:n})));return{data:id,error:null};
    }
    const result=await __fixtureSB.rpc(name,args);if(name==='tnt_startup_context'&&result.data)result.data.personal=personal;return result;
   },{name,args,personal});
   await route.fulfill({status:r.error?400:200,json:r.error?{code:'P0001',message:r.error.message}:r.data??null});return;
  }
  if(name==='tnt_reader_marks'&&req.method()==='GET'){
   const rows=await serial(async()=>{await pg.db.exec(`reset role;set request.jwt.claim.sub='${pid(99+actor)}';set role authenticated;`);return(await pg.db.query('select book,chapter,verse,color from public.tnt_reader_marks order by updated_at desc limit 200')).rows;});await route.fulfill({json:rows});return;
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
 // A pending mock request may outlive navigation and reach the next document before its SDK fixture.
 }catch(error){if(/Execution context was destroyed|has been closed|Target page|__fixtureDB is not defined|__fixtureSB is not defined/.test(error.message)){await route.abort('aborted').catch(()=>{});return;}throw error;}
 });
 if(page.routeWebSocket)await page.routeWebSocket(/supabase\.co/,ws=>ws.close());
}

(async()=>{
 pg=await database();await pg.db.exec('reset role');await pg.db.query("insert into tnt_personal_preferences(person_id,extra_versions) values($1,array[1909])",[pid(1)]);for(let n=1;n<=5;n++)await pg.db.query('update tnt_accounts set auth_user_id=$1 where person_id=$2',[pid(99+n),pid(n)]);for(const [i,name] of ['Nora Pérez','Bruno Díaz','Mara López','Lucas Rey','Ana Paz'].entries())await pg.db.query('update tnt_people set full_name=$1 where id=$2',[name,pid(i+1)]);
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.TNT_TEST_BROWSER,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.addInitScript(({id,key})=>{
  if(location.protocol!=='http:')return;const enc=v=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
  const user={id,email:'demo@example.test',aud:'authenticated',role:'authenticated',user_metadata:{avatar_url:'https://lh3.googleusercontent.com/synthetic-photo'}};
  const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+86400,user_metadata:user.user_metadata})+'.test';
  localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user}));localStorage.setItem('tnt-theme','light');
 },{id:pid(100),key:'sb-oeodnnomgiddkblnlzay-auth-token'});
 const page=await context.newPage(),errors=[],storage=[],apiCalls=[];let licensed=false,catalogDown=false,passageDown=false,indexDown=0,revoked=0,deferredIndex=0,indexStarted=()=>{},releaseIndex,deferredCatalog=false,catalogStarted=()=>{},releaseCatalog;
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.stack));await mockAPI(page);
 await page.route('https://cdn.youversion.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.route('https://lh3.googleusercontent.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="#007d80"/></svg>'}));
 await page.route('https://oeodnnomgiddkblnlzay.supabase.co/storage/v1/**',async route=>{
  const r=route.request(),u=new URL(r.url());storage.push({method:r.method(),url:u.pathname,type:r.headers()['content-type'],webp:r.postDataBuffer()?.includes(Buffer.from('Content-Type: image/webp'))});
  if(r.method()==='GET')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#b9e3d1"/></svg>'});
  return route.fulfill({json:r.method()==='POST'?{Id:'synthetic-file',Key:u.pathname.split('/object/')[1]}:[]});
 });
 await page.route('**/api/bible?*',async route=>{
  const r=route.request(),p=new URL(r.url()).searchParams,action=p.get('action'),id=Number(p.get('version')||128);apiCalls.push({action,id,passage:p.get('passage'),auth:r.headers().authorization});
  const available=[{id:147,title:'Reina-Valera Antigua',abbreviation:'RVES'},{id:3291,title:'Versión Biblia Libre',abbreviation:'VBL'},{id:3365,title:'Palabra de Dios para ti',abbreviation:'PdDpt'},...(licensed?[{id:128,title:'NVI 2025',abbreviation:'NVI-S'},{id:2664,title:'NVI 2015',abbreviation:'NVI-S'}]:[])].filter(v=>v.id!==revoked);
  if(action==='versions'){if(deferredCatalog){catalogStarted();await new Promise(resolve=>releaseCatalog=resolve);}return catalogDown?route.fulfill({status:503,json:{code:'BIBLE_CONNECTION_ERROR',error:'Conexión sintética interrumpida'}}):route.fulfill({json:{versions:available,unavailable:[128,2664,149,1782,127].filter(id=>!available.some(v=>v.id===id)).map(id=>({id,code:[128,2664].includes(id)?'LICENSE_REQUIRED':'VERSION_UNAVAILABLE'}))}});}
  if(action==='passage'&&passageDown)return route.fulfill({status:503,json:{code:'BIBLE_CONNECTION_ERROR',error:'Conexión sintética interrumpida'}});
  if(action==='passage'&&!available.some(v=>v.id===id)){const pending=[128,2664].includes(id);return route.fulfill({status:pending?403:404,json:{code:pending?'LICENSE_REQUIRED':'VERSION_UNAVAILABLE',error:'Traducción de prueba sin habilitar'}});}
  if(action==='fonts')return route.fulfill({json:{css:''}});
  if(action==='version')return route.fulfill({json:{id,title:'NVI '+(id===128?'2025':'2015'),copyright:'Créditos sintéticos '+id}});
  if(action==='index'){if(deferredIndex===id){indexStarted();await new Promise(resolve=>releaseIndex=resolve);}return indexDown===id?route.fulfill({status:503,json:{error:'Índice sintético interrumpido'}}):route.fulfill({json:{books:[{id:'GEN',chapters:[{id:'1'},{id:'2'}]},{id:'EXO',chapters:[{id:'1'}]}]}});}
  return route.fulfill({json:{id:p.get('passage'),content:'<p><span data-usfm="'+p.get('passage').split('.').slice(0,2).join('.')+'.1"><sup class="verse-number">1</sup> Lectura sintética '+p.get('passage')+'</span></p>',copyright:'Créditos sintéticos '+id}});
 });
 async function visit(url,selector){await page.goto(base+url);await page.waitForFunction(()=>window.TNT?.identity&&!TNT.error);await page.locator(selector).first().waitFor();if(await page.locator('[data-phone-invite-later]').count())await page.locator('[data-phone-invite-later]').click();}
 async function capture(label){
  for(const theme of ['light','dark']){await page.evaluate(t=>TNT.setTheme(t),theme);for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,label+' '+theme+' '+width);assert.equal(await page.locator('#tnt-shell').count(),0);assert(await page.locator('#tnt-main-nav').evaluate(n=>{const b=n.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&Math.abs(b.left+b.width/2-innerWidth/2)<1;}),'Centered navigation '+width);if(width===390||width===1280)await page.screenshot({animations:'disabled',fullPage:true,path:path.join(out,label+'-'+theme+'-'+width+'.png')});}}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>TNT.setTheme('light'));
 }
 async function entryFlow(){
  await visit('/','[data-my-activity]');
  await page.evaluate(()=>{const people=__fixtureDB.tnt_people;people[0].full_name=people[1].full_name='Santiago Laghi';people.push({...people[0]});document.dispatchEvent(new CustomEvent('tnt:data',{detail:{tables:['tnt_people']}}));});
  await page.waitForTimeout(450);await page.locator('#hub-query').fill('Santiago Laghi');await page.locator('#hub-search button').click();
  assert.equal(await page.locator('.hub-search-result').count(),2);assert.equal(await page.locator('.hub-search-result small').first().innerText(),'Tu perfil');
  async function fit(p){const box=await p.locator('dialog[open]>.tnt-sheet').evaluate(n=>{const b=n.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,scroll:n.scrollWidth,client:n.clientWidth,width:innerWidth,height:innerHeight}});const ok=box.left>=11&&box.right<=box.width-11&&box.top>=11&&box.bottom<=box.height-11&&box.scroll<=box.client+1;if(!ok)await p.screenshot({path:path.join(out,'entry-overflow.png')});assert(ok,'Dialog fits '+JSON.stringify(box));}
  for(const theme of ['light','dark'])for(const width of [320,360,390,412,768,1280]){
   await page.setViewportSize({width,height:844});await page.evaluate(t=>TNT.setTheme(t),theme);await fit(page);
   assert(await page.locator('.hub-search-result>.tnt-person-avatar').evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return Math.abs(r.width-r.height)<1&&r.width>=40&&r.width<=52&&getComputedStyle(n).borderRadius==='50%';})),'Circular photos');
   assert(await page.locator('.hub-search-result').evaluateAll(nodes=>nodes.every(n=>{const b=n.getBoundingClientRect();return [...n.children].every(c=>{const r=c.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right;});})),'Search cards fit');
   if(width===390)await page.screenshot({animations:'disabled',path:path.join(out,'search-'+theme+'.png')});
  }
  await page.keyboard.press('Escape');assert.equal(await page.locator('.hub-search-dialog').count(),0);
  const authState=await context.storageState();
  for(const [kind,ua] of [['iphone','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'],['android','Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36']]){
   const ctx=await browser.newContext({viewport:{width:390,height:844},userAgent:ua,isMobile:true,hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.stack));await mockAPI(p);
   await ctx.addInitScript(()=>{window.__installed=false;Object.defineProperty(navigator,'standalone',{get:()=>window.__installed});window.__installCalls=0;});
   await p.goto(base+'/');await p.locator('#tnt-phone-setup[data-step=install]').waitFor();assert.equal(await p.locator('#email-form').count(),0);assert.equal(await p.locator('#tnt-phone-setup .tnt-close').count(),0);
   await p.keyboard.press('Escape');assert.equal(await p.locator('#tnt-phone-setup').count(),1);await p.goBack();assert.equal(await p.locator('#tnt-phone-setup').count(),1);
   for(const theme of ['light','dark'])for(const width of [320,360,390,412,768,1280]){await p.setViewportSize({width,height:844});await p.evaluate(t=>TNT.setTheme(t),theme);await fit(p);if(width===390)await p.screenshot({animations:'disabled',path:path.join(out,'setup-'+kind+'-'+theme+'.png')});}
   await p.setViewportSize({width:844,height:390});await fit(p);await p.screenshot({path:path.join(out,'setup-'+kind+'-landscape.png')});
   if(kind==='android'){
    await p.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>window.__installCalls++;e.userChoice=Promise.resolve({outcome:'accepted'});dispatchEvent(e);});await p.locator('[data-setup-install]').tap();assert.equal(await p.evaluate(()=>__installCalls),1);assert.equal(await p.locator('#tnt-phone-setup[data-step=install]').count(),1);
   }
   await p.evaluate(()=>{__installed=true;TNTPush.maybePrompt();});await p.locator('#tnt-phone-setup').waitFor({state:'detached'});await p.locator('#google').waitFor();assert.equal(await p.locator('input[type=email]').count(),0);
   let oauth;await p.route('**/auth/v1/authorize?**',async r=>{oauth=new URL(r.request().url());await r.fulfill({contentType:'text/html',body:'Google OAuth requested'});});await p.locator('#google').click();await p.getByText('Google OAuth requested').waitFor();assert.equal(oauth.searchParams.get('provider'),'google');assert.equal(oauth.searchParams.get('redirect_to'),base+'/');await ctx.close();
  }
  const pushContext=await browser.newContext({storageState:authState,viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await pushContext.addInitScript(()=>{
   Object.defineProperty(navigator,'standalone',{value:true});window.__permissionCalls=0;let permission='default',sub=null;
   Object.defineProperty(window,'Notification',{value:{get permission(){return permission},async requestPermission(){window.__permissionCalls++;permission='granted';return permission}}});Object.defineProperty(window,'PushManager',{value:class{}});
   const reg={active:{state:'activated'},async update(){},pushManager:{async getSubscription(){return sub},async subscribe(){sub={endpoint:'https://push.example.invalid/device',toJSON(){return{endpoint:this.endpoint,keys:{auth:'synthetic',p256dh:'synthetic'}}}};return sub;}}};
   Object.defineProperty(navigator,'serviceWorker',{value:{async register(){return reg},addEventListener(){}}});
  });
  const pushPage=await pushContext.newPage();pushPage.on('pageerror',e=>errors.push(e.stack));await mockAPI(pushPage);await pushPage.goto(base+'/');await pushPage.locator('#tnt-phone-setup[data-step=push]').waitFor();assert.equal(await pushPage.evaluate(()=>__permissionCalls),0);
  for(const theme of ['light','dark'])for(const width of [320,360,390,412,768,1280]){await pushPage.setViewportSize({width,height:844});await pushPage.evaluate(t=>TNT.setTheme(t),theme);await fit(pushPage);if(width===390)await pushPage.screenshot({animations:'disabled',path:path.join(out,'setup-push-'+theme+'.png')});}
  await pushPage.locator('[data-setup-enable]').tap();await pushPage.locator('#tnt-phone-setup').waitFor({state:'detached'});assert.equal(await pushPage.evaluate(()=>__permissionCalls),1);assert(await pushPage.evaluate(()=>__fixtureCalls.some(c=>c.rpc==='tnt_push_subscribe')));await pushContext.close();
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{__fixtureDB.tnt_people=__fixtureDB.tnt_people.filter((p,i,all)=>all.findIndex(x=>x.id===p.id)===i);__fixtureDB.tnt_people[0].full_name='Nora Pérez';__fixtureDB.tnt_people[1].full_name='Bruno Díaz';TNT.setTheme('light');});
  console.log('Entrada: solo Google, instalación Android/iPhone antes del ingreso, aviso tras el toque y guardado sintético, buscador con retratos circulares, seis anchos, dos temas y horizontal: OK');
 }
 async function attendanceResumeFlow(){
  const saved=new Map();let hold=false,releaseSave;
  await page.route('**/rest/v1/tnt_saturday_attendance?*',r=>r.fulfill({json:[...saved.values()]}));
  await page.route('**/rest/v1/rpc/tnt_mark_attendance',async r=>{const a=r.request().postDataJSON();if(hold)await new Promise(resolve=>releaseSave=resolve);saved.set(a.p_person,{person_id:a.p_person,saturday_date:a.p_date,status:a.p_status});await r.fulfill({json:null});});
  await visit('/asistencia/?mode=sabados','#startDeck');await page.locator('#startDeck').click();const first=await page.locator('#swipeCard h2').innerText();await page.locator('[data-deck-answer=present]').tap();await page.waitForFunction(n=>document.querySelector('#swipeCard h2')?.textContent!==n,first);const next=await page.locator('#swipeCard h2').innerText();await page.locator('#deckClose').tap();await page.locator('#startDeck').tap();assert.equal(await page.locator('#swipeCard h2').innerText(),next);
  await page.reload();await page.locator('#startDeck').waitFor();if(await page.locator('[data-phone-invite-later]').count())await page.locator('[data-phone-invite-later]').click();await page.locator('#startDeck').tap();assert.equal(await page.locator('#swipeCard h2').innerText(),next);assert((await page.locator('.deck-head small').innerText()).includes('1 de 5 registradas'));
  for(const theme of ['light','dark'])for(const width of [320,360,390,412,768,1280]){
   await page.setViewportSize({width,height:844});await page.evaluate(t=>TNT.setTheme(t),theme);
   assert(await page.locator('#swipeCard').evaluate(n=>{const b=n.getBoundingClientRect();return b.width<=362&&b.height<450&&b.left>=11&&b.right<=innerWidth-11&&b.top>=0&&b.bottom<=innerHeight;}),'Compact card '+width);
   assert(await page.locator('#swipeCard .big-avatar').evaluate(n=>{const b=n.getBoundingClientRect();return Math.abs(b.width-b.height)<1&&b.width<=141;}));
   if(width===390)await page.screenshot({animations:'disabled',path:path.join(out,'attendance-compact-'+theme+'.png')});
  }
  await page.setViewportSize({width:844,height:390});assert(await page.locator('#swipeCard').evaluate(n=>{const b=n.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;}));await page.screenshot({animations:'disabled',path:path.join(out,'attendance-landscape.png')});await page.setViewportSize({width:390,height:844});
  for(let i=0;i<4;i++){await page.locator('[data-deck-answer=absent]').tap();await page.waitForTimeout(300);}await page.locator('.deck-finish').waitFor();await page.locator('#deckDone').tap();await page.locator('#startDeck').tap();assert.equal(await page.locator('#swipeCard').count(),0);assert.equal(saved.size,5);
  await page.locator('#deckDone').tap();saved.clear();await page.reload();await page.locator('#startDeck').waitFor();await page.locator('#startDeck').tap();const skipped=[];
  for(const direction of [-1,1]){const card=page.locator('#swipeCard');skipped.push(await card.locator('h2').innerText());const box=await card.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+direction*100,{steps:5});await page.mouse.up();await page.waitForFunction(name=>document.querySelector('#swipeCard h2')?.textContent!==name,skipped.at(-1));}
  for(let i=0;i<3;i++){if(i===2)hold=true;await page.locator('[data-deck-answer=absent]').tap();await page.waitForTimeout(300);}await page.locator('.deck-finish').waitFor();assert(await page.locator('[data-copy-absent]').isDisabled());hold=false;releaseSave();await page.waitForFunction(()=>!document.querySelector('[data-copy-absent]').disabled);assert((await page.locator('[data-deck-counts]').innerText()).includes('2 sin marcar'));const share=decodeURIComponent(await page.locator('a[data-deck-export]').getAttribute('href'));for(const name of skipped)assert(!share.includes(name),'Omitted people are not absentees');assert.equal(saved.size,3);
  await context.grantPermissions(['clipboard-read','clipboard-write']);await page.locator('[data-copy-absent]').click();assert((await page.evaluate(()=>navigator.clipboard.readText())).includes('Ausentes'));
  await page.screenshot({animations:'disabled',path:path.join(out,'attendance-share.png')});await page.locator('#deckDone').tap();await page.locator('#startDeck').tap();assert.equal(await page.locator('#swipeCard h2').innerText(),skipped[0]);await page.locator('#deckClose').tap();
  console.log('Asistencia: retoma al cerrar y recargar, sólo pendientes, sin repetir al terminar, tarjeta compacta; seis anchos, ambos temas y horizontal: OK');
 }
 async function startupPerformanceFlow(){
  const requests=[],scripts=[];const track=req=>{const u=new URL(req.url());if(u.pathname.includes('/rest/v1/'))requests.push({name:u.pathname.split('/').at(-1),args:req.method()==='POST'?req.postDataJSON():null});if(u.origin===base&&u.pathname.endsWith('.js'))scripts.push(u.pathname);};page.on('request',track);
  let releaseHome,releaseNotes,releaseCatalog;
  const homeGate=new Promise(r=>releaseHome=r),notesGate=new Promise(r=>releaseNotes=r),catalogGate=new Promise(r=>releaseCatalog=r);
  const homeRoute=async route=>{await homeGate;await route.fallback();},noteRoute=async route=>{await notesGate;await route.fallback();};
  await page.route('**/rest/v1/rpc/tnt_home_context',homeRoute);await page.route('**/rest/v1/rpc/tnt_my_notifications',noteRoute);
  await visit('/','.module-card');await page.locator('.daily-carousel').waitFor();
  assert.equal(await page.locator('.tnt-startup').count(),0);assert.equal(await page.locator('.hub-activities[aria-busy=true]').count(),1);assert(!(await page.locator('.hub-activities').innerText()).includes('Todavía no tenés'));
  await page.locator('[data-tnt-notify]').click();await page.locator('.tnt-notifications-root').waitFor();assert.equal(requests.filter(r=>r.name==='tnt_my_notifications').length,1,'Header, home and dialog share one pending notification request');await page.locator('dialog .tnt-close').click();
  releaseNotes();await page.waitForFunction(()=>TNTNotifications.notes.length>0);
  await page.locator('[data-daily-pause]').click();await page.locator('[data-space-next]').click();const space=await page.locator('[data-deck-active=true]').getAttribute('data-space');
  await page.locator('#hub-query').fill('mi búsqueda mientras carga');await page.evaluate(()=>{document.querySelector('[data-space-track]').scrollIntoView({block:'center'});document.querySelector('#hub-query').focus({preventScroll:true});});
  const before=await page.locator('[data-space-track]').evaluate(n=>n.getBoundingClientRect().top);
  await page.screenshot({animations:'disabled',path:path.join(out,'startup-pending.png')});
  releaseHome();await page.locator('.hub-activity-list').waitFor();await page.waitForFunction(()=>!document.querySelector('.hub-activities[aria-busy]'));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await page.locator('#hub-query').inputValue(),'mi búsqueda mientras carga');assert.equal(await page.locator('#hub-query').evaluate(n=>document.activeElement===n),true);assert.equal(await page.locator('[data-deck-active=true]').getAttribute('data-space'),space);assert.equal(await page.locator('[data-daily-pause]').getAttribute('aria-pressed'),'true');
  const after=await page.locator('[data-space-track]').evaluate(n=>n.getBoundingClientRect().top);assert(Math.abs(after-before)<3,'Delayed activities keep the visible module deck in place');
  assert.equal(requests.filter(r=>r.name==='tnt_startup_context').length,1);assert.equal(requests.filter(r=>['tnt_ensure_account','tnt_continue_profile','tnt_profile_context','tnt_access_grants','tnt_role_permission_presets'].includes(r.name)).length,0,'One identity HTTP request replaces the individual startup requests');
  assert.equal(scripts.filter(s=>s==='/assets/tnt-experience.js').length,1);assert(!scripts.some(s=>s==='/assets/tnt-experience-base.js'||s==='/assets/tnt-unified.js'),'Production uses the ordered shared bundle');
  await page.unroute('**/rest/v1/rpc/tnt_home_context',homeRoute);await page.unroute('**/rest/v1/rpc/tnt_my_notifications',noteRoute);
  await page.evaluate(()=>{__fixtureFailures['rpc:tnt_home_context']='Conexión de actividades interrumpida';document.dispatchEvent(new CustomEvent('tnt:data',{detail:{tables:['tnt_events']}}));});await page.locator('#reload').waitFor();assert(await page.locator('.hub-activity-list').count());assert(await page.locator('[data-space-track]').count());
  await page.evaluate(()=>{delete __fixtureFailures['rpc:tnt_home_context'];__fixtureDB.tnt_tasks[0].title='Actividad actualizada después de reintentar';});await page.locator('#reload').click();await page.getByText('Actividad actualizada después de reintentar',{exact:true}).first().waitFor();
  await visit('/perfil','.life-profile');const startups=requests.filter(r=>r.name==='tnt_startup_context');assert.equal(startups.length,2);assert.equal(startups[1].args.p_sync,false);assert.equal(startups[1].args.p_continue,false);
  const catalogueRoute=async route=>{await catalogGate;await route.fallback();};await page.route('**/api/bible?action=versions',catalogueRoute);
  const communityBefore=requests.filter(r=>r.name==='tnt_community_bootstrap').length;
  await visit('/biblia?v=1909&ref=MAT.5.14-16','[data-reading]');await page.getByText(/Vosotros sois la luz del mundo/).waitFor();assert.equal(await page.locator('[data-version]').isEnabled(),true);
  // Let the actual reading-save debounce finish. It must not load the whole
  // Community dashboard or refetch all notifications just to save a bookmark.
  await page.waitForTimeout(850);assert.equal(requests.filter(r=>r.name==='tnt_community_bootstrap').length,communityBefore);
  await page.screenshot({animations:'disabled',path:path.join(out,'reader-before-catalog.png')});releaseCatalog();await page.locator('[data-catalog]').waitFor({state:'attached'});
  await page.unroute('**/api/bible?action=versions',catalogueRoute);page.off('request',track);
  fs.writeFileSync(path.join(out,'startup-evidence.json'),JSON.stringify({identityRequestsPerPage:1,sharedScriptRequests:1,notificationRequestsDuringHomeAndDialog:1,localReaderWaitsForCatalogue:false,homeSurvivesActivityFailure:true,searchFocusDeckAndDailyPausePreserved:true},null,2));
  console.log('Carga: acceso en una consulta, paquete compartido único, inicio usable con actividades/avisos pendientes, foco/scroll/pausa conservados, reintento, navegación sin resinc y lectura local sin esperar catálogo: OK');
 }
 async function layoutSizingFlow(){
  licensed=false;
  await visit('/','.daily-carousel');
  await page.evaluate(()=>{
   const event=__fixtureDB.tnt_events[0];
   __fixtureDB.tnt_event_members.filter(m=>m.event_id===event.id).forEach(m=>m.event_role='organizer');
   document.dispatchEvent(new Event('tnt:data'));
  });
  await page.waitForFunction(()=>document.querySelectorAll('[data-my-activity^="event-"] .activity-person').length>=3);
  await page.waitForFunction(()=>document.querySelector('[data-daily-verse]')?.textContent.length>35);
  await page.evaluate(async()=>{TNTCommunity.data.daily.reference='Mateo 5:14-16';TNTCommunity.data.daily.phrase='Date un momento para orar, respirar y mirar con amor lo que tenés por delante.';TNTCommunity.data.daily.author='';await TNTCommunity.home();await document.fonts.ready;});
  await page.waitForFunction(()=>document.querySelector('[data-daily-verse]')?.textContent.includes('Vosotros sois la luz del mundo'));
  for(const theme of ['light','dark'])for(const width of [320,360,390,412,768,1280]){
   await page.setViewportSize({width,height:844});await page.evaluate(t=>TNT.setTheme(t),theme);
   for(const index of [0,1]){
    await page.evaluate(index=>{const track=document.querySelector('.daily-track');track.scrollTo({left:track.children[index].offsetLeft-track.children[0].offsetLeft,behavior:'instant'});},index);
    await page.waitForFunction(index=>document.querySelectorAll('.daily-dot')[index].getAttribute('aria-current')==='true',index);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const size=await page.evaluate(index=>{
     const track=document.querySelector('.daily-track'),slide=track.children[index],last=slide.querySelector('.daily-action'),s=getComputedStyle(slide);
     const blank=slide.getBoundingClientRect().bottom-last.getBoundingClientRect().bottom-parseFloat(s.paddingBottom)-parseFloat(s.borderBottomWidth);
     return{blank,track:track.getBoundingClientRect().height,slide:slide.getBoundingClientRect().height,dates:[...document.querySelectorAll('.hub-activity-date')].map(n=>n.getBoundingClientRect().height),controls:[...document.querySelectorAll('.daily-controls button')].every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth;}),overflow:document.documentElement.scrollWidth>innerWidth};
    },index);
    if(width===390){await page.locator('.daily-carousel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'layout-daily-'+theme+'-'+index+'.png')});}
    assert(size.blank<3,'Daily card has no stretched blank area: '+JSON.stringify({theme,width,index,...size}));
    assert(Math.abs(size.track-size.slide-8)<3,'Carousel follows the active card height: '+JSON.stringify({theme,width,index,...size}));
    assert(size.slide<=330,'Daily preview stays compact with the reported passage: '+JSON.stringify({theme,width,index,...size}));
    assert(size.dates.every(height=>height<=90),'Date badges do not stretch with a large team: '+JSON.stringify({theme,width,...size}));
    assert(!size.overflow,'Home fits '+theme+' '+width);
    assert(size.controls,'Daily controls fit and have 44 px touch targets: '+theme+' '+width);
   }
  }
  await page.setViewportSize({width:390,height:844});await page.locator('.daily-carousel').scrollIntoViewIfNeeded();
  await page.locator('[data-daily-next]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.daily-dot')[0].getAttribute('aria-current')==='true'&&document.querySelector('.daily-track').scrollLeft<1);
  await page.locator('.daily-track').focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>{const n=document.querySelector('.daily-track');return document.querySelectorAll('.daily-dot')[1].getAttribute('aria-current')==='true'&&Math.abs(n.scrollLeft-(n.scrollWidth-n.clientWidth))<1;});
  await page.evaluate(()=>document.querySelector('.daily-phrase blockquote').textContent='Un paso a la vez.');
  await page.waitForFunction(()=>{const n=document.querySelector('.daily-track');return Math.abs(n.getBoundingClientRect().height-n.children[1].getBoundingClientRect().height-8)<3;});
  await page.locator('[data-daily-phrase]').click();assert((await page.locator('dialog .daily-full-quote').innerText()).includes('lo que tenés por delante.'));await page.keyboard.press('Escape');
  await page.locator('[data-daily-go="0"]').click();await page.locator('[data-c-reading]').click();await page.waitForURL('**/biblia?ref=MAT.5.14-16&v=1909');await page.locator('[data-reading] p').first().waitFor();
  assert(await page.evaluate(async()=>{const original=await(await fetch('/assets/bible/rvr1909/MAT.json')).json(),text=document.querySelector('[data-reading]').innerText;return original.chapters['5'].filter(v=>v.verse>=14&&v.verse<=16).every(v=>text.includes(v.text));}),'The complete daily passage is intact in the reader');
  await visit('/','.daily-carousel');
  await page.setViewportSize({width:390,height:844});await page.locator('.hub-activities').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'layout-activities.png')});
  await visit('/perfil','[data-photo]');
  for(const theme of ['light','dark'])for(const width of [320,360,390,412,768,1280]){
   await page.setViewportSize({width,height:844});await page.evaluate(t=>TNT.setTheme(t),theme);
   assert(await page.locator('.life-profile').evaluate(n=>{
    const portrait=n.querySelector('.portrait'),r=portrait.getBoundingClientRect(),outer=n.getBoundingClientRect(),s=getComputedStyle(portrait);
    return Math.abs(r.width-r.height)<1&&s.borderRadius==='50%'&&Math.abs(r.left+r.width/2-outer.left-outer.width/2)<2&&getComputedStyle(n).textAlign==='center'&&document.documentElement.scrollWidth<=innerWidth;
   }),'Centered circular profile '+theme+' '+width);
   if(width===390)await page.screenshot({path:path.join(out,'layout-profile-'+theme+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>TNT.setTheme('light'));await page.locator('[data-appearance]').click();assert.equal(await page.locator('[name=palette]').count(),5);await page.locator('.appearance-form [data-cancel]').click();
  console.log('Layout: compact Matthew 5:14-16 preview, complete reading/phrase, 3+ coordinators, compact dates and circular profile; six widths, both themes: OK');
 }
 async function loadingAndRotationFlow(){
  await visit('/','.daily-carousel');await page.locator('[data-daily-pause]').click();await page.locator('.hub-greeting h1').click();
  await page.waitForTimeout(12500);assert.equal(await page.locator('.daily-dot').first().getAttribute('aria-current'),'true','Explicit pause survives losing focus');
  await page.locator('[data-daily-pause]').click();await page.locator('.hub-greeting h1').click();
  await page.waitForFunction(()=>document.querySelectorAll('.daily-dot')[1].getAttribute('aria-current')==='true',null,{timeout:14000});
  await page.evaluate(()=>document.getElementById('app').insertAdjacentHTML('beforeend',TNTUI.startup()));
  for(const theme of ['light','dark'])for(const [width,height] of [[320,640],[360,740],[390,844],[412,900],[768,900],[844,360],[1280,900]]){
   await page.setViewportSize({width,height});await page.evaluate(t=>TNT.setTheme(t),theme);
   assert(await page.locator('.tnt-startup').evaluate(n=>{
    const r=n.getBoundingClientRect(),badge=n.querySelector('.tnt-startup-orbit'),img=badge.querySelector('img'),s=getComputedStyle(badge,'::after');
    const parts=[...n.children].map(c=>c.getBoundingClientRect()),center=(Math.min(...parts.map(p=>p.top))+Math.max(...parts.map(p=>p.bottom)))/2;
    return r.left===0&&r.top===0&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1&&Math.abs(center-innerHeight/2)<18&&s.content==='none'&&s.animationName==='none'&&getComputedStyle(img).animationName==='none'&&document.elementFromPoint(10,10).closest('.tnt-startup')===n&&document.elementFromPoint(innerWidth/2,innerHeight-10).closest('.tnt-startup')===n;
   }),'One centered TNT loading screen, without the old ring: '+theme+' '+width+'x'+height);
   if(width===390||width===844)await page.screenshot({path:path.join(out,'loading-tnt-'+theme+'-'+width+'.png')});
  }
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.tnt-startup>i').evaluate(n=>getComputedStyle(n).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('.tnt-startup').evaluate(n=>n.remove());await page.setViewportSize({width:390,height:844});await page.evaluate(()=>TNT.setTheme('light'));
  console.log('Widget rotation/pause/resume and a single centered TNT loader without the old ring; both themes, portrait/landscape and reduced motion: OK');
 }
 async function approvedVisualFlow(){
  if(process.env.TNT_TEST_APPROVED_FAST!=='1'){
  await visit('/','.daily-carousel');await page.waitForFunction(()=>document.querySelector('[data-daily-verse]')?.textContent.length>35);
  assert(await page.locator('[data-community-home]').evaluate(n=>Boolean(n.compareDocumentPosition(document.querySelector('.hub-activities'))&Node.DOCUMENT_POSITION_FOLLOWING)),'Verse precedes activities');
  await page.screenshot({animations:'disabled',path:path.join(out,'approved-home.png')});
  await page.locator('[data-space-track]').scrollIntoViewIfNeeded();await page.locator('[data-deck-active=true] .tnt-space-cover').evaluate(img=>img.decode());await page.screenshot({animations:'disabled',path:path.join(out,'approved-deck.png')});console.log('Deck evidence',await page.locator('.tnt-space-cover').evaluateAll(nodes=>nodes.map(n=>({src:n.src,loaded:n.complete,width:n.naturalWidth,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,opacity:getComputedStyle(n).opacity}))));
  const first=await page.locator('[data-deck-active=true]').getAttribute('data-space');await page.locator('[data-space-next]').click();assert.notEqual(await page.locator('[data-deck-active=true]').getAttribute('data-space'),first);
  await page.locator('[data-space-track]').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('[data-deck-active=true]').getAttribute('data-space'),first);
  await visit('/perfil','[data-appearance]');await page.locator('[data-appearance]').click();assert.equal(await page.locator('[name=palette]').count(),5);
  for(const theme of ['light','dark'])for(const [width,height] of [[320,740],[360,740],[390,844],[412,900],[768,1024],[844,390],[1280,900],[1366,593],[1440,900],[1920,1080],[683,296]]){
   await page.setViewportSize({width,height});await page.evaluate(t=>TNT.setTheme(t),theme);
   assert(await page.locator('.appearance-option').evaluateAll(cards=>cards.every(card=>{const r=card.getBoundingClientRect();return [...card.children].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right+1&&b.top>=r.top&&b.bottom<=r.bottom+1;});})), 'All palette names and swatches fit '+width+' '+theme);
   if([390,1366].includes(width))await page.screenshot({animations:'disabled',path:path.join(out,'repair-appearance-'+theme+'-'+width+'.png')});
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>TNT.setTheme('light'));
  await page.locator('[data-style-card=oceano]').click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.tntPalette),'oceano');
  await page.locator('.appearance-form [data-cancel]').click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.tntPalette),'original');
  for(const palette of ['original','bosque','lavanda','oceano','atardecer']){
   await page.locator('[data-appearance]').click();await page.locator('[data-style-card='+palette+']').click();await page.locator('.appearance-form [type=submit]').click();
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.tntPalette),palette);
   for(const theme of ['light','dark']){await page.evaluate(t=>TNT.setTheme(t),theme);for(const width of [320,360,390,412,768,1280]){
    await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Palette fits '+palette+' '+theme+' '+width);
    assert(await page.locator('#tnt-main-nav').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
   }}
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>TNT.setTheme('light'));await page.screenshot({animations:'disabled',path:path.join(out,'palette-'+palette+'.png')});if(palette==='original')console.log('Profile evidence',await page.locator('.life-row').first().evaluate(n=>({background:getComputedStyle(n).backgroundColor,disabled:n.disabled,root:getComputedStyle(document.documentElement).getPropertyValue('--life-panel'),panel:getComputedStyle(document.documentElement).getPropertyValue('--tnt-panel')})));
  }
  await page.reload();await page.locator('[data-appearance]').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.tntPalette),'atardecer');
  await page.evaluate(()=>{localStorage.setItem('tnt:palette:'+TNT.session.user.id,'original');TNTAppearance.apply();});
  }
  await visit('/organizacion?view=schedule','.agenda-card');const taskId=await page.locator('[data-feature-task]').first().getAttribute('data-feature-task');
  const named=await page.locator('.agenda-card').first().innerText();assert(!/1 responsable/i.test(named));assert(await page.locator('.agenda-card .activity-person b').count()>0);
  await page.locator('[data-feature-task="'+taskId+'"]').first().click();assert.equal(await page.locator('[name=feature_color]').count(),13);
  await page.locator('[name=feature_custom]').fill('#162b49');await page.locator('[name=feature_custom]').dispatchEvent('input');
  assert.equal(await page.locator('[data-feature-preview]').evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)');
  await page.screenshot({path:path.join(out,'activity-custom-color.png')});await page.locator('[data-activity-color] [type=submit]').click();
  await page.locator('[data-activity-color]').waitFor({state:'detached'});
  assert.equal(await page.evaluate(id=>__fixtureDB.tnt_tasks.find(t=>t.id===id).feature_color,taskId),'#162B49');
  const colored=page.locator('[data-feature-task="'+taskId+'"]').first().locator('xpath=ancestor::article[1]');
  await page.waitForTimeout(300);console.log('Color evidence',await page.evaluate(id=>[...document.querySelectorAll('[data-feature-task=\"'+id+'\"]')].map(n=>{const c=n.closest('article');return {cls:c?.className,style:c?.getAttribute('style'),background:c&&getComputedStyle(c).backgroundColor,tone:c&&getComputedStyle(c).getPropertyValue('--feature-tone')};}),taskId));await page.screenshot({path:path.join(out,'approved-schedule-debug.png')});
  await page.waitForFunction(id=>{const n=document.querySelector('[data-feature-task=\"'+id+'\"]')?.closest('article');return n&&getComputedStyle(n).backgroundColor==='rgb(22, 43, 73)';},taskId);
  assert.equal(await colored.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(22, 43, 73)');
  await page.screenshot({path:path.join(out,'approved-schedule.png')});
  for(const [url,selector] of [['/comunidad?manage=1','.c-groups'],['/perfil','[data-appearance]'],['/biblia','[data-reading]'],['/juegos','[data-game]'],['/organizacion?view=schedule','.agenda-card'],['/','.hub-activities']]){
   await visit(url,selector);
   for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Route fits '+url+' '+width);assert(await page.locator('.life-header-tools>*,.tnt-shell-tools>*').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none').every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>=43&&r.height>=43;})),'Header controls fit '+url+' '+width);}
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>TNTExperience.startTutorial());await page.locator('#tnt-tutorial').waitFor();
   for(let step=0;step<3;step++){
    for(const [width,height] of [[320,844],[360,740],[390,844],[412,900],[768,900],[844,360],[1280,900]]){
     await page.setViewportSize({width,height});
     assert(await page.locator('.tnt-tutorial-overlay .tnt-sheet').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=10&&r.right<=innerWidth-10&&r.top>=10&&r.bottom<=innerHeight-10;}),'Tutorial fits '+url+' '+width+'x'+height);
     await page.locator('#tnt-tutorial [data-next]').scrollIntoViewIfNeeded();assert(await page.locator('#tnt-tutorial [data-next]').isVisible());
    }
    if(step<2)await page.locator('#tnt-tutorial [data-next]').click();
   }
   await page.setViewportSize({width:390,height:844});await page.locator('.tnt-tutorial-overlay .tnt-sheet').evaluate(n=>n.scrollTop=0);await page.screenshot({path:path.join(out,'tutorial-'+(url==='/'?'home':url.split('?')[0].slice(1))+'.png')});
   await page.keyboard.press('Escape');assert.equal(await page.locator('.tnt-tutorial-overlay').count(),0);
  }
  console.log('Approved design: 5 palettes, light/dark, 6 widths, custom color, named responsibles, persistent preference, deck navigation and centered tutorials: OK');
 }
  async function actorPage(actor){const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block'});await ctx.addInitScript(({uid,key})=>{if(location.protocol!=='http:')return;const enc=v=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_'),user={id:uid,email:'demo@example.test',aud:'authenticated',role:'authenticated',user_metadata:{}},token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+86400})+'.test';localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user}));localStorage.setItem('tnt-theme','light');},{uid:pid(99+actor),key:'sb-oeodnnomgiddkblnlzay-auth-token'});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.stack));await mockAPI(p,actor);await p.route('**/api/bible?*',r=>r.fulfill({status:403,json:{code:'LICENSE_REQUIRED'}}));return{ctx,p,visit:async url=>{await p.goto(base+url+(url.includes('?')?'&':'?')+'fixture-person='+actor);await p.waitForFunction(()=>window.TNT?.profileComplete);if(await p.locator('[data-phone-invite-later]').count())await p.locator('[data-phone-invite-later]').click();}};}
 async function welcomeRequestFlow(){
  for(const actor of [1,2,3]){const a=await actorPage(actor);try{
   await a.visit('/comunidad?module=welcome');await a.p.locator('.life-page').waitFor();const request=a.p.locator('[data-c-action=request_welcome]');
   if(actor<3){await a.p.getByRole('heading',{name:'Acompañamos juntos',exact:true}).waitFor();assert.equal(await request.count(),0);const result=await a.p.evaluate(()=>TNT.sb.rpc('tnt_community_action',{p_action:'request_welcome',p_data:{staff_status:'community'}}));assert(result.error?.message.includes('personas de Comunidad'));}
   else{await request.waitFor();assert.equal(await request.count(),1);}
   for(const theme of ['light','dark'])for(const [width,height] of [[320,740],[360,740],[390,844],[412,900],[768,1024],[844,390],[1280,900],[1366,593],[1440,900],[1920,1080],[683,296]]){await a.p.setViewportSize({width,height});await a.p.evaluate(t=>TNT.setTheme(t),theme);assert(await a.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Welcome fits role '+actor+' '+width);if(width===390||width===1366)await a.p.screenshot({animations:'disabled',path:path.join(out,'welcome-role-'+actor+'-'+theme+'-'+width+'.png')});}
   if(actor===3){await request.click();await a.p.getByText('El equipo está organizando quién puede acompañarte.',{exact:true}).waitFor();assert.equal(await request.count(),0);}
  }finally{await a.ctx.close();}}
  console.log('Welcome request: Community can ask, leaders/admin cannot through UI or RPC, direct administrative assignment follows, eleven responsive sizes and both themes: OK');
 }
 async function communityFocusRefreshFlow(){
  await visit('/comunidad?module=bible&manage=1','[data-create]');let release,started;const waiting=new Promise(r=>started=r),gate=new Promise(r=>release=r);const hold=async route=>{started();await gate;await route.fallback();};await page.route('**/rpc/tnt_community_bootstrap',hold);
  try{await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await waiting;await page.locator('[data-create]').click();assert.equal(await page.locator('dialog form [name=title]').count(),1,'An admin can open the editor while a focus refresh is pending; '+errors.join(' / '));await page.locator('dialog [name=title]').fill('Borrador conservado al recuperar foco');}
  finally{const response=page.waitForResponse(r=>r.url().includes('/rpc/tnt_community_bootstrap'));release();await(await response).finished();await page.unroute('**/rpc/tnt_community_bootstrap',hold);}
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForFunction(()=>TNTCommunity.data?.modules);assert.equal(await page.locator('dialog [name=title]').inputValue(),'Borrador conservado al recuperar foco');await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});console.log('Returning focus keeps the current community data and editable draft while the refresh completes: OK');
 }
 async function communitySavedRefreshFlow(){
  await visit('/comunidad?module=welcome&manage=1','[data-assign]');let release,started,seen=0;const waiting=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  const hold=async route=>{if(seen++)return route.fallback();const snapshot=await serial(async()=>{await pg.db.exec(`reset role;set request.jwt.claim.sub='${pid(100)}';set role authenticated;`);return(await pg.db.query('select public.tnt_community_bootstrap() result')).rows[0].result;});started();await gate;await route.fulfill({json:snapshot});};await page.route('**/rpc/tnt_community_bootstrap',hold);
  try{await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await waiting;await page.locator('[data-assign="'+pid(3)+'"]').click();await page.locator('dialog [name=referent_id]').selectOption(pid(1),{force:true});await page.locator('dialog [type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(person=>TNTCommunity.data.accompaniment.find(a=>a.person_id===person).referent_id,pid(3)),pid(1));
   const response=page.waitForResponse(r=>r.url().includes('/rpc/tnt_community_bootstrap'));release();await(await response).finished();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.evaluate(person=>TNTCommunity.data.accompaniment.find(a=>a.person_id===person).referent_id,pid(3)),pid(1),'An older bootstrap must not replace a saved assignment');
  }finally{release();await page.unroute('**/rpc/tnt_community_bootstrap',hold);}
  console.log('A saved administrative assignment waits for its own fresh data and survives an older delayed bootstrap response: OK');
 }
 async function directAccompanimentFlow(){
  await serial(async()=>{await pg.db.exec('reset role');await pg.db.query("insert into tnt_community_accompaniment(person_id,referent_id,status,assigned_by,assigned_at) values($1,$2,'accepted',$1,now()),($2,null,'unassigned',null,null) on conflict(person_id) do update set status=excluded.status,referent_id=excluded.referent_id",[pid(1),pid(2)]);await pg.db.query("insert into tnt_community_followups(person_id,author_id,note) values($1,$2,'Historia del equipo conservada')",[pid(1),pid(2)]);await pg.db.query("update tnt_accounts set staff_status='approved' where person_id=$1",[pid(2)]);});
  await visit('/comunidad?module=welcome&manage=1','[data-assign]');assert.deepEqual(new Set(await page.locator('[data-assign]').evaluateAll(ns=>ns.map(n=>n.dataset.assign))),new Set([pid(3),pid(4),pid(5)]));assert.equal(await page.locator('[data-assign="'+pid(1)+'"],[data-assign="'+pid(2)+'"]').count(),0);
  const history=page.locator('details').filter({has:page.getByText('Acompañamientos anteriores del equipo',{exact:true})});await history.locator('summary').click();await history.getByText('Historia del equipo conservada',{exact:false}).waitFor();
  await page.locator('[data-assign="'+pid(3)+'"]').click();await page.getByRole('button',{name:'Asignar referente',exact:true}).waitFor();assert(!(await page.locator('dialog').innerText()).includes('acepte'));assert.equal(await page.locator('dialog option').count(),3);
  for(const theme of ['light','dark'])for(const [width,height] of [[320,740],[360,740],[390,844],[412,900],[768,1024],[844,390],[1280,900],[1366,593],[1440,900],[1920,1080],[683,296],[390,320]]){await page.setViewportSize({width,height});await page.evaluate(t=>TNT.setTheme(t),theme);assert(await page.locator('dialog .tnt-sheet').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=11&&r.right<=innerWidth-11&&r.top>=11&&r.bottom<=innerHeight-11&&n.scrollWidth<=n.clientWidth+1;}),'Direct assignment fits '+theme+' '+width+'x'+height);await page.locator('dialog [type=submit]').scrollIntoViewIfNeeded();if(width===390&&height===844||width===1366)await page.screenshot({animations:'disabled',path:path.join(out,'direct-assignment-'+theme+'-'+width+'.png')});}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>TNT.setTheme('light'));await page.locator('dialog [name=referent_id]').selectOption(pid(2),{force:true});await page.locator('dialog [type=submit]').press('Enter');await page.locator('dialog').waitFor({state:'hidden'});await page.locator('.life-card').filter({has:page.locator('[data-assign="'+pid(3)+'"]')}).getByText('Referente asignado',{exact:true}).waitFor();
  const ref=await actorPage(2);try{await ref.visit('/comunidad?module=welcome');await ref.p.getByRole('heading',{name:'Mara López',exact:true}).waitFor();assert.equal(await ref.p.locator('[data-c-ref]').count(),0);await ref.p.getByRole('button',{name:'Registrar un encuentro',exact:true}).click();await ref.p.locator('dialog [name=note]').fill('Encuentro disponible sin aceptación');await ref.p.locator('dialog [name=shared]').check();await ref.p.locator('dialog [type=submit]').click();await ref.p.locator('dialog').waitFor({state:'hidden'});await ref.p.screenshot({animations:'disabled',path:path.join(out,'direct-referent-mobile.png')});}finally{await ref.ctx.close();}
  const member=await actorPage(3);try{await member.visit('/comunidad?module=welcome');await member.p.getByText('Tu referente es',{exact:false}).waitFor();await member.p.getByText('Encuentro disponible sin aceptación',{exact:true}).waitFor();assert.equal(await member.p.locator('[data-c-action=request_welcome],[data-assign],[data-c-ref]').count(),0);await member.p.screenshot({animations:'disabled',path:path.join(out,'direct-member-mobile.png')});}finally{await member.ctx.close();}
  await serial(async()=>{await pg.db.exec('reset role');await pg.db.query('delete from tnt_community_followups where person_id in($1,$2)',[pid(1),pid(2)]);await pg.db.query('delete from tnt_community_accompaniment where person_id in($1,$2)',[pid(1),pid(2)]);});
  console.log('Administrative assignment is immediate, no accept/decline, staff requests closed and excluded, earlier history retained, assigned referent records and member sees shared notes: OK');
 }
 async function correctedGamesFlow(){
  await visit('/juegos','[data-game=order]');await page.locator('[data-game=order]').click();assert(await page.locator('[name=start_from][value=beginning]').isChecked());await page.locator('[name=difficulty][value=easy]').check();await page.locator('[data-game-setup] [type=submit]').click();await page.locator('[data-answer=EXO]').click();await page.locator('.life-game-feedback.bad').waitFor();assert.equal(await page.locator('.life-game-feedback').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 232, 229)');
  await page.locator('[data-hint]').click();await page.locator('[data-answer=GEN].g-hint').waitFor();assert((await page.locator('.life-game-feedback').innerText()).includes('Génesis'));for(const id of ['GEN','EXO','LEV','NUM','DEU'])await page.locator('[data-answer='+id+']').click();await page.getByText('Ronda 2 de 3',{exact:true}).waitFor();assert(await page.locator('[data-hint]').isEnabled());assert.equal(await page.locator('[data-answer=GEN]').count(),0);
  await page.locator('[data-hint]').click();assert((await page.locator('.life-game-feedback').innerText()).includes('Josué'));await page.screenshot({animations:'disabled',path:path.join(out,'game-order-hint.png')});
  await visit('/juegos','[data-game=pairs]');await page.locator('[data-game=pairs]').click();await page.locator('[data-game-setup] [type=submit]').click();await page.locator('[data-answer=p0]').click();await page.locator('[data-answer=o1]').click();await page.locator('.life-game-feedback.bad').waitFor();await page.waitForTimeout(850);await page.locator('[data-answer=p0]').click();await page.locator('[data-hint]').click();await page.locator('[data-answer=o0].g-hint').waitFor();await page.locator('[data-answer=o0]').click();await page.locator('.life-game-feedback.good').waitFor();
  console.log('Games distinguish wrong/correct, explain hints, advance automatically and renew the hint after beginning at Genesis: OK');
 }
 async function modulesAndCommunityFlow(){
  // Leave the previous app document first: its pagehide handler persists open modules.
  await page.goto(base+'/icons/dynamite-app.svg');
  await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('tnt:modules:'))localStorage.removeItem(key);});
  await visit('/','.community-count');assert.equal(await page.locator('.community-count b').innerText(),'Ya somos 5');
  for(const theme of ['light','dark'])for(const [width,height] of [[320,740],[360,740],[390,844],[412,900],[768,1024],[844,390],[1280,900],[1366,593],[1440,900],[1920,1080],[683,296],[960,540]]){await page.setViewportSize({width,height});await page.evaluate(t=>TNT.setTheme(t),theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Home fits '+width+' '+height);if([390,1366,1920].includes(width))await page.screenshot({animations:'disabled',path:path.join(out,'home-current-'+theme+'-'+width+'.png'),fullPage:true});}
  await page.setViewportSize({width:683,height:296});await page.locator('[data-nav-spaces]').press('Enter');assert(await page.locator('dialog .tnt-sheet').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=10&&r.right<=innerWidth-10&&r.top>=10&&r.bottom<=innerHeight-10;}));await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>TNTNavigation.settings());await page.locator('dialog input[value=saturday]').check();await page.locator('dialog input[value=schedule]').check();await page.locator('dialog [data-shortcut-up=schedule]').click();assert((await page.locator('[data-shortcut-preview]').innerText()).includes('Inicio · Cronograma · Pasar lista · Comunidad · Más'));await page.locator('dialog [type=submit]').click();await page.locator('#tnt-main-nav a[href*="mode=sabados"]').waitFor();
  await page.locator('#tnt-main-nav a[href*="mode=sabados"]').click();const attendance=page.frameLocator('iframe[title="Asistencia"]');await attendance.locator('#startDeck').waitFor();await attendance.locator('#att-search').fill('Bruno');
  await page.evaluate(()=>TNTNavigation.open('/biblia?ref=GEN.1&v=128'));const reader=page.frameLocator('iframe[title="Biblia"]');await reader.locator('[data-reading] p').first().waitFor();assert.equal(await reader.locator('#tnt-main-nav').count(),0);
  await page.locator('[data-nav-spaces]').click();await page.locator('dialog .nav-opened>summary').first().click();await page.locator('dialog [data-workspace="/asistencia"]').click();assert.equal(await attendance.locator('#att-search').inputValue(),'Bruno');assert.equal(await page.locator('iframe').count(),2);
  await page.locator('#tnt-main-nav a[href*="next_saturday=1"]').click();const org=page.frameLocator('iframe[title="Organización"]');await org.locator('.tnt-program-hero').waitFor();
  await org.locator('dialog[open] [data-close]').click();await org.locator('[data-schedule-options]').click();await org.locator('#schedule-people').click();
  await org.locator('#membersForm').waitFor();assert.equal(await org.locator('dialog:modal').count(),1);const member=org.locator('[data-member-row]').nth(1);await member.getByText('Coordina',{exact:true}).tap();assert(await member.locator('[value=organizer]').isChecked());
  await org.locator('#membersForm [type=submit]').click();await org.locator('#membersForm').waitFor({state:'detached'});assert.equal(await org.locator('dialog:modal').count(),0);
  await org.locator('[data-schedule-options]').click();await org.locator('#schedule-people').click();assert(await org.locator('[data-member-row]').nth(1).locator('[value=organizer]').isChecked());await org.locator('#modal [data-close]').click();await org.locator('#schedule-people').waitFor();assert.equal(await org.locator('dialog:modal').count(),1);await org.locator('#modal [data-close]').click();
  await org.locator('body').evaluate(()=>eventDetailModal(S.selectedEvent));await org.locator('#modal #manageEventMembers').click();await org.locator('#membersForm').waitFor();assert.equal(await org.locator('dialog:modal').count(),1);await org.locator('#modal [data-close]').click();await org.locator('#modal .event-overview').waitFor();await org.locator('#modal [data-close]').click();
  await org.locator('[data-build-schedule]').click();await org.locator('.tnt-program-hero').waitFor();
  for(const theme of ['light','dark'])for(const [width,height] of [[320,740],[390,844],[844,390],[1366,593],[1920,1080]]){await page.setViewportSize({width,height});await page.evaluate(t=>TNT.setTheme(t),theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Module workspace fits '+width);assert.equal(await page.locator('.tnt-module-tabs').isVisible(),false);assert.equal(await page.locator('#tnt-main-nav').count(),1);assert.equal(await page.locator('#tnt-main-nav [aria-current=page]').count(),1);assert(await page.locator('#tnt-module-stage').evaluate(n=>{const r=n.getBoundingClientRect(),nav=document.querySelector('#tnt-main-nav').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=nav.top;}));if(width===390||width===1366)await page.screenshot({animations:'disabled',path:path.join(out,'modules-'+theme+'-'+width+'.png')});}
  // A legacy button or a redirect may drop tnt_embed; it must never create a nested workspace.
  await page.evaluate(()=>TNTNavigation.open('/biblia?ref=GEN.1&v=128'));
  await reader.locator('[data-reading]').waitFor();await reader.locator('[data-reading]').evaluate(()=>{location.href='/comunidad?module=birthdays';});
  await page.waitForURL('**/comunidad?module=birthdays');const redirected=page.frameLocator('iframe[title="Comunidad"]');await redirected.locator('.birthday-month').first().waitFor();assert.equal(await redirected.locator('#tnt-main-nav,iframe,.tnt-module-tabs').count(),0);
  await page.locator('#tnt-main-nav a[href="/"]').click();await page.locator('#tnt-module-base .community-count').waitFor();assert.equal(await page.locator('#tnt-main-nav a[aria-current=page]').getAttribute('href'),'/');
  await page.evaluate(()=>TNTNavigation.open('/comunidad?module=birthdays'));const birthdays=page.frameLocator('iframe[title="Comunidad"]');await birthdays.locator('.birthday-month').first().waitFor();assert.equal(await birthdays.locator('.birthday-month').count(),12);assert.equal(await birthdays.locator('[name=birthday_public]').count(),0);await birthdays.locator('.birthday-next').waitFor();
  await page.evaluate(()=>{TNT.grants=TNT.grants.map(g=>g.module==='lista-sabados'?{...g,enabled:false,access_level:'none'}:g);TNT.account.system_role='user';TNT.isAdmin=false;document.dispatchEvent(new CustomEvent('tnt:permissions'));});assert.equal(await page.locator('iframe[title="Asistencia"]').count(),0);assert.equal(await page.locator('#tnt-main-nav a[href*="mode=sabados"]').count(),0);
  await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('tnt:modules:'))localStorage.removeItem(key);});
  console.log('Live modules retain forms, per-user shortcuts, current Saturday program, twelve birthday months and revoked access: OK');
 }
 async function coordinatorVideoFlow(){
  await page.setViewportSize({width:360,height:800});await visit('/','.community-count');
  await page.evaluate(()=>{const db=__fixtureDB;db.tnt_accounts.forEach(a=>a.staff_status='approved');for(let i=0;i<14;i++){const id='00000000-0000-4000-8000-'+String(200+i).padStart(12,'0');db.tnt_people.push({...db.tnt_people[0],id,full_name:'Persona de prueba '+String(i+1).padStart(2,'0')});db.tnt_accounts.push({...db.tnt_accounts[1],person_id:id,system_role:'user',staff_status:'approved',auth_user_id:null});}db.tnt_event_members=db.tnt_event_members.filter(m=>m.person_id===TNT.person.id);TNTNavigation.open('/organizacion/?next_saturday=1');});
  const org=page.frameLocator('iframe[title="Organización"]');await org.locator('.tnt-program-hero').waitFor();await org.locator('#modal [data-close]').click();await org.locator('[data-schedule-options]').tap();await org.locator('#schedule-people').tap();await org.locator('#membersForm').waitFor();
  for(const theme of ['light','dark'])for(const [width,height] of [[320,740],[360,800],[390,844],[412,900],[768,1024],[844,390],[1280,900],[1366,593],[1440,900],[1920,1080],[683,296],[390,320]]){
   await page.setViewportSize({width,height});await page.evaluate(t=>TNT.setTheme(t),theme);const row=org.locator('[data-member-row]').nth(10);await row.scrollIntoViewIfNeeded();if(!await row.locator('[name=person]').isChecked())await row.locator('[name=person]').tap();await row.locator('label').filter({hasText:/^Coordina$/}).tap();
   const info=await row.evaluate(n=>{const input=n.querySelector('[value=organizer]'),dialog=n.closest('dialog'),sheet=dialog.querySelector('.sheet'),b=sheet.getBoundingClientRect();return{checked:input.checked,modal:dialog.matches(':modal'),dialogScroll:dialog.scrollTop,top:b.top,bottom:b.bottom,left:b.left,right:b.right,width:innerWidth,height:innerHeight,overflow:sheet.scrollWidth>sheet.clientWidth+1};});assert(info.checked&&info.modal);assert(info.dialogScroll===0&&info.top>=10&&info.bottom<=info.height-10&&info.left>=10&&info.right<=info.width-10&&!info.overflow,'Scrolled coordinator stays visible '+theme+' '+JSON.stringify(info));
   if(width===390&&height===844||width===1366)await page.screenshot({animations:'disabled',path:path.join(out,'coordinator-video-'+theme+'-'+width+'.png')});await row.locator('label').filter({hasText:/^Participa$/}).tap();assert(await row.locator('[value=participant]').isChecked());await row.locator('[value=participant]').press('ArrowRight');assert(await row.locator('[value=organizer]').isChecked());
  }
  await page.setViewportSize({width:360,height:800});
  await org.locator('#membersForm [type=submit]').tap();await org.locator('#membersForm').waitFor({state:'detached'});assert.equal(await org.locator('dialog:modal').count(),0);console.log('Video regression: scrolled coordinator/participant stays on screen, touch and arrow keys work, long roster saves; both themes, mobile/desktop/landscape and reduced height: OK');
 }
 async function granularActionsFlow(){
  await visit('/','.community-count');await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('tnt:modules:'))localStorage.removeItem(key);});await visit('/','.community-count');
  await page.evaluate(()=>TNTPersonal.action('preferences',{shortcuts:['saturday','schedule','community'],shortcut_context:{}}));
  await page.locator('[data-nav-spaces]').tap();await page.locator('[data-nav-edit]').click();await page.locator('dialog input[value=saturday]').uncheck();await page.locator('dialog input[value=efe]').check();
  const efe=page.locator('[data-context=efe]');await efe.locator('[data-context-key=group]').selectOption('varones',{force:true});await efe.locator('[data-context-key=when]').selectOption('latest',{force:true});
  await page.locator('dialog input[value=schedule]').uncheck();await page.locator('dialog input[value=chat]').check();await page.locator('dialog [type=submit]').click();await page.locator('#tnt-main-nav [data-nav-action=efe]').waitFor();
  assert.equal(await page.locator('#tnt-main-nav>:is(a,button)').count(),5);assert.equal(await page.locator('#tnt-main-nav').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  await page.locator('[data-nav-action=efe]').tap();const attendance=page.frameLocator('iframe[title="Asistencia"]');await attendance.locator('#startDeck').waitFor();assert.equal(await attendance.locator('#att-group').inputValue(),'efe-group');
  await page.locator('[data-nav-action=chat]').tap();const chat=page.frameLocator('iframe[title="Chat TNT"]');await chat.locator('#chat-composer [contenteditable=true]').waitFor();assert.equal(await chat.locator('#chat-room-head h2').innerText(),'Equipo TNT');assert(await chat.locator('#chat-composer [contenteditable=true]').isEditable());await chat.locator('#chat-back').click();await chat.locator('[data-thread=\"00000000-0000-4000-8000-000000000060\"]').click();await page.locator('[data-nav-action=chat]').tap();await page.waitForFunction(()=>document.querySelector('iframe[title=\"Chat TNT\"]').contentDocument.querySelector('#chat-room-head h2')?.textContent==='Equipo TNT');
  await page.locator('#tnt-main-nav a[href="/"]').tap();await page.locator('[data-nav-spaces]').tap();await page.locator('[data-open-space*="action=prepare-saturday"]').click();const org=page.frameLocator('iframe[title="Organización"]');await org.locator('.event-edit-form').waitFor();assert.equal(await org.locator('#ev-name').inputValue(),'Sábado TNT · Somos equipo');
  await page.locator('#tnt-main-nav a[href="/"]').tap();await page.locator('[data-nav-spaces]').tap();await page.locator('[data-open-space*="view=brief"]').click();await org.locator('.briefing-list').waitFor();assert((await org.locator('.briefing-list').innerText()).includes('Preparar la merienda'));assert(!(await org.locator('.briefing-list').innerText()).includes('Multimedia y sonido'));
  await page.locator('#tnt-main-nav a[href="/"]').tap();await page.evaluate(()=>{__fixtureDB.tnt_events=__fixtureDB.tnt_events.filter(e=>e.kind!=='saturday');});await page.locator('[data-nav-spaces]').tap();await page.locator('[data-open-space*="action=prepare-saturday"]').click();await org.locator('#satForm').waitFor();const date=await org.locator('#satForm [name=date]').inputValue();assert.equal(new Date(date+'T12:00:00Z').getUTCDay(),6);assert(date>=await page.evaluate(()=>TNTUI.dateKey()));
  await page.locator('#tnt-main-nav a[href="/"]').tap();await page.locator('[data-nav-spaces]').tap();await page.locator('[data-nav-edit]').click();await page.locator('dialog input[value=community]').uncheck();await page.locator('dialog input[value=saturday]').check();
  const fixed=await page.evaluate(()=>{const date=TNTUI.dateKey(),day=new Date(date+'T12:00:00Z').getUTCDay();return TNTUI.addDays(date,(6-day+7)%7);});await page.locator('[data-context=saturday] [data-context-key=when]').selectOption('date',{force:true});await page.locator('[data-context=saturday] [data-context-key=date]').fill(fixed);await page.locator('dialog [type=submit]').click();await page.evaluate(()=>__fixtureDB.tnt_events.push({id:'older-saturday',kind:'saturday',name:'Sábado anterior',start_date:'2026-10-24',end_date:'2026-10-24',status:'completed'}));await page.locator('[data-nav-action=saturday]').tap();await attendance.locator('#att-event').waitFor();assert.equal(await attendance.locator('#att-event').inputValue(),fixed);
  await attendance.locator('#att-event').selectOption('2026-10-24',{force:true});await page.locator('[data-nav-action=saturday]').tap();await page.waitForFunction(date=>document.querySelector('iframe[title="Asistencia"]').contentDocument.querySelector('#att-event')?.value===date,fixed);
  await page.locator('#tnt-main-nav a[href="/"]').tap();await page.evaluate(()=>{TNT.grants.push({module:'efe',scope:'varones',enabled:false,access_level:'none'});document.dispatchEvent(new CustomEvent('tnt:permissions'));});assert.equal(await page.locator('[data-nav-action=efe]').count(),0);assert.equal(await page.locator('iframe[title="Asistencia"]').count(),1);assert.equal(await page.evaluate(()=>TNTNavigation.open('/asistencia/?mode=efe&group=varones')),false);
  console.log('Fixed five slots, saved group/date contexts, exact EFE list, general chat composer, my activities, existing/new Saturday forms and revoked EFE: OK');
 }
 async function bibleVersionsFlow(){
  licensed=false;await visit('/biblia?ref=JHN.3.16&v=127','[data-reading]');await page.locator('.reader-unavailable').waitFor();assert.equal(await page.locator('[data-reading] a').count(),0);assert.equal(await page.locator('.reader-config').getAttribute('open'),null);
  assert.deepEqual(await page.locator('[data-version] option').evaluateAll(ns=>ns.slice(0,5).map(n=>Number(n.value))),[128,127,1782,149,176]);
  licensed=true;await visit('/biblia?ref=GEN.1&v=128','[data-reading]');await page.getByText('Lectura sintética GEN.1',{exact:false}).waitFor();await page.locator('[data-reading] [data-reader-verse]').first().click();await page.locator('.reader-mark-bar:not([hidden])').waitFor();await page.locator('[data-mark-color=lime]').click();await page.locator('[data-reading] [data-mark=lime]').waitFor();
  await page.locator('[data-config-toggle]').click();await page.locator('[data-favorite]').click();await page.getByText('Tu versión favorita',{exact:false}).waitFor();
  await page.locator('[data-next]').click();await page.getByText('Lectura sintética GEN.2',{exact:false}).waitFor();await page.locator('[data-prev]').click();await page.locator('[data-reading] [data-mark=lime]').waitFor();
  await page.locator('[data-catalog]').click();await page.locator('dialog input[value="147"]').check();await page.locator('dialog [type=submit]').click();await page.locator('[data-version]').selectOption('147',{force:true});await page.getByText('Créditos sintéticos 147',{exact:true}).waitFor();await page.locator('[data-reading] [data-mark=lime]').waitFor();assert.equal(await page.locator('[data-attribution]').innerText(),'Créditos sintéticos 147');
  indexDown=128;await page.locator('[data-version]').selectOption('128',{force:true});await page.getByText('Lectura sintética GEN.1',{exact:false}).waitFor();indexDown=0;
  passageDown=true;await page.locator('[data-next]').click();await page.locator('.reader-unavailable').waitFor();passageDown=false;await page.locator('[data-reader-retry]').click();await page.getByText('Lectura sintética GEN.2',{exact:false}).waitFor();
  if(await page.locator('.reader-config').getAttribute('open')!==null)await page.locator('[data-config-toggle]').click();
  for(const theme of ['light','dark'])for(const [width,height] of [[320,740],[360,740],[390,844],[412,900],[768,1024],[844,390],[1280,900],[1366,593],[1440,900],[1920,1080],[683,296],[960,540]]){await page.setViewportSize({width,height});await page.evaluate(t=>TNT.setTheme(t),theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Reader fits '+width);await page.locator('[data-reading]').scrollIntoViewIfNeeded();assert(await page.locator('[data-next]').isVisible());if([390,1366].includes(width))await page.screenshot({animations:'disabled',path:path.join(out,'reader-current-'+theme+'-'+width+'.png')});}
  await page.setViewportSize({width:683,height:296});await page.locator('[data-config-toggle]').press('Enter');await page.locator('.reader-config[open]').waitFor();await page.locator('[data-config-toggle]').press('Enter');await page.locator('[data-reading] [data-reader-verse]').first().press('Enter');assert(await page.locator('.reader-mark-bar').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=10&&r.right<=innerWidth-10&&r.top>=10&&r.bottom<=innerHeight-10;}));await page.keyboard.press('Escape');
  // This is the provider's paragraph shape that originally prevented selection.
  const denseRoute=route=>new URL(route.request().url()).searchParams.get('action')==='passage'?route.fulfill({json:{content:'<p><sup class="yv-v-num">1</sup>Primera frase sintética. <a class="verse-number" href="#verse-2">2</a>Segunda frase sintética.</p><p><sup class="yv-v-num">3</sup>Tercera frase sintética.</p>',copyright:'Créditos de prueba'}}):route.fallback();await page.route('**/api/bible?*',denseRoute);
  await page.setViewportSize({width:390,height:844});await visit('/biblia?ref=JHN.16&v=128','[data-reader-verse="2"]');
  assert.equal(await page.locator('[data-reader-verse]').count(),3);assert((await page.locator('[data-reader-verse="2"]').innerText()).includes('Segunda frase'));assert(!(await page.locator('[data-reader-verse="1"]').innerText()).includes('Segunda frase'));
  assert(await page.locator('[data-reading]').evaluate(n=>n.getBoundingClientRect().width>=innerWidth-40));assert(await page.locator('[data-reading]').evaluate(n=>n.getBoundingClientRect().top<200));
  await page.locator('[data-reader-verse="2"] a').click();await page.locator('.reader-mark-bar:not([hidden])').waitFor();await page.locator('[data-mark-save]').click();await page.locator('[data-reader-verse="2"][data-mark=lime]').waitFor();
  await page.locator('[data-saved]').click();await page.locator('[data-saved-ref="JHN.16.2"]').waitFor();await page.locator('[data-saved-ref="JHN.16.2"]').click();await page.locator('[data-reader-verse="2"][data-mark=lime]').waitFor();
  await page.unroute('**/api/bible?*',denseRoute);
  // Actual YouVersion REST uses verse milestones with following sibling text.
  const yvRoute=route=>new URL(route.request().url()).searchParams.get('action')==='passage'?route.fulfill({json:{content:'<div class="p"><span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>Primera frase. <span class="yv-v" v="2"></span><span class="yv-vlbl">2</span>Segunda frase.</div><div class="q1">Continuación poética del segundo versículo.</div><div class="p"><span class="yv-v" v="3"></span><span class="yv-vlbl">3</span>Tercera frase.</div>',copyright:'Créditos sintéticos de formato REST'}}):route.fallback();await page.route('**/api/bible?*',yvRoute);
  await visit('/biblia?ref=REV.9&v=128','[data-reader-verse="2"]');
  assert.equal(await page.locator('[data-reader-verse="2"]').count(),2);assert((await page.locator('[data-reader-verse="2"]').first().innerText()).includes('Segunda frase'));
  await page.locator('[data-reader-verse="2"]').first().tap();await page.locator('.reader-mark-bar:not([hidden])').waitFor();await page.locator('[data-reader-verse="1"]').tap();assert.equal(await page.locator('.is-selected[data-reader-verse]').count(),3);
  await page.locator('[data-mark-underline]').tap();await page.locator('[data-reader-verse="2"][data-mark=underline]').first().waitFor();assert.equal(await page.locator('[data-mark=underline][data-reader-verse]').count(),3);
  await page.locator('[data-chapter-picker]').click();await page.locator('[data-picker-chapter="10"]').click();await page.waitForFunction(()=>document.querySelector('[data-dock-reference]').textContent==='Apocalipsis 10');
  await page.locator('[data-dock-prev]').tap();await page.waitForFunction(()=>document.querySelector('[data-dock-reference]').textContent==='Apocalipsis 9');await page.locator('[data-reader-verse="2"][data-mark=underline]').first().waitFor();
  await page.locator('[data-reader-verse="2"]').first().tap();await page.locator('[data-mark-expand]').click();await page.locator('.reader-selection-more:not([hidden])').waitFor();
  for(const theme of ['light','dark'])for(const [width,height] of [[320,740],[360,740],[390,844],[412,900],[768,1024],[844,390],[1280,900],[1366,593],[1440,900],[1920,1080],[683,296],[960,540]]){await page.setViewportSize({width,height});await page.evaluate(t=>TNT.setTheme(t),theme);assert(await page.locator('.reader-mark-bar').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=10&&r.right<=innerWidth-10&&r.top>=10&&r.bottom<=innerHeight-10&&n.scrollWidth<=n.clientWidth+1;}));if([390,1366].includes(width))await page.screenshot({animations:'disabled',path:path.join(out,'reader-selection-'+theme+'-'+width+'.png')});}
  await page.keyboard.press('Escape');assert.equal(await page.locator('.reader-mark-bar').isVisible(),false);await page.unroute('**/api/bible?*',yvRoute);
  await page.setViewportSize({width:390,height:844});await visit('/biblia?ref=GEN.1&v=1909','[data-reader-verse="20"]');await page.evaluate(()=>window.scrollTo({top:600,behavior:'instant'}));await page.waitForFunction(()=>document.querySelector('.reader-chapter-dock').dataset.revealed==='false');await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));await page.waitForFunction(()=>document.querySelector('.reader-chapter-dock').dataset.revealed==='true');assert(await page.locator('[data-dock-next]').isVisible());
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.locator('[data-reader-verse="1"]').tap();
  for(const theme of ['light','dark']){await page.evaluate(t=>TNT.setTheme(t),theme);await page.screenshot({animations:'disabled',path:path.join(out,'reader-local-selection-'+theme+'-390.png')});}
  await page.keyboard.press('Escape');
  console.log('Five translations, wide reader, multi-verse paragraphs, saved favorites, retry, sticky chapter controls and responsive reflow: OK');
 }
 async function inlineLicenseFlow(){licensed=false;await visit('/biblia?ref=GEN.1&v=128','[data-reading]');await page.locator('.reader-unavailable').waitFor();licensed=true;await page.locator('[data-reader-retry]').click();await page.getByText('Lectura sintética GEN.1',{exact:false}).waitFor();revoked=128;await page.locator('[data-next]').click();await page.locator('.reader-unavailable').waitFor();revoked=0;}

 try{
  if(process.env.TNT_TEST_COMMUNITY_SAVE_ONLY==='1'){await communitySavedRefreshFlow();assert.deepEqual(errors,[]);return;}
  if(process.env.TNT_TEST_COMMUNITY_FOCUS_ONLY==='1'){await communityFocusRefreshFlow();assert.deepEqual(errors,[]);return;}
  if(process.env.TNT_TEST_COORDINATOR_VIDEO==='1'){await coordinatorVideoFlow();assert.deepEqual(errors,[]);return;}
  if(process.env.TNT_TEST_APPEARANCE_ONLY==='1'){await approvedVisualFlow();assert.equal(errors.length,0,errors.join('\n'));return;}
  if(process.env.TNT_TEST_WELCOME_ONLY==='1'){await welcomeRequestFlow();await directAccompanimentFlow();assert.equal(errors.length,0,errors.join('\n'));return;}
  if(process.env.TNT_TEST_GAMES_ONLY==='1'){await correctedGamesFlow();assert.equal(errors.length,0,errors.join('\n'));return;}
  if(process.env.TNT_TEST_ACTIONS_ONLY==='1'){await granularActionsFlow();assert.equal(errors.length,0,errors.join('\n'));return;}
  if(process.env.TNT_TEST_MODULES_ONLY==='1'){await modulesAndCommunityFlow();assert.equal(errors.length,0,errors.join('\n'));return;}
  if(process.env.TNT_TEST_ATTENDANCE_ONLY==='1'){await attendanceResumeFlow();assert.equal(errors.length,0,errors.join('\n'));return;}
  if(process.env.TNT_TEST_ENTRY_ONLY==='1'){await entryFlow();assert.equal(errors.length,0,errors.join('\n'));return;}
  if(process.env.TNT_TEST_INLINE_ONLY==='1'){await inlineLicenseFlow();assert.equal(errors.length,0,errors.join('\n'));return;}
  if(process.env.TNT_TEST_STARTUP_ONLY==='1'){await startupPerformanceFlow();assert.equal(errors.length,0,errors.join('\n'));return;}
  if(!process.env.TNT_TEST_EXTERNAL_ONLY&&!process.env.TNT_TEST_BIBLE_ONLY&&!process.env.TNT_TEST_LAYOUT_ONLY)await startupPerformanceFlow();
  if(process.env.TNT_TEST_EXTERNAL_ONLY==='1'){await bibleVersionsFlow();assert.equal(errors.length,0,errors.join('\n'));return;}
  await bibleVersionsFlow();
  await inlineLicenseFlow();
  if(process.env.TNT_TEST_BIBLE_ONLY==='1'){assert.equal(errors.length,0,errors.join('\n'));return;}
  await layoutSizingFlow();
  await loadingAndRotationFlow();
  if(process.env.TNT_TEST_LAYOUT_ONLY==='1'){assert.equal(errors.length,0,errors.join('\n'));return;}
  await approvedVisualFlow();
  await welcomeRequestFlow();
  await directAccompanimentFlow();
  await communityFocusRefreshFlow();
  await communitySavedRefreshFlow();
  await coordinatorVideoFlow();
  await visit('/comunidad' ,'.c-groups');assert.equal(await page.locator('.c-group').count(),3);assert.equal(await page.locator('.daily-carousel').count(),0);await capture('community-new');
  await visit('/comunidad?module=bible&manage=1','[data-create]');await page.locator('[data-create]').click();let form=page.locator('dialog form');await form.locator('[name=title]').fill('Plan desde el equipo');await form.locator('[name=description]').fill('Dos momentos para compartir');await form.locator('[name=status]').selectOption('published',{force:true});await form.locator('[data-step-title]').fill('Descubrir el amor de Dios');await form.locator('[data-reference]').fill('Juan 3:16');await form.locator('[data-reflection]').fill('¿Cómo podés compartir ese amor hoy?');await form.locator('[data-add-step]').click();await form.locator('[data-step-title]').nth(1).fill('Caminar juntos');await form.locator('[data-reference]').nth(1).fill('Hechos 2:42-47');
  await page.evaluate(()=>window.__communityFailure='Conexión interrumpida de prueba');await form.locator('[type=submit]').click();await form.getByText('Conexión interrumpida de prueba').waitFor();assert.equal(await form.locator('[name=title]').inputValue(),'Plan desde el equipo');await form.locator('[type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});await page.getByRole('heading',{name:'Plan desde el equipo',exact:true}).waitFor();await capture('staff-plans');
  const plan=await serial(async()=>{await pg.db.exec('reset role');return(await pg.db.query("select id from tnt_community_content where title='Plan desde el equipo'")).rows[0].id;});
  await visit('/comunidad?module=baptisms&manage=1','[data-config]');await page.locator('[data-config]').click();form=page.locator('dialog form');await form.locator('[name=intro]').fill('Texto de bautismo revisado por el equipo.');await form.locator('[name=faq]').fill('Primero conversamos y después coordinamos el encuentro.');await form.locator('[type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});await visit('/comunidad?module=baptisms','[data-c-action=request_baptism]');await page.getByText('Texto de bautismo revisado por el equipo.').waitFor();await capture('baptisms');
  await visit('/comunidad?module=welcome&manage=1','[data-assign]');await page.locator('[data-assign="'+pid(3)+'"]').click();await page.locator('dialog [name=referent_id]').selectOption(pid(2),{force:true});await page.locator('dialog [type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});
  // Real JPEG decoding and the mobile file-provider MIME fallback.
  await visit('/perfil?view=photo','#life-photo-form');await page.locator('[name=source][value=custom]').check();const jpeg=await page.screenshot({type:'jpeg',quality:75});await page.evaluate(()=>window.createImageBitmap=undefined);await page.locator('#life-photo-file').setInputFiles({name:'galeria.jpg',mimeType:'application/octet-stream',buffer:jpeg});await page.getByText('Tu foto está lista para guardar.').waitFor();assert((await page.locator('[data-photo-preview] img').getAttribute('src')).startsWith('blob:'));await page.locator('#life-photo-form [type=submit]').click();await page.waitForURL('**/perfil');await capture('profile-new');
  // The account panel owns its scroll and fits above every viewport edge.
  await page.locator('[data-account]').click();await page.locator('#tnt-account-menu').waitFor();assert(await page.locator('#tnt-account-menu').evaluate(n=>{const r=n.getBoundingClientRect(),list=n.querySelector('.tnt-menu-actions'),s=getComputedStyle(list);return r.top>=0&&r.bottom<=innerHeight&&s.overflowY==='auto'&&n.scrollHeight<=n.clientHeight+1;}));await page.locator('.tnt-menu-actions').evaluate(n=>n.scrollTop=n.scrollHeight);assert(await page.locator('[data-logout]').isVisible());await page.screenshot({path:path.join(out,'account-scroll.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('#tnt-account-menu').count(),0);assert.equal(await page.evaluate(()=>document.body.classList.contains('tnt-account-open')),false);
  await visit('/','[data-my-activity]');assert(await page.locator('.hub-activity-list').evaluate(n=>getComputedStyle(n).overflowY==='visible'&&getComputedStyle(n).maxHeight==='none'));await page.locator('.hub-activity-list').scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);await page.mouse.move(190,550);await page.mouse.wheel(0,550);await page.waitForTimeout(250);assert(await page.evaluate(y=>scrollY>y,before));await page.screenshot({path:path.join(out,'home-new.png'),fullPage:true});
  await visit('/juegos','[data-game]');assert.equal(await page.locator('[data-game]').count(),5);await capture('games-new');await page.locator('[data-game=pairs]').click();await page.locator('[name=difficulty][value=easy]').check();await page.locator('[data-game-setup] [type=submit]').click();await page.locator('.g-pair-board').waitFor();await capture('game-pairs');
  for(let round=0;round<3;round++){const pairs=await page.locator('[data-answer]').evaluateAll(nodes=>nodes.filter(n=>n.dataset.answer[0]==='p').map(n=>[n.dataset.answer,'o'+n.dataset.answer.slice(1)]));for(const ids of pairs)for(const id of ids)await page.locator('[data-answer="'+id+'"]').click();if(round<2)await page.locator('[data-next-round]').click();}await page.getByText('¡Lo lograste!').waitFor();await page.getByText('Tu partida y tu marca quedaron guardadas en tu cuenta.').waitFor();await capture('game-result-new');
  assert(await serial(async()=>{await pg.db.exec('reset role');return(await pg.db.query("select count(*)::int n from tnt_community_game_runs where kind='pairs'")).rows[0].n===1;}));
  // The assigned referent can register immediately; a community member joins the actual plan.
  const ref=await actorPage(2);await ref.visit('/comunidad?module=welcome');assert.equal(await ref.p.locator('[data-c-ref]').count(),0);await ref.p.getByText('Registrar un encuentro',{exact:true}).waitFor();await ref.ctx.close();
  const member=await actorPage(3);await member.visit('/comunidad?module=bible');assert.equal(await member.p.locator('[data-c-manage]').count(),0);await member.p.locator('[data-c-content="'+plan+'"]').click();await member.p.locator('dialog [data-join]').click();await member.p.locator('dialog [data-step="1"]').check();await member.p.getByText('1 de 2 pasos completados').waitFor();await member.p.screenshot({path:path.join(out,'member-plan.png')});await member.p.locator('dialog .tnt-close').click();await member.visit('/comunidad?module=welcome');await member.p.getByText('Tu referente es').waitFor();await member.ctx.close();
  await correctedGamesFlow();
  await modulesAndCommunityFlow();
  assert.deepEqual(errors,[]);console.log('Comunidad con SQL real: staff publica y edita, referente registra sin aceptar, miembro avanza, JPEG real, menú y scroll móviles, Biblia oficial/inline y 5 juegos. Capturas en 320/390/768/1280 y ambos temas: OK.');
 }catch(error){await page.screenshot({path:path.join(out,'community-failure.png')}).catch(()=>{});console.error('Browser page errors',errors);throw error;}finally{await browser.close();await new Promise(r=>server.close(r));await pg.db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
