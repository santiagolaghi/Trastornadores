-- Exercise the real RPC as authenticated users. All identities and content roll back.
begin;
do $$declare u uuid;p uuid;ev uuid:=gen_random_uuid();d uuid:=gen_random_uuid();n integer;
begin
 for n in 1..2 loop
  u:=gen_random_uuid();
  insert into auth.users(id,email,raw_user_meta_data,aud,role) values(u,'tnt-event-save-'||u||'@example.invalid','{"full_name":"TNT Prueba"}','authenticated','authenticated');
  perform public.tnt_ensure_account_for_user(u);
  select person_id into p from public.tnt_accounts where auth_user_id=u;
  update public.tnt_people set first_name='TNT',last_name='Prueba',full_name='TNT Prueba',birthday='2000-01-01',phone='1112345678',sex='M',instagram='No tengo',profile_consent=true where id=p;
  update public.tnt_accounts set ministry_role='Colaborador',staff_status='approved',onboarding_completed_at=now(),system_role=case when n=1 then 'admin' else 'user' end where person_id=p;
  perform public.tnt_apply_profile_answers(p,'{"studies":"Trabajo","dreams":"Aprender","health":"Ninguna","interests":["Música"],"efe_group":"none","leadership_strengths":{"Acompañar jóvenes":50,"Acompañar adolescentes":50,"Enseñar":50,"Escuchar":50,"Organizar equipos":50,"Comunicar":50}}');
  insert into public.tnt_profile_private_fields(person_id,dni) values(p,'12345678') on conflict(person_id) do update set dni=excluded.dni;
  if n=1 then
   perform set_config('tnt.test.admin',u::text,true);
   insert into public.tnt_events(id,name,kind,start_date,end_date,created_by) values(ev,'Prueba guardado','event','2027-01-29','2027-01-31',p);
   insert into public.tnt_schedule_days(id,event_id,label,date,sort_order) values(d,ev,'29/01','2027-01-29',0);
  else perform set_config('tnt.test.member',u::text,true);end if;
 end loop;
 perform set_config('tnt.test.event',ev::text,true);perform set_config('tnt.test.day',d::text,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare ev uuid:=current_setting('tnt.test.event')::uuid;fri uuid;sat uuid;v_day uuid;v_item uuid;logistics uuid;p uuid;v jsonb;
begin
 fri:=public.tnt_save_task(null,ev,'{"title":"Prédica","task_type":"complex","planned_start":"2027-01-29T21:00:00-03:00","is_featured":true,"feature_color":"peach"}','{}'::uuid[]);
 sat:=public.tnt_save_task(null,ev,'{"title":"Prédica","task_type":"complex","planned_start":"2027-01-30T21:00:00-03:00","is_featured":false,"feature_color":"blue"}','{}'::uuid[]);
 if not exists(select 1 from public.tnt_tasks where id=fri and is_featured and feature_color='peach') or not exists(select 1 from public.tnt_tasks where id=sat and not is_featured) then raise exception 'Highlights leaked between occurrences';end if;
 -- Older clients and edits unrelated to highlights must preserve the chosen color/state.
 perform public.tnt_save_task(fri,ev,'{"title":"Prédica del viernes","task_type":"complex","planned_start":"2027-01-29T21:00:00-03:00"}','{}'::uuid[]);
 if not exists(select 1 from public.tnt_tasks where id=fri and is_featured and feature_color='peach') then raise exception 'Legacy edit reset highlight';end if;
 select to_jsonb(t) into v from public.tnt_tasks t where id=fri;
 perform public.tnt_save_task(fri,ev,v||'{"is_featured":false}','{}'::uuid[]);
 if exists(select 1 from public.tnt_tasks where id=fri and is_featured) then raise exception 'Highlight cannot be removed';end if;
 begin perform public.tnt_save_task(fri,ev,v||'{"feature_color":"invalid"}','{}'::uuid[]);raise exception 'Invalid color accepted';exception when check_violation then null;end;
 if (select feature_color from public.tnt_tasks where id=fri)<>'peach' then raise exception 'Failed color save was not atomic';end if;
 select id into v_day from public.tnt_schedule_days where event_id=ev and date='2027-01-29' order by sort_order limit 1;
 v_item:=public.tnt_save_schedule_item(null,v_day,'{"title":"Fogón","item_type":"activity","task_type":"complex","starts_at":"22:00","is_featured":true,"feature_color":"lilac"}','{}'::uuid[]);
 if not exists(select 1 from public.tnt_schedule_items i join public.tnt_tasks t on t.id=i.task_id where i.id=v_item and t.is_featured and t.feature_color='lilac' and t.task_type='complex') then raise exception 'Program editor did not persist presentation on its activity';end if;
 select person_id into p from public.tnt_accounts where auth_user_id=current_setting('tnt.test.member')::uuid;
 logistics:=public.tnt_save_task(null,ev,'{"title":"Recepción","task_type":"logistics","planned_start":"2027-01-29T08:00:00-03:00","is_featured":true,"feature_color":"blue"}',array[p]);
 if not exists(select 1 from public.tnt_schedule_items where task_id=logistics and starts_at='08:00') then raise exception 'Timed area has no program entry';end if;
 perform set_config('tnt.test.area',logistics::text,true);
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.member'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare area uuid:=current_setting('tnt.test.area')::uuid;v jsonb;
begin
 select to_jsonb(t) into v from public.tnt_tasks t where id=area;
 begin perform public.tnt_save_task(area,current_setting('tnt.test.event')::uuid,v||'{"is_featured":false}',array[public.tnt_current_person_id()]);raise exception 'Member changed highlighting without edit permission';exception when insufficient_privilege then null;end;
 insert into public.tnt_task_comments(task_id,person_id,body,kind) values(area,public.tnt_current_person_id(),'Consulta sintética del equipo','question');
 if not exists(select 1 from public.tnt_task_comments where task_id=area and body='Consulta sintética del equipo') then raise exception 'Responsible person cannot write to their area';end if;
end $$;
reset role;
rollback;
select 'per-occurrence highlights, optional metadata, validated colors, timed areas and team conversation permissions passed' as verification;
