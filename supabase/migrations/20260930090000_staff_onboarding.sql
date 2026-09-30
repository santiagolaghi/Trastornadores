-- The attendance directory and the approved staff roster are distinct.
alter table public.tnt_accounts alter column ministry_role drop not null;
alter table public.tnt_accounts alter column ministry_role drop default;
alter table public.tnt_accounts add column if not exists staff_status text not null default 'community' check(staff_status in ('community','pending','approved','rejected'));
alter table public.tnt_accounts add column if not exists requested_ministry_role text check(requested_ministry_role in ('Pastor/a','Líder','Timoteo','Colaborador'));
alter table public.tnt_accounts add column if not exists onboarding_completed_at timestamptz;
alter table public.tnt_accounts add column if not exists staff_reviewed_at timestamptz;
alter table public.tnt_accounts add column if not exists staff_reviewed_by uuid references public.tnt_people(id);
-- Preserve the two existing administrators; no attendee is promoted by this migration.
update public.tnt_accounts set staff_status='approved',onboarding_completed_at=coalesce(onboarding_completed_at,now()),staff_reviewed_at=now() where system_role='admin';

create table if not exists public.tnt_role_requests (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references public.tnt_accounts(person_id) on delete cascade,
 requested_role text not null check(requested_role in ('Pastor/a','Líder','Timoteo','Colaborador')),
 approved_role text check(approved_role in ('Pastor/a','Líder','Timoteo','Colaborador')),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 reviewed_by uuid references public.tnt_people(id),reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists tnt_role_request_pending on public.tnt_role_requests(person_id) where status='pending';
create index if not exists tnt_role_requests_reviewer on public.tnt_role_requests(reviewed_by);
alter table public.tnt_role_requests enable row level security;
create policy tnt_role_requests_read on public.tnt_role_requests for select to authenticated using(person_id=(select public.tnt_current_person_id()) or (select public.tnt_is_admin()));
grant select on public.tnt_role_requests to authenticated;

create or replace function public.tnt_is_staff(p_person uuid default public.tnt_current_person_id()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_accounts where person_id=p_person and enabled and staff_status='approved')
$$;
revoke all on function public.tnt_is_staff(uuid) from public,anon;
grant execute on function public.tnt_is_staff(uuid) to authenticated;

create or replace function public.tnt_guard_account_sensitive_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return new; end if;
 if public.tnt_is_admin() then
  if old.system_role='admin' and old.enabled and (new.system_role<>'admin' or not new.enabled)
    and (select count(*) from public.tnt_accounts where system_role='admin' and enabled)<=1 then
    raise exception 'No se puede quitar o deshabilitar el último administrador';
  end if;
  return new;
 end if;
 if new.system_role is distinct from old.system_role or new.ministry_role is distinct from old.ministry_role
  or new.enabled is distinct from old.enabled or new.auth_user_id is distinct from old.auth_user_id
  or new.person_id is distinct from old.person_id or new.staff_reviewed_by is distinct from old.staff_reviewed_by
  or new.staff_reviewed_at is distinct from old.staff_reviewed_at
  or (new.staff_status is distinct from old.staff_status and (new.staff_status='approved' or old.staff_status='approved')) then
  raise exception 'Solo un administrador puede aprobar o modificar un rol y sus permisos' using errcode='42501';
 end if;
 return new;
end $$;

create or replace function public.tnt_complete_onboarding(p_staff boolean,p_role text default null,p_birthday date default null,p_sex text default 'U') returns void
language plpgsql security definer set search_path='' as $$
declare v_person uuid:=public.tnt_current_person_id(); v_account public.tnt_accounts%rowtype;
begin
 if v_person is null then raise exception 'Iniciá sesión nuevamente' using errcode='42501'; end if;
 select * into v_account from public.tnt_accounts where person_id=v_person for update;
 if p_birthday>current_date or p_birthday<date '1900-01-01' then raise exception 'Revisá tu fecha de nacimiento'; end if;
 if p_sex not in ('M','F','U') then raise exception 'Elegí una opción válida'; end if;
 if p_staff and coalesce(p_role,'') not in ('Pastor/a','Líder','Timoteo','Colaborador') then raise exception 'Elegí tu función en el equipo'; end if;
 update public.tnt_people set birthday=coalesce(p_birthday,birthday),sex=p_sex where id=v_person;
 update public.tnt_role_requests set status='cancelled' where person_id=v_person and status='pending';
 if p_staff and (v_account.staff_status<>'approved' or p_role is distinct from v_account.ministry_role) then
  insert into public.tnt_role_requests(person_id,requested_role) values(v_person,p_role);
 end if;
 update public.tnt_accounts set requested_ministry_role=case when p_staff then p_role else null end,
  staff_status=case when staff_status='approved' then staff_status when p_staff then 'pending' else 'community' end,
  onboarding_completed_at=now() where person_id=v_person;
end $$;
revoke all on function public.tnt_complete_onboarding(boolean,text,date,text) from public,anon;
grant execute on function public.tnt_complete_onboarding(boolean,text,date,text) to authenticated;

create or replace function public.tnt_review_staff(p_person uuid,p_role text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.tnt_is_admin() then raise exception 'Solo un administrador puede revisar roles' using errcode='42501'; end if;
 if p_role is not null and p_role not in ('Pastor/a','Líder','Timoteo','Colaborador') then raise exception 'Elegí un rol válido'; end if;
 perform 1 from public.tnt_accounts where person_id=p_person for update;
 if not found then raise exception 'No se encontró la cuenta'; end if;
 update public.tnt_accounts set ministry_role=p_role,staff_status=case when p_role is null then 'community' else 'approved' end,
  staff_reviewed_by=public.tnt_current_person_id(),staff_reviewed_at=now(),onboarding_completed_at=coalesce(onboarding_completed_at,now()) where person_id=p_person;
 update public.tnt_role_requests set status=case when p_role is null then 'rejected' else 'approved' end,
  approved_role=p_role,reviewed_by=public.tnt_current_person_id(),reviewed_at=now() where person_id=p_person and status='pending';
 if p_role is not null then
  insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled,granted_by)
  values(p_person,'organizacion','*','view',true,public.tnt_current_person_id()) on conflict(person_id,module,scope) do nothing;
 end if;
end $$;
revoke all on function public.tnt_review_staff(uuid,text) from public,anon;
grant execute on function public.tnt_review_staff(uuid,text) to authenticated;

create or replace function public.tnt_is_pastor_or_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_accounts where auth_user_id=auth.uid() and enabled
 and (system_role='admin' or (staff_status='approved' and ministry_role='Pastor/a')))
$$;

create or replace function public.tnt_has_access(p_module text,p_scope text default '*',p_min_level text default 'view') returns boolean
language sql stable security definer set search_path='' as $$
 select public.tnt_current_person_id() is not null and (public.tnt_is_admin() or public.tnt_is_staff()) and (
 (p_module<>'efe' and public.tnt_is_admin())
 or (p_module='chat' and public.tnt_is_staff() and public.tnt_access_rank(p_min_level)<=1)
 or exists(select 1 from public.tnt_access_grants g where g.person_id=public.tnt_current_person_id() and g.module=p_module and g.enabled
  and (g.scope=p_scope or (g.scope='*' and not exists(select 1 from public.tnt_access_grants exact where exact.person_id=g.person_id and exact.module=g.module and exact.scope=p_scope))) and (g.valid_from is null or g.valid_from<=now()) and (g.valid_until is null or g.valid_until>=now())
  and public.tnt_access_rank(g.access_level)>=public.tnt_access_rank(p_min_level))
 or (p_module<>'efe' and exists(select 1 from public.tnt_module_access m where m.person_id=public.tnt_current_person_id() and m.module=p_module and m.enabled
  and not exists(select 1 from public.tnt_access_grants g where g.person_id=m.person_id and g.module=p_module and g.scope='*')
  and public.tnt_access_rank(case m.access_level when 'manager' then 'manage' when 'editor' then 'edit' else 'view' end)>=public.tnt_access_rank(p_min_level))))
$$;

create or replace function public.tnt_can_read_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.tnt_current_person_id() is not null and
 (public.tnt_is_admin() or (public.tnt_is_staff() and exists(select 1 from public.tnt_chat_threads t
  join public.tnt_chat_members m on m.thread_id=t.id where t.id=p_thread and not t.is_archived and m.person_id=public.tnt_current_person_id())))
$$;
drop policy if exists tnt_chat_members_self_insert on public.tnt_chat_members;

-- Backend validation also rejects assignments from a crafted request.
create or replace function private.tnt_require_staff_member() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not public.tnt_is_staff(new.person_id) then raise exception 'Elegí una persona del staff aprobado' using errcode='23514'; end if;
 return new;
end $$;
create trigger tnt_task_staff_member before insert or update of person_id on public.tnt_task_assignees for each row execute function private.tnt_require_staff_member();
create trigger tnt_schedule_staff_member before insert or update of person_id on public.tnt_schedule_responsibles for each row execute function private.tnt_require_staff_member();
create trigger tnt_chat_staff_member before insert or update of person_id on public.tnt_chat_members for each row execute function private.tnt_require_staff_member();
notify pgrst,'reload schema';
-- Community accounts can read their own identity without receiving the staff directory.
drop policy if exists tnt_accounts_read on public.tnt_accounts;
create policy tnt_accounts_read on public.tnt_accounts for select to authenticated using(person_id=(select public.tnt_current_person_id()) or (select public.tnt_is_staff()) or (select public.tnt_is_admin()));
drop policy if exists tnt_people_read on public.tnt_people;
drop policy if exists tnt_people_read_auth on public.tnt_people;
create policy tnt_people_read on public.tnt_people for select to authenticated using(id=(select public.tnt_current_person_id()) or (select public.tnt_is_staff()) or (select public.tnt_is_admin()));
