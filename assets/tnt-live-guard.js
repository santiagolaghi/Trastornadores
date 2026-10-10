/* Scoped realtime guard for TNT. Keeps collaborative updates live without making every screen react to every table in the app. */
(() => {
  'use strict';
  const E=window.TNTExperience;
  if(!E)return;
  const getT=()=>window.TNT;
  const canonical=id=>['efe','lista-sabados'].includes(id)?'asistencia':(id||'home');
  const page=()=>{const T=getT();return canonical(T?.module||document.body.dataset.tntSurface||'home');};
  const COMMON=['tnt_experience','tnt_settings','tnt_notifications','tnt_notification_state','tnt_people','tnt_accounts','tnt_access_grants','tnt_role_permission_presets','tnt_person_permission_overrides','tnt_profile_answers'];
  const PAGE_TABLES={
    home:['tnt_events','tnt_event_members','tnt_tasks','tnt_task_assignees','tnt_library_items','tnt_efe_groups','tnt_efe_memberships'],
    organizacion:['tnt_events','tnt_event_members','tnt_tasks','tnt_task_assignees','tnt_schedule_days','tnt_schedule_items','tnt_schedule_responsibles','tnt_chat_threads','tnt_chat_members'],
    chat:['tnt_chat_threads','tnt_chat_members','tnt_chat_messages','tnt_chat_reactions'],
    asistencia:['tnt_efe_groups','tnt_efe_memberships','tnt_efe_meetings','tnt_efe_wednesday_attendance','tnt_saturday_members','tnt_saturday_attendance'],
    campamento:['tnt_camp_editions','tnt_camp_registrations','tnt_camp_payments','tnt_camp_settings','tnt_camp_resources','tnt_camp_assignments','tnt_camp_form_fields','tnt_camp_messages','tnt_camp_payment_plans','tnt_camp_plan_installments','tnt_camp_payment_exceptions','tnt_camp_sponsorships','tnt_camp_churches','tnt_camp_penalties','tnt_camp_sponsors','tnt_camp_notification_templates','tnt_camp_outbox'],
    glosario:['sermons','topics','sermon_files','tnt_library_items'],
    buffet:['tnt_products','tnt_shifts','tnt_sales','tnt_orders','tnt_menu_items','tnt_expenses','tnt_debts','tnt_cash_closures'],
    perfiles:['tnt_profile_change_requests','tnt_profile_link_requests','tnt_profile_public_requests','tnt_efe_groups','tnt_efe_memberships'],
    admin:['tnt_access_requests','tnt_role_requests','tnt_profile_change_requests','tnt_profile_link_requests','tnt_profile_public_requests','tnt_audit_log']
  };
  const IDENTITY=new Set(['tnt_accounts','tnt_access_grants','tnt_role_permission_presets','tnt_person_permission_overrides','tnt_people','tnt_profile_answers','tnt_settings']);
  const PEOPLE_PAGES=new Set(['admin','perfiles','organizacion','chat','asistencia','campamento']);
  let channel=null,timer=null,identityTouched=false;
  const queued=new Set();
  const rowOf=p=>p?.new&&Object.keys(p.new).length?p.new:(p?.old||{});
  function affectsMe(table,payload){
    const T=getT();
    if(!T)return false;
    if(table==='tnt_settings')return true;
    const row=rowOf(payload),pid=T.person?.id;
    if(!pid)return false;
    if(table==='tnt_people')return row.id?row.id===pid:true;
    if(table==='tnt_role_permission_presets')return row.role?row.role===T.account?.ministry_role:true;
    if(['tnt_accounts','tnt_access_grants','tnt_person_permission_overrides','tnt_profile_answers'].includes(table))return row.person_id?row.person_id===pid:true;
    return false;
  }
  function relevant(table,payload){
    const T=getT(),p=page(),row=rowOf(payload),pid=T?.person?.id;
    if(table==='tnt_notifications')return !row.person_id||row.person_id===pid;
    if(table==='tnt_notification_state')return !row.person_id||row.person_id===pid;
    if(table==='tnt_access_grants'||table==='tnt_person_permission_overrides')return p==='admin'||!row.person_id||row.person_id===pid;
    if(table==='tnt_role_permission_presets')return p==='admin'||!row.role||row.role===T?.account?.ministry_role;
    if(table==='tnt_profile_answers')return ['admin','perfiles'].includes(p)||!row.person_id||row.person_id===pid;
    if(table==='tnt_people')return PEOPLE_PAGES.has(p)||!row.id||row.id===pid;
    if(table==='tnt_accounts')return PEOPLE_PAGES.has(p)||!row.person_id||row.person_id===pid;
    return true;
  }
  function delay(){const p=page();return p==='chat'?70:p==='asistencia'?120:p==='organizacion'?180:p==='home'?420:220;}
  function schedule(){clearTimeout(timer);timer=setTimeout(flush,delay());}
  async function flush(){
    const T=getT();
    if(!T||!queued.size)return;
    if(page()==='home'&&document.documentElement.dataset.tntPointerDown==='true'){schedule();return;}
    const tables=[...queued];queued.clear();const refreshIdentity=identityTouched;identityTouched=false;
    try{
      if(tables.includes('tnt_experience')){await E.load(T.sb);document.dispatchEvent(new CustomEvent('tnt:config',{detail:E.config}));}
      if(refreshIdentity){
        await T.refreshIdentity();
        document.dispatchEvent(new CustomEvent('tnt:permissions'));
        document.dispatchEvent(new CustomEvent('tnt:config',{detail:E.config}));
        if(T.module&&!T.profileComplete){T.blocked=true;location.replace('/?onboarding=1');return;}
        if(T.module&&!T.isAdmin&&!T.hasAccess(T.module,T.scope||'*')){T.blocked=true;location.replace('/');return;}
      }
      document.dispatchEvent(new CustomEvent('tnt:data',{detail:{tables}}));
    }catch(e){console.warn('TNT scoped live update',e);}
  }
  document.addEventListener('pointerdown',()=>{document.documentElement.dataset.tntPointerDown='true';},{capture:true,passive:true});
  const pointerUp=()=>{delete document.documentElement.dataset.tntPointerDown;if(queued.size)schedule();};
  document.addEventListener('pointerup',pointerUp,{capture:true,passive:true});
  document.addEventListener('pointercancel',pointerUp,{capture:true,passive:true});
  E.subscribe=()=>{
    const T=getT();
    if(!T?.sb?.channel||!T.identity||channel)return;
    const p=page(),tables=[...new Set([...COMMON,...(PAGE_TABLES[p]||[])])];
    channel=T.sb.channel('tnt-live-scoped-'+p+'-'+T.person.id+'-'+crypto.randomUUID());
    for(const table of tables){
      channel.on('postgres_changes',{event:'*',schema:'public',table},payload=>{
        if(!relevant(table,payload))return;
        queued.add(table);if(IDENTITY.has(table)&&affectsMe(table,payload))identityTouched=true;schedule();
      });
    }
    channel.subscribe(status=>{document.body.dataset.tntConnection=status==='SUBSCRIBED'?'live':'connecting';});
    window.addEventListener('pagehide',()=>{clearTimeout(timer);if(channel)T.sb.removeChannel(channel);channel=null;},{once:true});
  };
})();
