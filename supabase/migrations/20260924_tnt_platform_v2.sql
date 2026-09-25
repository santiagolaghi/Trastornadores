-- TNT Organization / central account layer.
-- IMPORTANT: preserves the existing central tnt_people table used by EFE/Lista schema.
-- This migration does NOT enable RLS on legacy tnt_people/attendance tables yet.

create extension if not exists pgcrypto;

create table if not exists public.tnt_accounts (
  person_id uuid primary key references public.tnt_people(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text,
  nickname text,
  avatar_url text,
  ministry_role text not null default 'Timoteo' check (ministry_role in ('Pastor/a','Colaborador','Líder','Timoteo')),
  system_role text not null default 'user' check (system_role in ('admin','user')),
  service_areas text[] not null default '{}',
  skills text[] not null default '{}',
  availability_days text[] not null default '{}',
  service_preferences jsonb not null default '{}'::jsonb,
  bio text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tnt_accounts_email_unique on public.tnt_accounts(lower(email)) where email is not null and email<>'';
create index if not exists tnt_accounts_auth_idx on public.tnt_accounts(auth_user_id);

create table if not exists public.tnt_module_access (
  person_id uuid not null references public.tnt_people(id) on delete cascade,
  module text not null check (module in ('organizacion','campamento','efe','lista-sabados','glosario','buffet','admin')),
  enabled boolean not null default true,
  access_level text not null default 'user' check (access_level in ('user','editor','manager')),
  primary key(person_id,module)
);

create table if not exists public.tnt_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.tnt_people(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.tnt_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'event' check (kind in ('saturday','event','camp')),
  description text,
  is_default boolean not null default false,
  created_by uuid references public.tnt_people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tnt_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.tnt_templates(id) on delete cascade,
  title text not null,
  icon text default '✓',
  task_type text not null default 'simple' check(task_type in ('simple','complex')),
  description text,
  sort_order integer not null default 0
);

create table if not exists public.tnt_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'event' check (kind in ('saturday','event','camp')),
  name text not null,
  description text,
  location text,
  start_date date not null,
  end_date date not null,
  status text not null default 'planning' check(status in ('planning','confirmed','live','completed','cancelled')),
  event_mode boolean not null default false,
  color text default '#ff7143',
  template_id uuid references public.tnt_templates(id) on delete set null,
  created_by uuid references public.tnt_people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tnt_events_dates_idx on public.tnt_events(start_date,end_date);

create table if not exists public.tnt_event_members (
  event_id uuid not null references public.tnt_events(id) on delete cascade,
  person_id uuid not null references public.tnt_people(id) on delete cascade,
  event_role text not null default 'participant' check(event_role in ('organizer','responsible','participant')),
  created_at timestamptz not null default now(),
  primary key(event_id,person_id,event_role)
);

create table if not exists public.tnt_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.tnt_events(id) on delete cascade,
  parent_task_id uuid references public.tnt_tasks(id) on delete cascade,
  title text not null,
  icon text default '✓',
  task_type text not null default 'simple' check(task_type in ('simple','complex')),
  description text,
  status text not null default 'unread' check(status in ('unread','preparing','progress','review','ready','completed','replacement')),
  priority text not null default 'medium' check(priority in ('low','medium','high')),
  due_at timestamptz,
  planned_start timestamptz,
  duration_minutes integer,
  budget_estimated numeric(14,2),
  materials text,
  private_notes text,
  sort_order integer not null default 0,
  created_by uuid references public.tnt_people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tnt_tasks_event_idx on public.tnt_tasks(event_id,status);

create table if not exists public.tnt_task_assignees (
  task_id uuid not null references public.tnt_tasks(id) on delete cascade,
  person_id uuid not null references public.tnt_people(id) on delete cascade,
  assignment_status text not null default 'assigned' check(assignment_status in ('assigned','read','accepted','declined')),
  response_note text,
  read_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(task_id,person_id)
);
create table if not exists public.tnt_task_links (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tnt_tasks(id) on delete cascade,
  url text not null,label text,link_type text not null default 'link' check(link_type in ('link','youtube','pinterest','instagram','drive','canva')),sort_order integer not null default 0
);
create table if not exists public.tnt_task_files (
  id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tnt_tasks(id) on delete cascade,
  storage_path text not null,file_name text not null,mime_type text,size_bytes bigint,uploaded_by uuid references public.tnt_people(id) on delete set null,created_at timestamptz not null default now()
);
create table if not exists public.tnt_task_checklist (
  id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tnt_tasks(id) on delete cascade,
  text text not null,done boolean not null default false,assigned_person_id uuid references public.tnt_people(id) on delete set null,sort_order integer not null default 0,updated_at timestamptz not null default now()
);
create table if not exists public.tnt_task_comments (
  id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tnt_tasks(id) on delete cascade,
  person_id uuid references public.tnt_people(id) on delete set null,body text not null,created_at timestamptz not null default now()
);
create table if not exists public.tnt_availability (
  person_id uuid not null references public.tnt_people(id) on delete cascade,date date not null,
  status text not null check(status in ('available','maybe','unavailable')),note text,updated_at timestamptz not null default now(),primary key(person_id,date)
);

create table if not exists public.tnt_schedule_days (
  id uuid primary key default gen_random_uuid(),event_id uuid not null references public.tnt_events(id) on delete cascade,
  label text not null,date date,sort_order integer not null default 0,created_at timestamptz not null default now()
);
create table if not exists public.tnt_schedule_items (
  id uuid primary key default gen_random_uuid(),day_id uuid not null references public.tnt_schedule_days(id) on delete cascade,
  title text not null,item_type text not null default 'activity' check(item_type in ('game','activity','meal','meeting','other')),
  starts_at time,duration_minutes integer,description text,video_url text,materials text,location text,
  task_id uuid references public.tnt_tasks(id) on delete set null,sort_order integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.tnt_schedule_responsibles (
  item_id uuid not null references public.tnt_schedule_items(id) on delete cascade,person_id uuid not null references public.tnt_people(id) on delete cascade,primary key(item_id,person_id)
);

create table if not exists public.tnt_groups (
  id uuid primary key default gen_random_uuid(),event_id uuid not null references public.tnt_events(id) on delete cascade,
  day_id uuid references public.tnt_schedule_days(id) on delete cascade,name text not null,color text not null default '#ff4444',sort_order integer not null default 0,created_at timestamptz not null default now()
);
create table if not exists public.tnt_group_members (
  group_id uuid not null references public.tnt_groups(id) on delete cascade,person_id uuid not null references public.tnt_people(id) on delete cascade,
  age_snapshot integer,sex_snapshot text,created_at timestamptz not null default now(),primary key(group_id,person_id)
);

create table if not exists public.tnt_notifications (
  id uuid primary key default gen_random_uuid(),person_id uuid references public.tnt_people(id) on delete cascade,
  scope text not null default 'personal' check(scope in ('personal','team','general')),event_id uuid references public.tnt_events(id) on delete cascade,
  task_id uuid references public.tnt_tasks(id) on delete cascade,title text not null,body text,href text,data jsonb not null default '{}'::jsonb,
  read_at timestamptz,created_at timestamptz not null default now()
);
create index if not exists tnt_notifications_person_idx on public.tnt_notifications(person_id,created_at desc);
create table if not exists public.tnt_push_subscriptions (
  person_id uuid not null references public.tnt_people(id) on delete cascade,endpoint text not null,subscription jsonb not null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(person_id,endpoint)
);
create table if not exists public.tnt_audit_log (
  id bigint generated always as identity primary key,person_id uuid references public.tnt_people(id) on delete set null,
  entity_type text not null,entity_id uuid,action text not null,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);

create or replace function public.tnt_current_person_id()
returns uuid language sql stable security definer set search_path=public as $$
  select person_id from public.tnt_accounts where auth_user_id=auth.uid() and enabled limit 1
$$;
create or replace function public.tnt_is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.tnt_accounts where auth_user_id=auth.uid() and system_role='admin' and enabled)
$$;
create or replace function public.tnt_is_pastor_or_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.tnt_accounts where auth_user_id=auth.uid() and enabled and (system_role='admin' or ministry_role='Pastor/a'))
$$;
create or replace function public.tnt_can_manage_event(p_event uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.tnt_is_pastor_or_admin() or exists(
    select 1 from public.tnt_event_members em where em.event_id=p_event and em.event_role='organizer' and em.person_id=public.tnt_current_person_id()
  )
$$;
create or replace function public.tnt_is_task_assignee(p_task uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.tnt_task_assignees where task_id=p_task and person_id=public.tnt_current_person_id() and assignment_status<>'declined')
$$;
create or replace function public.tnt_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

-- Auth mapping. The first authenticated TNT account becomes Admin; subsequent accounts are users.
create or replace function public.tnt_handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid; first_admin boolean; nm text;
begin
  select person_id into pid from public.tnt_accounts where lower(coalesce(email,''))=lower(coalesce(new.email,'')) limit 1;
  select not exists(select 1 from public.tnt_accounts where system_role='admin' and auth_user_id is not null) into first_admin;
  nm:=coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(coalesce(new.email,''),'@',1));
  if pid is null then
    insert into public.tnt_people(full_name,normalized_name,sex,source,active)
    values(nm,lower(regexp_replace(nm,'[^a-zA-Z0-9]+','','g')),'U','auth',true) returning id into pid;
    insert into public.tnt_accounts(person_id,auth_user_id,email,nickname,avatar_url,system_role)
    values(pid,new.id,new.email,coalesce(new.raw_user_meta_data->>'given_name',new.raw_user_meta_data->>'name',''),new.raw_user_meta_data->>'avatar_url',case when first_admin then 'admin' else 'user' end);
  else
    update public.tnt_accounts set auth_user_id=new.id,avatar_url=coalesce(avatar_url,new.raw_user_meta_data->>'avatar_url'),system_role=case when first_admin then 'admin' else system_role end,updated_at=now() where person_id=pid;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created_tnt on auth.users;
create trigger on_auth_user_created_tnt after insert on auth.users for each row execute procedure public.tnt_handle_new_user();

create or replace function public.tnt_notify_assignment() returns trigger language plpgsql security definer set search_path=public as $$
declare t public.tnt_tasks; e public.tnt_events;
begin
  select * into t from public.tnt_tasks where id=new.task_id; select * into e from public.tnt_events where id=t.event_id;
  insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href)
  values(new.person_id,'personal',t.event_id,t.id,'Nueva asignación','Te asignaron a '||t.title||' en '||e.name||'.','/organizacion/?task='||t.id);
  return new;
end $$;
drop trigger if exists tnt_assignment_notification on public.tnt_task_assignees;
create trigger tnt_assignment_notification after insert on public.tnt_task_assignees for each row execute procedure public.tnt_notify_assignment();

create or replace function public.tnt_audit_task_changes() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
 values(public.tnt_current_person_id(),'task',coalesce(new.id,old.id),tg_op,jsonb_build_object('old',to_jsonb(old),'new',to_jsonb(new)));
 return coalesce(new,old);
end $$;
drop trigger if exists tnt_task_audit on public.tnt_tasks;
create trigger tnt_task_audit after insert or update or delete on public.tnt_tasks for each row execute procedure public.tnt_audit_task_changes();

create or replace function public.tnt_set_assignment_response(p_task uuid,p_status text,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare pid uuid; ev uuid; ttl text;
begin
 if p_status not in ('read','accepted','declined') then raise exception 'Estado inválido'; end if;
 pid:=public.tnt_current_person_id(); if pid is null then raise exception 'Sin perfil TNT'; end if;
 update public.tnt_task_assignees set assignment_status=p_status,response_note=p_note,
 read_at=case when p_status in ('read','accepted','declined') then coalesce(read_at,now()) else read_at end,
 responded_at=case when p_status in ('accepted','declined') then now() else responded_at end
 where task_id=p_task and person_id=pid;
 if not found then raise exception 'No estás asignado a esta tarea'; end if;
 select event_id,title into ev,ttl from public.tnt_tasks where id=p_task;
 if p_status='declined' then
   update public.tnt_tasks set status='replacement' where id=p_task and status<>'completed';
   insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href)
   select em.person_id,'personal',ev,p_task,'Necesita reemplazo',(select coalesce(a.nickname,p.full_name) from public.tnt_people p left join public.tnt_accounts a on a.person_id=p.id where p.id=pid)||' no puede hacer '||ttl,'/organizacion/?task='||p_task
   from public.tnt_event_members em where em.event_id=ev and em.event_role='organizer';
 end if;
end $$;
create or replace function public.tnt_set_task_status(p_task uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare pid uuid; ev uuid;
begin
 if p_status not in ('unread','preparing','progress','review','ready','completed','replacement') then raise exception 'Estado inválido'; end if;
 pid:=public.tnt_current_person_id(); select event_id into ev from public.tnt_tasks where id=p_task;
 if not public.tnt_can_manage_event(ev) and not exists(select 1 from public.tnt_task_assignees where task_id=p_task and person_id=pid and assignment_status<>'declined') then raise exception 'Sin permiso'; end if;
 update public.tnt_tasks set status=p_status where id=p_task;
end $$;
create or replace function public.tnt_set_admin(p_person uuid,p_make_admin boolean)
returns void language plpgsql security definer set search_path=public as $$
declare admins integer;
begin
 if not public.tnt_is_admin() then raise exception 'Solo Admin'; end if;
 if not p_make_admin then
   select count(*) into admins from public.tnt_accounts where system_role='admin' and enabled;
   if admins<=1 and exists(select 1 from public.tnt_accounts where person_id=p_person and system_role='admin') then raise exception 'No se puede quitar el último Admin'; end if;
 end if;
 update public.tnt_accounts set system_role=case when p_make_admin then 'admin' else 'user' end where person_id=p_person;
end $$;

-- Updated-at triggers on new Organization tables only.
DO $$ declare r record; begin
 for r in select unnest(array['tnt_accounts','tnt_templates','tnt_events','tnt_tasks','tnt_task_checklist','tnt_availability','tnt_schedule_items','tnt_push_subscriptions']) as t loop
  execute format('drop trigger if exists %I_touch on public.%I',r.t,r.t);
  execute format('create trigger %I_touch before update on public.%I for each row execute procedure public.tnt_touch_updated_at()',r.t,r.t);
 end loop;
end $$;

-- RLS only for new Organization/account tables. Legacy central-person/attendance RLS is handled separately after explicit approval.
DO $$ declare r record; begin
 for r in select unnest(array['tnt_accounts','tnt_module_access','tnt_settings','tnt_templates','tnt_template_items','tnt_events','tnt_event_members','tnt_tasks','tnt_task_assignees','tnt_task_links','tnt_task_files','tnt_task_checklist','tnt_task_comments','tnt_availability','tnt_schedule_days','tnt_schedule_items','tnt_schedule_responsibles','tnt_groups','tnt_group_members','tnt_notifications','tnt_push_subscriptions','tnt_audit_log']) as t loop execute format('alter table public.%I enable row level security',r.t); end loop;
end $$;
DO $$ declare p record; begin
 for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('tnt_accounts','tnt_module_access','tnt_settings','tnt_templates','tnt_template_items','tnt_events','tnt_event_members','tnt_tasks','tnt_task_assignees','tnt_task_links','tnt_task_files','tnt_task_checklist','tnt_task_comments','tnt_availability','tnt_schedule_days','tnt_schedule_items','tnt_schedule_responsibles','tnt_groups','tnt_group_members','tnt_notifications','tnt_push_subscriptions','tnt_audit_log') loop execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;

create policy tnt_accounts_read on public.tnt_accounts for select to authenticated using(true);
create policy tnt_accounts_self_update on public.tnt_accounts for update to authenticated using(person_id=public.tnt_current_person_id() or public.tnt_is_admin()) with check(person_id=public.tnt_current_person_id() or public.tnt_is_admin());
create policy tnt_accounts_admin_insert on public.tnt_accounts for insert to authenticated with check(public.tnt_is_admin());
create policy tnt_accounts_admin_delete on public.tnt_accounts for delete to authenticated using(public.tnt_is_admin());
create policy tnt_module_access_read on public.tnt_module_access for select to authenticated using(person_id=public.tnt_current_person_id() or public.tnt_is_admin());
create policy tnt_module_access_admin on public.tnt_module_access for all to authenticated using(public.tnt_is_admin()) with check(public.tnt_is_admin());
create policy tnt_settings_read on public.tnt_settings for select to authenticated using(true);
create policy tnt_settings_admin on public.tnt_settings for all to authenticated using(public.tnt_is_admin()) with check(public.tnt_is_admin());
create policy tnt_templates_read on public.tnt_templates for select to authenticated using(true);
create policy tnt_templates_manage on public.tnt_templates for all to authenticated using(public.tnt_is_pastor_or_admin()) with check(public.tnt_is_pastor_or_admin());
create policy tnt_template_items_read on public.tnt_template_items for select to authenticated using(true);
create policy tnt_template_items_manage on public.tnt_template_items for all to authenticated using(public.tnt_is_pastor_or_admin()) with check(public.tnt_is_pastor_or_admin());
create policy tnt_events_read on public.tnt_events for select to authenticated using(true);
create policy tnt_events_insert on public.tnt_events for insert to authenticated with check(public.tnt_is_pastor_or_admin());
create policy tnt_events_update on public.tnt_events for update to authenticated using(public.tnt_can_manage_event(id)) with check(public.tnt_can_manage_event(id));
create policy tnt_events_delete on public.tnt_events for delete to authenticated using(public.tnt_is_pastor_or_admin());
create policy tnt_event_members_read on public.tnt_event_members for select to authenticated using(true);
create policy tnt_event_members_manage on public.tnt_event_members for all to authenticated using(public.tnt_can_manage_event(event_id)) with check(public.tnt_can_manage_event(event_id));
create policy tnt_tasks_read on public.tnt_tasks for select to authenticated using(true);
create policy tnt_tasks_manage on public.tnt_tasks for all to authenticated using(public.tnt_can_manage_event(event_id)) with check(public.tnt_can_manage_event(event_id));
create policy tnt_assignees_read on public.tnt_task_assignees for select to authenticated using(true);
create policy tnt_assignees_manage on public.tnt_task_assignees for all to authenticated using(public.tnt_can_manage_event((select event_id from public.tnt_tasks where id=task_id))) with check(public.tnt_can_manage_event((select event_id from public.tnt_tasks where id=task_id)));
create policy tnt_assignees_self_update on public.tnt_task_assignees for update to authenticated using(person_id=public.tnt_current_person_id()) with check(person_id=public.tnt_current_person_id());
create policy tnt_links_read on public.tnt_task_links for select to authenticated using(true);
create policy tnt_links_manage on public.tnt_task_links for all to authenticated using(public.tnt_can_manage_event((select event_id from public.tnt_tasks where id=task_id)) or public.tnt_is_task_assignee(task_id)) with check(public.tnt_can_manage_event((select event_id from public.tnt_tasks where id=task_id)) or public.tnt_is_task_assignee(task_id));
create policy tnt_files_read on public.tnt_task_files for select to authenticated using(true);
create policy tnt_files_manage on public.tnt_task_files for all to authenticated using(public.tnt_can_manage_event((select event_id from public.tnt_tasks where id=task_id)) or public.tnt_is_task_assignee(task_id)) with check(public.tnt_can_manage_event((select event_id from public.tnt_tasks where id=task_id)) or public.tnt_is_task_assignee(task_id));
create policy tnt_checklist_read on public.tnt_task_checklist for select to authenticated using(true);
create policy tnt_checklist_manage on public.tnt_task_checklist for all to authenticated using(public.tnt_can_manage_event((select event_id from public.tnt_tasks where id=task_id)) or public.tnt_is_task_assignee(task_id)) with check(public.tnt_can_manage_event((select event_id from public.tnt_tasks where id=task_id)) or public.tnt_is_task_assignee(task_id));
create policy tnt_comments_read on public.tnt_task_comments for select to authenticated using(true);
create policy tnt_comments_insert on public.tnt_task_comments for insert to authenticated with check(person_id=public.tnt_current_person_id());
create policy tnt_comments_delete on public.tnt_task_comments for delete to authenticated using(person_id=public.tnt_current_person_id() or public.tnt_is_admin());
create policy tnt_availability_read on public.tnt_availability for select to authenticated using(true);
create policy tnt_availability_self on public.tnt_availability for all to authenticated using(person_id=public.tnt_current_person_id() or public.tnt_is_admin()) with check(person_id=public.tnt_current_person_id() or public.tnt_is_admin());
create policy tnt_schedule_days_read on public.tnt_schedule_days for select to authenticated using(true);
create policy tnt_schedule_days_manage on public.tnt_schedule_days for all to authenticated using(public.tnt_can_manage_event(event_id)) with check(public.tnt_can_manage_event(event_id));
create policy tnt_schedule_items_read on public.tnt_schedule_items for select to authenticated using(true);
create policy tnt_schedule_items_manage on public.tnt_schedule_items for all to authenticated using(public.tnt_can_manage_event((select event_id from public.tnt_schedule_days where id=day_id))) with check(public.tnt_can_manage_event((select event_id from public.tnt_schedule_days where id=day_id)));
create policy tnt_schedule_resp_read on public.tnt_schedule_responsibles for select to authenticated using(true);
create policy tnt_schedule_resp_manage on public.tnt_schedule_responsibles for all to authenticated using(public.tnt_can_manage_event((select d.event_id from public.tnt_schedule_items i join public.tnt_schedule_days d on d.id=i.day_id where i.id=item_id))) with check(public.tnt_can_manage_event((select d.event_id from public.tnt_schedule_items i join public.tnt_schedule_days d on d.id=i.day_id where i.id=item_id)));
create policy tnt_groups_read on public.tnt_groups for select to authenticated using(true);
create policy tnt_groups_manage on public.tnt_groups for all to authenticated using(public.tnt_can_manage_event(event_id)) with check(public.tnt_can_manage_event(event_id));
create policy tnt_group_members_read on public.tnt_group_members for select to authenticated using(true);
create policy tnt_group_members_manage on public.tnt_group_members for all to authenticated using(public.tnt_can_manage_event((select event_id from public.tnt_groups where id=group_id))) with check(public.tnt_can_manage_event((select event_id from public.tnt_groups where id=group_id)));
create policy tnt_notifications_own on public.tnt_notifications for select to authenticated using(person_id=public.tnt_current_person_id() or person_id is null or public.tnt_is_admin());
create policy tnt_notifications_update_own on public.tnt_notifications for update to authenticated using(person_id=public.tnt_current_person_id()) with check(person_id=public.tnt_current_person_id());
create policy tnt_notifications_manager_insert on public.tnt_notifications for insert to authenticated with check(public.tnt_is_pastor_or_admin() or person_id=public.tnt_current_person_id());
create policy tnt_push_own on public.tnt_push_subscriptions for all to authenticated using(person_id=public.tnt_current_person_id()) with check(person_id=public.tnt_current_person_id());
create policy tnt_audit_read on public.tnt_audit_log for select to authenticated using(public.tnt_is_pastor_or_admin());

insert into public.tnt_templates(name,kind,description,is_default)
select 'Sábado normal','saturday','Plantilla base para una reunión normal de TNT.',true where not exists(select 1 from public.tnt_templates where name='Sábado normal');
insert into public.tnt_templates(name,kind,description,is_default)
select 'Evento evangelístico','event','Recepción, bienvenida, multimedia, dinámica, palabra, ministración y seguimiento.',false where not exists(select 1 from public.tnt_templates where name='Evento evangelístico');
insert into public.tnt_templates(name,kind,description,is_default)
select 'Congreso','event','Decoración, merch, acreditaciones, multimedia, escenario, invitados, hospedaje, comida, buffet y recepción.',false where not exists(select 1 from public.tnt_templates where name='Congreso');
insert into public.tnt_template_items(template_id,title,icon,task_type,sort_order)
select t.id,v.title,v.icon,'simple',v.ord from public.tnt_templates t cross join (values ('Bienvenida','👋',1),('Dinámica','⚡',2),('Ofrenda','🤲',3),('Ministración','🙏',4),('Palabra / Prédica','📖',5)) as v(title,icon,ord)
where t.name='Sábado normal' and not exists(select 1 from public.tnt_template_items i where i.template_id=t.id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tnt-files','tnt-files',false,52428800,null) on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tnt-avatars','tnt-avatars',true,5242880,array['image/jpeg','image/png','image/webp','image/gif']) on conflict(id) do nothing;
DO $$ begin
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='tnt_files_read') then create policy tnt_files_read on storage.objects for select to authenticated using(bucket_id='tnt-files'); end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='tnt_files_insert') then create policy tnt_files_insert on storage.objects for insert to authenticated with check(bucket_id='tnt-files'); end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='tnt_files_update') then create policy tnt_files_update on storage.objects for update to authenticated using(bucket_id='tnt-files') with check(bucket_id='tnt-files'); end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='tnt_files_delete') then create policy tnt_files_delete on storage.objects for delete to authenticated using(bucket_id='tnt-files' and public.tnt_is_admin()); end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='tnt_avatars_read') then create policy tnt_avatars_read on storage.objects for select using(bucket_id='tnt-avatars'); end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='tnt_avatars_write') then create policy tnt_avatars_write on storage.objects for insert to authenticated with check(bucket_id='tnt-avatars'); end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='tnt_avatars_update') then create policy tnt_avatars_update on storage.objects for update to authenticated using(bucket_id='tnt-avatars') with check(bucket_id='tnt-avatars'); end if;
end $$;