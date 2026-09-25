const SUPABASE_URL='https://oeodnnomgiddkblnlzay.supabase.co';
const SUPABASE_KEY='sb_publishable_X06jWDKqV6jgKbaa1PrrbQ_zto1XeTJ';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

const ROLE_OPTIONS=['Pastor/a','Colaborador','Líder','Timoteo'];
const MODULES=['organizacion','campamento','efe','lista-sabados','glosario','buffet'];
const SERVICE_AREAS=['Bienvenida','Dinámica','Ofrenda','Ministración','Palabra','Multimedia','Fotografía','Video','Diseño','Recepción','Intercesión','Sonido','Limpieza','Merch','Decoración','Buffet','Organización'];
const NAV=[
  ['my','⌂','Mi TNT'],['schedule','◷','Cronograma'],['saturdays','🗓','Sábados'],['events','◇','Eventos'],
  ['tasks','✓','Mis tareas'],['team','◉','Equipo'],['templates','▦','Plantillas']
];
const STATUS_LABEL={unread:'Todavía no leído',preparing:'En preparación',progress:'Avanzando',review:'Necesita revisión',ready:'Listo',completed:'Terminado',replacement:'Necesita reemplazo'};
const ASSIGN_LABEL={assigned:'Pendiente',read:'Leído',accepted:'Aceptado',declined:'No puedo'};
const RUN_LABEL={pending:'Pendiente',live:'En curso',done:'Terminada'};

const S={session:null,account:null,person:null,view:'my',cronTab:'schedule',selectedEvent:null,selectedDay:null,satMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1),
  people:[],accounts:[],events:[],eventMembers:[],tasks:[],assignees:[],templates:[],templateItems:[],days:[],items:[],responsibles:[],groups:[],groupMembers:[],groupConfigs:[],notifications:[],availability:[],workload:[],moduleAccess:[]};

const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36);
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=d=>d?new Intl.DateTimeFormat('es-AR',{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00')):'';
const fmtShort=d=>d?new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'short'}).format(new Date(d+'T12:00:00')):'';
const fmtTime=t=>t?String(t).slice(0,5):'—';
const age=(birthday,at=new Date())=>{if(!birthday)return null;let b=new Date(birthday+'T12:00:00'),n=at.getFullYear()-b.getFullYear();let m=at.getMonth()-b.getMonth();if(m<0||(m===0&&at.getDate()<b.getDate()))n--;return n};
const toast=(m)=>{let t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2600)};
const errMsg=e=>e?.message||String(e||'Error');
const pBy=id=>S.people.find(p=>p.id===id); const aByPid=id=>S.accounts.find(a=>a.person_id===id);
const displayName=id=>{let p=pBy(id),a=aByPid(id);return a?.nickname||p?.full_name||'Persona'};
const avatarHtml=id=>{let p=pBy(id),a=aByPid(id),name=displayName(id),url=a?.avatar_url;return `<div class="avatar">${url?`<img src="${esc(url)}" alt="">`:esc(name.slice(0,2).toUpperCase())}</div>`};
const currentPersonId=()=>S.person?.id||null;
const isAdmin=()=>S.account?.system_role==='admin'; const isPastor=()=>S.account?.ministry_role==='Pastor/a';
const canManageEvent=id=>isAdmin()||isPastor()||S.eventMembers.some(m=>m.event_id===id&&m.person_id===currentPersonId()&&m.event_role==='organizer');
const canManageTemplates=()=>isAdmin()||isPastor();
const eventBy=id=>S.events.find(e=>e.id===id); const dayBy=id=>S.days.find(d=>d.id===id); const taskBy=id=>S.tasks.find(t=>t.id===id);
const eventMembers=id=>S.eventMembers.filter(m=>m.event_id===id);
const eventTasks=id=>S.tasks.filter(t=>t.event_id===id&&!t.parent_task_id).sort((a,b)=>a.sort_order-b.sort_order);
const childrenOf=id=>S.tasks.filter(t=>t.parent_task_id===id).sort((a,b)=>a.sort_order-b.sort_order);
const eventDays=id=>S.days.filter(d=>d.event_id===id).sort((a,b)=>a.sort_order-b.sort_order);
const dayItems=id=>S.items.filter(i=>i.day_id===id).sort((a,b)=>a.sort_order-b.sort_order);
const itemPeople=id=>S.responsibles.filter(r=>r.item_id===id).map(r=>r.person_id);
const taskPeople=id=>S.assignees.filter(a=>a.task_id===id).map(a=>a.person_id);
const myAssignment=t=>S.assignees.find(a=>a.task_id===t.id&&a.person_id===currentPersonId());
const statusChip=(s)=>`<span class="status ${esc(s)}">${esc(STATUS_LABEL[s]||s)}</span>`;
const assignChip=(s)=>`<span class="status ${esc(s)}">${esc(ASSIGN_LABEL[s]||s)}</span>`;
const runChip=(s)=>`<span class="chip run ${esc(s)}">${esc(RUN_LABEL[s]||s)}</span>`;

function loading(){document.getElementById('app').innerHTML='<div class="skeleton"><div><div class="spinner"></div>Cargando TNT Organización…</div></div>'}
function modal(html,wide=false){document.getElementById('modal').innerHTML=`<div class="modal" data-overlay><section class="sheet ${wide?'wide':''}">${html}</section></div>`;$$('[data-close]').forEach(x=>x.onclick=closeModal);$('[data-overlay]')?.addEventListener('click',e=>{if(e.target.dataset.overlay!==undefined)closeModal()})}
function closeModal(){document.getElementById('modal').innerHTML=''}
function sheetHead(title,sub=''){return `<div class="sheetHead"><div><h2>${esc(title)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div><button class="close" data-close>×</button></div>`}
function empty(title,text,button='',action=''){return `<div class="empty"><b>${esc(title)}</b>${text?`<div>${esc(text)}</div>`:''}${button?`<div style="margin-top:14px"><button class="btn primary" data-action="${esc(action)}">${esc(button)}</button></div>`:''}</div>`}

async function signInGoogle(){
  const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/'}}); if(error)toast('Google todavía no está habilitado en Supabase. Podés entrar por email mientras tanto.');
}
async function magicLink(){let email=$('#loginEmail')?.value.trim();if(!email)return toast('Escribí tu email');let {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+'/'}});toast(error?errMsg(error):'Te enviamos un enlace de ingreso')}
function renderLogin(){document.getElementById('app').innerHTML=`<main class="login"><section class="loginCard"><div class="loginLogo">T</div><h1>TNT Organización</h1><p>Equipos, eventos, responsabilidades y ejecución del ministerio en un solo lugar.</p><button class="google" id="googleLogin">Continuar con Google</button><div class="divider">o por email</div><input id="loginEmail" type="email" placeholder="tu@email.com"><button class="btn" id="magicLogin">Enviar enlace de acceso</button><p class="tiny" style="margin-top:16px">El Admin inicial se asigna de forma segura por email. Después puede otorgar Admin a otras personas desde la aplicación.</p></section></main>`;$('#googleLogin').onclick=signInGoogle;$('#magicLogin').onclick=magicLink}

async function boot(){loading();let {data:{session}}=await sb.auth.getSession();S.session=session;if(!session){renderLogin();return}await initAuthed()}
sb.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){S.session=null;S.account=null;S.person=null;renderLogin()}else if(session&&!S.session){S.session=session;setTimeout(initAuthed,0)}});

async function initAuthed(){loading();try{
  const ensured=await sb.rpc('tnt_ensure_account');
  if(ensured.error)throw ensured.error;
  for(let n=0;n<5;n++){
    let {data,error}=await sb.from('tnt_accounts').select('*').eq('auth_user_id',S.session.user.id).maybeSingle();if(error)throw error;if(data){S.account=data;break}await new Promise(r=>setTimeout(r,350));
  }
  if(!S.account)throw new Error('No se pudo crear o vincular tu perfil TNT.');
  let {data:p,error:pe}=await sb.from('tnt_people').select('*').eq('id',S.account.person_id).single();if(pe)throw pe;S.person=p;
  await Promise.allSettled([sb.rpc('tnt_touch_last_seen'),sb.rpc('tnt_generate_personal_reminders')]);
  await loadAll();readDeepLink();render();
}catch(e){document.getElementById('app').innerHTML=`<div class="login"><div class="loginCard"><h1>No pudimos entrar</h1><p>${esc(errMsg(e))}</p><button class="btn" id="retry">Reintentar</button><button class="btn danger" id="logout">Cerrar sesión</button></div></div>`;$('#retry').onclick=initAuthed;$('#logout').onclick=()=>sb.auth.signOut()}}

async function loadAll(){
  const q=[
    ['people',sb.from('tnt_people').select('*').order('full_name')],['accounts',sb.from('tnt_accounts').select('*')],['events',sb.from('tnt_events').select('*').order('start_date')],
    ['eventMembers',sb.from('tnt_event_members').select('*')],['tasks',sb.from('tnt_tasks').select('*').order('sort_order')],['assignees',sb.from('tnt_task_assignees').select('*')],
    ['templates',sb.from('tnt_templates').select('*').order('name')],['templateItems',sb.from('tnt_template_items').select('*').order('sort_order')],
    ['days',sb.from('tnt_schedule_days').select('*').order('sort_order')],['items',sb.from('tnt_schedule_items').select('*').order('sort_order')],['responsibles',sb.from('tnt_schedule_responsibles').select('*')],
    ['groups',sb.from('tnt_groups').select('*').order('sort_order')],['groupMembers',sb.from('tnt_group_members').select('*')],['groupConfigs',sb.from('tnt_group_configs').select('*')],
    ['notifications',sb.from('tnt_notifications').select('*').order('created_at',{ascending:false}).limit(200)],['availability',sb.from('tnt_availability').select('*')],
    ['workload',sb.from('tnt_monthly_workload').select('*')],['moduleAccess',sb.from('tnt_module_access').select('*')]
  ];
  const res=await Promise.all(q.map(x=>x[1]));res.forEach((r,i)=>{if(r.error)console.warn(q[i][0],r.error);else S[q[i][0]]=r.data||[]});
  S.account=S.accounts.find(a=>a.person_id===S.account.person_id)||S.account;S.person=S.people.find(p=>p.id===S.account.person_id)||S.person;
  if(!S.selectedEvent){let future=S.events.find(e=>e.end_date>=today());S.selectedEvent=(future||S.events[0])?.id||null}if(S.selectedEvent&&!S.selectedDay)S.selectedDay=eventDays(S.selectedEvent)[0]?.id||null;
}
function readDeepLink(){let p=new URLSearchParams(location.search);if(p.get('task')){S.view='tasks';setTimeout(()=>taskDetailModal(p.get('task')),100)}if(p.get('event')){S.view='events';S.selectedEvent=p.get('event')}}

function navButtons(mobile=false){let arr=[...NAV];if(isAdmin())arr.push(['admin','⚙','Admin']);return arr.map(([id,ico,label])=>`<button class="navBtn ${S.view===id?'on':''} ${id==='admin'?'admin':''}" data-view="${id}"><span class="ni">${ico}</span><span>${label}</span></button>`).join('')}
function shell(content,title,sub=''){let unread=S.notifications.filter(n=>!n.read_at&&(n.person_id===currentPersonId()||n.person_id===null)).length;return `<div class="appShell"><aside class="sidebar"><div class="brand"><div class="brandMark">T</div><div><b>TNT Organización</b><small>Trastornadores</small></div></div><div class="navList">${navButtons()}</div><div class="sideFoot"><button class="userMini" data-action="profile">${avatarHtml(currentPersonId())}<div><b>${esc(S.account.nickname||S.person.full_name)}</b><small>${esc(S.account.system_role==='admin'?'Admin · '+S.account.ministry_role:S.account.ministry_role)}</small></div></button><button class="signout" data-action="signout">Cerrar sesión</button></div></aside><main class="main"><header class="topbar"><div class="topTitle"><b>${esc(title)}</b><small>${esc(sub)}</small></div><div class="sp"></div><button class="iconBtn" data-action="notifications">🔔${unread?`<span class="badgeDot">${unread>9?'9+':unread}</span>`:''}</button><button class="pillBtn" data-action="profile">${esc(S.account.nickname||S.person.full_name)}</button></header>${content}</main><nav class="mobileNav">${navButtons(true)}</nav></div>`}
function render(){let out,title,sub;switch(S.view){case'my':[out,title,sub]=[viewMy(),'Mi TNT','Tu panel personal'];break;case'schedule':[out,title,sub]=[viewSchedule(),'Cronograma','Horarios, responsables y grupos'];break;case'saturdays':[out,title,sub]=[viewSaturdays(),'Sábados','Reuniones normales de TNT'];break;case'events':[out,title,sub]=[viewEvents(),'Eventos','Congresos, campamentos y actividades especiales'];break;case'tasks':[out,title,sub]=[viewMyTasks(),'Mis tareas','Asignaciones y seguimiento'];break;case'team':[out,title,sub]=[viewTeam(),'Equipo','Perfiles, disponibilidad y carga'];break;case'templates':[out,title,sub]=[viewTemplates(),'Plantillas','Estructuras reutilizables'];break;case'admin':[out,title,sub]=[viewAdmin(),'Administración','Usuarios, roles y accesos'];break;default:S.view='my';return render()}document.getElementById('app').innerHTML=shell(out,title,sub);bindGlobal()}
function bindGlobal(){
  $$('[data-view]').forEach(b=>b.onclick=()=>{S.view=b.dataset.view;render()});
  $$('[data-action]').forEach(b=>b.onclick=()=>handleAction(b.dataset.action,b));
  $$('[data-event-open]').forEach(b=>b.onclick=()=>eventDetailModal(b.dataset.eventOpen));
  $$('[data-task-open]').forEach(b=>b.onclick=()=>taskDetailModal(b.dataset.taskOpen));
  $$('[data-person-open]').forEach(b=>b.onclick=()=>personResponsibilitiesModal(b.dataset.personOpen));
}
async function handleAction(a,b){
  if(a==='signout')return sb.auth.signOut();if(a==='profile')return profileModal(currentPersonId());if(a==='notifications')return notificationsModal();
  if(a==='new-saturday')return saturdayCreateModal();if(a==='new-event')return eventCreateModal();if(a==='new-person')return profileModal(null,true);
  if(a==='new-template')return templateModal();if(a==='general-notification')return generalNotificationModal();
  if(a==='group-config')return groupConfigModal(S.selectedDay);if(a==='event-members')return eventMembersModal(S.selectedEvent);
}
