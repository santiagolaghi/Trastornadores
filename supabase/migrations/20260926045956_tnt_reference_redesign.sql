-- Contextual chat, private attachments and configurable TNT Saturdays.
-- Invoker RPCs use the existing event/assignment RLS. No existing events are rewritten.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.tnt_thread_moderator(p_thread uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.tnt_current_person_id() is not null and (
   public.tnt_is_admin() or exists(select 1 from public.tnt_chat_members m
   where m.thread_id=p_thread and m.person_id=public.tnt_current_person_id() and m.member_role='moderator'))
$$;
revoke all on function private.tnt_thread_moderator(uuid) from public,anon;
grant execute on function private.tnt_thread_moderator(uuid) to authenticated;

create or replace function public.tnt_can_read_thread(p_thread uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.tnt_current_person_id() is not null and (
 public.tnt_is_admin() or exists(select 1 from public.tnt_chat_threads t where t.id=p_thread and (
 t.created_by=public.tnt_current_person_id() or t.thread_type='general'
 or exists(select 1 from public.tnt_chat_members m where m.thread_id=t.id and m.person_id=public.tnt_current_person_id())
 or (t.thread_type in ('module','efe') and t.module is not null and public.tnt_has_access(t.module,coalesce(t.scope,'*'),'view'))
 or (t.thread_type='event' and t.event_id is not null and (public.tnt_can_manage_event(t.event_id)
   or exists(select 1 from public.tnt_event_members m where m.event_id=t.event_id and m.person_id=public.tnt_current_person_id())))
 or (t.thread_type='task' and t.task_id is not null and (
   exists(select 1 from public.tnt_task_assignees a where a.task_id=t.task_id and a.person_id=public.tnt_current_person_id())
   or exists(select 1 from public.tnt_tasks task where task.id=t.task_id and public.tnt_can_manage_event(task.event_id))))
 )))
$$;
revoke all on function public.tnt_can_read_thread(uuid) from public,anon;
grant execute on function public.tnt_can_read_thread(uuid) to authenticated;

drop policy if exists tnt_chat_members_manage on public.tnt_chat_members;
create policy tnt_chat_members_manage on public.tnt_chat_members for all to authenticated
 using(private.tnt_thread_moderator(thread_id)) with check(private.tnt_thread_moderator(thread_id));
drop policy if exists tnt_chat_members_self_insert on public.tnt_chat_members;
create policy tnt_chat_members_self_insert on public.tnt_chat_members for insert to authenticated
 with check(person_id=(select public.tnt_current_person_id()) and member_role='member' and public.tnt_can_read_thread(thread_id));
drop policy if exists tnt_chat_members_self_update on public.tnt_chat_members;
create policy tnt_chat_members_self_update on public.tnt_chat_members for update to authenticated
 using(person_id=(select public.tnt_current_person_id()) and public.tnt_can_read_thread(thread_id))
 with check(person_id=(select public.tnt_current_person_id()) and public.tnt_can_read_thread(thread_id));
create or replace function private.tnt_protect_chat_membership()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.thread_id<>old.thread_id or new.person_id<>old.person_id then
   raise exception 'La identidad de una membresía no se puede cambiar.' using errcode='42501';
 end if;
 if new.member_role is distinct from old.member_role and not private.tnt_thread_moderator(old.thread_id) then
   raise exception 'No tenés permiso para cambiar roles del chat.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.tnt_protect_chat_membership() from public,anon;
drop trigger if exists tnt_protect_chat_membership on public.tnt_chat_members;
create trigger tnt_protect_chat_membership before update on public.tnt_chat_members for each row execute function private.tnt_protect_chat_membership();

drop policy if exists tnt_threads_context_insert on public.tnt_chat_threads;
create policy tnt_threads_context_insert on public.tnt_chat_threads for insert to authenticated with check(
 created_by=(select public.tnt_current_person_id()) and module is null and (
 (thread_type='task' and task_id is not null and event_id is null and
 exists(select 1 from public.tnt_tasks t where t.id=task_id and (public.tnt_can_manage_event(t.event_id) or exists(
 select 1 from public.tnt_task_assignees a where a.task_id=t.id and a.person_id=(select public.tnt_current_person_id())))))
 or (thread_type='event' and event_id is not null and task_id is null and
 (public.tnt_can_manage_event(event_id) or exists(select 1 from public.tnt_event_members m where m.event_id=tnt_chat_threads.event_id and m.person_id=(select public.tnt_current_person_id()))))
 ));

drop policy if exists tnt_chat_reactions_all on public.tnt_chat_reactions;
create policy tnt_chat_reactions_read on public.tnt_chat_reactions for select to authenticated
 using(exists(select 1 from public.tnt_chat_messages m where m.id=message_id and public.tnt_can_read_thread(m.thread_id)));
create policy tnt_chat_reactions_insert on public.tnt_chat_reactions for insert to authenticated
 with check(person_id=(select public.tnt_current_person_id()) and exists(select 1 from public.tnt_chat_messages m where m.id=message_id and public.tnt_can_read_thread(m.thread_id)));
create policy tnt_chat_reactions_delete on public.tnt_chat_reactions for delete to authenticated
 using((person_id=(select public.tnt_current_person_id()) or (select public.tnt_is_admin())) and exists(select 1 from public.tnt_chat_messages m where m.id=message_id and public.tnt_can_read_thread(m.thread_id)));
create index if not exists tnt_chat_messages_thread_created_idx on public.tnt_chat_messages(thread_id,created_at desc);
create index if not exists tnt_chat_members_person_idx on public.tnt_chat_members(person_id,thread_id);

create or replace function public.tnt_open_activity_chat(p_task uuid default null,p_event uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_title text; v_event uuid;
begin
 if public.tnt_current_person_id() is null or (p_task is null)=(p_event is null) then
   raise exception 'Elegí una tarea o un evento.' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tnt-chat:'||coalesce(p_task,p_event)::text,0));
 if p_task is not null then
   select title,event_id into v_title,v_event from public.tnt_tasks where id=p_task;
   if v_title is null or not (public.tnt_can_manage_event(v_event) or exists(select 1 from public.tnt_task_assignees where task_id=p_task and person_id=public.tnt_current_person_id())) then
     raise exception 'Este chat es para los responsables de la tarea.' using errcode='42501';
   end if;
   select id into v_id from public.tnt_chat_threads where thread_type='task' and task_id=p_task order by created_at limit 1;
   if v_id is null then
     insert into public.tnt_chat_threads(title,thread_type,task_id,created_by) values(v_title,'task',p_task,public.tnt_current_person_id()) returning id into v_id;
   end if;
 else
   select name into v_title from public.tnt_events where id=p_event;
   if v_title is null or not (public.tnt_can_manage_event(p_event) or exists(select 1 from public.tnt_event_members where event_id=p_event and person_id=public.tnt_current_person_id())) then
     raise exception 'Este chat es para los participantes del evento.' using errcode='42501';
   end if;
   select id into v_id from public.tnt_chat_threads where thread_type='event' and event_id=p_event order by created_at limit 1;
   if v_id is null then
     insert into public.tnt_chat_threads(title,thread_type,event_id,created_by) values(v_title,'event',p_event,public.tnt_current_person_id()) returning id into v_id;
   end if;
 end if;
 return v_id;
end $$;
revoke all on function public.tnt_open_activity_chat(uuid,uuid) from public,anon;
grant execute on function public.tnt_open_activity_chat(uuid,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tnt-chat-files','tnt-chat-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','audio/mpeg','audio/mp4','video/mp4','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do nothing;
create or replace function private.tnt_chat_file_thread(p_name text)
returns uuid language sql immutable security invoker set search_path='' as $$
 select case when split_part(p_name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(p_name,'/',1)::uuid else null end
$$;
revoke all on function private.tnt_chat_file_thread(text) from public,anon;
grant execute on function private.tnt_chat_file_thread(text) to authenticated;
create policy tnt_chat_files_read on storage.objects for select to authenticated using(
 bucket_id='tnt-chat-files' and public.tnt_can_read_thread(private.tnt_chat_file_thread(name)));
create policy tnt_chat_files_insert on storage.objects for insert to authenticated with check(
 bucket_id='tnt-chat-files' and split_part(name,'/',2)=(select public.tnt_current_person_id())::text and public.tnt_can_read_thread(private.tnt_chat_file_thread(name)));
create policy tnt_chat_files_delete on storage.objects for delete to authenticated using(
 bucket_id='tnt-chat-files' and split_part(name,'/',2)=(select public.tnt_current_person_id())::text and public.tnt_can_read_thread(private.tnt_chat_file_thread(name)));

create or replace function public.tnt_sync_saturdays(p_from date,p_to date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb; v_from date; v_to date; d date; anchor date; v_start time; v_minutes int; v_offset int;
 v_item jsonb; v_title text; v_event uuid; v_day uuid; v_task uuid; v_actor uuid; v_count int:=0; v_order int;
begin
 if not public.tnt_is_pastor_or_admin() then raise exception 'Solo los organizadores autorizados pueden programar sábados.' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Elegí un intervalo de hasta un año.'; end if;
 select value into cfg from public.tnt_settings where key='organization_defaults';
 cfg:=coalesce(cfg,'{}'::jsonb);
 if coalesce((cfg->>'auto_saturdays')::boolean,true)=false then return jsonb_build_object('created',0,'enabled',false); end if;
 v_from:=greatest(p_from,(now() at time zone 'America/Argentina/Buenos_Aires')::date,coalesce((cfg->>'saturday_from')::date,p_from));
 v_to:=least(p_to,coalesce((cfg->>'saturday_until')::date,p_to));
 anchor:=coalesce((cfg->>'saturday_from')::date,date '2026-01-03');
 anchor:=anchor+((6-extract(dow from anchor)::int+7)%7);
 v_start:=coalesce((cfg->>'saturday_start')::time,time '18:30');
 if jsonb_typeof(cfg->'default_activities') is distinct from 'array' then
   cfg:=jsonb_set(cfg,'{default_activities}','["Bienvenida","Dinámica","Ofrenda","Ministración","Palabra","Merienda","Cierre"]');
 end if;
 if jsonb_array_length(cfg->'default_activities')>30 then raise exception 'Usá hasta 30 actividades.'; end if;
 v_actor:=public.tnt_current_person_id();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tnt-auto-saturdays',0));
 for d in select dt::date from pg_catalog.generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') dt where extract(dow from dt)=6 loop
   if coalesce(cfg->'saturday_excluded','[]'::jsonb) ? d::text then continue; end if;
   if cfg->>'saturday_frequency'='first' and extract(day from d)>7 then continue; end if;
   if cfg->>'saturday_frequency'='biweekly' and mod((d-anchor)/7,2)<>0 then continue; end if;
   if exists(select 1 from public.tnt_events where kind='saturday' and start_date=d) then continue; end if;
   insert into public.tnt_events(kind,name,start_date,end_date,created_by,auto_generated,recurrence_rule)
    values('saturday','Sábado TNT · '||to_char(d,'DD/MM'),d,d,v_actor,true,coalesce(cfg->>'saturday_frequency','weekly')) returning id into v_event;
   insert into public.tnt_event_members(event_id,person_id,event_role) values(v_event,v_actor,'organizer');
   insert into public.tnt_schedule_days(event_id,label,date) values(v_event,'Sábado TNT',d) returning id into v_day;
   v_offset:=0;v_order:=0;
   for v_item in select value from jsonb_array_elements(cfg->'default_activities') loop
     if jsonb_typeof(v_item)='object' and coalesce((v_item->>'enabled')::boolean,true)=false then continue; end if;
     v_title:=trim(case when jsonb_typeof(v_item)='string' then v_item#>>'{}' else v_item->>'title' end);
     v_minutes:=coalesce((v_item->>'minutes')::int,30);
     if v_title is null or v_title='' or v_minutes<1 or v_minutes>720 then raise exception 'Revisá los nombres y la duración de las actividades.'; end if;
     if extract(epoch from v_start)/60+v_offset+v_minutes>1440 then raise exception 'Las actividades deben terminar antes de medianoche.'; end if;
     insert into public.tnt_tasks(event_id,title,planned_start,due_at,duration_minutes,sort_order,created_by)
      values(v_event,v_title,(d+v_start+make_interval(mins=>v_offset)) at time zone 'America/Argentina/Buenos_Aires',
      (d+v_start+make_interval(mins=>v_offset+v_minutes)) at time zone 'America/Argentina/Buenos_Aires',v_minutes,v_order,v_actor) returning id into v_task;
     insert into public.tnt_schedule_items(day_id,title,item_type,starts_at,duration_minutes,task_id,sort_order)
      values(v_day,v_title,case when lower(v_title) like '%merienda%' then 'meal' else 'activity' end,(v_start+make_interval(mins=>v_offset))::time,v_minutes,v_task,v_order);
     v_offset:=v_offset+v_minutes;v_order:=v_order+1;
   end loop;
   v_count:=v_count+1;
 end loop;
 return jsonb_build_object('created',v_count,'enabled',true);
end $$;
revoke all on function public.tnt_sync_saturdays(date,date) from public,anon;
grant execute on function public.tnt_sync_saturdays(date,date) to authenticated;

-- Saving the item and its team in one transaction prevents partial updates.
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
create or replace function public.tnt_copy_event(p_event uuid,p_name text,p_date date,p_team boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare e public.tnt_events; t public.tnt_tasks; d public.tnt_schedule_days; i public.tnt_schedule_items;
 v_event uuid; v_task uuid; v_day uuid; v_item uuid; v_map jsonb:='{}'; v_shift int;
begin
 if not public.tnt_is_pastor_or_admin() then raise exception 'No tenés permiso para crear eventos.' using errcode='42501'; end if;
 select * into e from public.tnt_events where id=p_event;
 if e.id is null or nullif(trim(p_name),'') is null or p_date is null then raise exception 'Completá nombre y fecha.'; end if;
 v_shift:=p_date-e.start_date;
 insert into public.tnt_events(name,kind,description,location,start_date,end_date,status,color,created_by)
 values(trim(p_name),e.kind,e.description,e.location,p_date,e.end_date+v_shift,'planning',e.color,public.tnt_current_person_id()) returning id into v_event;
 insert into public.tnt_event_members(event_id,person_id,event_role) values(v_event,public.tnt_current_person_id(),'organizer');
 if p_team then insert into public.tnt_event_members(event_id,person_id,event_role,include_in_groups)
 select v_event,person_id,event_role,include_in_groups from public.tnt_event_members where event_id=p_event on conflict do nothing; end if;
 for t in select * from public.tnt_tasks where event_id=p_event order by sort_order loop
   insert into public.tnt_tasks(event_id,title,icon,task_type,description,priority,due_at,planned_start,duration_minutes,budget_estimated,materials,sort_order,created_by)
   values(v_event,t.title,t.icon,t.task_type,t.description,t.priority,t.due_at+make_interval(days=>v_shift),t.planned_start+make_interval(days=>v_shift),t.duration_minutes,t.budget_estimated,t.materials,t.sort_order,public.tnt_current_person_id()) returning id into v_task;
   v_map:=v_map||jsonb_build_object(t.id::text,v_task::text);
   insert into public.tnt_task_checklist(task_id,text,sort_order) select v_task,text,sort_order from public.tnt_task_checklist where task_id=t.id;
   insert into public.tnt_task_links(task_id,url,label,link_type,sort_order) select v_task,url,label,link_type,sort_order from public.tnt_task_links where task_id=t.id;
   if p_team then insert into public.tnt_task_assignees(task_id,person_id) select v_task,person_id from public.tnt_task_assignees where task_id=t.id; end if;
 end loop;
 for t in select * from public.tnt_tasks where event_id=p_event and parent_task_id is not null loop
   update public.tnt_tasks set parent_task_id=(v_map->>t.parent_task_id::text)::uuid where id=(v_map->>t.id::text)::uuid;
 end loop;
 for d in select * from public.tnt_schedule_days where event_id=p_event order by sort_order loop
   insert into public.tnt_schedule_days(event_id,label,date,sort_order) values(v_event,d.label,d.date+v_shift,d.sort_order) returning id into v_day;
   for i in select * from public.tnt_schedule_items where day_id=d.id order by sort_order loop
     insert into public.tnt_schedule_items(day_id,title,item_type,starts_at,duration_minutes,description,video_url,materials,location,task_id,sort_order)
     values(v_day,i.title,i.item_type,i.starts_at,i.duration_minutes,i.description,i.video_url,i.materials,i.location,(v_map->>i.task_id::text)::uuid,i.sort_order) returning id into v_item;
     if p_team then insert into public.tnt_schedule_responsibles(item_id,person_id) select v_item,person_id from public.tnt_schedule_responsibles where item_id=i.id; end if;
   end loop;
 end loop;
 return v_event;
end $$;
revoke all on function public.tnt_copy_event(uuid,text,date,boolean) from public,anon;
grant execute on function public.tnt_copy_event(uuid,text,date,boolean) to authenticated;
notify pgrst,'reload schema';
