-- Run after the TNT migrations. Only synthetic identities; every row and push is rolled back.
begin;
do $$declare u uuid:=gen_random_uuid();v_source uuid;v_target uuid:=gen_random_uuid();v_holder uuid:=gen_random_uuid();v_event uuid:=gen_random_uuid();v_task uuid:=gen_random_uuid();v_label text:='Prueba Continuacion '||replace(gen_random_uuid()::text,'-','');begin
 insert into auth.users(id,email,raw_user_meta_data,aud,role) values(u,'tnt-test-'||u||'@example.invalid',jsonb_build_object('full_name',v_label),'authenticated','authenticated');
 perform public.tnt_ensure_account_for_user(u);
 select person_id into v_source from public.tnt_accounts where auth_user_id=u;
 update public.tnt_people set first_name='Prueba',last_name=substr(v_label,8),full_name=v_label,birthday='2000-03-04',phone='1112345678',sex='F',instagram='No tengo',profile_consent=true where id=v_source;
 update public.tnt_accounts set ministry_role='Colaborador',staff_status='approved',onboarding_completed_at=now(),avatar_url='https://example.invalid/google.jpg' where person_id=v_source;
 perform public.tnt_apply_profile_answers(v_source,'{"studies":"Trabajo","dreams":"Aprender","health":"Ninguna","interests":["Música"],"efe_group":"none","leadership_strengths":{"Acompañar jóvenes":50,"Acompañar adolescentes":50,"Enseñar":50,"Escuchar":50,"Organizar equipos":50,"Comunicar":50}}');
 insert into public.tnt_profile_private_fields(person_id,dni) values(v_source,'12345678') on conflict(person_id) do update set dni=excluded.dni;
 insert into public.tnt_people(id,full_name,normalized_name,first_name,last_name,birthday,phone,sex,active) values(v_target,v_label,lower(v_label),'Prueba',substr(v_label,8),'2000-03-04','1112345678','F',true);
 insert into public.tnt_people(id,full_name,normalized_name) values(v_holder,'Cuenta auxiliar sintética','cuenta auxiliar sintetica');
 insert into public.tnt_accounts(person_id,ministry_role,staff_status) values(v_target,'Líder','approved');
 insert into public.tnt_profile_answers(person_id,answers) values(v_target,'{"health":"Historial de salud","studies":"Anterior","dreams":"Anterior","interests":["Leer"]}');
 insert into public.tnt_saturday_attendance(person_id,saturday_date,status) values(v_source,'2020-01-04','present'),(v_target,'2020-01-04','absent'),(v_target,'2020-01-11','present');
 insert into public.tnt_events(id,name,kind,start_date,end_date) values(v_event,'Encuentro sintético','event','2031-10-18','2031-10-18');
 insert into public.tnt_tasks(id,event_id,title) values(v_task,v_event,'Actividad sintética');
 insert into public.tnt_task_assignees(task_id,person_id) values(v_task,v_source),(v_task,v_target);
 insert into public.tnt_event_members(event_id,person_id,event_role) values(v_event,v_source,'participant'),(v_event,v_target,'organizer');
 insert into public.tnt_access_grants(person_id,module,scope,access_level) values(v_source,'buffet','*','edit'),(v_target,'campamento','*','manage');
 update public.tnt_accounts set person_id=v_holder where person_id=v_target;
 perform set_config('tnt.test.uid',u::text,true);perform set_config('tnt.test.v_source',v_source::text,true);perform set_config('tnt.test.v_target',v_target::text,true);perform set_config('tnt.test.v_task',v_task::text,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare result jsonb;begin
 begin perform tnt_actions.link_verified_profile(current_setting('tnt.test.v_source')::uuid,current_setting('tnt.test.v_target')::uuid);raise exception 'Unverified direct transfer was allowed';exception when insufficient_privilege then null;end;
 result:=public.tnt_continue_profile(current_setting('tnt.test.v_target')::uuid,'{"birthday":"1999-01-01","phone":"0000000000"}',true);
 if result->>'linked' is distinct from 'false' then raise exception 'Wrong proof was accepted';end if;
 result:=public.tnt_continue_profile(null,'{}',false);
 if result->>'linked'<>'true' or result->>'person_id'<>current_setting('tnt.test.v_target') then raise exception 'Verified identity was not continued';end if;
 if not public.tnt_has_access('organizacion','*','view') then raise exception 'Staff cannot read Organization';end if;
end $$;
reset role;
do $$declare v_source uuid:=current_setting('tnt.test.v_source')::uuid;v_target uuid:=current_setting('tnt.test.v_target')::uuid;begin
 if not exists(select 1 from public.tnt_accounts where person_id=v_target and auth_user_id=current_setting('tnt.test.uid')::uuid and avatar_url='https://example.invalid/google.jpg' and ministry_role='Colaborador') then raise exception 'Google identity or role was lost';end if;
 if exists(select 1 from public.tnt_accounts where person_id=v_source) or exists(select 1 from public.tnt_people where id=v_source and active) then raise exception 'A duplicate active profile remains';end if;
 if (select count(*) from public.tnt_saturday_attendance where person_id=v_target)<>2 or not exists(select 1 from public.tnt_saturday_attendance where person_id=v_target and saturday_date='2020-01-04' and status='present') then raise exception 'Overlapping attendance was lost';end if;
 if not exists(select 1 from public.tnt_task_assignees where task_id=current_setting('tnt.test.v_task')::uuid and person_id=v_target and assignment_status='accepted') then raise exception 'Assignment was not consolidated';end if;
 if not exists(select 1 from public.tnt_event_members where person_id=v_target and event_role='organizer') then raise exception 'Coordination history was lost';end if;
 if exists(select 1 from public.tnt_access_grants where person_id=v_target and module='campamento' and enabled) then raise exception 'Manual profile permissions escalated the Google account';end if;
 if not exists(select 1 from public.tnt_access_grants where person_id=v_target and module='buffet' and access_level='edit') then raise exception 'Google permissions were lost';end if;
 if exists(select 1 from tnt_actions.profile_claims where auth_user_id=current_setting('tnt.test.uid')::uuid and transaction_id=txid_current()) then raise exception 'Verification capability was not revoked';end if;
 if not exists(select 1 from public.tnt_audit_log where entity_id=v_target and action='profile_link_approved' and details ? 'references_before') then raise exception 'Transfer audit was not retained';end if;
end $$;
rollback;

select 'profile continuation, identity proof, history and permission checks passed' as verification;
