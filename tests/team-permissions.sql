-- Integration assertions against real functions and RLS. All fixtures and mutations roll back.
begin;
do $$
declare ids jsonb:=jsonb_build_object('admin',gen_random_uuid(),'admin_auth',gen_random_uuid(),'leader',gen_random_uuid(),'leader_auth',gen_random_uuid(),'community',gen_random_uuid(),'community_auth',gen_random_uuid(),'match',gen_random_uuid(),'own',gen_random_uuid(),'other',gen_random_uuid(),'task',gen_random_uuid(),'other_task',gen_random_uuid(),'note',gen_random_uuid(),'team_note',gen_random_uuid(),'personal_note',gen_random_uuid()); k text; pid uuid; auto_pid uuid;
begin
 perform set_config('tnt.test.ids',ids::text,true);perform set_config('tnt.test.results','[]',true);
 foreach k in array array['admin','leader','community'] loop
  pid:=(ids->>k)::uuid;
  insert into auth.users(id,email) values((ids->>(k||'_auth'))::uuid,'tnt-test-'||pid||'@example.invalid');
  select person_id into auto_pid from public.tnt_accounts where auth_user_id=(ids->>(k||'_auth'))::uuid;
  if auto_pid is not null then
   pid:=auto_pid;ids:=jsonb_set(ids,array[k],to_jsonb(pid));perform set_config('tnt.test.ids',ids::text,true);
   update public.tnt_people set full_name='TNT Test '||k||' '||pid,first_name='TNT',last_name='Test '||k,birthday='2000-01-01',sex='M',phone='1100000000',instagram='@tnt-test',profile_consent=true where id=pid;
   update public.tnt_accounts set system_role=case when k='admin' then 'admin' else 'user' end,staff_status=case when k='community' then 'community' else 'approved' end,ministry_role=case when k='leader' then 'Líder' else null end,onboarding_completed_at=now() where person_id=pid;
  else
   insert into public.tnt_people(id,full_name,normalized_name,first_name,last_name,birthday,sex,phone,instagram,profile_consent)
    values(pid,'TNT Test '||k||' '||pid,'tnt test '||pid,'TNT','Test '||k,'2000-01-01','M','1100000000','@tnt-test',true);
   insert into public.tnt_accounts(person_id,auth_user_id,system_role,staff_status,ministry_role,onboarding_completed_at)
    values(pid,(ids->>(k||'_auth'))::uuid,case when k='admin' then 'admin' else 'user' end,case when k='community' then 'community' else 'approved' end,case when k='leader' then 'Líder' else null end,now());
  end if;
  insert into public.tnt_profile_private_fields(person_id,dni) values(pid,'00000000');
  insert into public.tnt_profile_answers(person_id,answers) values(pid,'{"interests":["Música"],"studies":"Prueba","dreams":"Prueba","efe_group":"none"}');
 end loop;
 insert into public.tnt_people(id,full_name,normalized_name,birthday) values((ids->>'match')::uuid,'TNTMatch ApellidoCompleto','tntmatch apellidocompleto','2000-01-01');
 insert into public.tnt_access_grants(person_id,module,access_level) values((ids->>'leader')::uuid,'organizacion','manage'),((ids->>'leader')::uuid,'chat','edit');
 insert into public.tnt_person_permission_overrides(person_id,module,action,allowed) values
  ((ids->>'leader')::uuid,'organizacion','view',true),((ids->>'leader')::uuid,'organizacion','edit_activity',true),((ids->>'leader')::uuid,'organizacion','delete_activity',true),((ids->>'leader')::uuid,'organizacion','create_chat',true),((ids->>'leader')::uuid,'chat','view',true);
 insert into public.tnt_events(id,kind,name,start_date,end_date) values((ids->>'own')::uuid,'saturday','TNT test propio',current_date-30,current_date-30),((ids->>'other')::uuid,'saturday','TNT test ajeno',current_date+7,current_date+7);
 insert into public.tnt_event_members(event_id,person_id,event_role) values((ids->>'own')::uuid,(ids->>'leader')::uuid,'organizer');
 insert into public.tnt_tasks(id,event_id,title) values((ids->>'task')::uuid,(ids->>'own')::uuid,'Actividad propia de prueba'),((ids->>'other_task')::uuid,(ids->>'other')::uuid,'Actividad ajena de prueba');
 insert into public.tnt_notifications(id,scope,title) values((ids->>'note')::uuid,'general','Aviso general de prueba'),((ids->>'team_note')::uuid,'team','Aviso solo staff de prueba');
 insert into public.tnt_notifications(id,scope,title,person_id) values((ids->>'personal_note')::uuid,'personal','Aviso de otro', (ids->>'admin')::uuid);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.ids')::jsonb->>'leader_auth','role','authenticated')::text,true);
do $$
declare ids jsonb:=current_setting('tnt.test.ids')::jsonb; changed integer; a uuid;b uuid; result jsonb;
begin
 if not public.tnt_profile_is_complete() then raise exception 'Fixture profile should be complete';end if;
 if not public.tnt_event_can_action((ids->>'own')::uuid,'edit_activity') or public.tnt_event_can_action((ids->>'other')::uuid,'edit_activity') then raise exception 'Action AND coordination must be enforced';end if;
 update public.tnt_tasks set title='No debe cambiar' where id=(ids->>'other_task')::uuid;get diagnostics changed=row_count;if changed<>0 then raise exception 'RLS allowed another event';end if;
 begin perform public.tnt_delete_activity((ids->>'other_task')::uuid);raise exception 'RPC allowed another event';exception when insufficient_privilege then null;end;
 result:=public.tnt_archive_activities(array[(ids->>'task')::uuid,(ids->>'other_task')::uuid],false);
 if not exists(select 1 from jsonb_array_elements(result) x where (x->>'id')::uuid=(ids->>'task')::uuid and x->>'ok'='true') or not exists(select 1 from jsonb_array_elements(result) x where (x->>'id')::uuid=(ids->>'other_task')::uuid and x->>'ok'='false') then raise exception 'Batch did not return partial results';end if;
 perform public.tnt_archive_activities(array[(ids->>'task')::uuid],true);
 if exists(select 1 from public.tnt_tasks where id=(ids->>'task')::uuid and archived_at is not null) then raise exception 'Undo did not restore activity';end if;
 a:=public.tnt_create_chat('TNT test sábado anterior',(ids->>'own')::uuid,null,false,false,array[(ids->>'leader')::uuid]);
 b:=public.tnt_create_chat('TNT test repetido',(ids->>'own')::uuid,null,false,false,array[(ids->>'leader')::uuid]);if a<>b then raise exception 'Creating an existing Saturday chat must be idempotent';end if;
 perform public.tnt_notification_action(array[(ids->>'note')::uuid],'dismiss');
 if exists(select 1 from public.tnt_my_notifications(false) n where n->>'id'=ids->>'note') then raise exception 'Dismissed notification still pending';end if;
 begin perform public.tnt_notification_action(array[(ids->>'personal_note')::uuid],'dismiss');raise exception 'Could dismiss another person notification';exception when insufficient_privilege then null;end;
 begin perform public.tnt_publish_experience('{}',0);raise exception 'Non-admin could publish';exception when insufficient_privilege then null;end;
 begin perform public.tnt_claim_push(1);raise exception 'Authenticated could claim service queue';exception when insufficient_privilege then null;end;
 perform set_config('tnt.test.results','["context permission AND","direct RLS","RPC permission","partial batch","archive undo","existing Saturday chat idempotence","per-user dismiss","notification ownership","admin-only publishing","service-only worker"]',true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.ids')::jsonb->>'community_auth','role','authenticated')::text,true);
do $$
declare ids jsonb:=current_setting('tnt.test.ids')::jsonb; matches jsonb;
begin
 if not exists(select 1 from public.tnt_my_notifications(false) n where n->>'id'=ids->>'note') then raise exception 'One person dismissal affected everyone';end if;
 if exists(select 1 from public.tnt_my_notifications(false) n where n->>'id'=ids->>'team_note') then raise exception 'Team notification exposed to community';end if;
 matches:=public.tnt_match_profile_names('TNTMatch Apel','2000-01-01');if not exists(select 1 from jsonb_array_elements(matches) x where x->>'id'=ids->>'match') then raise exception 'Prefix name matching failed';end if;
 if exists(select 1 from jsonb_array_elements(matches) x where x ? 'birthday' or x ? 'phone' or x ? 'email') then raise exception 'Name matching exposed private data';end if;
 perform set_config('tnt.test.results',(current_setting('tnt.test.results')::jsonb||'["shared notification isolation","staff audience isolation","Google name prefix match","match data minimization"]')::text,true);
end $$;
reset role;
-- An admin can preview a paused module; staff must lose access immediately.
update public.tnt_experience set config=jsonb_set(config,'{modules}',coalesce(config->'modules','{}')||'{"organizacion":{"enabled":false}}') where id;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.ids')::jsonb->>'leader_auth','role','authenticated')::text,true);
do $$ begin if public.tnt_has_access('organizacion','*','view') or public.tnt_event_can_action((current_setting('tnt.test.ids')::jsonb->>'own')::uuid,'edit_activity') then raise exception 'Paused module did not block staff';end if;perform set_config('tnt.test.results',(current_setting('tnt.test.results')::jsonb||'["paused module blocks links and actions"]')::text,true);end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.ids')::jsonb->>'admin_auth','role','authenticated')::text,true);
do $$ declare cfg jsonb;r bigint;r2 bigint;begin
 if not public.tnt_has_access('organizacion','*','view') then raise exception 'Admin preview unavailable';end if;
 select config,revision into cfg,r from public.tnt_experience where id;r2:=public.tnt_publish_experience(cfg,r);if r2<>r+1 then raise exception 'Revision not incremented';end if;
 begin perform public.tnt_publish_experience(cfg,r);raise exception 'Stale publication not rejected';exception when serialization_failure then null;end;
 perform set_config('tnt.test.results',(current_setting('tnt.test.results')::jsonb||'["admin preview","publish revision","stale draft rejected"]')::text,true);
end $$;
reset role;
-- A completed account becomes gated when one required answer is removed.
update public.tnt_profile_answers set answers=answers-'dreams' where person_id=(current_setting('tnt.test.ids')::jsonb->>'leader')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.ids')::jsonb->>'leader_auth','role','authenticated')::text,true);
do $$ begin if public.tnt_profile_is_complete() or public.tnt_has_access('chat','*','view') then raise exception 'Incomplete profile could access modules';end if;perform set_config('tnt.test.results',(current_setting('tnt.test.results')::jsonb||'["required profile enforced on server"]')::text,true);end $$;
select current_setting('tnt.test.results')::jsonb passed;
rollback;
