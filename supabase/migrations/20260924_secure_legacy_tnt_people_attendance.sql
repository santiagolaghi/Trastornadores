-- Secure legacy shared TNT people/attendance tables.
create or replace function public.tnt_can_manage_module(p_module text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.tnt_is_admin()
  or exists (
    select 1 from public.tnt_module_access ma
    where ma.person_id=public.tnt_current_person_id()
      and ma.module=p_module and ma.enabled
      and ma.access_level in ('editor','manager')
  )
$$;
revoke all on function public.tnt_can_manage_module(text) from public, anon;
grant execute on function public.tnt_can_manage_module(text) to authenticated;

alter table public.tnt_people enable row level security;
alter table public.tnt_saturday_attendance enable row level security;
alter table public.tnt_efe_groups enable row level security;
alter table public.tnt_efe_memberships enable row level security;
alter table public.tnt_efe_wednesday_attendance enable row level security;
alter table public.tnt_efe_followups enable row level security;

drop policy if exists tnt_people_read_auth on public.tnt_people;
drop policy if exists tnt_people_insert_admin on public.tnt_people;
drop policy if exists tnt_people_update_self_or_admin on public.tnt_people;
drop policy if exists tnt_people_delete_admin on public.tnt_people;
create policy tnt_people_read_auth on public.tnt_people for select to authenticated using (true);
create policy tnt_people_insert_admin on public.tnt_people for insert to authenticated with check (
  public.tnt_is_admin() or public.tnt_can_manage_module('efe') or public.tnt_can_manage_module('lista-sabados')
  or public.tnt_can_manage_module('organizacion') or public.tnt_can_manage_module('campamento')
);
create policy tnt_people_update_self_or_admin on public.tnt_people for update to authenticated
using (
  id=public.tnt_current_person_id() or public.tnt_is_admin() or public.tnt_can_manage_module('efe')
  or public.tnt_can_manage_module('lista-sabados') or public.tnt_can_manage_module('organizacion')
  or public.tnt_can_manage_module('campamento')
)
with check (
  id=public.tnt_current_person_id() or public.tnt_is_admin() or public.tnt_can_manage_module('efe')
  or public.tnt_can_manage_module('lista-sabados') or public.tnt_can_manage_module('organizacion')
  or public.tnt_can_manage_module('campamento')
);
create policy tnt_people_delete_admin on public.tnt_people for delete to authenticated using (public.tnt_is_admin());

drop policy if exists tnt_saturday_attendance_read on public.tnt_saturday_attendance;
drop policy if exists tnt_saturday_attendance_write on public.tnt_saturday_attendance;
create policy tnt_saturday_attendance_read on public.tnt_saturday_attendance for select to authenticated using (true);
create policy tnt_saturday_attendance_write on public.tnt_saturday_attendance for all to authenticated
using (public.tnt_is_admin() or public.tnt_can_manage_module('lista-sabados'))
with check (public.tnt_is_admin() or public.tnt_can_manage_module('lista-sabados'));

drop policy if exists tnt_efe_groups_read on public.tnt_efe_groups;
drop policy if exists tnt_efe_groups_write on public.tnt_efe_groups;
create policy tnt_efe_groups_read on public.tnt_efe_groups for select to authenticated using (true);
create policy tnt_efe_groups_write on public.tnt_efe_groups for all to authenticated
using (public.tnt_is_admin() or public.tnt_can_manage_module('efe'))
with check (public.tnt_is_admin() or public.tnt_can_manage_module('efe'));

drop policy if exists tnt_efe_memberships_read on public.tnt_efe_memberships;
drop policy if exists tnt_efe_memberships_write on public.tnt_efe_memberships;
create policy tnt_efe_memberships_read on public.tnt_efe_memberships for select to authenticated using (true);
create policy tnt_efe_memberships_write on public.tnt_efe_memberships for all to authenticated
using (public.tnt_is_admin() or public.tnt_can_manage_module('efe'))
with check (public.tnt_is_admin() or public.tnt_can_manage_module('efe'));

drop policy if exists tnt_efe_wed_att_read on public.tnt_efe_wednesday_attendance;
drop policy if exists tnt_efe_wed_att_write on public.tnt_efe_wednesday_attendance;
create policy tnt_efe_wed_att_read on public.tnt_efe_wednesday_attendance for select to authenticated using (true);
create policy tnt_efe_wed_att_write on public.tnt_efe_wednesday_attendance for all to authenticated
using (public.tnt_is_admin() or public.tnt_can_manage_module('efe'))
with check (public.tnt_is_admin() or public.tnt_can_manage_module('efe'));

drop policy if exists tnt_efe_followups_read on public.tnt_efe_followups;
drop policy if exists tnt_efe_followups_write on public.tnt_efe_followups;
create policy tnt_efe_followups_read on public.tnt_efe_followups for select to authenticated using (true);
create policy tnt_efe_followups_write on public.tnt_efe_followups for all to authenticated
using (public.tnt_is_admin() or public.tnt_can_manage_module('efe'))
with check (public.tnt_is_admin() or public.tnt_can_manage_module('efe'));

alter function public.tnt_sync_efe_membership() set search_path=public;
alter view public.tnt_possible_duplicates set (security_invoker = true);
alter view public.tnt_monthly_cross_attendance set (security_invoker = true);
