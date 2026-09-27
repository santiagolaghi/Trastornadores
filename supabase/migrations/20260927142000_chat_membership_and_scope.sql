-- Chats have explicit participants. Admins can inspect without joining, and EFE
-- permissions must honor their scoped grant even for an administrator.
create or replace function public.tnt_has_access(p_module text,p_scope text default '*',p_min_level text default 'view')
returns boolean language sql stable security definer set search_path='public' as $$
 select (p_module<>'efe' and public.tnt_is_admin()) or exists(
   select 1 from public.tnt_access_grants g
   where g.person_id=public.tnt_current_person_id() and g.module=p_module and g.enabled
     and (g.scope='*' or g.scope=p_scope)
     and (g.valid_from is null or g.valid_from<=now())
     and (g.valid_until is null or g.valid_until>=now())
     and public.tnt_access_rank(g.access_level)>=public.tnt_access_rank(p_min_level)
 ) or (p_module<>'efe' and exists(
   select 1 from public.tnt_module_access m where m.person_id=public.tnt_current_person_id()
     and m.module=p_module and m.enabled
     and public.tnt_access_rank(case m.access_level when 'manager' then 'manage' when 'editor' then 'edit' else 'view' end)>=public.tnt_access_rank(p_min_level)
 ));
$$;

create or replace function public.tnt_can_read_thread(p_thread uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.tnt_current_person_id() is not null and (
   public.tnt_is_admin() or exists(
     select 1 from public.tnt_chat_threads t where t.id=p_thread and not t.is_archived
       and (t.thread_type='general' or exists(
         select 1 from public.tnt_chat_members m
         where m.thread_id=t.id and m.person_id=public.tnt_current_person_id()))))
$$;

-- Users cannot self-enroll in a team conversation just because they have an
-- assignment. The general room is open to every active account.
drop policy if exists tnt_chat_members_self_insert on public.tnt_chat_members;
create policy tnt_chat_members_self_insert on public.tnt_chat_members for insert to authenticated
 with check(person_id=(select public.tnt_current_person_id()) and member_role='member'
 and exists(select 1 from public.tnt_chat_threads t where t.id=thread_id and t.thread_type='general' and not t.is_archived));
drop policy if exists tnt_chat_members_self_update on public.tnt_chat_members;
create policy tnt_chat_members_self_update on public.tnt_chat_members for update to authenticated
 using(person_id=(select public.tnt_current_person_id()) and public.tnt_can_read_thread(thread_id))
 with check(person_id=(select public.tnt_current_person_id()) and public.tnt_can_read_thread(thread_id));

-- All creation goes through the atomic, checked RPC below.
drop policy if exists tnt_threads_assignee_insert on public.tnt_chat_threads;
drop policy if exists tnt_threads_context_insert on public.tnt_chat_threads;
drop policy if exists tnt_threads_manage on public.tnt_chat_threads;
create policy tnt_threads_manage on public.tnt_chat_threads for update to authenticated
 using(public.tnt_is_admin() or (thread_type='task' and created_by=public.tnt_current_person_id()
   and exists(select 1 from public.tnt_task_assignees a where a.task_id=tnt_chat_threads.task_id and a.person_id=public.tnt_current_person_id())))
 with check(public.tnt_is_admin() or (thread_type='task' and created_by=public.tnt_current_person_id()
   and exists(select 1 from public.tnt_task_assignees a where a.task_id=tnt_chat_threads.task_id and a.person_id=public.tnt_current_person_id())));

create or replace function public.tnt_create_chat(
 p_title text,p_event uuid default null,p_task uuid default null,p_general boolean default false,
 p_all boolean default false,p_people uuid[] default '{}'::uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_actor uuid;v_admin boolean;v_event uuid;v_kind text;v_date date;v_ids uuid[];
begin
 v_actor:=public.tnt_current_person_id();v_admin:=public.tnt_is_admin();
 if auth.uid() is null or v_actor is null then raise exception 'Iniciá sesión para crear el chat.' using errcode='42501'; end if;
 if (p_general::int+(p_event is not null)::int+(p_task is not null)::int)<>1 then
   raise exception 'Elegí un solo contexto para el chat.' using errcode='22023'; end if;
 if length(trim(coalesce(p_title,'')))<3 or length(trim(p_title))>100 then
   raise exception 'Escribí un nombre de 3 a 100 caracteres.' using errcode='22023'; end if;
 if p_general and not v_admin then raise exception 'Solo un administrador puede crear el chat general.' using errcode='42501'; end if;
 if p_event is not null then
   select kind,start_date into v_kind,v_date from public.tnt_events where id=p_event;
   if v_kind is null or not v_admin then raise exception 'Solo un administrador puede crear este chat.' using errcode='42501'; end if;
   if v_date< (now() at time zone 'America/Argentina/Buenos_Aires')::date then
     raise exception 'Este encuentro ya pasó.' using errcode='22023'; end if;
 end if;
 if p_task is not null then
   select t.event_id,e.kind,e.start_date into v_event,v_kind,v_date from public.tnt_tasks t
     join public.tnt_events e on e.id=t.event_id where t.id=p_task;
   if v_event is null or v_kind='saturday' or v_date<(now() at time zone 'America/Argentina/Buenos_Aires')::date or
     not (v_admin or exists(select 1 from public.tnt_task_assignees a where a.task_id=p_task and a.person_id=v_actor)) then
     raise exception 'Solo el responsable de una tarea de un evento puede crear este chat.' using errcode='42501'; end if;
 end if;
 -- Reject arbitrary account IDs, including IDs outside the task leader's event.
 if exists(select 1 from unnest(coalesce(p_people,'{}'::uuid[])) pid
   where not exists(select 1 from public.tnt_accounts a where a.person_id=pid and a.enabled and a.auth_user_id is not null
    and (v_admin or pid=v_actor or exists(select 1 from public.tnt_event_members em where em.event_id=v_event and em.person_id=pid)
      or exists(select 1 from public.tnt_tasks t join public.tnt_task_assignees ta on ta.task_id=t.id where t.event_id=v_event and ta.person_id=pid)))) then
   raise exception 'Una de las personas elegidas no pertenece al equipo.' using errcode='42501'; end if;
 if p_all then
   select array_agg(a.person_id) into v_ids from public.tnt_accounts a where a.enabled and a.auth_user_id is not null
     and (not v_admin or a.system_role<>'admin')
     and (v_admin or a.person_id=v_actor or exists(select 1 from public.tnt_event_members em where em.event_id=v_event and em.person_id=a.person_id)
       or exists(select 1 from public.tnt_tasks t join public.tnt_task_assignees ta on ta.task_id=t.id where t.event_id=v_event and ta.person_id=a.person_id));
 else v_ids:=coalesce(p_people,'{}'::uuid[]); end if;
 if not v_admin then v_ids:=array_append(v_ids,v_actor); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tnt-chat-new:'||coalesce(coalesce(p_task,p_event)::text,'general'),0));
 if p_general and exists(select 1 from public.tnt_chat_threads where thread_type='general' and not is_archived) then
   raise exception 'Ya existe un chat general. Editalo o eliminalo primero.' using errcode='23505'; end if;
 if p_event is not null and v_kind='saturday' and exists(select 1 from public.tnt_chat_threads where event_id=p_event and thread_type='event' and not is_archived) then
   raise exception 'Ya existe un chat para este sábado.' using errcode='23505'; end if;
 insert into public.tnt_chat_threads(title,thread_type,event_id,task_id,created_by,is_pinned)
 values(trim(p_title),case when p_general then 'general' when p_task is not null then 'task' else 'event' end,
 p_event,p_task,v_actor,p_general) returning id into v_id;
 insert into public.tnt_chat_members(thread_id,person_id,member_role)
 select v_id,pid,case when not v_admin and pid=v_actor then 'moderator' else 'member' end
 from (select distinct unnest(coalesce(v_ids,'{}'::uuid[])) pid) chosen;
 return v_id;
end $$;
revoke all on function public.tnt_create_chat(text,uuid,uuid,boolean,boolean,uuid[]) from public,anon;
grant execute on function public.tnt_create_chat(text,uuid,uuid,boolean,boolean,uuid[]) to authenticated;

-- Opening an activity in Organización never creates a conversation implicitly.
create or replace function public.tnt_open_activity_chat(p_task uuid default null,p_event uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_event uuid;
begin
 if auth.uid() is null or (p_task is null)=(p_event is null) then
   raise exception 'Elegí un encuentro.' using errcode='22023'; end if;
 if p_task is not null then select event_id into v_event from public.tnt_tasks where id=p_task;
 else v_event:=p_event; end if;
 select id into v_id from public.tnt_chat_threads where event_id=v_event and thread_type='event' and not is_archived order by created_at desc limit 1;
 if v_id is null or not public.tnt_can_read_thread(v_id) then
   raise exception 'Todavía no hay un chat disponible para este encuentro.' using errcode='42501'; end if;
 return v_id;
end $$;

-- An administrator can observe without becoming a visible member. The room
-- still counts reads normally once that administrator explicitly joins.
create or replace function public.tnt_chat_overview()
returns table(thread_id uuid,last_body text,last_created_at timestamptz,unread_count bigint)
language sql stable security invoker set search_path='' as $$
 select t.id,
 case when last_message.deleted_at is not null then 'Mensaje eliminado'
 else coalesce(nullif(last_message.body,''),last_message.attachment_name) end,
 last_message.created_at,
 case when public.tnt_is_admin() and member.thread_id is null then 0::bigint else
 (select count(*) from public.tnt_chat_messages msg where msg.thread_id=t.id and msg.person_id<>public.tnt_current_person_id()
  and msg.deleted_at is null and msg.created_at>coalesce(member.last_read_at,'-infinity'::timestamptz)) end
 from public.tnt_chat_threads t
 left join public.tnt_chat_members member on member.thread_id=t.id and member.person_id=public.tnt_current_person_id()
 left join lateral(select m.body,m.created_at,m.attachment_name,m.deleted_at from public.tnt_chat_messages m
   where m.thread_id=t.id order by m.created_at desc,m.id desc limit 1) last_message on true
 where not t.is_archived
$$;
notify pgrst,'reload schema';

-- A scoped EFE grant controls the actual rows, not just the navigation card.
drop policy if exists tnt_efe_groups_read on public.tnt_efe_groups;
drop policy if exists tnt_efe_groups_write on public.tnt_efe_groups;
create policy tnt_efe_groups_read on public.tnt_efe_groups for select to authenticated
 using(public.tnt_has_access('efe',code,'view'));
create policy tnt_efe_groups_write on public.tnt_efe_groups for all to authenticated
 using(public.tnt_has_access('efe',code,'manage'))
 with check(public.tnt_has_access('efe',code,'manage'));
