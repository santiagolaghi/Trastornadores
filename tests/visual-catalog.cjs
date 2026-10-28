/* Representative UI inventory. Stable IDs must never be reassigned or renumbered.
   Uses the compiled app and the isolated fixtures in community-browser.cjs. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const roles={1:'Administración',2:'Líder',3:'Comunidad'};
const screens=[];
const add=(id,module,title,url,options={})=>screens.push({id,module,title,url,actor:1,...options});
for(const [actor,suffix] of [[1,'01'],[2,'02'],[3,'03']])add('INI-'+suffix,'Inicio','Inicio · '+roles[actor],'/',{actor,ready:'.community-count'});
add('INI-04','Inicio','Tus accesos y espacios abiertos','/',{eval:'TNTNavigation.spaces()',ready:'dialog[open]'});
add('INI-05','Inicio','Personalizar la barra','/',{eval:'TNTNavigation.settings()',ready:'dialog form'});
add('INI-06','Inicio','Mis avisos','/',{eval:'TNTNotifications.open()',ready:'dialog[open]'});
add('INI-07','Inicio','Menú de cuenta','/',{eval:'TNTAccounts.openMenu()',ready:'#tnt-account-menu'});
add('INI-08','Inicio','Tutorial de uso','/',{eval:'TNTExperience.startTutorial()',ready:'#tnt-tutorial'});
for(const actor of [1,2,3])add('PER-0'+actor,'Perfil','Perfil · '+roles[actor],'/perfil',{actor,ready:'.life-profile'});
add('PER-04','Perfil','Cambiar foto','/perfil?view=photo',{ready:'#life-photo-form'});
add('PER-05','Perfil','Mis preferencias','/perfil?view=preferences',{ready:'[data-community-prefs]'});
add('PER-06','Perfil','Apariencia y paletas','/perfil',{click:'[data-appearance]',ready:'.appearance-form'});
add('PER-07','Perfil','Editar mis datos','/perfil',{click:'[data-edit-profile]',ready:'dialog[open]'});
add('PER-08','Perfil','Ya tenía un perfil','/perfil',{click:'[data-continue-profile]',ready:'dialog[open]'});
add('PER-09','Perfil','Avisos en el teléfono','/perfil',{click:'[data-phone]',ready:'dialog[open]'});
add('PER-10','Perfil','Mis cuentas','/perfil?view=preferences',{click:'[data-accounts]',ready:'dialog[open]'});
for(const actor of [1,3])add('COM-0'+(actor===1?'1':'2'),'Comunidad','Comunidad · '+roles[actor],'/comunidad',{actor,ready:'.c-groups'});
const modules={welcome:'Bienvenida y acompañamiento',birthdays:'Cumpleaños',bible:'Biblia y planes',challenges:'Desafíos',questions:'Preguntas de fe',families:'Familias',baptisms:'Bautismos',polls:'Encuestas',games:'Dinámicas y juegos'};
let n=3;
for(const [key,title] of Object.entries(modules)){
 add('COM-'+String(n++).padStart(2,'0'),'Comunidad',title+' · Comunidad','/comunidad?module='+key,{actor:3,ready:'.life-page'});
 add('COM-'+String(n++).padStart(2,'0'),'Comunidad','Administrar '+title,'/comunidad?module='+key+'&manage=1',{ready:'.c-admin-heading'});
}
for(const [key,title] of Object.entries(modules).filter(([k])=>k!=='questions'))add('COM-'+String(n++).padStart(2,'0'),'Comunidad','Crear contenido · '+title,'/comunidad?module='+key+'&manage=1',{click:'[data-create]',ready:'dialog form'});
add('COM-40','Comunidad','Asignar referente directamente','/comunidad?module=welcome&manage=1',{click:'[data-assign]',ready:'dialog form'});
add('COM-41','Comunidad','Permisos del equipo','/comunidad?module=welcome&manage=1',{click:'[data-grants]',ready:'dialog form'});
add('COM-42','Comunidad','Hacer una pregunta','/comunidad?module=questions',{actor:3,click:'[data-c-ask]',ready:'dialog form'});
add('COM-43','Comunidad','Vincular una familia','/comunidad?module=families',{actor:3,click:'[data-c-family-request]',ready:'dialog form'});
add('COM-44','Comunidad','Programar contenido diario','/comunidad?module=daily&manage=1',{click:'[data-day]',ready:'dialog form'});
add('COM-45','Comunidad','Agregar una frase','/comunidad?module=daily&manage=1',{click:'[data-phrase]',ready:'dialog form'});
for(const [i,view,title] of [[1,'my','Mi organización'],[2,'saturdays','Encuentros'],[3,'calendar','Calendario'],[4,'schedule','Cronograma'],[5,'team','Equipo'],[6,'templates','Plantillas'],[7,'files','Archivos'],[8,'brief','Mis actividades'],[9,'admin','Administración de Organización']])add('ORG-'+String(i).padStart(3,'0'),'Organización',title,'/organizacion?view='+view,{ready:'.org-shell'});
const orgModals=[['Preparar sábado','saturdayCreateModal()'],['Crear evento','eventCreateModal()'],['Detalle del encuentro','eventDetailModal(S.events[0].id)'],['Personas del sábado','eventMembersModal(S.events[0].id)'],['Nueva actividad','taskEditModal(null,S.events[0].id)'],['Detalle de actividad','taskDetailModal(S.tasks[0].id)'],['Destacar actividad','activityColorModal(S.tasks[0])'],['Invitar al equipo','inviteStaffModal()'],['Disponibilidad','availabilityModal(S.people[0].id)'],['Notificación general','generalNotificationModal()'],['Editar persona del equipo','adminUserModal(S.people[1].id)'],['Crear plantilla','templateModal()'],['Opciones del sábado','scheduleOptions(S.events[0].id)'],['Cronograma rápido','quickScheduleModal(S.events[0].id)'],['Sugerencias de actividades','taskSuggestionModal(S.events[0].id)'],['Elegir una actividad','activityChooserModal(S.events[0].id)'],['Duplicar encuentro','duplicateEvent(S.events[0].id)'],['Nota privada de actividad','addPrivateNoteModal(S.tasks[0].id)'],['Agregar punto de checklist','addChecklistModal(S.tasks[0].id,0)'],['Agregar referencia a actividad','addLinkModal(S.tasks[0].id,0)']];
orgModals.forEach(([title,code],i)=>add('ORG-'+String(i+10).padStart(3,'0'),'Organización',title,'/organizacion?view=schedule',{eval:code,ready:'dialog[open]'}));
add('ASI-01','Asistencia','Pasar lista del sábado','/asistencia?mode=sabados&when=next',{ready:'#attendance-app'});
add('ASI-02','Asistencia','Pasar lista de mi EFE','/asistencia?mode=efe&group=varones&when=latest',{ready:'#attendance-app'});
add('ASI-03','Asistencia','Presentación de asistencia','/asistencia',{ready:'#attendance-app'});
add('BIB-01','Biblia','Lectura amplia del capítulo','/biblia?ref=JHN.16&v=1909',{ready:'[data-reader-verse]'});
add('BIB-02','Biblia','Versículos seleccionados','/biblia?ref=JHN.16&v=1909',{click:'[data-reader-verse="2"]',ready:'.reader-mark-bar:not([hidden])'});
add('BIB-03','Biblia','Herramientas del versículo','/biblia?ref=JHN.16&v=1909',{click:'[data-reader-verse="2"]',thenClick:'[data-mark-expand]',ready:'.reader-selection-more:not([hidden])'});
add('BIB-04','Biblia','Elegir capítulo','/biblia?ref=JHN.16&v=1909',{click:'[data-chapter-picker]',ready:'dialog[open]'});
add('BIB-05','Biblia','Preferencias de lectura','/biblia?ref=JHN.16&v=1909',{click:'[data-config-toggle]',ready:'.reader-config[open]'});
add('BIB-06','Biblia','Traducción sin habilitar','/biblia?ref=JHN.16&v=127',{ready:'.reader-unavailable'});
add('JUE-01','Juegos','Elegir un juego','/juegos',{ready:'[data-game]'});
for(const [i,key,title] of [[2,'order','Orden de libros'],[3,'pairs','Unir parejas'],[4,'characters','Personajes'],[5,'timeline','Ordenar acontecimientos'],[6,'testament','Antiguo y Nuevo Testamento']])add('JUE-0'+i,'Juegos',title+' · preparación','/juegos',{click:'[data-game="'+key+'"]',ready:'[data-game-setup]'});
add('CHA-01','Chat','Conversaciones','/chat',{ready:'#chat-app'});
add('CHA-02','Chat','Chat general de TNT','/chat?thread=general',{ready:'#chat-room-head'});
for(const [i,tab,title] of [[1,'users','Usuarios'],[2,'requests','Solicitudes'],[3,'trash','Papelera'],[4,'roles','Permisos por rol'],[5,'settings','Configuración'],[6,'audit','Auditoría']])add('ADM-0'+i,'Administración',title,'/admin?tab='+tab,{ready:'#tabs'});
add('CAM-01','Campamento','Campamento','/campamento',{ready:'#camp-app'});
add('CAM-02','Campamento','Inscripción pública','/campamento/inscripcion',{ready:'body',public:true});
for(const [i,tab,title] of [[3,'dashboard','Resumen'],[4,'registrations','Inscripciones'],[5,'payments','Pagos'],[6,'logistics','Logística'],[7,'more','Más opciones'],[8,'rooms','Habitaciones'],[9,'buses','Micros'],[10,'teams','Equipos'],[11,'checkin','Ingreso al predio'],[12,'settings','Configuración'],[13,'sponsors','Padrinos'],[14,'trash','Papelera']])add('CAM-'+String(i).padStart(2,'0'),'Campamento',title+' · edición de ejemplo','/campamento',{eval:`CampApp.S.editions=[{id:'camp-demo',name:'Campamento de ejemplo',public_slug:'ejemplo',status:'open',capacity:100,start_date:'2026-11-20',end_date:'2026-11-23',base_price:0,currency:'ARS'}];CampApp.S.camp='camp-demo';CampApp.go('${tab}',false)`,ready:'#camp-view'});
add('BUF-01','Buffet','Caja y pedidos','/buffet',{ready:'#app'});
add('GLO-01','Glosario','Prédicas y glosario','/glosario',{ready:'#app'});
add('DAT-01','Perfiles','Datos de la comunidad','/perfiles/datos',{ready:'body'});
add('DAT-02','Perfiles','Formulario público de perfil','/perfiles',{ready:'#profileForm',public:true});
for(const [id,module,title] of [['EXT-01','Sistema','Ingreso y selección de cuenta de Google'],['EXT-02','Sistema','Permiso nativo de notificaciones'],['EXT-03','Sistema','Instalación desde Android o iPhone']])add(id,module,title,'/',{pending:'Ventana del sistema operativo o del proveedor. Requiere captura del dispositivo y no se simula como pantalla verificada.'});
module.exports=async({page,actorPage,visit,base,browser,context,pg,pid,serial})=>{
 const dir=process.env.TNT_CATALOG_OUTPUT||path.resolve(__dirname,'../../tnt-tools/catalogo');fs.mkdirSync(dir,{recursive:true});const imgDir=path.join(dir,'capturas');fs.mkdirSync(imgDir,{recursive:true});
 const previous=fs.existsSync(path.join(dir,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')).screens:[],selected=process.env.TNT_CATALOG_IDS?new Set(process.env.TNT_CATALOG_IDS.split(',')):null;
 const results=[],people=new Map([[1,{p:page,visit:async url=>visit(url,'body')}]]);
 for(const actor of [2,3])people.set(actor,await actorPage(actor));
 for(const a of people.values()){a.p.setDefaultTimeout(3500);await a.p.context().route('https://**/*',r=>r.abort('blockedbyclient'));}
 const variants=[{key:'movil-claro',name:'Móvil · claro',width:390,height:844,theme:'light'},{key:'movil-oscuro',name:'Móvil · oscuro',width:390,height:844,theme:'dark'},{key:'escritorio-claro',name:'Escritorio · claro',width:1366,height:900,theme:'light'}];
 let last='';
 for(const s of screens){if(selected&&!selected.has(s.id)){results.push(previous.find(p=>p.id===s.id)||{...s,role:s.pending?'Todos':roles[s.actor],images:[],status:'pendiente',reason:'Todavía sin captura.'});continue;}const result={...s,role:s.pending?'Todos':roles[s.actor],images:[],status:'pendiente'};delete result.eval;delete result.click;delete result.thenClick;
  if(s.pending){result.reason=s.pending;results.push(result);continue;}
  const a=people.get(s.actor),p=a.p;try{
   await p.setViewportSize({width:390,height:844});
   const target=s.actor+':'+s.url;
   if(target!==last||s.url.startsWith('/juegos')||s.url.startsWith('/biblia')){await a.visit(s.url);last=target;await p.waitForFunction(()=>!document.querySelector('.c-loading,.tnt-startup'),null,{timeout:5000}).catch(()=>{});}
   else await p.evaluate(()=>{TNTUI.clearOverlays();document.querySelector('#tnt-account-menu')?.remove();if(typeof clearOrgModal==='function')clearOrgModal();});
   if(s.url.startsWith('/organizacion'))await p.waitForSelector('.org-shell');
   if(s.eval)await p.evaluate(code=>(0,eval)(code),s.eval);
   if(s.click)await p.locator(s.click).first().click();
   if(s.thenClick)await p.locator(s.thenClick).first().click();
   if(s.ready)await p.locator(s.ready).first().waitFor({state:'visible'});
   await p.evaluate(async()=>{await document.fonts.ready;document.querySelectorAll('.tnt-toast,.toast.show,.c-refresh').forEach(n=>n.style.visibility='hidden');window.scrollTo(0,0);});
   for(const v of variants){await p.setViewportSize({width:v.width,height:v.height});await p.evaluate(t=>window.TNT?.setTheme?.(t),v.theme);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const name=s.id+'-'+v.key+'.jpg';await p.screenshot({path:path.join(imgDir,name),type:'jpeg',quality:74,animations:'disabled',fullPage:false});result.images.push({...v,file:'capturas/'+name});}
   result.status='capturada';result.actual=await p.locator('h1,h2,dialog[open]').first().innerText().catch(()=>s.title);console.log('CATALOGO',s.id,s.title);
  }catch(e){result.reason=String(e.message).split('\n')[0];console.log('PENDIENTE',s.id,result.reason);last='';}
  results.push(result);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),source:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),screens:results},null,2));
 }
 for(const [actor,a] of people)if(actor!==1)await a.ctx.close();
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),source:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),screens:results},null,2));
 require('../scripts/render-visual-catalog.cjs')(dir);
 console.log('CATALOGO TERMINADO',JSON.stringify({registered:results.length,captured:results.filter(s=>s.status==='capturada').length,output:dir}));
};
module.exports.screens=screens;
