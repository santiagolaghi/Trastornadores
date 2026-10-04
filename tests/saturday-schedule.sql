-- All accounts, activities, permissions and rows here are synthetic and rolled back.
begin;
select set_config('tnt.schedule_admin',gen_random_uuid()::text,true);
select set_config('tnt.schedule_editor',gen_random_uuid()::text,true);
select set_config('tnt.schedule_guest',gen_random_uuid()::text,true);
select set_config('tnt.schedule_incomplete',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,aud,role)
select uid::uuid,'schedule-'||uid||'@example.invalid',jsonb_build_object('full_name','Agenda '||uid),'authenticated','authenticated'
from unnest(array[current_setting('tnt.schedule_admin'),current_setting('tnt.schedule_editor'),current_setting('tnt.schedule_guest'),current_setting('tnt.schedule_incomplete')]) uid;
do $$ declare uid text;begin
 foreach uid in array array[current_setting('tnt.schedule_admin'),current_setting('tnt.schedule_editor'),current_setting('tnt.schedule_guest'),current_setting('tnt.schedule_incomplete')] loop
  perform public.tnt_ensure_account_for_user(uid::uuid);
 end loop;
end $$;
update public.tnt_accounts set system_role='admin' where auth_user_id in(current_setting('tnt.schedule_admin')::uuid,current_setting('tnt.schedule_incomplete')::uuid);
update public.tnt_accounts set staff_status='approved',ministry_role='Colaborador' where auth_user_id in(current_setting('tnt.schedule_admin')::uuid,current_setting('tnt.schedule_editor')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.schedule_admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding(jsonb_build_object('first_name','Agenda','last_name',current_setting('tnt.schedule_admin'),'birthday','2000-01-01','sex','F','phone','1112345678','instagram','No tengo','dni','87654321','interests',jsonb_build_array('Música'),'studies','Trabajo','dreams','Compartir','efe_group','none'),true,'Colaborador');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.schedule_editor'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding(jsonb_build_object('first_name','Agenda','last_name',current_setting('tnt.schedule_editor'),'birthday','2000-01-01','sex','M','phone','1112345678','instagram','No tengo','dni','12345678','interests',jsonb_build_array('Dibujar'),'studies','Trabajo','dreams','Compartir','efe_group','none'),true,'Colaborador');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.schedule_guest'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding(jsonb_build_object('first_name','Agenda','last_name',current_setting('tnt.schedule_guest'),'birthday','2000-01-01','sex','M','phone','1112345678','instagram','No tengo','dni','11223344','interests',jsonb_build_array('Cantar'),'studies','Trabajo','dreams','Compartir','efe_group','none'),false,null);
reset role;
select set_config('tnt.schedule_editor_pid',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.schedule_editor')::uuid),true);
select set_config('tnt.schedule_guest_pid',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.schedule_guest')::uuid),true);
insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled) values(current_setting('tnt.schedule_editor_pid')::uuid,'organizacion','*','view',true);
insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed)
values(current_setting('tnt.schedule_editor_pid')::uuid,'organizacion','*','view',true),
(current_setting('tnt.schedule_editor_pid')::uuid,'organizacion','*','create_activity',true),
(current_setting('tnt.schedule_editor_pid')::uuid,'organizacion','*','edit_event',false),
(current_setting('tnt.schedule_editor_pid')::uuid,'organizacion','*','assign_people',false);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.schedule_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare day date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date+36500;
 ids uuid[];again uuid[];request uuid:=gen_random_uuid();event uuid;other_event uuid;standalone uuid;crosslink uuid;task uuid;count_before integer;payload jsonb;
begin
 day:=day+((6-extract(dow from day)::integer+7)%7);
 while exists(select 1 from public.tnt_events where kind='saturday' and start_date in(day,day+7)) loop day:=day+14;end loop;
 event:=public.tnt_create_saturday(day,'Agenda temporal');other_event:=public.tnt_create_saturday(day+7,'Otro sábado temporal');
 perform set_config('tnt.schedule_event',event::text,true);perform set_config('tnt.schedule_other',other_event::text,true);perform set_config('tnt.schedule_date',day::text,true);
 payload:=jsonb_build_array(jsonb_build_object('title','Bienvenida temporal','time','18:30','person_id',public.tnt_current_person_id()),jsonb_build_object('title','Música temporal','time','18:45','person_id',null));
 ids:=public.tnt_save_quick_schedule(event,day,payload,request);again:=public.tnt_save_quick_schedule(event,day,payload,request);
 if cardinality(ids)<>2 or again is distinct from ids or (select count(*) from public.tnt_tasks where event_id=event)<>2 then raise exception 'El reintento duplicó actividades';end if;
 if (select planned_start from public.tnt_tasks where id=ids[1]) is distinct from (day+time '18:30') at time zone 'America/Argentina/Buenos_Aires' then raise exception 'Hora de Buenos Aires incorrecta';end if;
 if not exists(select 1 from public.tnt_schedule_items where task_id=ids[1] and starts_at='18:30'::time) then raise exception 'El cronograma no refleja la actividad';end if;
 if not exists(select 1 from public.tnt_schedule_responsibles r join public.tnt_schedule_items i on i.id=r.item_id where i.task_id=ids[1] and r.person_id=public.tnt_current_person_id()) then raise exception 'Falta el responsable en el cronograma';end if;
 begin perform public.tnt_save_quick_schedule(event,day,'[{"title":"Otra","time":"19:00"}]',request);raise exception 'Se aceptó un reintento distinto';exception when raise_exception then if sqlerrm='Se aceptó un reintento distinto' then raise;end if;end;
 count_before:=(select count(*) from public.tnt_tasks where event_id=event);request:=gen_random_uuid();
 begin perform public.tnt_save_quick_schedule(event,day,'[{"title":"Fila válida","time":"19:00"},{"title":"Hora inválida","time":"25:00"}]',request);raise exception 'Se aceptó una hora inválida';exception when raise_exception then if sqlerrm='Se aceptó una hora inválida' then raise;end if;end;
 if (select count(*) from public.tnt_tasks where event_id=event)<>count_before then raise exception 'Un lote fallido dejó actividades parciales';end if;
 begin perform public.tnt_save_quick_schedule(event,day+1,payload,gen_random_uuid());raise exception 'Se aceptó un día distinto del sábado';exception when raise_exception then if sqlerrm='Se aceptó un día distinto del sábado' then raise;end if;end;
 begin perform public.tnt_save_quick_schedule(event,day,jsonb_build_array(jsonb_build_object('title','Invitado','time','19:00','person_id',current_setting('tnt.schedule_guest_pid'))),gen_random_uuid());raise exception 'Se asignó un asistente sin staff';exception when raise_exception then if sqlerrm='Se asignó un asistente sin staff' then raise;end if;end;
 insert into public.tnt_schedule_items(day_id,title,task_id) select id,'Fila manual',null from public.tnt_schedule_days where event_id=other_event returning id into standalone;
 insert into public.tnt_schedule_items(day_id,title,task_id) select id,'Vínculo en otro día',ids[1] from public.tnt_schedule_days where event_id=other_event returning id into crosslink;
 -- Direct task deletion must cascade too, even if a caller bypasses the activity RPC.
 delete from public.tnt_tasks where id=ids[1];
 if exists(select 1 from public.tnt_schedule_items where task_id=ids[1] or id=crosslink) then raise exception 'Quedó una actividad vinculada tras eliminar la tarea';end if;
 if not exists(select 1 from public.tnt_schedule_items where id=standalone and task_id is null) then raise exception 'Se borró una fila independiente';end if;
 task:=public.tnt_save_task(null,event,jsonb_build_object('title','Actividad con subtarea','task_type','simple','planned_start',(day+time '19:00') at time zone 'America/Argentina/Buenos_Aires'),'{}');
 perform public.tnt_save_task(null,event,jsonb_build_object('title','Subtarea temporal','task_type','simple','parent_task_id',task,'planned_start',(day+time '19:10') at time zone 'America/Argentina/Buenos_Aires'),'{}');
 perform public.tnt_delete_activity(task);
 if exists(select 1 from public.tnt_tasks where id=task or parent_task_id=task) or exists(select 1 from public.tnt_schedule_items where title in('Actividad con subtarea','Subtarea temporal')) then raise exception 'El borrado dejó subtareas o cronograma';end if;
end $$;
reset role;
-- A failed batch leaves no receipt, and receipts cannot be read outside their RPC.
do $$ begin
 if (select count(*) from public.tnt_quick_schedule_requests where event_id=current_setting('tnt.schedule_event')::uuid)<>1 then raise exception 'Un lote fallido guardó un recibo';end if;
 if has_table_privilege('anon','public.tnt_quick_schedule_requests','select') or has_table_privilege('authenticated','public.tnt_quick_schedule_requests','select') then raise exception 'Los recibos tienen lectura directa';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.schedule_incomplete'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.tnt_save_quick_schedule(current_setting('tnt.schedule_event')::uuid,current_setting('tnt.schedule_date')::date,'[{"title":"No permitido","time":"19:00"}]',gen_random_uuid());raise exception 'El perfil incompleto creó actividades';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.schedule_editor'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.tnt_save_quick_schedule(current_setting('tnt.schedule_event')::uuid,current_setting('tnt.schedule_date')::date,jsonb_build_array(jsonb_build_object('title','Sin permiso de asignación','time','19:30','person_id',public.tnt_current_person_id())),gen_random_uuid());raise exception 'Se asignó sin permiso';exception when insufficient_privilege then null;end;
 perform public.tnt_save_quick_schedule(current_setting('tnt.schedule_event')::uuid,current_setting('tnt.schedule_date')::date,'[{"title":"Sin asignar temporal","time":"19:30"}]',gen_random_uuid());
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.schedule_guest'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.tnt_save_quick_schedule(current_setting('tnt.schedule_event')::uuid,current_setting('tnt.schedule_date')::date,'[{"title":"Comunidad sin permiso","time":"19:00"}]',gen_random_uuid());raise exception 'La comunidad creó actividades';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.schedule_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare event uuid:=current_setting('tnt.schedule_event')::uuid;day date:=current_setting('tnt.schedule_date')::date;begin
 update public.tnt_events set status='cancelled' where id=event;
 begin perform public.tnt_save_quick_schedule(event,day,'[{"title":"Sábado cancelado","time":"19:00"}]',gen_random_uuid());raise exception 'Se creó en un sábado cancelado';exception when raise_exception then if sqlerrm='Se creó en un sábado cancelado' then raise;end if;end;
 update public.tnt_events set status='planning' where id=event;
end $$;
reset role;
insert into public.tnt_chat_threads(title,thread_type,event_id,created_by) values('Chat temporal','event',current_setting('tnt.schedule_event')::uuid,public.tnt_current_person_id());
insert into public.tnt_checkins(event_id,person_id) values(current_setting('tnt.schedule_event')::uuid,public.tnt_current_person_id());
insert into public.tnt_notifications(person_id,event_id,title,href) values(public.tnt_current_person_id(),current_setting('tnt.schedule_event')::uuid,'Aviso temporal','/organizacion/?event='||current_setting('tnt.schedule_event'));
set local role authenticated;
do $$ declare event uuid:=current_setting('tnt.schedule_event')::uuid;begin
 perform public.tnt_delete_event(event);
 if exists(select 1 from public.tnt_events where id=event) or exists(select 1 from public.tnt_tasks where event_id=event) or exists(select 1 from public.tnt_schedule_days where event_id=event) or exists(select 1 from public.tnt_chat_threads where event_id=event) or exists(select 1 from public.tnt_checkins where event_id=event) or exists(select 1 from public.tnt_notifications where event_id=event) then raise exception 'Quedaron datos del sábado eliminado';end if;
 if not exists(select 1 from public.tnt_schedule_items where title='Fila manual' and day_id in(select id from public.tnt_schedule_days where event_id=current_setting('tnt.schedule_other')::uuid)) then raise exception 'El borrado afectó otro sábado';end if;
end $$;
reset role;
do $$ begin if exists(select 1 from public.tnt_quick_schedule_requests where event_id=current_setting('tnt.schedule_event')::uuid) then raise exception 'Quedaron recibos de un sábado eliminado';end if;end $$;
select 'OK: cronograma atómico, reintentos, permisos, hora argentina y borrados completos' as result;
rollback;
