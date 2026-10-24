const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('Startup and home snapshots retain RLS and fresh authorization without navigation writes',async t=>{
 const db=new PGlite(),one=async sql=>(await db.query(sql)).rows[0];
 const actor=n=>db.exec(`reset role;set request.jwt.claim.sub='${id(n)}';set role authenticated;`);
 const admin=sql=>db.exec('reset role;'+sql);
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table tnt_people(id uuid primary key,full_name text,active boolean default true);
   create table tnt_accounts(person_id uuid primary key,auth_user_id uuid,enabled boolean default true,staff_status text default 'approved',system_role text default 'user',ministry_role text default 'Líder',nickname text,avatar_url text,email text,onboarding_completed_at timestamptz default now());
   create table tnt_access_grants(person_id uuid,module text,scope text,enabled boolean,access_level text);
   create table tnt_module_access(person_id uuid,module text,enabled boolean,access_level text);
   create table tnt_role_permission_presets(role text,module text,scope text,action text,allowed boolean);
   create table tnt_person_permission_overrides(person_id uuid,module text,scope text,action text,allowed boolean,archived_at timestamptz);
   create table tnt_experience(id boolean,config jsonb,revision int);
   create table tnt_community_preferences(person_id uuid,reading jsonb);
   create table sync_calls(person_id uuid,kind text);
   create function tnt_current_person_id() returns uuid language sql stable security definer set search_path='' as $$select person_id from public.tnt_accounts where auth_user_id=auth.uid() and enabled$$;
   create function tnt_is_staff() returns boolean language sql stable security definer set search_path='' as $$select coalesce((select staff_status='approved' and enabled from public.tnt_accounts where auth_user_id=auth.uid()),false)$$;
   create function tnt_is_admin() returns boolean language sql stable security definer set search_path='' as $$select coalesce((select system_role='admin' and enabled from public.tnt_accounts where auth_user_id=auth.uid()),false)$$;
   create function tnt_profile_is_complete() returns boolean language sql stable security definer set search_path='' as $$select coalesce((select a.enabled and p.active and a.onboarding_completed_at is not null from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id where a.auth_user_id=auth.uid()),false)$$;
   create function tnt_profile_context() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('complete',public.tnt_profile_is_complete(),'values',jsonb_build_object('person_id',public.tnt_current_person_id()))$$;
   create function tnt_ensure_account() returns uuid language plpgsql security definer set search_path='' as $$declare pid uuid:=public.tnt_current_person_id();begin
    if pid is null and not exists(select 1 from public.tnt_accounts where auth_user_id=auth.uid()) then
     pid:=auth.uid();insert into public.tnt_people values(pid,'Persona nueva',true);insert into public.tnt_accounts(person_id,auth_user_id) values(pid,auth.uid());
    end if;
    insert into public.sync_calls values(pid,'sync');return pid;end$$;
   create function tnt_continue_profile(uuid,jsonb,boolean) returns jsonb language plpgsql security definer set search_path='' as $$begin insert into public.sync_calls values(public.tnt_current_person_id(),'continue');return jsonb_build_object('linked',false,'candidate',jsonb_build_object('full_name','Coincidencia'));end$$;
   create table tnt_events(id uuid primary key,owner_id uuid,status text);
   create table tnt_tasks(id uuid primary key,event_id uuid,owner_id uuid,archived_at timestamptz);
   create table tnt_task_assignees(task_id uuid,person_id uuid,owner_id uuid);
   create table tnt_schedule_days(id uuid,event_id uuid,owner_id uuid);
   create table tnt_schedule_items(id uuid,day_id uuid,owner_id uuid,archived_at timestamptz);
   create table tnt_schedule_responsibles(item_id uuid,person_id uuid,owner_id uuid);
   create table tnt_event_members(event_id uuid,person_id uuid,owner_id uuid);
   grant select on all tables in schema public to authenticated;
   alter table tnt_accounts enable row level security;
   create policy account_read on tnt_accounts for select to authenticated using(person_id=(select tnt_current_person_id()) or (select tnt_is_staff()) or (select tnt_is_admin()));
   alter table tnt_people enable row level security;
   create policy people_read on tnt_people for select to authenticated using(id=(select tnt_current_person_id()) or (select tnt_is_staff()) or (select tnt_is_admin()));
   alter table tnt_experience enable row level security;create policy config_read on tnt_experience for select to authenticated using(true);
   alter table tnt_role_permission_presets enable row level security;create policy roles_read on tnt_role_permission_presets for select to authenticated using(true);
  `);
  for(const table of ['tnt_access_grants','tnt_module_access','tnt_person_permission_overrides','tnt_community_preferences'])await db.exec(`alter table ${table} enable row level security;create policy own_read on ${table} for select to authenticated using(person_id=(select tnt_current_person_id()));`);
  for(const table of ['tnt_events','tnt_tasks','tnt_task_assignees','tnt_schedule_days','tnt_schedule_items','tnt_schedule_responsibles','tnt_event_members'])await db.exec(`alter table ${table} enable row level security;create policy scoped_read on ${table} for select to authenticated using(owner_id=(select tnt_current_person_id()));`);
  for(let n=1;n<=3;n++)await db.exec(`insert into tnt_people values('${id(n)}','Persona ${n}',true);insert into tnt_accounts(person_id,auth_user_id,nickname,email,system_role) values('${id(n)}','${id(n)}','Persona ${n}','private${n}@example.test','${n===1?'admin':'user'}');insert into tnt_access_grants values('${id(n)}','organizacion','*',true,'view');insert into tnt_module_access values('${id(n)}','chat',true,'view');insert into tnt_person_permission_overrides values('${id(n)}','organizacion','*','edit',false,null),('${id(n)}','organizacion','*','delete',true,now());insert into tnt_community_preferences values('${id(n)}','{"book":"MAT","chapter":5}');insert into tnt_events values('${id(20+n)}','${id(n)}','planning');insert into tnt_tasks values('${id(30+n)}','${id(20+n)}','${id(n)}',null);`);
  await db.exec(`insert into tnt_role_permission_presets values('Líder','organizacion','*','view',true),('Pastor/a','chat','*','manage',true);insert into tnt_experience values(true,'{"modules":{"buffet":{"enabled":false}}}',9);`);
  const migration=fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_startup_context.sql'));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));
  await t.test('Anonymous callers and missing JWT identities cannot open either snapshot',async()=>{
   await admin('set role anon');await assert.rejects(db.exec('select tnt_startup_context()'),/permission denied/);await assert.rejects(db.exec('select tnt_home_context()'),/permission denied/);
   await admin("set request.jwt.claim.sub='';set role authenticated");await assert.rejects(db.exec('select tnt_startup_context()'),/Iniciá sesión/);await assert.rejects(db.exec('select tnt_home_context()'),/perfil habilitado/);
  });
  await t.test('Even an admin gets only their own identity and grants; navigation does not write',async()=>{
   await actor(1);const {v}=await one('select tnt_startup_context(false,false) v');
   assert.equal(v.account.person_id,id(1));assert.equal(v.person.id,id(1));assert.equal(v.profile.complete,true);assert.equal(v.experience.revision,9);assert.equal(v.reading.book,'MAT');
   assert(v.grants.every(g=>g.person_id===id(1)));assert(v.legacy.every(g=>g.person_id===id(1)));assert.equal(v.person_permissions.length,1);assert.equal(v.role_permissions.length,1);assert.equal(v.role_permissions[0].role,'Líder');
   await db.exec('select tnt_startup_context(false,false)');await admin('');assert.equal((await one('select count(*)::int n from sync_calls')).n,0);
  });
  await t.test('Sign-in synchronization and profile matching run only when requested',async()=>{
   await actor(1);const {v}=await one('select tnt_startup_context(true,true) v');assert.equal(v.continuation.candidate.full_name,'Coincidencia');
   await db.exec('select tnt_startup_context(false,false)');await admin('');assert.equal((await one('select count(*)::int n from sync_calls')).n,2);
   await actor(8);const fresh=await one('select tnt_startup_context(false,false) v');assert.equal(fresh.v.account.auth_user_id,id(8));
  });
  await t.test('Home uses the caller RLS and excludes private account fields',async()=>{
   await actor(2);const {v}=await one('select tnt_home_context() v');assert.equal(v.events.length,1);assert.equal(v.events[0].owner_id,id(2));assert.equal(v.tasks.length,1);assert.equal(v.tasks[0].owner_id,id(2));
   assert(v.accounts.length>=2);assert(v.accounts.every(a=>Object.keys(a).sort().join(',')==='avatar_url,nickname,person_id'));assert(v.people.every(p=>Object.keys(p).sort().join(',')==='active,full_name,id'));
  });
  await t.test('Role, module configuration, required profile and disabled account changes are fresh',async()=>{
   await admin(`update tnt_accounts set ministry_role='Pastor/a' where person_id='${id(2)}';update tnt_access_grants set enabled=false where person_id='${id(2)}';update tnt_experience set revision=10;`);
   await actor(2);let v=(await one('select tnt_startup_context() v')).v;assert.equal(v.account.ministry_role,'Pastor/a');assert.equal(v.role_permissions[0].role,'Pastor/a');assert.equal(v.grants[0].enabled,false);assert.equal(v.experience.revision,10);
   await admin(`update tnt_accounts set onboarding_completed_at=null where person_id='${id(2)}'`);await actor(2);assert.equal((await one('select tnt_startup_context() v')).v.profile.complete,false);await assert.rejects(db.exec('select tnt_home_context()'),/perfil habilitado/);
   await admin(`update tnt_accounts set enabled=false where person_id='${id(2)}'`);await actor(2);await assert.rejects(db.exec('select tnt_startup_context()'),/cuenta no está habilitada/);
   await admin(`update tnt_people set active=false where id='${id(3)}'`);await actor(3);await assert.rejects(db.exec('select tnt_startup_context()'),/perfil no está disponible/);
   await actor(8);await admin(`update tnt_accounts set staff_status='community' where person_id='${id(8)}'`);await actor(8);await assert.rejects(db.exec('select tnt_home_context()'),/perfil habilitado/);
  });
 }finally{await db.close();}
});
