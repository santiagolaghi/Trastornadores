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
do $$declare ev uuid:=current_setting('tnt.test.event')::uuid;days jsonb;v_day uuid;v_task uuid;v_item uuid;v_values jsonb:='{"start_date":"2027-01-29","end_date":"2027-01-31"}';
begin
 perform public.tnt_update_event_config(ev,'{"name":"Campamento de prueba","start_date":"2027-01-29","end_date":"2027-01-31","status":"confirmed"}',
  jsonb_build_array(jsonb_build_object('id',current_setting('tnt.test.day'),'label','Viernes','date','2027-01-29'),jsonb_build_object('label','Sábado','date','2027-01-30'),jsonb_build_object('label','Domingo','date','2027-01-31')));
 if (select array_agg(label order by sort_order) from public.tnt_schedule_days where event_id=ev)<>array['Viernes','Sábado','Domingo'] then raise exception 'Days were not saved in order';end if;
 if (select count(*) from public.tnt_schedule_days where event_id=ev)<>3 then raise exception 'Missing or duplicate days';end if;
 select jsonb_agg(jsonb_build_object('id',id,'label',label||' editado','date',date) order by sort_order) into days from public.tnt_schedule_days where event_id=ev;
 perform public.tnt_update_event_config(ev,v_values||'{"name":"Campamento editado","status":"planning"}',days);
 if not exists(select 1 from public.tnt_schedule_days where event_id=ev and label='Sábado editado' and date='2027-01-30' and sort_order=1) then raise exception 'Existing day changes did not persist';end if;
 select id into v_day from public.tnt_schedule_days where event_id=ev and date='2027-01-30';
 v_item:=public.tnt_save_schedule_item(null,v_day,'{"title":"Actividad sin hora","item_type":"activity","starts_at":null}','{}'::uuid[]);
 if not exists(select 1 from public.tnt_schedule_items where id=v_item and starts_at is null) then raise exception 'An untimed program row requires a time';end if;
 v_task:=public.tnt_save_task(null,ev,'{"title":"Actividad todavía sin ubicar","task_type":"simple","planned_start":null}','{}'::uuid[]);
 if not exists(select 1 from public.tnt_tasks where id=v_task and event_id=ev and planned_start is null) then raise exception 'Untimed activity did not persist';end if;
 begin
  perform public.tnt_update_event_config(ev,v_values||'{"name":"Must not change","end_date":"2027-01-29"}',days);
  raise exception 'Out-of-range day accepted';
 exception when invalid_parameter_value then null;end;
 begin
  perform public.tnt_update_event_config(ev,v_values||'{"name":"Must not change"}',(select jsonb_agg(value) from jsonb_array_elements(days) where value->>'id'<>v_day::text));
  raise exception 'Day containing an untimed activity deleted';
 exception when invalid_parameter_value then null;end;
 if (select name from public.tnt_events where id=ev)<>'Campamento editado' then raise exception 'Failed save changed event';end if;
 -- Removing an empty day remains allowed; no activities or history are discarded.
 perform public.tnt_update_event_config(ev,v_values,(select jsonb_agg(value) from jsonb_array_elements(days) where value->>'label'<>'Domingo editado'));
 if (select count(*) from public.tnt_schedule_days where event_id=ev)<>2 then raise exception 'Empty day removal failed';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.member'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 begin perform public.tnt_update_event_config(current_setting('tnt.test.event')::uuid,'{"name":"Unauthorized"}','[]');raise exception 'Unrelated member edited event';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'event saves, day add/edit/remove, untimed activities, atomic errors and permissions passed' as verification;
