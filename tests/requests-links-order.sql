-- Synthetic accounts and records only. Nothing, including queued push, is committed.
begin;
do $$declare u uuid;pid uuid;tag text;begin
 foreach tag in array array['admin','google','guest'] loop
  u:=gen_random_uuid();perform set_config('tnt.oct16.'||tag,u::text,true);
  insert into auth.users(id,email,raw_user_meta_data,aud,role)
  values(u,'oct16-'||u||'@example.invalid',jsonb_build_object('full_name','Cuenta '||tag,'avatar_url','https://example.invalid/google.jpg'),'authenticated','authenticated');
  perform public.tnt_ensure_account_for_user(u);
  select person_id into pid from public.tnt_accounts where auth_user_id=u;
  perform set_config('tnt.oct16.'||tag||'_pid',pid::text,true);
  update public.tnt_people set first_name='Cuenta',last_name=tag,full_name='Cuenta '||tag,birthday='2000-01-01',sex='F',phone='1112345678',instagram='No tengo',profile_consent=true where id=pid;
  insert into public.tnt_profile_private_fields(person_id,dni) values(pid,'12345678') on conflict(person_id) do update set dni=excluded.dni;
  perform public.tnt_apply_profile_answers(pid,'{"health":"Ninguna","dreams":"Aprender","studies":"Trabajo","interests":["Música"],"efe_group":"none"}');
  update public.tnt_accounts set onboarding_completed_at=now(),system_role=case when tag='admin' then 'admin' else 'user' end,
   staff_status=case when tag in('admin','google') then 'approved' else 'community' end,
   ministry_role=case when tag in('admin','google') then 'Colaborador' end where person_id=pid;
 end loop;
end $$;
-- A second login updates the same account and cannot announce a second signup.
select public.tnt_ensure_account_for_user(current_setting('tnt.oct16.google')::uuid);
do $$declare source uuid:=current_setting('tnt.oct16.google_pid')::uuid;admin uuid:=current_setting('tnt.oct16.admin_pid')::uuid;request uuid;begin
 if (select count(*) from public.tnt_notifications where person_id=admin and data->>'kind'='account_created' and data->>'actor_person_id'=source::text)<>1 then raise exception 'Signup notice missing or duplicated';end if;
 if not exists(select 1 from public.tnt_notifications where person_id=admin and title='Cuenta google creó su cuenta') then raise exception 'Signup notice does not name the person';end if;
 insert into public.tnt_role_requests(person_id,requested_role) values(source,'Líder') returning id into request;
 if not exists(select 1 from public.tnt_notifications where person_id=admin and data->>'request_id'=request::text and title='Cuenta google solicitó ser Líder') then raise exception 'Staff notice is generic';end if;
 insert into public.tnt_access_requests(person_id,module,requested_level) values(source,'buffet','edit') returning id into request;
 if not exists(select 1 from public.tnt_notifications where person_id=admin and data->>'request_id'=request::text and title='Cuenta google pidió acceso a Buffet' and body like '%editar%') then raise exception 'Access notice is generic';end if;
 insert into public.tnt_profile_change_requests(person_id,before_values,proposed_values) values(source,'{"phone":"1112345678"}','{"phone":"1199999999"}') returning id into request;
 if not exists(select 1 from public.tnt_notifications where person_id=admin and data->>'request_id'=request::text and body like '%WhatsApp%' and body not like '%1199999999%') then raise exception 'Profile notice lacks context or leaks private values';end if;
end $$;
do $$declare source uuid:=current_setting('tnt.oct16.google_pid')::uuid;target uuid:=gen_random_uuid();request uuid;begin
 insert into public.tnt_people(id,full_name,normalized_name,first_name,last_name,birthday,sex,phone,instagram,active)
 values(target,'Perfil Histórico','perfil historico','Perfil','Histórico','1990-01-01','F','1199999999','viejo',true);
 insert into public.tnt_profile_answers(person_id,answers) values(target,'{"health":"Anterior","studies":"Anterior","dreams":"Anterior","interests":["Leer"]}');
 insert into public.tnt_profile_private_fields(person_id,dni) values(target,'87654321');
 insert into public.tnt_saturday_attendance(person_id,saturday_date,status) values(target,'2020-01-04','present'),(source,'2020-01-11','present');
 insert into public.tnt_access_grants(person_id,module,scope,enabled,access_level) values(source,'buffet','*',true,'edit'),(target,'organizacion','*',true,'manage');
 insert into public.tnt_profile_link_requests(person_id,target_person_id) values(source,target) returning id into request;
 perform set_config('tnt.oct16.target',target::text,true);perform set_config('tnt.oct16.link',request::text,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.oct16.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare request uuid:=current_setting('tnt.oct16.link')::uuid;preview jsonb;begin
 preview:=public.tnt_profile_link_preview(request);
 -- A stale target choice cannot override the new account-priority rule.
 perform public.tnt_resolve_profile_link(request,true,'{"first_name":"target","studies":"target"}',preview->>'revision');
end $$;
reset role;
do $$declare target uuid:=current_setting('tnt.oct16.target')::uuid;begin
 if not exists(select 1 from public.tnt_people where id=target and first_name='Cuenta' and last_name='google' and birthday='2000-01-01' and phone='1112345678') then raise exception 'Google data did not win';end if;
 if not exists(select 1 from public.tnt_profile_answers where person_id=target and answers->>'studies'='Trabajo' and not (answers ? 'leadership_strengths')) then raise exception 'Answers were lost or null leadership was introduced';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=target and auth_user_id=current_setting('tnt.oct16.google')::uuid and avatar_url='https://example.invalid/google.jpg' and ministry_role='Colaborador') then raise exception 'Google account or portrait changed';end if;
 if (select count(*) from public.tnt_saturday_attendance where person_id=target)<>2 then raise exception 'History lost';end if;
 if not exists(select 1 from public.tnt_access_grants where person_id=target and module='buffet' and enabled and access_level='edit') then raise exception 'Google permissions lost';end if;
 if exists(select 1 from public.tnt_access_grants where person_id=target and module='organizacion' and enabled) then raise exception 'Historical permissions were inherited';end if;
end $$;
-- A complete synthetic administrator creates a four-part service program.
select set_config('request.jwt.claims','{}',true);
do $$declare event uuid:=gen_random_uuid();day uuid:=gen_random_uuid();task uuid;item uuid;title text;clock time;duration integer;position integer:=0;begin
 insert into public.tnt_events(id,name,kind,start_date,end_date) values(event,'Programa temporal','event','2031-10-18','2031-10-18');
 insert into public.tnt_schedule_days(id,event_id,label,date) values(day,event,'Programa','2031-10-18');
 for title,clock,duration in select * from (values('Reflexión','19:20'::time,5),('Ofrenda','19:25'::time,5),('Canciones',null::time,15),('Adoración','19:12'::time,8)) x(t,c,d) loop
  task:=gen_random_uuid();item:=gen_random_uuid();perform set_config('tnt.oct16.item'||position,item::text,true);
  insert into public.tnt_tasks(id,event_id,title,planned_start,duration_minutes,sort_order) values(task,event,title,('2031-10-18'::date+clock) at time zone 'America/Argentina/Buenos_Aires',duration,position);
  insert into public.tnt_schedule_items(id,day_id,task_id,title,starts_at,duration_minutes,sort_order) values(item,day,task,title,clock,duration,position);position:=position+1;
 end loop;
 perform set_config('tnt.oct16.day',day::text,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.oct16.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare day uuid:=current_setting('tnt.oct16.day')::uuid;before jsonb;ids uuid[];result jsonb;begin
 select jsonb_agg(jsonb_build_object('id',id,'starts_at',starts_at,'duration_minutes',duration_minutes,'sort_order',sort_order,'task_id',task_id)) into before from public.tnt_schedule_items where day_id=day;
 ids:=array[current_setting('tnt.oct16.item3')::uuid,current_setting('tnt.oct16.item2')::uuid,current_setting('tnt.oct16.item0')::uuid,current_setting('tnt.oct16.item1')::uuid];
 result:=public.tnt_reorder_schedule(day,ids,before);
 if (select starts_at from public.tnt_schedule_items where id=ids[2]) is not null or (select starts_at from public.tnt_schedule_items where id=ids[3])<>'19:20'::time then raise exception 'Reorder rewrote an existing time';end if;
 if not exists(select 1 from public.tnt_tasks t join public.tnt_schedule_items i on i.task_id=t.id where i.id=ids[3] and t.planned_start='2031-10-18 22:20+00'::timestamptz) then raise exception 'Task timestamp changed during reorder';end if;
 begin perform public.tnt_reorder_schedule(day,ids,before);raise exception 'Stale snapshot accepted';exception when raise_exception then if sqlerrm not like 'Otra persona cambió%' then raise;end if;end;
 begin perform public.tnt_reorder_schedule(day,array[ids[1],ids[1],ids[3],ids[4]],before);raise exception 'Duplicate ids accepted';exception when raise_exception then if sqlerrm not like 'La lista cambió%' then raise;end if;end;
 select jsonb_agg(jsonb_build_object('id',id,'starts_at',starts_at,'duration_minutes',duration_minutes,'sort_order',sort_order,'task_id',task_id)) into before from public.tnt_schedule_items where day_id=day;
 begin perform public.tnt_reorder_program(day,array[ids[4],ids[2],ids[3],ids[1]],before);raise exception 'Inverted times accepted';exception when raise_exception then if sqlerrm not like 'No podés ubicar%' then raise;end if;end;
 perform set_config('tnt.oct16.before',before::text,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.oct16.guest'),'role','authenticated')::text,true);
do $$begin
 begin perform public.tnt_reorder_schedule(current_setting('tnt.oct16.day')::uuid,'{}','[]');raise exception 'Guest reordered a service';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- New visible questions, even optional in old settings, must be answered next time.
select set_config('request.jwt.claims','{}',true);
update public.tnt_settings set value=value||'{"mandatory_test":{"label":"Pregunta temporal","type":"text","visible":true,"required":false}}' where key='profile_fields';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.oct16.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 if public.tnt_profile_is_complete() or public.tnt_has_access('organizacion','*','view') then raise exception 'Incomplete administrator was allowed into a module';end if;
 if not exists(select 1 from jsonb_array_elements(public.tnt_profile_context()->'missing') x where x->>'key'='mandatory_test') then raise exception 'Missing question not shown on next entry';end if;
 perform public.tnt_complete_profile('{"mandatory_test":"Respuesta"}');
 if not public.tnt_profile_is_complete() then raise exception 'Completing mandatory data did not restore access';end if;
end $$;
reset role;
select 'specific notices, signup deduplication, automatic Google priority, null skills, history and permissions, atomic order and timestamps, stale-write rejection, permissions and mandatory re-entry' as passed;
rollback;
