// Runs the new migration and existing save RPC in an isolated PostgreSQL runtime.
// Identity/profile/permission providers are test doubles; event guards, RLS,
// triggers, notifications, snapshots and transactions execute as real SQL.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const migration='supabase/migrations/20261021170000_organization_conversations_and_program.sql';
test('Organization migration: real PostgreSQL transactions and audience checks',async t=>{
 const db=new PGlite();let failureIndex=0;
 const scalar=async(sql,args)=>(await db.query(sql,args)).rows[0];
 const role=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated;`);
 const reject=async(sql,pattern)=>{const name='rejection_'+(++failureIndex);await db.exec('savepoint '+name);try{await assert.rejects(db.exec(sql),pattern);}finally{await db.exec('rollback to savepoint '+name+';release savepoint '+name);}};
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema tnt_actions;
   grant usage on schema auth,tnt_actions to authenticated,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table auth.users(id uuid primary key);
   create table public.tnt_people(id uuid primary key,full_name text,active boolean default true);
   create table public.tnt_accounts(person_id uuid primary key references public.tnt_people,auth_user_id uuid,system_role text,staff_status text default 'approved',enabled boolean default true,onboarding_completed_at timestamptz default now(),nickname text,avatar_url text);
   create table public.tnt_templates(id uuid primary key);
   create table public.tnt_test_permissions(person_id uuid,module text,action text);
   create function public.tnt_current_person_id() returns uuid language sql stable security definer as $$select person_id from public.tnt_accounts where auth_user_id=auth.uid()$$;
   create function public.tnt_is_admin() returns boolean language sql stable security definer as $$select coalesce((select system_role='admin' from public.tnt_accounts where person_id=public.tnt_current_person_id()),false)$$;
   create function public.tnt_profile_is_complete() returns boolean language sql stable security definer as $$select coalesce((select enabled and onboarding_completed_at is not null from public.tnt_accounts where person_id=public.tnt_current_person_id()),false)$$;
   create function public.tnt_module_enabled(text) returns boolean language sql stable as $$select true$$;
   create function public.tnt_module_available(text) returns boolean language sql stable as $$select true$$;
   create function public.tnt_profile_values(uuid) returns jsonb language sql stable as $$select '{}'::jsonb$$;
   create function public.tnt_profile_missing_values(jsonb) returns jsonb language sql stable as $$select '[]'::jsonb$$;
   create function public.tnt_can_action(text,text,text default '*') returns boolean language sql stable security definer as $$select public.tnt_is_admin() or exists(select 1 from public.tnt_test_permissions where person_id=public.tnt_current_person_id() and module=$1 and action=$2)$$;
   create function public.tnt_recipient_has_module(uuid,text) returns boolean language sql stable security definer as $$select exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id where a.person_id=$1 and a.enabled and p.active and a.staff_status='approved' and (a.system_role='admin' or exists(select 1 from public.tnt_test_permissions where person_id=$1 and module=$2 and action='view')))$$;
  `);
  const base=read('supabase/migrations/20260924_tnt_platform_v2.sql');
  for(const table of ['tnt_events','tnt_event_members','tnt_tasks','tnt_task_assignees','tnt_task_links','tnt_task_files','tnt_task_checklist','tnt_task_comments','tnt_schedule_days','tnt_schedule_items','tnt_schedule_responsibles','tnt_notifications','tnt_push_subscriptions','tnt_audit_log']){
   const match=base.match(new RegExp('create table if not exists public\\.'+table+' \\([\\s\\S]*?\\n\\);'));assert(match,table);await db.exec(match[0]);
  }
  await db.exec(`alter table public.tnt_tasks drop constraint tnt_tasks_task_type_check;
   alter table public.tnt_tasks add check(task_type in('simple','complex','logistics'));
   alter table public.tnt_tasks add column assignee_mode text default 'single',add column archived_at timestamptz;
   alter table public.tnt_schedule_items add column archived_at timestamptz;
   alter table public.tnt_task_comments add column body_rich text,add column kind text not null default 'question' check(kind in('note','question')),add column resolved_at timestamptz,add column resolved_by uuid;
   create table public.tnt_push_outbox(id uuid primary key default gen_random_uuid(),source_key text,person_id uuid,endpoint text,payload jsonb,unique(source_key,person_id,endpoint));
   create table public.tnt_chat_threads(id uuid primary key,title text,thread_type text,event_id uuid,task_id uuid,is_archived boolean default false);
   create table public.tnt_chat_messages(id uuid primary key,thread_id uuid,person_id uuid,body text,attachments jsonb default '[]',created_at timestamptz default now(),deleted_at timestamptz,audience_person_ids uuid[]);
   create table public.tnt_chat_members(thread_id uuid,person_id uuid,last_read_at timestamptz);
   create function public.tnt_enqueue_push() returns trigger language plpgsql as $$begin return new;end$$;
   create trigger tnt_new_notification_push after insert on public.tnt_notifications for each row execute function public.tnt_enqueue_push();
   create trigger tnt_new_chat_message_push after insert on public.tnt_chat_messages for each row execute function public.tnt_enqueue_push();
   create function tnt_actions.reorder_schedule(uuid,uuid[],jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
   revoke all on function tnt_actions.reorder_schedule(uuid,uuid[],jsonb) from public,anon;
   grant execute on function tnt_actions.reorder_schedule(uuid,uuid[],jsonb) to authenticated;
   create function public.tnt_reorder_schedule(p_day uuid,p_ids uuid[],p_before jsonb) returns jsonb language sql security invoker as $$select tnt_actions.reorder_schedule(p_day,p_ids,p_before)$$;
  `);
  const management=read('supabase/migrations/20261004205701_team_management_experience.sql');
  await db.exec(management.match(/create or replace function public\.tnt_event_can_action[\s\S]*?\$\$;/i)[0]);
  await db.exec(`create function public.tnt_can_manage_event(uuid) returns boolean language sql stable as $$select public.tnt_event_can_action($1,'edit_event')$$;`);
  await db.exec(read('supabase/migrations/20261018030254_activity_highlights.sql'));
  await db.exec(read('supabase/migrations/20261023230939_approved_activity_colors.sql'));
  await db.exec(read('supabase/migrations/20260924_tnt_automatic_notifications.sql').split('create or replace function public.tnt_generate_daily_notifications')[0]);
  await db.exec(base.slice(base.indexOf('create or replace function public.tnt_notify_assignment()'),base.indexOf('create or replace function public.tnt_audit_task_changes()')));
  await db.exec(`grant all on all tables in schema public to authenticated;grant usage,select on all sequences in schema public to authenticated;
   alter table public.tnt_task_comments enable row level security;
   create policy comments_read on public.tnt_task_comments for select to authenticated using(public.tnt_can_action('organizacion','view','*'));
   create policy comments_delete on public.tnt_task_comments for delete to authenticated using(person_id=public.tnt_current_person_id() or public.tnt_is_admin());
   alter table public.tnt_notifications enable row level security;
   create policy tnt_notifications_own on public.tnt_notifications for select to authenticated using(person_id=public.tnt_current_person_id());`);
  const coherent=read('supabase/migrations/20260926192710_coherent_platform.sql');
  await db.exec(coherent.slice(coherent.indexOf('drop policy if exists tnt_comments_update'),coherent.indexOf('-- Event chats also include')));
  for(let n=1;n<=6;n++)await db.exec(`insert into auth.users values('${id(n)}');insert into public.tnt_people values('${id(n)}','Persona ${n}',true);
   insert into public.tnt_accounts(person_id,auth_user_id,system_role,nickname,avatar_url,enabled) values('${id(n)}','${id(n)}','${n===1?'admin':'user'}','Persona ${n}','https://photos.example.test/${n}.jpg',${n!==5});
   insert into public.tnt_test_permissions values('${id(n)}','organizacion','view'),('${id(n)}','chat','view');`);
  for(const action of ['edit_event','create_activity','edit_activity','assign_people'])await db.exec(`insert into public.tnt_test_permissions values('${id(2)}','organizacion','${action}');`);
  await db.exec(`insert into public.tnt_test_permissions values('${id(3)}','organizacion','edit_activity');
   insert into public.tnt_events(id,name,kind,start_date,end_date) values('${id(10)}','Sábado del equipo','saturday','2027-01-30','2027-01-30'),('${id(11)}','Otro evento','event','2027-02-01','2027-02-02');
   insert into public.tnt_event_members values('${id(10)}','${id(2)}','organizer',now()),('${id(10)}','${id(3)}','participant',now()),('${id(10)}','${id(4)}','participant',now());
   insert into public.tnt_schedule_days(id,event_id,label,date) values('${id(20)}','${id(10)}','Sábado','2027-01-30'),('${id(21)}','${id(11)}','Lunes','2027-02-01');
   insert into public.tnt_tasks(id,event_id,title,task_type,planned_start,duration_minutes,sort_order) values
    ('${id(30)}','${id(10)}','Bienvenida','complex','2027-01-30T19:15:00-03:00',5,0),
    ('${id(31)}','${id(10)}','Palabra','complex','2027-01-30T19:20:00-03:00',15,1),
    ('${id(32)}','${id(10)}','Oración','simple',null,null,2);
   insert into public.tnt_schedule_items(id,day_id,task_id,title,starts_at,duration_minutes,sort_order) values
    ('${id(40)}','${id(20)}','${id(30)}','Bienvenida','19:15',5,0),('${id(41)}','${id(20)}','${id(31)}','Palabra','19:20',15,1);
   insert into public.tnt_task_assignees(task_id,person_id) values('${id(30)}','${id(3)}'),('${id(30)}','${id(4)}'),('${id(30)}','${id(5)}');
   insert into public.tnt_push_subscriptions(person_id,endpoint,subscription) values('${id(2)}','organizer-phone','{}'),('${id(3)}','member-phone','{}'),('${id(4)}','asker-phone','{}'),('${id(5)}','disabled-phone','{}');
  `);
  await db.exec(`insert into public.tnt_notifications(id,person_id,scope,event_id,task_id,title,body,href,data) values('${id(90)}','${id(2)}','team','${id(10)}','${id(30)}','Old team notice','','/organizacion/','{"kind":"activity_question"}');`);
  await db.exec(read(migration));
  await db.exec(read('supabase/migrations/20261021204620_activity_notification_audience.sql'));
  await db.exec('begin');
  await t.test('Existing flexible cards have a day and no invented time',async()=>{
   const row=await scalar(`select i.starts_at,i.duration_minutes from public.tnt_schedule_items i where i.task_id='${id(32)}'`);assert.equal(row.starts_at,null);assert.equal(row.duration_minutes,null);
  });
  await t.test('Reorder preserves all times, rejects inversion and detects a stale snapshot',async()=>{
   await role(2);const before=(await scalar(`select jsonb_agg(jsonb_build_object('id',id,'starts_at',starts_at,'duration_minutes',duration_minutes,'sort_order',sort_order,'task_id',task_id)) as value from public.tnt_schedule_items where day_id='${id(20)}'`)).value;
   const rows=(await db.query(`select id,task_id,starts_at,duration_minutes from public.tnt_schedule_items where day_id=$1 order by sort_order`,[id(20)])).rows,flex=rows.find(i=>i.starts_at===null).id,quote=JSON.stringify(before).replace(/'/g,"''");
   await db.query('select public.tnt_reorder_program($1,$2,$3)',[id(20),[id(40),flex,id(41)],before]);
   assert.deepEqual((await db.query(`select id,task_id,starts_at,duration_minutes from public.tnt_schedule_items where day_id=$1 order by id`,[id(20)])).rows,[...rows].sort((a,b)=>a.id.localeCompare(b.id)));
   await reject(`select public.tnt_reorder_program('${id(20)}',array['${id(41)}','${flex}','${id(40)}']::uuid[],'${quote}'::jsonb)`,/Otra persona cambió/);
   const next=(await scalar(`select jsonb_agg(jsonb_build_object('id',id,'starts_at',starts_at,'duration_minutes',duration_minutes,'sort_order',sort_order,'task_id',task_id)) as value from public.tnt_schedule_items where day_id='${id(20)}'`)).value;
   await reject(`select public.tnt_reorder_schedule('${id(20)}',array['${id(41)}','${flex}','${id(40)}']::uuid[],'${JSON.stringify(next)}'::jsonb)`,/Los horarios deben conservar/);
   await role(3);await reject(`select public.tnt_reorder_program('${id(20)}',array['${id(40)}','${flex}','${id(41)}']::uuid[],'${JSON.stringify(next)}'::jsonb)`,/No tenés permiso/);
  });
  await t.test('Saving an untimed activity and its phase is atomic and validates its day',async()=>{
   await role(2);const saved=await scalar('select public.tnt_save_activity(null,$1,$2,$3) as id',[id(10),{title:'Guardar sillas',task_type:'simple',logistics_phase:'after',planned_start:null},[]]);
   const item=await scalar('select starts_at from public.tnt_schedule_items where task_id=$1',[saved.id]);assert.equal(item.starts_at,null);
   assert.equal((await scalar('select logistics_phase from public.tnt_tasks where id=$1',[saved.id])).logistics_phase,'after');
   await reject(`select public.tnt_save_activity(null,'${id(10)}','{"title":"Wrong day","program_day_id":"${id(21)}"}','{}'::uuid[])`,/El día no pertenece/);
   assert.equal((await scalar("select count(*)::int as n from public.tnt_tasks where title='Wrong day'")).n,0);
  });
  await t.test('Questions carry the actual author photo and Saturday; replies reach the original asker',async()=>{
   await role(4);const question=await scalar('insert into public.tnt_task_comments(task_id,person_id,body,kind) values($1,$2,$3,$4) returning id',[id(30),id(4),'¿Qué llevo?','question']);
   await db.exec('reset role');const notes=(await db.query("select person_id,data,href from public.tnt_notifications where data->>'comment_id'=$1",[question.id])).rows;
   assert.deepEqual(notes.map(n=>n.person_id).sort(),[id(3)]);assert(notes.every(n=>n.data.sender_avatar==='https://photos.example.test/4.jpg'&&n.data.sender_id===id(4)&&n.data.event_date==='2027-01-30'&&n.href.includes('&tab=team&comment='+question.id)));
   const payloads=(await db.query("select payload from public.tnt_push_outbox where payload->>'comment_id'=$1",[question.id])).rows;assert.equal(payloads.length,1);assert(payloads.every(p=>p.payload.sender_avatar==='https://photos.example.test/4.jpg'&&p.payload.comment_id===question.id));
   await role(2);
   const reply=await scalar('insert into public.tnt_task_comments(task_id,person_id,body,kind,reply_to) values($1,$2,$3,$4,$5) returning id',[id(30),id(2),'Los carteles','question',question.id]);
   await db.exec('reset role');assert((await scalar("select count(*)::int as n from public.tnt_notifications where data->>'comment_id'=$1 and person_id=$2",[reply.id,id(4)])).n===1);
   await role(3);await reject(`insert into public.tnt_task_comments(task_id,person_id,body,kind,reply_to) values('${id(31)}','${id(3)}','Respuesta cruzada','question','${question.id}')`,/esta actividad/);
   await reject(`insert into public.tnt_task_comments(task_id,person_id,body,kind,is_pinned) values('${id(30)}','${id(3)}','Indicación sin permiso','note',true)`,/Solo coordinación/);
   await reject(`update public.tnt_event_changes set summary='Alterado'`,/permission denied/);
  });
  await t.test('Activity notices exclude unrelated coordinators, former commenters, declined and removed members in SQL and RLS',async()=>{
   await db.exec('reset role');
   const legacy={id:id(90)};
   const visible=async(person,note)=>!!(await scalar('select public.tnt_notification_visible_for(n,$1) as visible from public.tnt_notifications n where id=$2',[id(person),note])).visible;
   assert.equal(await visible(2,legacy.id),false);
   await role(2);assert.equal((await scalar('select count(*)::int as n from public.tnt_notifications where id=$1',[legacy.id])).n,0);
   await db.exec('reset role');
   assert.equal((await db.query("insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,href,data) values($1,'team',$2,$3,'Unrelated coordinator','/organizacion/','{\"kind\":\"activity_question\"}') returning id",[id(2),id(10),id(30)])).rows.length,0);
   const former=await scalar("insert into public.tnt_task_comments(task_id,person_id,body,kind) values($1,$2,'Former participant','question') returning id",[id(30),id(6)]);
   await role(2);const reply=await scalar("insert into public.tnt_task_comments(task_id,person_id,body,kind,reply_to) values($1,$2,'Current team reply','question',$3) returning id",[id(30),id(2),former.id]);
   await db.exec('reset role');const targets=(await db.query("select person_id from public.tnt_notifications where data->>'comment_id'=$1 order by person_id",[reply.id])).rows.map(n=>n.person_id);assert.deepEqual(targets,[id(3),id(4)]);
   const memberNotice=await scalar("select id from public.tnt_notifications where data->>'comment_id'=$1 and person_id=$2",[reply.id,id(4)]);assert.equal(await visible(4,memberNotice.id),true);
   await db.query("update public.tnt_task_assignees set assignment_status='declined' where task_id=$1 and person_id=$2",[id(30),id(4)]);assert.equal(await visible(4,memberNotice.id),false);
   await role(4);assert.equal((await scalar('select count(*)::int as n from public.tnt_notifications where id=$1',[memberNotice.id])).n,0);
   await db.exec('reset role');await db.query("update public.tnt_task_assignees set assignment_status='accepted' where task_id=$1 and person_id=$2",[id(30),id(4)]);
   const personal=await scalar("insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,href,data) values($1,'personal',$2,$3,'Participation changed','/organizacion/',jsonb_build_object('kind','assignment_removed')) returning id",[id(6),id(10),id(30)]);assert.equal(await visible(6,personal.id),true);
   assert.equal((await scalar("select has_function_privilege('anon','tnt_actions.my_notification_visible(public.tnt_notifications)','execute') as allowed")).allowed,false);
  });
  await t.test('Explicit time edits restore chronological slots; untimed logistics stays outside the program',async()=>{
   await role(2);const task=await scalar(`select to_jsonb(t) as value from public.tnt_tasks t where id='${id(31)}'`);
   await db.query('select public.tnt_save_activity($1,$2,$3,$4)',[id(31),id(10),{...task.value,planned_start:'2027-01-30T19:00:00-03:00'},[]]);
   const clocks=(await db.query(`select starts_at from public.tnt_schedule_items where day_id='${id(20)}' and starts_at is not null order by sort_order`)).rows.map(i=>i.starts_at);assert.deepEqual(clocks,['19:00:00','19:15:00']);
   assert((await scalar(`select summary from public.tnt_event_changes where task_id='${id(31)}' order by created_at desc limit 1`)).summary.includes('30/01 19:20 → 30/01 19:00'));
   const area=await scalar('select public.tnt_save_activity(null,$1,$2,$3) as id',[id(10),{title:'Limpieza final',task_type:'logistics',logistics_phase:'after',planned_start:null},[]]);
   assert.equal((await scalar('select logistics_phase from public.tnt_tasks where id=$1',[area.id])).logistics_phase,'after');assert.equal((await scalar('select count(*)::int as n from public.tnt_schedule_items where task_id=$1',[area.id])).n,0);
  });
  await t.test('Chat push retains message identity and is invisible after membership revocation',async()=>{
   await db.exec('reset role');await db.exec(`insert into public.tnt_chat_threads values('${id(60)}','Equipo del sábado','event','${id(10)}',null,false);insert into public.tnt_chat_members(thread_id,person_id) values('${id(60)}','${id(2)}'),('${id(60)}','${id(3)}');`);
   await role(2);await db.exec(`insert into public.tnt_chat_messages(id,thread_id,person_id,body,audience_person_ids) values('${id(70)}','${id(60)}','${id(2)}','Mensaje privado',array['${id(3)}']::uuid[])`);
   await db.exec('reset role');const note=await scalar("select id,data from public.tnt_notifications where data->>'message_id'=$1",[id(70)]);assert.equal(note.data.sender_avatar,'https://photos.example.test/2.jpg');assert.equal(note.data.event_name,'Sábado del equipo');
   const push=await scalar("select payload from public.tnt_push_outbox where payload->>'message_id'=$1",[id(70)]);assert.equal(push.payload.message_id,id(70));assert.equal(push.payload.sender_id,id(2));
   await db.exec('reset role');assert.equal((await scalar('select public.tnt_notification_visible_for(n,$1) as visible from public.tnt_notifications n where n.id=$2',[id(3),note.id])).visible,true);
   await db.query('delete from public.tnt_chat_members where thread_id=$1 and person_id=$2',[id(60),id(3)]);assert.equal((await scalar('select public.tnt_notification_visible_for(n,$1) as visible from public.tnt_notifications n where n.id=$2',[id(3),note.id])).visible,false);
  });
  await t.test('Activity chat notifications exclude room members who are not part of the activity',async()=>{
   await db.exec(`reset role;insert into public.tnt_chat_threads values('${id(61)}','Equipo de Bienvenida','task','${id(10)}','${id(30)}',false);insert into public.tnt_chat_members(thread_id,person_id) values('${id(61)}','${id(2)}'),('${id(61)}','${id(3)}'),('${id(61)}','${id(6)}');`);
   await role(2);await db.exec(`insert into public.tnt_chat_messages(id,thread_id,person_id,body) values('${id(71)}','${id(61)}','${id(2)}','Mensaje de actividad');`);
   await db.exec('reset role');assert.deepEqual((await db.query("select person_id from public.tnt_notifications where data->>'message_id'=$1",[id(71)])).rows.map(n=>n.person_id),[id(3)]);
   const note=await scalar("select id from public.tnt_notifications where data->>'message_id'=$1",[id(71)]);await db.query('delete from public.tnt_task_assignees where task_id=$1 and person_id=$2',[id(30),id(3)]);assert.equal((await scalar('select public.tnt_notification_visible_for(n,$1) as visible from public.tnt_notifications n where n.id=$2',[id(3),note.id])).visible,false);
  });
  await t.test('Thread references and history do not block deletion of an event',async()=>{
   await db.exec(`reset role;delete from public.tnt_events where id='${id(10)}';`);
   assert.equal((await scalar(`select count(*)::int as n from public.tnt_task_comments`)).n,0);
   assert.equal((await scalar(`select count(*)::int as n from public.tnt_event_changes where event_id='${id(10)}'`)).n,0);
  });
  await db.exec('reset role;rollback');
 }finally{await db.close();}
});
