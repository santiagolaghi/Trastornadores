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
   if(name.startsWith('tnt_community_')&&name!=='tnt_community_home'){
    const failure=await page.evaluate(()=>window.__communityFailure||'');if(failure&&name==='tnt_community_action'){await page.evaluate(()=>window.__communityFailure='');await route.fulfill({status:400,json:{message:failure}});return;}
    const allowed=['tnt_community_bootstrap','tnt_community_action','tnt_community_delivery_status'];if(!allowed.includes(name))throw Error('Unexpected community RPC '+name);
    const result=await serial(async()=>{await pg.db.exec(`reset role;set request.jwt.claim.sub='${pid(99+actor)}';set role authenticated;`);try{return{data:(await pg.db.query(name==='tnt_community_action'?'select public.tnt_community_action($1,$2::jsonb) result':'select public.'+name+'() result',name==='tnt_community_action'?[args.p_action,JSON.stringify(args.p_data)]:[])).rows[0].result};}catch(e){return{error:{message:e.message}};}});
    await route.fulfill({status:result.error?400:200,json:result.error||result.data});return;
   }

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
 pg=await database();await pg.db.exec('reset role');for(let n=1;n<=5;n++)await pg.db.query('update tnt_accounts set auth_user_id=$1 where person_id=$2',[pid(99+n),pid(n)]);for(const [i,name] of ['Nora Pérez','Bruno Díaz','Mara López','Lucas Rey','Ana Paz'].entries())await pg.db.query('update tnt_people set full_name=$1 where id=$2',[name,pid(i+1)]);
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
  if(action==='passage'&&!licensed)return route.fulfill({status:403,json:{code:'LICENSE_REQUIRED',error:'Traducción de prueba sin habilitar'}});
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
 async function layoutSizingFlow(){
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
 try{
  await layoutSizingFlow();
  await loadingAndRotationFlow();
  if(process.env.TNT_TEST_LAYOUT_ONLY==='1'){assert.equal(errors.length,0,errors.join('\n'));return;}
  await approvedVisualFlow();
  await visit('/comunidad' ,'.c-groups');assert.equal(await page.locator('.c-group').count(),3);await capture('community-new');
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
  await visit('/biblia?ref=GEN.1&v=1909','[data-reading]');await page.getByText('EN el principio crió Dios los cielos y la tierra.',{exact:false}).waitFor();assert.equal(await page.locator('[data-version]').inputValue(),'1909');await page.screenshot({animations:'disabled',path:path.join(out,'reader-rv1909.png')});await page.locator('[data-version]').selectOption('128',{force:true});await page.getByRole('link',{name:/Leer en Bible.com/}).waitFor();assert((await page.getByRole('link',{name:/Leer en Bible.com/}).getAttribute('href')).includes('/128/GEN.1'));await page.locator('[data-version]').selectOption('149',{force:true});await page.getByRole('link',{name:/Leer en Bible.com/}).waitFor();assert((await page.getByRole('link',{name:/Leer en Bible.com/}).getAttribute('href')).includes('/149/'));await page.locator('[name=reference]').fill('Juan 3:16');await page.locator('.c-reader-jump [type=submit]').click();assert((await page.getByRole('link',{name:/Leer en Bible.com/}).getAttribute('href')).endsWith('JHN.3.16'));await capture('reader-fallback');
  licensed=true;await visit('/biblia?v=128&ref=GEN.1','[data-reading]');await page.getByText('Lectura sintética GEN.1').waitFor();await page.locator('[data-next]').click();await page.getByText('Lectura sintética GEN.2').waitFor();await page.locator('[data-next]').click();await page.getByText('Lectura sintética EXO.1').waitFor();assert(await page.locator('[data-next]').isDisabled());await capture('reader-inline');
  await visit('/juegos','[data-game]');assert.equal(await page.locator('[data-game]').count(),5);await capture('games-new');await page.locator('[data-game=pairs]').click();await page.locator('[name=difficulty][value=easy]').check();await page.locator('[data-game-setup] [type=submit]').click();await page.locator('.g-pair-board').waitFor();await capture('game-pairs');
  for(let round=0;round<3;round++){const pairs=await page.locator('[data-answer]').evaluateAll(nodes=>nodes.filter(n=>n.dataset.answer[0]==='p').map(n=>[n.dataset.answer,'o'+n.dataset.answer.slice(1)]));for(const ids of pairs)for(const id of ids)await page.locator('[data-answer="'+id+'"]').click();if(round<2)await page.locator('[data-next-round]').click();}await page.getByText('¡Lo lograste!').waitFor();await page.getByText('Tu partida y tu marca quedaron guardadas en tu cuenta.').waitFor();await capture('game-result-new');
  assert(await serial(async()=>{await pg.db.exec('reset role');return(await pg.db.query("select count(*)::int n from tnt_community_game_runs where kind='pairs'")).rows[0].n===1;}));
  // A second signed-in account accepts its invitation; a community member joins the actual plan.
  async function actorPage(actor){const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,serviceWorkers:'block'});await ctx.addInitScript(({uid,key})=>{if(location.protocol!=='http:')return;const enc=v=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_'),user={id:uid,email:'demo@example.test',aud:'authenticated',role:'authenticated',user_metadata:{}},token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+86400})+'.test';localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user}));localStorage.setItem('tnt-theme','light');},{uid:pid(99+actor),key:'sb-oeodnnomgiddkblnlzay-auth-token'});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.stack));await mockAPI(p,actor);await p.route('**/api/bible?*',r=>r.fulfill({status:403,json:{code:'LICENSE_REQUIRED'}}));return{ctx,p,visit:async url=>{await p.goto(base+url+(url.includes('?')?'&':'?')+'fixture-person='+actor);await p.waitForFunction(()=>window.TNT?.profileComplete);if(await p.locator('[data-phone-invite-later]').count())await p.locator('[data-phone-invite-later]').click();}};}
  const ref=await actorPage(2);await ref.visit('/comunidad?module=welcome');await ref.p.locator('[data-c-ref][data-accept=true]').click();await ref.p.getByText('Registrar un encuentro',{exact:true}).waitFor();await ref.ctx.close();
  const member=await actorPage(3);await member.visit('/comunidad?module=bible');assert.equal(await member.p.locator('[data-c-manage]').count(),0);await member.p.locator('[data-c-content="'+plan+'"]').click();await member.p.locator('dialog [data-join]').click();await member.p.locator('dialog [data-step="1"]').check();await member.p.getByText('1 de 2 pasos completados').waitFor();await member.p.screenshot({path:path.join(out,'member-plan.png')});await member.p.locator('dialog .tnt-close').click();await member.visit('/comunidad?module=welcome');await member.p.getByText('Tu referente es').waitFor();await member.ctx.close();
  assert.deepEqual(errors,[]);console.log('Comunidad con SQL real: staff publica y edita, referente acepta, miembro avanza, JPEG real, menú y scroll móviles, Biblia oficial/inline y 5 juegos. Capturas en 320/390/768/1280 y ambos temas: OK.');
 }finally{await browser.close();await new Promise(r=>server.close(r));await pg.db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
