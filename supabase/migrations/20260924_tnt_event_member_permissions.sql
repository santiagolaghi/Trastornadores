-- Tighten event-member permissions: only Admin/Pastor can designate organizers.
-- Existing event organizers can manage responsible/participant membership for their event.

drop policy if exists tnt_event_members_manage on public.tnt_event_members;
drop policy if exists tnt_event_members_admin_pastor on public.tnt_event_members;
drop policy if exists tnt_event_members_organizer_insert on public.tnt_event_members;
drop policy if exists tnt_event_members_organizer_update on public.tnt_event_members;
drop policy if exists tnt_event_members_organizer_delete on public.tnt_event_members;

create policy tnt_event_members_admin_pastor
on public.tnt_event_members
for all to authenticated
using (public.tnt_is_pastor_or_admin())
with check (public.tnt_is_pastor_or_admin());

create policy tnt_event_members_organizer_insert
on public.tnt_event_members
for insert to authenticated
with check (
  event_role <> 'organizer'
  and exists (
    select 1 from public.tnt_event_members mine
    where mine.event_id = tnt_event_members.event_id
      and mine.person_id = public.tnt_current_person_id()
      and mine.event_role = 'organizer'
  )
);

create policy tnt_event_members_organizer_update
on public.tnt_event_members
for update to authenticated
using (
  event_role <> 'organizer'
  and exists (
    select 1 from public.tnt_event_members mine
    where mine.event_id = tnt_event_members.event_id
      and mine.person_id = public.tnt_current_person_id()
      and mine.event_role = 'organizer'
  )
)
with check (
  event_role <> 'organizer'
  and exists (
    select 1 from public.tnt_event_members mine
    where mine.event_id = tnt_event_members.event_id
      and mine.person_id = public.tnt_current_person_id()
      and mine.event_role = 'organizer'
  )
);

create policy tnt_event_members_organizer_delete
on public.tnt_event_members
for delete to authenticated
using (
  event_role <> 'organizer'
  and exists (
    select 1 from public.tnt_event_members mine
    where mine.event_id = tnt_event_members.event_id
      and mine.person_id = public.tnt_current_person_id()
      and mine.event_role = 'organizer'
  )
);