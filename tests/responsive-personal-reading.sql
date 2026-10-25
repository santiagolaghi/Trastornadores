-- Synthetic accounts only. The whole test, including notices and role defaults, rolls back.
begin;
set local lock_timeout='4s';
set local statement_timeout='20s';
do $$declare u uuid;pid uuid;n integer;begin
 for n in 1..2 loop
  u:=gen_random_uuid();insert into auth.users(id,email,raw_user_meta_data,aud,role) values(u,'responsive-'||u||'@example.invalid',jsonb_build_object('full_name','Prueba Responsive '||n),'authenticated','authenticated');
  perform public.tnt_ensure_account_for_user(u);select person_id into pid from public.tnt_accounts where auth_user_id=u;
  update public.tnt_people set first_name='Prueba',last_name='Responsive '||n,full_name='Prueba Responsive '||n,birthday='2000-01-02',phone='1112345678',sex='M',instagram='No tengo',profile_consent=true where id=pid;
  update public.tnt_accounts set system_role=case when n=1 then 'admin' else 'user' end,staff_status=case when n=1 then 'approved' else 'community' end,ministry_role=case when n=1 then 'Líder' else null end,onboarding_completed_at=now() where person_id=pid;
  insert into public.tnt_profile_private_fields(person_id,dni) values(pid,(10000000+floor(random()*89999999))::integer::text) on conflict(person_id) do update set dni=excluded.dni;
  perform public.tnt_apply_profile_answers(pid,'{"studies":"Trabajo","dreams":"Aprender","health":"Ninguna","interests":["Música"],"efe_group":"none","leadership_strengths":{"Acompañar jóvenes":50,"Acompañar adolescentes":50,"Enseñar":50,"Escuchar":50,"Organizar equipos":50,"Comunicar":50}}');
  perform set_config('tnt.responsive.uid'||n,u::text,true);perform set_config('tnt.responsive.pid'||n,pid::text,true);
 end loop;
 insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled) values(current_setting('tnt.responsive.pid1')::uuid,'efe','*','edit',true),(current_setting('tnt.responsive.pid1')::uuid,'efe','mujeres18','view',false);
 insert into public.tnt_role_permission_presets(role,module,scope,action,allowed) values('Líder','efe','*','view',true) on conflict(role,module,scope,action) do update set allowed=true;
 perform set_config('tnt.responsive.group',(select id::text from public.tnt_efe_groups where code='mujeres18'),true);
 insert into public.tnt_efe_meetings(group_id,scheduled_date,meeting_date,title) values(current_setting('tnt.responsive.group')::uuid,'2099-01-07','2099-01-07','Prueba responsive') returning id into pid;perform set_config('tnt.responsive.meeting',pid::text,true);
 insert into public.tnt_community_preferences(person_id,birthday_public) values(current_setting('tnt.responsive.pid2')::uuid,false) on conflict(person_id) do update set birthday_public=false;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.responsive.uid1'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare result jsonb;v_group uuid;begin
 if not public.tnt_profile_is_complete() then raise exception 'Synthetic admin is incomplete: %',public.tnt_profile_missing_values(public.tnt_profile_values(public.tnt_current_person_id()));end if;
 if public.tnt_has_access('efe','mujeres18') or public.tnt_can_action('efe','attendance','mujeres18') or not public.tnt_can_action('efe','attendance','varones') then raise exception 'EFE explicit denial did not override admin/role presets';end if;
 v_group:=current_setting('tnt.responsive.group')::uuid;
 begin perform public.tnt_mark_attendance('efe',public.tnt_current_person_id(),current_date,'present',v_group);raise exception 'Denied EFE attendance was written';exception when insufficient_privilege then null;end;
 begin perform public.tnt_ensure_efe_wednesdays(v_group,current_date,current_date+7);raise exception 'Denied EFE dates were generated';exception when insufficient_privilege then null;end;
 begin perform public.tnt_set_efe_membership(public.tnt_current_person_id(),v_group,true,null);raise exception 'Denied EFE membership was written';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.tnt_efe_meetings where tnt_efe_meetings.group_id=v_group) then raise exception 'Denied EFE meetings leaked through RLS';end if;
 begin perform public.tnt_update_efe_meeting(current_setting('tnt.responsive.meeting')::uuid,'2099-01-07','Cambio prohibido');raise exception 'Denied EFE meeting was updated';exception when insufficient_privilege then null;end;
 begin perform public.tnt_delete_efe_meeting(current_setting('tnt.responsive.meeting')::uuid);raise exception 'Denied EFE meeting was deleted';exception when insufficient_privilege then null;end;
 begin perform public.tnt_restore_efe_meeting(current_setting('tnt.responsive.meeting')::uuid);raise exception 'Denied EFE meeting was restored';exception when insufficient_privilege then null;end;
 result:=public.tnt_personal_action('preferences','{"favorite_version":176,"extra_versions":[1909],"shortcuts":["efe","bible"]}');
 if result#>>'{preferences,favorite_version}'<>'176' then raise exception 'Favorite not saved';end if;
 result:=public.tnt_personal_action('mark',jsonb_build_object('book','JHN','chapter',3,'verses',jsonb_build_array(16,17),'color','lime','person_id',current_setting('tnt.responsive.pid2')));
 if jsonb_array_length(result->'marks')<>2 then raise exception 'Canonical marks missing';end if;
 perform public.tnt_personal_action('read','{"day":"2099-01-01"}');perform public.tnt_personal_action('read','{}');
 if (select count(*) from public.tnt_reader_days)<>1 then raise exception 'Reading day was duplicated';end if;
 if not exists(select 1 from public.tnt_reader_days where day=tnt_actions.community_today()) then raise exception 'Reading date came from client';end if;
 result:=public.tnt_startup_context(false,false);if result#>>'{personal,favorite_version}'<>'176' then raise exception 'Startup snapshot lost private preferences';end if;
 result:=public.tnt_community_bootstrap();
 if not exists(select 1 from jsonb_array_elements(result->'birthdays') b where b->>'person_id'=current_setting('tnt.responsive.pid2') and b->>'year'='2000') then raise exception 'Birthday still depends on old opt-out';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.responsive.uid2'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare result jsonb;begin
 result:=public.tnt_personal_context('JHN',3);if jsonb_array_length(result->'marks')<>0 or result#>>'{preferences,favorite_version}'<>'128' then raise exception 'Another person''s reader state leaked';end if;
 if exists(select 1 from public.tnt_reader_marks) or exists(select 1 from public.tnt_reader_days) then raise exception 'Private reader tables leak through RLS';end if;
 begin insert into public.tnt_reader_days(person_id,day) values(current_setting('tnt.responsive.pid1')::uuid,current_date);raise exception 'Direct reader write was permitted';exception when insufficient_privilege then null;end;
 perform public.tnt_community_action('request_welcome','{}');
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.responsive.uid1'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 if not exists(select 1 from public.tnt_my_notifications(true) n where n->>'title'='Prueba Responsive 2 pidió acompañamiento' and n#>>'{data,sender_id}'=current_setting('tnt.responsive.pid2') and n->>'href' like '%person='||current_setting('tnt.responsive.pid2')) then raise exception 'Accompaniment notification lacks identity';end if;
end $$;
reset role;
rollback;
select 'PASS: scoped EFE denial, RPC/RLS, own marks/favorite/shortcuts, server-day streak, one startup snapshot, birthdays and identifying notifications; all rolled back' verification;
