-- A Saturday is prepared by a person. Templates are suggestions, never scheduled automatically.
insert into public.tnt_settings(key,value)
values('organization_defaults','{"auto_saturdays":false}'::jsonb)
on conflict(key) do update set value=public.tnt_settings.value||'{"auto_saturdays":false}'::jsonb;

create or replace function public.tnt_sync_saturdays(p_from date,p_to date)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('created',0,'enabled',false,'reason','manual_saturdays')
$$;

create or replace function public.tnt_create_saturday(p_date date,p_name text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_actor uuid;
begin
 v_actor:=public.tnt_current_person_id();
 if auth.uid() is null or v_actor is null or not public.tnt_is_pastor_or_admin() then
  raise exception 'Solo Pastor/a o Admin puede preparar un sábado.' using errcode='42501';
 end if;
 if p_date is null or extract(dow from p_date)<>6 or p_date<(now() at time zone 'America/Argentina/Buenos_Aires')::date then
  raise exception 'Elegí un sábado que todavía no pasó.' using errcode='22023';
 end if;
 if length(trim(coalesce(p_name,'')))>100 then raise exception 'El nombre es demasiado largo.' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tnt-saturday:'||p_date::text,0));
 if exists(select 1 from public.tnt_events where kind='saturday' and start_date=p_date and status<>'cancelled') then
  raise exception 'Ese sábado ya está preparado. Abrilo para editarlo.' using errcode='23505';
 end if;
 insert into public.tnt_events(kind,name,start_date,end_date,created_by,auto_generated,status)
 values('saturday',coalesce(nullif(trim(p_name),''),'Sábado · '||to_char(p_date,'DD/MM')),p_date,p_date,v_actor,false,'planning') returning id into v_id;
 insert into public.tnt_event_members(event_id,person_id,event_role) values(v_id,v_actor,'organizer');
 insert into public.tnt_schedule_days(event_id,label,date,sort_order) values(v_id,'Sábado',p_date,0);
 return v_id;
end $$;
revoke all on function public.tnt_create_saturday(date,text) from public,anon;
grant execute on function public.tnt_create_saturday(date,text) to authenticated;

alter table public.tnt_template_items add column if not exists duration_minutes integer check(duration_minutes between 1 and 1440);
alter table public.tnt_template_items add column if not exists materials text;
alter table public.tnt_template_items add column if not exists checklist jsonb not null default '[]'::jsonb;

-- The event's template is explicitly chosen. Store the detailed instructions and checklist.
create or replace function public.tnt_create_event_from_template(
 p_template uuid,p_name text,p_start date,p_end date default null,p_location text default null,p_kind text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_event uuid;v_person uuid;v_kind text;v_task uuid;v_item record;v_step text;v_order int;
begin
 if auth.uid() is null or not public.tnt_is_pastor_or_admin() then
  raise exception 'Solo Pastor/a o Admin puede crear este encuentro.' using errcode='42501'; end if;
 select kind into v_kind from public.tnt_templates where id=p_template;
 if v_kind is null then raise exception 'Plantilla inexistente.' using errcode='22023'; end if;
 if p_kind is not null and p_kind<>v_kind then raise exception 'La plantilla no corresponde al tipo elegido.' using errcode='22023'; end if;
 if v_kind='saturday' then raise exception 'Prepará el sábado vacío y elegí las tareas sugeridas una por una.' using errcode='22023'; end if;
 if nullif(trim(coalesce(p_name,'')),'') is null or p_start is null or coalesce(p_end,p_start)<p_start then
  raise exception 'Revisá el nombre y las fechas.' using errcode='22023'; end if;
 v_person:=public.tnt_current_person_id();
 insert into public.tnt_events(kind,name,start_date,end_date,location,template_id,created_by,status)
 values(v_kind,trim(p_name),p_start,coalesce(p_end,p_start),p_location,p_template,v_person,'planning') returning id into v_event;
 insert into public.tnt_event_members(event_id,person_id,event_role) values(v_event,v_person,'organizer');
 for v_item in select * from public.tnt_template_items where template_id=p_template order by sort_order loop
  insert into public.tnt_tasks(event_id,title,icon,task_type,description,materials,duration_minutes,status,sort_order,created_by)
  values(v_event,v_item.title,v_item.icon,v_item.task_type,v_item.description,v_item.materials,v_item.duration_minutes,'unread',v_item.sort_order,v_person) returning id into v_task;
  v_order:=0;
  for v_step in select jsonb_array_elements_text(case when jsonb_typeof(v_item.checklist)='array' then v_item.checklist else '[]'::jsonb end) loop
   insert into public.tnt_task_checklist(task_id,text,sort_order) values(v_task,v_step,v_order);
   v_order:=v_order+1;
  end loop;
 end loop;
 return v_event;
end $$;
revoke all on function public.tnt_create_event_from_template(uuid,text,date,date,text,text) from public,anon;
grant execute on function public.tnt_create_event_from_template(uuid,text,date,date,text,text) to authenticated;

-- Chats inherit assigned leaders from Organización. A task chat cannot exist without one.
create or replace function public.tnt_create_chat(
 p_title text,p_event uuid default null,p_task uuid default null,p_general boolean default false,
 p_all boolean default false,p_people uuid[] default '{}'::uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_actor uuid;v_admin boolean;v_event uuid;v_kind text;v_date date;v_ids uuid[];v_required uuid[];
begin
 v_actor:=public.tnt_current_person_id();v_admin:=public.tnt_is_admin();
 if auth.uid() is null or v_actor is null then raise exception 'Iniciá sesión para crear el chat.' using errcode='42501'; end if;
 if (p_general::int+(p_event is not null)::int+(p_task is not null)::int)<>1 then raise exception 'Elegí un solo contexto.' using errcode='22023'; end if;
 if length(trim(coalesce(p_title,'')))<3 or length(trim(p_title))>100 then raise exception 'Escribí un nombre de 3 a 100 caracteres.' using errcode='22023'; end if;
 if p_general and not v_admin then raise exception 'Solo Admin puede crear el chat general.' using errcode='42501'; end if;
 if p_event is not null then
  select kind,start_date into v_kind,v_date from public.tnt_events where id=p_event and status<>'cancelled';v_event:=p_event;
  if v_kind is null or not v_admin then raise exception 'El encuentro no está disponible para crear este chat.' using errcode='42501'; end if;
  if v_date<(now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'Este encuentro ya pasó.' using errcode='22023'; end if;
 end if;
 if p_task is not null then
  select t.event_id,e.kind,e.start_date into v_event,v_kind,v_date from public.tnt_tasks t join public.tnt_events e on e.id=t.event_id where t.id=p_task and e.status<>'cancelled';
  if v_event is null or v_kind='saturday' or v_date<(now() at time zone 'America/Argentina/Buenos_Aires')::date or
   not(v_admin or exists(select 1 from public.tnt_task_assignees a where a.task_id=p_task and a.person_id=v_actor and a.assignment_status<>'declined')) then
   raise exception 'Solo el responsable de una tarea de un evento puede crear este chat.' using errcode='42501'; end if;
  if not exists(select 1 from public.tnt_task_assignees a join public.tnt_accounts ac on ac.person_id=a.person_id
    where a.task_id=p_task and a.assignment_status<>'declined' and ac.enabled and ac.auth_user_id is not null) then
   raise exception 'Primero asigná una persona responsable a esta tarea en Organización.' using errcode='22023'; end if;
 end if;
 if exists(select 1 from unnest(coalesce(p_people,'{}'::uuid[])) pid where not exists(
  select 1 from public.tnt_accounts a where a.person_id=pid and a.enabled and a.auth_user_id is not null and
   (p_general or v_kind='saturday' or exists(select 1 from public.tnt_event_members em where em.event_id=v_event and em.person_id=pid)
    or exists(select 1 from public.tnt_tasks t join public.tnt_task_assignees ta on ta.task_id=t.id where t.event_id=v_event and ta.person_id=pid and ta.assignment_status<>'declined')))) then
  raise exception 'Una persona elegida no pertenece al equipo de este encuentro.' using errcode='42501'; end if;
 select coalesce(array_agg(distinct pid),'{}'::uuid[]) into v_required from (
  select a.person_id pid from public.tnt_task_assignees a join public.tnt_accounts ac on ac.person_id=a.person_id
   where a.task_id=p_task and a.assignment_status<>'declined' and ac.enabled and ac.auth_user_id is not null
  union
  select em.person_id from public.tnt_event_members em join public.tnt_accounts ac on ac.person_id=em.person_id
   where em.event_id=v_event and em.event_role='organizer' and ac.enabled and ac.auth_user_id is not null
 ) required;
 if p_all then
  select coalesce(array_agg(a.person_id),'{}'::uuid[]) into v_ids from public.tnt_accounts a where a.enabled and a.auth_user_id is not null
   and a.system_role<>'admin' and (p_general or v_kind='saturday' or exists(select 1 from public.tnt_event_members em where em.event_id=v_event and em.person_id=a.person_id)
    or exists(select 1 from public.tnt_tasks t join public.tnt_task_assignees ta on ta.task_id=t.id where t.event_id=v_event and ta.person_id=a.person_id and ta.assignment_status<>'declined'));
 else v_ids:=coalesce(p_people,'{}'::uuid[]);end if;
 v_ids:=coalesce(v_ids,'{}'::uuid[])||v_required;
 if not v_admin then v_ids:=array_append(v_ids,v_actor);end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tnt-chat-new:'||coalesce(coalesce(p_task,p_event)::text,'general'),0));
 if exists(select 1 from public.tnt_chat_threads where not is_archived and
  (p_general and thread_type='general' or p_event is not null and thread_type='event' and event_id=p_event
   or p_task is not null and thread_type='task' and task_id=p_task)) then
  raise exception 'Ya existe un chat activo para este contexto. Editalo o eliminalo primero.' using errcode='23505'; end if;
 insert into public.tnt_chat_threads(title,thread_type,event_id,task_id,created_by,is_pinned)
 values(trim(p_title),case when p_general then 'general' when p_task is not null then 'task' else 'event' end,p_event,p_task,v_actor,p_general) returning id into v_id;
 insert into public.tnt_chat_members(thread_id,person_id,member_role)
 select v_id,pid,case when not v_admin and pid=v_actor then 'moderator' else 'member' end
 from (select distinct unnest(v_ids) pid) chosen;
 return v_id;
end $$;
revoke all on function public.tnt_create_chat(text,uuid,uuid,boolean,boolean,uuid[]) from public,anon;
grant execute on function public.tnt_create_chat(text,uuid,uuid,boolean,boolean,uuid[]) to authenticated;
