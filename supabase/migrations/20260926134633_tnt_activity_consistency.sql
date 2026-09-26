-- Keep one activity and one team across tasks, schedules and contextual chat.
create or replace function public.tnt_save_task(p_id uuid,p_event uuid,p_values jsonb,p_people uuid[])
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_parent uuid; v_start timestamptz; v_date date; v_day uuid; v_event public.tnt_events;
begin
 select * into v_event from public.tnt_events where id=p_event;
 if v_event.id is null or not public.tnt_can_manage_event(p_event) then raise exception 'No tenés permiso para editar esta tarea.' using errcode='42501'; end if;
 if nullif(trim(p_values->>'title'),'') is null then raise exception 'La tarea necesita un nombre.'; end if;
 if p_id is not null and not exists(select 1 from public.tnt_tasks where id=p_id and event_id=p_event) then raise exception 'La tarea cambió. Volvé a abrirla.'; end if;
 v_parent:=nullif(p_values->>'parent_task_id','')::uuid;
 if v_parent is not null and (v_parent=p_id or not exists(select 1 from public.tnt_tasks where id=v_parent and event_id=p_event)) then raise exception 'La tarea principal no es válida.'; end if;
 if p_id is not null and v_parent is not null and exists(with recursive descendants as(select id from public.tnt_tasks where parent_task_id=p_id union all select t.id from public.tnt_tasks t join descendants d on t.parent_task_id=d.id) select 1 from descendants where id=v_parent) then raise exception 'Una tarea no puede depender de su propia subtarea.'; end if;
 v_id:=coalesce(p_id,gen_random_uuid());v_start:=nullif(p_values->>'planned_start','')::timestamptz;v_date:=(v_start at time zone 'America/Argentina/Buenos_Aires')::date;
 if v_date is not null and (v_date<v_event.start_date or v_date>v_event.end_date) then raise exception 'El horario de la actividad debe estar dentro de las fechas del evento.'; end if;
 insert into public.tnt_tasks(id,event_id,parent_task_id,title,task_type,priority,description,materials,due_at,planned_start,duration_minutes,budget_estimated,sort_order,created_by)
 values(v_id,p_event,v_parent,trim(p_values->>'title'),coalesce(p_values->>'task_type','simple'),coalesce(p_values->>'priority','medium'),p_values->>'description',p_values->>'materials',nullif(p_values->>'due_at','')::timestamptz,v_start,(p_values->>'duration_minutes')::int,(p_values->>'budget_estimated')::numeric,coalesce((p_values->>'sort_order')::int,0),public.tnt_current_person_id())
 on conflict(id) do update set parent_task_id=excluded.parent_task_id,title=excluded.title,task_type=excluded.task_type,priority=excluded.priority,description=excluded.description,materials=excluded.materials,due_at=excluded.due_at,planned_start=excluded.planned_start,duration_minutes=excluded.duration_minutes,budget_estimated=excluded.budget_estimated;
 delete from public.tnt_task_assignees where task_id=v_id and not(person_id=any(coalesce(p_people,'{}'::uuid[])));
 insert into public.tnt_task_assignees(task_id,person_id) select v_id,x from unnest(coalesce(p_people,'{}'::uuid[])) x on conflict do nothing;
 if v_date is not null then
  select id into v_day from public.tnt_schedule_days where event_id=p_event and date=v_date order by sort_order limit 1;
  if v_day is null then insert into public.tnt_schedule_days(event_id,label,date,sort_order) values(p_event,to_char(v_date,'DD/MM'),v_date,(select count(*) from public.tnt_schedule_days where event_id=p_event)) returning id into v_day; end if;
  if not exists(select 1 from public.tnt_schedule_items where task_id=v_id) then
   insert into public.tnt_schedule_items(day_id,title,task_id,sort_order) values(v_day,trim(p_values->>'title'),v_id,(select count(*) from public.tnt_schedule_items where day_id=v_day));
  end if;
 end if;
 update public.tnt_schedule_items set day_id=coalesce(v_day,day_id),title=trim(p_values->>'title'),description=p_values->>'description',materials=p_values->>'materials',duration_minutes=(p_values->>'duration_minutes')::int,starts_at=(v_start at time zone 'America/Argentina/Buenos_Aires')::time where task_id=v_id;
 delete from public.tnt_schedule_responsibles where item_id in(select id from public.tnt_schedule_items where task_id=v_id) and not(person_id=any(coalesce(p_people,'{}'::uuid[])));
 insert into public.tnt_schedule_responsibles(item_id,person_id) select i.id,p from public.tnt_schedule_items i cross join unnest(coalesce(p_people,'{}'::uuid[])) p where i.task_id=v_id on conflict do nothing;
 return v_id;
end $$;
revoke all on function public.tnt_save_task(uuid,uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.tnt_save_task(uuid,uuid,jsonb,uuid[]) to authenticated;

create or replace function public.tnt_delete_activity(p_task uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.tnt_tasks where id=p_task and public.tnt_can_manage_event(event_id)) then raise exception 'No tenés permiso para eliminar esta actividad.' using errcode='42501'; end if;
 delete from public.tnt_schedule_items where task_id in(with recursive subtree as(select id from public.tnt_tasks where id=p_task union all select t.id from public.tnt_tasks t join subtree s on t.parent_task_id=s.id) select id from subtree);
 delete from public.tnt_tasks where id=p_task;
end $$;
revoke all on function public.tnt_delete_activity(uuid) from public,anon;
grant execute on function public.tnt_delete_activity(uuid) to authenticated;

create or replace function private.tnt_protect_chat_message()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.thread_id<>old.thread_id or new.person_id is distinct from old.person_id) then raise exception 'No se puede mover un mensaje a otra conversación o persona.' using errcode='42501'; end if;
 if auth.uid() is not null and not public.tnt_can_read_thread(new.thread_id) then raise exception 'No tenés acceso a esta conversación.' using errcode='42501'; end if;
 if new.reply_to is not null and not exists(select 1 from public.tnt_chat_messages where id=new.reply_to and thread_id=new.thread_id) then raise exception 'La respuesta debe pertenecer a la misma conversación.'; end if;
 if new.attachment_url like 'tnt-chat-files/%' and split_part(new.attachment_url,'/',2)<>new.thread_id::text then raise exception 'El archivo debe pertenecer a esta conversación.'; end if;
 if length(coalesce(new.body,''))>10000 then raise exception 'El mensaje puede tener hasta 10.000 caracteres.'; end if;
 return new;
end $$;
revoke all on function private.tnt_protect_chat_message() from public,anon;
drop trigger if exists tnt_protect_chat_message on public.tnt_chat_messages;
create trigger tnt_protect_chat_message before insert or update on public.tnt_chat_messages for each row execute function private.tnt_protect_chat_message();

create or replace function public.tnt_save_schedule_item(p_id uuid,p_day uuid,p_values jsonb,p_people uuid[])
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_event uuid; v_id uuid; v_task uuid;
begin
 select event_id into v_event from public.tnt_schedule_days where id=p_day;
 if v_event is null or not public.tnt_can_manage_event(v_event) then raise exception 'No tenés permiso para editar esta actividad.' using errcode='42501'; end if;
 if nullif(trim(p_values->>'title'),'') is null then raise exception 'La actividad necesita un nombre.'; end if;
 if p_id is not null and not exists(select 1 from public.tnt_schedule_items where id=p_id and day_id=p_day) then raise exception 'La actividad cambió. Volvé a abrirla.'; end if;
 v_id:=coalesce(p_id,gen_random_uuid());
 insert into public.tnt_schedule_items(id,day_id,title,item_type,starts_at,duration_minutes,description,video_url,materials,location,sort_order)
 values(v_id,p_day,trim(p_values->>'title'),coalesce(p_values->>'item_type','activity'),nullif(p_values->>'starts_at','')::time,
 (p_values->>'duration_minutes')::int,p_values->>'description',p_values->>'video_url',p_values->>'materials',p_values->>'location',coalesce((p_values->>'sort_order')::int,0))
 on conflict(id) do update set title=excluded.title,item_type=excluded.item_type,starts_at=excluded.starts_at,duration_minutes=excluded.duration_minutes,
 description=excluded.description,video_url=excluded.video_url,materials=excluded.materials,location=excluded.location,sort_order=excluded.sort_order
 returning task_id into v_task;
 delete from public.tnt_schedule_responsibles where item_id=v_id and not(person_id=any(coalesce(p_people,'{}'::uuid[])));
 insert into public.tnt_schedule_responsibles(item_id,person_id) select v_id,x from unnest(coalesce(p_people,'{}'::uuid[])) x on conflict do nothing;
 if v_task is null then
   insert into public.tnt_tasks(event_id,title,created_by) values(v_event,trim(p_values->>'title'),public.tnt_current_person_id()) returning id into v_task;
   update public.tnt_schedule_items set task_id=v_task where id=v_id;
 end if;
 if v_task is not null then
   update public.tnt_tasks set title=trim(p_values->>'title'),description=p_values->>'description',materials=p_values->>'materials',
   duration_minutes=(p_values->>'duration_minutes')::int,
   planned_start=(select (d.date+nullif(p_values->>'starts_at','')::time) at time zone 'America/Argentina/Buenos_Aires' from public.tnt_schedule_days d where d.id=p_day) where id=v_task;
   delete from public.tnt_task_assignees where task_id=v_task and not(person_id=any(coalesce(p_people,'{}'::uuid[])));
   insert into public.tnt_task_assignees(task_id,person_id) select v_task,x from unnest(coalesce(p_people,'{}'::uuid[])) x on conflict do nothing;
 end if;
 return v_id;
end $$;
revoke all on function public.tnt_save_schedule_item(uuid,uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.tnt_save_schedule_item(uuid,uuid,jsonb,uuid[]) to authenticated;

notify pgrst,'reload schema';
