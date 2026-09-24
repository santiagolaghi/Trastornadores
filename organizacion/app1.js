const KEY='tnt-org-v5';
const ROLES=['Pastor/a','Colaborador/a','Líder','Timoteo'];
const BASE=[['👋','Bienvenida'],['⚡','Dinámica'],['🤲','Ofrenda'],['🙏','Ministración'],['📖','Palabra / Prédica']];
let view='home',month=new Date(new Date().getFullYear(),new Date().getMonth(),1),satKey='',eventId='',taskId='';
const gid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const fresh=()=>({people:[],active:'',template:BASE.map(([icon,name])=>({id:gid(),icon,name})),saturdays:{},events:[],notes:[]});
let db;try{db=JSON.parse(localStorage.getItem(KEY))||fresh()}catch{db=fresh()}
function migrateTask(t,context){if(!t.type)t.type=context==='event'?'complex':'simple';if(!t.phase)t.phase=['completed'].includes(t.status)?'completed':['planning','progress','review'].includes(t.status)?'planning':'pending';if(!Array.isArray(t.links))t.links=typeof t.links==='string'?t.links.split(/\n+/).filter(Boolean):[];if(!Array.isArray(t.checklist))t.checklist=[];t.checklist=t.checklist.map(x=>typeof x==='string'?{id:gid(),text:x,done:false}:x);if(!Array.isArray(t.assignees))t.assignees=[];t.assignees=t.assignees.map(a=>({uid:a.uid||a,status:a.status,confirmedAt:a.confirmedAt||((a.status==='confirmed')?new Date().toISOString():null)}));return t}
Object.values(db.saturdays||{}).forEach(s=>(s.activities||[]).forEach(t=>migrateTask(t,'sat')));(db.events||[]).forEach(e=>(e.tasks||[]).forEach(t=>migrateTask(t,'event')));save();
function save(){try{localStorage.setItem(KEY,JSON.stringify(db))}catch{}}
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usr=()=>db.people.find(p=>p.id===db.active)||null;
const pastor=()=>usr()&&usr().role==='Pastor/a';
const fmt=d=>new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long'}).format(new Date(d+'T12:00:00'));
const mon=d=>new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(d);
const sats=d=>{let a=[],x=new Date(d.getFullYear(),d.getMonth(),1);while(x.getMonth()===d.getMonth()){if(x.getDay()===6)a.push(`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`);x.setDate(x.getDate()+1)}return a};
const sat=d=>db.saturdays[d];
const ensure=d=>db.saturdays[d]||(db.saturdays[d]={date:d,organizers:[],activities:db.template.map(t=>migrateTask({id:gid(),name:t.name,icon:t.icon,type:'simple',phase:'pending',description:'',links:[],checklist:[],assignees:[]},'sat'))});
const names=ids=>(ids||[]).map(i=>{let p=db.people.find(x=>x.id===i);return p&&(p.nickname||p.name)}).filter(Boolean);
const can=(type,key)=>pastor()||(usr()&&(type==='sat'?(sat(key)?.organizers||[]):(db.events.find(e=>e.id===key)?.organizers||[])).includes(usr().id));
function notify(uid,title,msg){db.notes.unshift({id:gid(),uid,title,msg,read:false,at:new Date().toISOString()});save()}
function confirmations(t){const total=(t.assignees||[]).length,ok=(t.assignees||[]).filter(a=>a.confirmedAt).length;return{total,ok,all:total>0&&ok===total}}
function taskState(t){const c=confirmations(t);if(t.phase==='completed')return['completed','Terminado'];if(t.type==='complex'&&t.phase==='planning')return['planning','En planificación'];if(c.all)return['confirmed','Confirmado'];return['pending','Pendiente']}
function status(t){const s=taskState(t);return `<span class="status ${s[0]}">${s[1]}</span>`}
function typeLabel(t){return `<span class="typechip">${t.type==='complex'?'Compleja':'Simple'}</span>`}
function header(){let u=usr(),un=u?db.notes.filter(n=>n.uid===u.id&&!n.read).length:0;return `<header class="top"><div class="logo">T</div><div class="brand"><b>Organización</b><small>TNT</small></div><div class="sp"></div><button class="iconbtn" data-a="notes">🔔${un?'<i class="notifdot"></i>':''}</button><button class="pill" data-a="user">${u?esc(u.nickname||u.name):'Perfil'}</button></header>`}
function nav(){return `<nav class="bottom">${[['home','⌂','Inicio'],['saturdays','◷','Sábados'],['events','◇','Eventos'],['team','◉','Equipo']].map(x=>`<button class="nav ${view===x[0]?'on':''}" data-v="${x[0]}"><b>${x[1]}</b>${x[2]}</button>`).join('')}</nav>`}
function back(to,label){return `<div class="crumb"><button class="back" data-back="${to}">← ${label}</button></div>`}
function empty(t,p,b='',a=''){return `<div class="empty"><b>${t}</b><p>${p}</p>${b?`<button class="btn primary" data-a="${a}">${b}</button>`:''}</div>`}