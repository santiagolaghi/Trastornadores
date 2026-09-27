-- Administrators stay invisible unless explicitly invited or assigned to the task.
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
   where em.event_id=v_event and em.event_role='organizer' and ac.system_role<>'admin' and ac.enabled and ac.auth_user_id is not null
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
notify pgrst, 'reload schema';
