// Real PostgreSQL coverage for role metadata, administrative review and old clients.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const migration=()=>{const file=fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_roles_and_community.sql'));return read(file?'supabase/migrations/'+file:'supabase/changes/roles-and-community.sql');};
test('Roles and Community: authoritative profiles and server-enforced requests',async t=>{
 const db=new PGlite(),one=async sql=>(await db.query(sql)).rows[0];
 const actor=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated;`);
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema tnt_actions;
   grant usage on schema auth to authenticated;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.tnt_people(id uuid primary key,full_name text,first_name text,last_name text,birthday date,sex text,phone text,instagram text,active boolean default true,data_notes jsonb default '{}');
   create table public.tnt_accounts(person_id uuid primary key,auth_user_id uuid,system_role text default 'user',enabled boolean default true,staff_status text default 'community',ministry_role text,requested_ministry_role text,staff_reviewed_by uuid,staff_reviewed_at timestamptz,onboarding_completed_at timestamptz);
   create table public.tnt_profile_answers(person_id uuid primary key,answers jsonb);
   create table public.tnt_profile_private_fields(person_id uuid,dni text);
   create table public.tnt_efe_groups(id uuid,code text);
   create table public.tnt_efe_memberships(id uuid,person_id uuid,group_id uuid,active boolean);
   create table public.tnt_role_requests(id uuid default gen_random_uuid(),person_id uuid,requested_role text,status text default 'pending',approved_role text,reviewed_by uuid,reviewed_at timestamptz);
   create table public.tnt_access_grants(person_id uuid,module text,scope text,access_level text,enabled boolean,granted_by uuid,unique(person_id,module,scope));
   create table public.tnt_staff_invitations(id uuid,person_id uuid,status text,responded_at timestamptz);
   create table public.tnt_access_requests(person_id uuid,module text,status text default 'pending');
   create function public.tnt_current_person_id() returns uuid language sql stable security definer as $$select person_id from public.tnt_accounts where auth_user_id=auth.uid()$$;
   create function public.tnt_is_admin() returns boolean language sql stable security definer as $$select coalesce((select enabled and system_role='admin' from public.tnt_accounts where person_id=public.tnt_current_person_id()),false)$$;
   create function public.tnt_is_staff() returns boolean language sql stable security definer as $$select coalesce((select enabled and staff_status='approved' from public.tnt_accounts where person_id=public.tnt_current_person_id()),false)$$;
   create function public.tnt_profile_missing_values(jsonb) returns jsonb language sql stable as $$select '[]'::jsonb$$;
   grant select,insert,update on all tables in schema public to authenticated;
   alter table public.tnt_access_requests enable row level security;
   create policy own_access on public.tnt_access_requests for insert to authenticated with check(person_id=public.tnt_current_person_id());
  `);
  await db.exec(migration());
  const source=read('supabase/migrations/20261004153010_community_identity_profiles.sql');
  await db.exec(source.match(/create or replace function public\.tnt_complete_onboarding[\s\S]*?\$\$;/)[0]);
  for(let n=1;n<=5;n++)await db.exec(`insert into public.tnt_people(id,full_name,sex) values('${id(n)}','Persona ${n}','U');insert into public.tnt_accounts(person_id,auth_user_id,system_role,staff_status,ministry_role,requested_ministry_role,onboarding_completed_at) values('${id(n)}','${id(n)}','${n===1?'admin':'user'}','${n<=2?'approved':n===5?'pending':'community'}',${n<=2?"'Líder'":'null'},'Líder',${n===4?'null':'now()'});insert into public.tnt_profile_answers values('${id(n)}','{"leadership_strengths":{"Enseñar":80},"dreams":"Acompañar"}');`);
  await t.test('Community ignores stale requested roles and retains saved answers',async()=>{
   const {v}=await one(`select public.tnt_profile_values('${id(3)}') as v`);
   assert.equal(v._ministry_role,'Comunidad');assert.deepEqual(v._profile_roles,['Comunidad']);assert.equal(v._staff_status,'community');assert.equal(v.leadership_strengths.Enseñar,80);
  });
  await t.test('Admin review refreshes both role sources and resolves pending requests',async()=>{
   await actor(1);await db.exec(`insert into public.tnt_role_requests(person_id,requested_role) values('${id(2)}','Líder');select public.tnt_review_staff('${id(2)}','Timoteo');`);
   let a=await one(`select ministry_role,requested_ministry_role,staff_status from public.tnt_accounts where person_id='${id(2)}'`);assert.deepEqual(a,{ministry_role:'Timoteo',requested_ministry_role:'Timoteo',staff_status:'approved'});
   assert.equal((await one(`select status from public.tnt_role_requests where person_id='${id(2)}'`)).status,'approved');
   await db.exec(`select public.tnt_review_staff('${id(2)}',null)`);a=await one(`select public.tnt_profile_values('${id(2)}') as v`);assert.equal(a.v._ministry_role,'Comunidad');assert.equal(a.v.leadership_strengths.Enseñar,80);
   assert.equal((await one(`select requested_ministry_role from public.tnt_accounts where person_id='${id(2)}'`)).requested_ministry_role,null);
  });
  await t.test('Completed Community cannot use the old membership RPC or direct writes',async()=>{
   await actor(3);
   await assert.rejects(db.exec(`select public.tnt_complete_onboarding(true,'Líder')`),/Administración/);
   await assert.rejects(db.exec(`update public.tnt_accounts set staff_status='pending' where person_id='${id(3)}'`),/Administración/);
   await assert.rejects(db.exec(`insert into public.tnt_role_requests(person_id,requested_role) values('${id(3)}','Timoteo')`),/Administración/);
   await assert.rejects(db.exec(`insert into public.tnt_access_requests(person_id,module) values('${id(3)}','organizacion')`),/administra TNT|row-level security/);
   assert.equal((await one(`select count(*)::int as n from public.tnt_role_requests where person_id='${id(3)}'`)).n,0);
   await assert.rejects(db.exec(`select public.tnt_review_staff('${id(3)}','Líder')`),/administrador/);
  });
  await t.test('Initial registration and an existing pending request remain supported',async()=>{
   await actor(4);await db.exec(`select public.tnt_complete_onboarding(true,'Colaborador')`);
   const {v}=await one(`select public.tnt_profile_values('${id(4)}') as v`);assert.equal(v._staff_status,'pending');assert.equal(v._ministry_role,'Colaborador');
   await actor(5);await db.exec(`select public.tnt_complete_onboarding(true,'Timoteo')`);assert.equal((await one(`select public.tnt_profile_values('${id(5)}') as v`)).v._ministry_role,'Timoteo');
  });
  await t.test('Reviewed people cannot restart onboarding to request a role',async()=>{
   await actor(1);await db.exec(`select public.tnt_review_staff('${id(4)}',null);update public.tnt_accounts set onboarding_completed_at=null where person_id='${id(4)}'`);
   await actor(4);await assert.rejects(db.exec(`select public.tnt_complete_onboarding(true,'Líder')`),/Administración/);
  });
  await t.test('Approved staff can request module access; admin can assign Community roles',async()=>{
   await actor(1);await db.exec(`select public.tnt_review_staff('${id(2)}','Colaborador')`);
   await actor(2);await db.exec(`insert into public.tnt_access_requests(person_id,module) values('${id(2)}','glosario')`);
   await actor(1);await db.exec(`select public.tnt_review_staff('${id(3)}','Líder')`);assert.equal((await one(`select public.tnt_profile_values('${id(3)}') as v`)).v._ministry_role,'Líder');
   await db.exec(`reset role`);assert.equal((await one(`select has_function_privilege('authenticated','tnt_actions.guard_community_requests()','execute') as allowed`)).allowed,false);
  });
 }finally{await db.close();}
});
