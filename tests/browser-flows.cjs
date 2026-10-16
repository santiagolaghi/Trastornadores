/* Runs the published HTML parser and the official Supabase SDK against synthetic HTTP responses.
   TNT_TEST_BROWSER points to a Chromium executable; TNT_TEST_SDK to the exact UMD version in vercel.json. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),servedRoot=process.env.TNT_TEST_ROOT||path.join(root,'public'),out=process.env.TNT_TEST_OUTPUT||path.resolve(root,'../tnt-tools/screenshots');
const phoneMode=process.env.TNT_TEST_PHONE==='1';
const mockPhoneOS=process.env.TNT_TEST_MOCK_NOTIFICATIONS==='1',displayed=[];
const pid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixtureScript(){return fs.readFileSync(path.join(__dirname,'fixtures/runtime.js'),'utf8').replace("if(!location.pathname.includes('/hub'))","if(false)");}
const sdk=fs.readFileSync(process.env.TNT_TEST_SDK,'utf8')+`\nconst originalClient=supabase.createClient;supabase.createClient=(...args)=>{eval(${JSON.stringify(fixtureScript())});window.__fixtureSB=TNT.sb;window.__fixtureValues={};window.__profileValues={efe_group:'varones'};const db=window.__fixtureDB;db.tnt_people[0].first_name='Nora';db.tnt_people[0].last_name='Pérez';db.tnt_profiles_central=db.tnt_people.map(p=>({...p,nombre:p.full_name.split(' ')[0],apellido:p.full_name.split(' ').slice(1).join(' '),fecha_nacimiento:p.birthday,genero:p.sex==='F'?'Mujer':'Varón',telefono:'1112345678',creado_en:new Date().toISOString()}));db.tnt_efe_groups=[{id:'efe-group',code:'varones',name:'EFE Varones',active:true}];db.tnt_efe_memberships=db.tnt_people.map(p=>({person_id:p.id,group_id:'efe-group',active:true}));db.tnt_efe_meetings=[{id:'efe-meeting',group_id:'efe-group',meeting_date:TNTUI.dateKey(),active:true,title:'Miércoles EFE'}];db.tnt_saturday_members=db.tnt_people.map(p=>({person_id:p.id,active:true}));db.tnt_saturday_attendance=[];db.tnt_access_grants=[...TNT.grants,{module:'perfiles',scope:'*',enabled:true,access_level:'manage'}].map(g=>({...g,person_id:db.tnt_people[0].id}));if(new URLSearchParams(location.search).has('fixture-incomplete'))window.__profileValues.health='';if(new URLSearchParams(location.search).has('fixture-onboarding'))db.tnt_accounts[0].onboarding_completed_at=null;if(new URLSearchParams(location.search).has('fixture-community')){Object.assign(db.tnt_accounts[0],{staff_status:'community',ministry_role:null,system_role:'user'});db.tnt_access_grants=[];}return originalClient(...args)};`;
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
    if(name==='tnt_push_test'){__fixtureCalls.push({rpc:name,args});window.__phoneTest={id:'00000000-0000-4000-8000-000000009900',status:'sent',attempts:1};return{data:__phoneTest,error:null};}
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
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 let args=['--no-sandbox','--disable-dev-shm-usage'];try{const {default:b}=await import('@sparticuz/chromium');args=b.args;}catch{try{const {default:b}=await import('../..//tnt-tools/node_modules/@sparticuz/chromium/build/index.js');args=b.args;}catch{}}
 if(process.env.TNT_TEST_FULL_BROWSER==='1')args=['--no-sandbox','--disable-dev-shm-usage'];
 const browser=await chromium.launch({executablePath:process.env.TNT_TEST_BROWSER,args,headless:true}).catch(async error=>{await new Promise(r=>server.close(r));throw error});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,serviceWorkers:phoneMode?'allow':'block'});
 await context.addInitScript(({id,key})=>{if(location.protocol!=='http:')return;const enc=v=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+86400})+'.test';localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'synthetic-test-refresh-token',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user:{id,email:'demo@example.test',aud:'authenticated',role:'authenticated',user_metadata:{}}}));localStorage.setItem('tnt-theme','light');}, {id:pid(100),key:'sb-oeodnnomgiddkblnlzay-auth-token'});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.stack));await mockAPI(page);
 async function visit(url,selector){await page.goto(base+url);await page.waitForFunction(()=>window.TNT?.identity&&!TNT.error,{timeout:10000});await page.locator(selector).first().waitFor({timeout:10000});await page.evaluate(()=>{for(const key of ['home','organizacion','asistencia','perfiles'])localStorage.setItem('tnt-tutorial:'+TNT.person.id+':'+key+':2','true');});await page.waitForTimeout(160);}
 try{
  if(phoneMode){
   await context.grantPermissions(['notifications']);
   await context.addInitScript(mockOS=>{
    if(mockOS)Object.defineProperty(Notification,'permission',{value:'granted',configurable:true});
    localStorage.setItem('tnt-assets-version','20261012');
    const sub={endpoint:'https://push.example.invalid/browser-test',toJSON(){return{endpoint:this.endpoint,keys:{auth:'fixture',p256dh:'fixture'}}}};
    Object.defineProperty(PushManager.prototype,'getSubscription',{value:async()=>sub});
   },mockPhoneOS);
   const cdp=await context.newCDPSession(page);let resolveReg;
   const registration=new Promise(resolve=>resolveReg=resolve);
   cdp.on('ServiceWorker.workerRegistrationUpdated',e=>{for(const r of e.registrations)if(r.scopeURL===base+'/'&&!r.isDeleted)resolveReg(r.registrationId)});
   await cdp.send('ServiceWorker.enable');
   await visit('/organizacion/?view=my','.org-nav');
   await page.waitForFunction(()=>navigator.serviceWorker.controller,{timeout:15000});
   const registrationId=await registration;
   await page.evaluate(async()=>{
    const name=(await caches.keys()).find(k=>k.includes('profile-schedule')),cache=await caches.open(name);
    await cache.put('/manifest.webmanifest?v=20261013',new Response('{"icons":[{"src":"old.png"}]}'));
    await cache.put('/icons/icon-192.png',new Response('old icon'));
   });
   const manifest=await page.evaluate(async()=> (await fetch('/manifest.webmanifest?v=20261013')).json());
   assert(manifest.icons[0].src.includes('20261014'));
   const icon=await page.evaluate(async()=>Array.from(new Uint8Array(await(await fetch('/icons/icon-192.png')).arrayBuffer())).slice(0,8));assert.deepEqual(icon,[137,80,78,71,13,10,26,10]);
   await context.setOffline(true);const offline=await page.evaluate(async()=> (await fetch('/manifest.webmanifest?v=20261013')).json());assert.deepEqual(offline,manifest);await context.setOffline(false);
   await page.evaluate(async()=>{__fixtureDB.tnt_push_subscriptions=[{person_id:TNT.person.id,endpoint:'https://push.example.invalid/browser-test'}];await TNTNotifications.phone()});
   const modal=page.locator('dialog[open]').last();await modal.locator('[data-test]').waitFor({state:'visible'});await modal.locator('[data-test]').click();
   await page.waitForFunction(()=>__fixtureCalls.some(c=>c.rpc==='tnt_push_test'));
   await modal.locator('.tnt-phone-panel > [role=status]').filter({hasText:'Enviado desde TNT'}).waitFor();
   assert(!(await modal.innerText()).includes('La prueba llegó'));
   await cdp.send('ServiceWorker.deliverPushMessage',{origin:base,registrationId,data:JSON.stringify({title:'Prueba de avisos TNT',body:'Prueba aislada de Chromium',test_id:'00000000-0000-4000-8000-000000009900',url:'/'})});
   await modal.locator('.tnt-phone-panel > [role=status]').filter({hasText:'La prueba llegó a este teléfono'}).waitFor({timeout:10000});
   if(mockPhoneOS){assert(displayed.some(n=>n.title==='Prueba de avisos TNT'));assert(displayed[0].options.icon.includes('20261014'));}
   else assert.equal(await page.evaluate(async()=> (await(await navigator.serviceWorker.ready).getNotifications()).some(n=>n.title==='Prueba de avisos TNT')),true);
   await modal.locator('details.tnt-phone-panel > summary').click();const before=page.url();await modal.locator('[data-update]').click();await modal.locator('[data-reopen]').waitFor({state:'visible'});assert.equal(page.url(),before);assert((await modal.locator('[data-update-status]').innerText()).includes('última versión'));
   await page.screenshot({path:path.join(out,'phone-mobile.png')});await page.evaluate(()=>TNT.setTheme('dark'));await page.screenshot({path:path.join(out,'phone-dark-mobile.png')});
   assert.equal(await modal.locator('.tnt-phone-panel').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 32, 32)');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   console.log('PWA: direct module entry updates the worker; legacy manifests/icons refresh; offline fallback works; the native Chromium push event reaches the reception UI; updates preserve the open page. OS display:',mockPhoneOS?'mocked':'native');
   assert.deepEqual(errors,[]);return;
  }
  await visit('/', '.module-card');
  assert.equal(await page.evaluate(()=>!!TNTProfileLinks&&!!TNTProfileView&&!!TNTTemplateBuilder),true);
  assert.equal(await page.locator('.module-card .tnt-space-cover').count(),await page.locator('.module-card').count());
  console.log('Parser: shared profile, link review and visual templates loaded; every module has a photo.');
  await page.screenshot({path:path.join(out,'home-mobile.png'),fullPage:true});
  await page.locator('[data-hero-next]').click();assert((await page.locator('[data-hero-event]').innerText()).includes('United Camp'));
  await page.locator('[data-hero-prev]').click();await page.locator('[data-hero-event]').click();await page.locator('.schedule-top').waitFor();assert(page.url().includes('event='+pid(20)));
  assert.equal(await page.locator('[data-view=activities]').count(),0);assert.equal(await page.locator('[data-view=events]').count(),0);
  await page.evaluate(async()=>{
   const names=['Reflexión','Ofrenda','Canciones','Adoración'],times=['19:20:00','19:25:00','19:30:00','19:12:00'],durations=[5,5,15,8];
   __fixtureDB.tnt_schedule_items.forEach((row,index)=>Object.assign(row,{title:names[index],starts_at:times[index],duration_minutes:durations[index]}));
   await loadAll();render();
  });
  const order=()=>page.locator('[data-order-day] > [data-schedule-order-item]').evaluateAll(rows=>rows.map(row=>row.dataset.scheduleOrderItem));
  assert.deepEqual(await order(),[pid(53),pid(50),pid(51),pid(52)]);
  const touch=await context.newCDPSession(page);
  async function moveBefore(id,before){
   const handle=page.locator('[data-schedule-drag="'+id+'"]');await handle.evaluate(el=>el.scrollIntoView({block:'center'}));
   const start=await handle.boundingBox(),target=await page.locator('[data-schedule-order-item="'+before+'"]:not(.schedule-order-ghost)').boundingBox(),x=start.x+start.width/2,y=start.y+start.height/2,end=Math.max(104,target.y+12);
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let step=1;step<=8;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(end-y)*step/8}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForFunction(()=>!TNTScheduleOrder.busy);
  }
  await moveBefore(pid(52),pid(51));await moveBefore(pid(52),pid(50));
  assert.deepEqual(await order(),[pid(53),pid(52),pid(50),pid(51)]);
  assert.equal(await page.evaluate(()=>__fixtureDB.tnt_schedule_items.find(i=>i.title==='Reflexión').starts_at),'19:35:00');
  await page.evaluate(async()=>{await loadAll();render()});assert.deepEqual(await order(),[pid(53),pid(52),pid(50),pid(51)]);
  const savedOrder=await order();await page.evaluate(()=>__fixtureFailures['rpc:tnt_reorder_schedule']='El cronograma cambió en otro dispositivo.');
  await page.locator('[data-schedule-drag="'+pid(52)+'"]').focus();await page.keyboard.press('ArrowUp');await page.waitForFunction(()=>!TNTScheduleOrder.busy);
  assert.deepEqual(await order(),savedOrder);assert((await page.locator('#tnt-toast').innerText()).includes('otro dispositivo'));await page.evaluate(()=>delete __fixtureFailures['rpc:tnt_reorder_schedule']);
  await page.evaluate(()=>__fixtureFailures['tnt_schedule_items:read']='Lectura interrumpida');await page.locator('[data-schedule-drag="'+pid(52)+'"]').focus();await page.keyboard.press('ArrowUp');await page.waitForFunction(()=>!TNTScheduleOrder.busy);
  assert.deepEqual(await order(),[pid(52),pid(53),pid(50),pid(51)]);await page.evaluate(async()=>{delete __fixtureFailures['tnt_schedule_items:read'];await loadAll();render()});
  await page.locator('[data-order-day]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'program-order-mobile.png'),fullPage:true});
  console.log('Program: chronological display, touch reorder, adjusted times, reload persistence and rollback on conflict.');
  await page.locator('.timeline [data-item-open]').first().click();await page.locator('#editTask').waitFor();
  assert.equal(await page.locator('[data-response],[data-task-status],.live-controls').count(),0);
  await visit('/organizacion/?view=my','.org-nav');await page.evaluate(async()=>{__fixtureDB.tnt_tasks=[];__fixtureDB.tnt_task_assignees=[];__fixtureDB.tnt_schedule_items=[];__fixtureDB.tnt_schedule_responsibles=[];await loadAll();render();});
  assert.equal(await page.locator('.coordination-duty').count(),2);assert(!(await page.locator('#app').innerText()).includes('Todavía no tenés'));
  await page.screenshot({path:path.join(out,'organization-mobile.png'),fullPage:true});
  await page.locator('[data-view=brief]').click();assert.equal(await page.locator('.coordination-duty').count(),2);await page.screenshot({path:path.join(out,'summary-mobile.png'),fullPage:true});
  console.log('Organization: coordinator responsibilities survive an empty activity list; direct assignment details and interactive hero work.');
  await visit('/perfiles/datos/?me=1','#my-profile-view .tnt-profile-complete');await page.screenshot({path:path.join(out,'own-profile-mobile.png'),fullPage:true});
  await page.locator('[data-profile-edit]').click();await page.locator('.tnt-complete-editor').waitFor();
  assert.equal(await page.locator('[name=nickname],[name=bio],[name=skills],[name=avatar_file]').count(),0);assert.equal(await page.locator('.tnt-complete-editor [name=efe_service_role]').count(),1);
  assert((await page.locator('[name=efe_service_role]').innerText()).includes('Soy Timoteo de este EFE'));
  await visit('/perfiles/datos/','[data-view-id]:visible');await page.locator('[data-view-id]:visible').first().click();await page.locator('#detailSheet .tnt-profile-complete').waitFor();await page.screenshot({path:path.join(out,'profile-dialog-mobile.png')});
  const rect=await page.locator('#detailSheet').boundingBox();assert(rect.y>=0&&rect.y+rect.height<=844&&rect.x>=0&&rect.x+rect.width<=390);
  await page.evaluate(()=>TNTUI.toast('Guardado de prueba',true));assert.equal(await page.locator('dialog[open] #tnt-toast').count(),1);await page.screenshot({path:path.join(out,'toast-dialog-mobile.png')});
  await visit('/perfiles/datos/?me=1&fixture-community=1','#my-profile-view .tnt-profile-complete');assert.equal(await page.locator('[data-tnt-admin]').count(),0);assert.equal(await page.locator('.tnt-profile-dock-me').isVisible(),true);assert.equal(await page.evaluate(()=>TNT.hasAccess('perfiles')),false);assert.equal(await page.evaluate(()=>__fixtureCalls.some(c=>c.table==='tnt_profiles_central')),false);
  await visit('/?fixture-onboarding=1','#tnt-membership');await page.locator('[data-next]').click();await page.locator('[data-next]').click();assert.equal(await page.locator('[data-efe-service-role]').isVisible(),true);assert((await page.locator('[name=efe_service_role]').innerText()).includes('Soy líder de este EFE'));
  console.log('Profiles: one complete editor, no presentation form, EFE role choices, accessible own profile and top-layer notices.');
  await visit('/?fixture-incomplete=1','#tnt-membership');assert.equal(await page.locator('.module-card').count(),0);
  await page.locator('[data-next]').click();assert.equal(await page.locator('[name=health]').evaluate(el=>el.required),true);
  await page.locator('[name=health]').fill('No tengo condiciones de salud');await page.locator('[data-next]').click();await page.locator('[name=consent]').check();await page.locator('#tnt-membership [type=submit]').click();
  await page.locator('.module-card').first().waitFor();assert.equal(await page.evaluate(()=>TNT.profileComplete),true);
  console.log('Existing account: missing mandatory answer blocks modules, completing it restores entry.');
  await visit('/admin/','[data-tab=roles]');await page.evaluate(async()=>{
   __profileLinkPreview={fields:TNTProfiles.config(),source:{first_name:'Nora',last_name:'Pérez',phone:'1112345678',dreams:'Servir con el equipo'},target:{first_name:'Nora María',last_name:'Pérez',phone:'2222222222',health:'Sin alergias'},history:{saturdays:12,efe:3},revision:'browser-revision'};
   await TNTProfileLinks.review('browser-link');
  });
  assert.equal(await page.locator('.profile-link-choices [type=radio]').count(),0);assert.equal(await page.locator('.profile-link-summary h3').innerText(),'Nora Pérez');
  await page.screenshot({path:path.join(out,'google-link-mobile.png')});await page.locator('.profile-link-choices details').first().locator('summary').click();
  assert((await page.locator('.profile-link-result').innerText()).includes('1112345678'));assert(!(await page.locator('.profile-link-result').innerText()).includes('2222222222'));
  await page.locator('[name=same_person]').check();await page.locator('.profile-link-choices [type=submit]').click();await page.locator('.profile-link-choices').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>__fixtureCalls.filter(c=>c.rpc==='tnt_resolve_profile_link').length),1);
  console.log('Google linking: one identity confirmation, automatic account priority, visible final values and one save.');
  await visit('/asistencia/?mode=sabados','#attendanceRows');await page.locator('.tnt-attendance-list-fold summary').click();assert.equal(await page.locator('.people-list').isVisible(),false);await page.locator('.tnt-attendance-list-fold summary').click();assert.equal(await page.locator('.people-list').isVisible(),true);await page.screenshot({path:path.join(out,'attendance-mobile.png'),fullPage:true});
  await page.locator('.tnt-attendance-list-fold summary').click();await page.locator('#att-search').fill('Bruno');assert.equal(await page.locator('.people-list').isVisible(),false);await page.locator('.tnt-attendance-list-fold summary').click();assert.equal(await page.locator('.person-row').count(),1);
  console.log('Attendance verified, checking resources.');await visit('/organizacion/?view=files','[data-add-resource]');await page.locator('[data-add-resource]').click();await page.locator('[name=title]').fill('Unipase');await page.locator('[name=url]').fill('www.cchurlingham.com');await page.locator('.tnt-overlay form [type=submit]').click();await page.waitForFunction(()=>__fixtureDB.tnt_library_items.length===1);assert.equal(await page.evaluate(()=>__fixtureDB.tnt_library_items[0].url),'https://www.cchurlingham.com/');await page.locator('.tnt-overlay').waitFor({state:'detached'});
  console.log('Resources verified, checking permissions.');await visit('/admin/','[data-tab=roles]');await page.locator('[data-tab=roles]').click();const camp=page.locator('.permission-module').filter({has:page.locator('summary h3',{hasText:/^Campamento$/})});assert.equal(await camp.count(),1);assert.equal(await camp.locator('[data-module=campamento-salud]').count(),2);assert.equal(await page.locator('.permission-module summary h3',{hasText:'Salud de Campamento'}).count(),0);
  await visit('/organizacion/?view=templates','[data-action=new-template]');await page.locator('[data-action=new-template]').click();await page.locator('[data-template-preset=service]').click();await page.screenshot({path:path.join(out,'template-mobile.png')});
  await page.locator('.tnt-template-builder [name=name]').fill('Programa de prueba');await page.locator('.tnt-template-block summary').first().click();assert.equal(await page.locator('.tnt-template-block').first().evaluate(el=>el.open),false);await page.locator('[data-template-move="0"][data-direction="1"]').click();assert.equal(await page.locator('.tnt-template-block summary b').first().innerText(),'Palabra');
  await page.evaluate(()=>__fixtureFailures['rpc:tnt_save_org_template']='Guardado interrumpido');await page.locator('.tnt-template-builder [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.tnt-template-builder [role=status]')?.textContent==='Guardado interrumpido');assert.equal(await page.locator('.tnt-template-builder [name=name]').inputValue(),'Programa de prueba');assert.equal(await page.evaluate(()=>__fixtureDB.tnt_template_items.length),0);
  await page.evaluate(()=>delete __fixtureFailures['rpc:tnt_save_org_template']);await page.locator('.tnt-template-builder [type=submit]').click();await page.waitForFunction(()=>__fixtureDB.tnt_template_items.length===3);await page.locator('.tnt-template-dialog').waitFor({state:'detached'});
  console.log('Attendance folds preserve state; URLs normalize; camp/health is one permission group; visual template reorder and retry save correctly.');
  await page.setViewportSize({width:1440,height:960});await visit('/','.module-card');await page.screenshot({path:path.join(out,'home-desktop.png'),fullPage:true});
  await page.locator('button[data-tnt-theme]').click();await page.screenshot({path:path.join(out,'home-dark-desktop.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:390,height:844});await visit('/perfiles/datos/?me=1','#my-profile-view .tnt-profile-complete');await page.evaluate(()=>TNT.setTheme('dark'));await page.screenshot({path:path.join(out,'own-profile-dark-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('.tnt-profile-cover h2').evaluate(el=>getComputedStyle(el).color),'rgb(23, 23, 23)');assert.equal(await page.locator('.tnt-profile-story p').first().evaluate(el=>getComputedStyle(el).color),'rgb(23, 23, 23)');
  console.log('Page errors',errors);assert.deepEqual(errors,[]);
 }catch(error){console.error('Browser flow failed:',error.message);throw error;}finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
