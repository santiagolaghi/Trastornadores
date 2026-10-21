-- The current account role owns profile visibility; old declarations are not roles.
CREATE OR REPLACE FUNCTION public.tnt_profile_values(p_person uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((select answers from public.tnt_profile_answers where person_id=p.id),'{}'::jsonb)
 ||jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),
 'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),
 'birthday',coalesce(p.birthday::text,''),'sex',case when p.sex='U' then '' else p.sex end,
 'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''),
 'dni',coalesce((select dni from public.tnt_profile_private_fields where person_id=p.id),''),
 '_staff_status',(select staff_status from public.tnt_accounts where person_id=p.id),
 '_ministry_role',coalesce((select case when staff_status='approved' then ministry_role when staff_status='pending' then requested_ministry_role end from public.tnt_accounts where person_id=p.id),'Comunidad'),
 '_profile_roles',coalesce((select to_jsonb(array_remove(array[case when staff_status='approved' then ministry_role when staff_status='pending' then requested_ministry_role end,case when system_role='admin' then 'Admin' end,case when staff_status not in('approved','pending') then 'Comunidad' end],null)) from public.tnt_accounts where person_id=p.id),'["Comunidad"]'::jsonb),
 'efe_group',coalesce((select g.code from public.tnt_efe_memberships m join public.tnt_efe_groups g on g.id=m.group_id where m.person_id=p.id and m.active order by m.id limit 1),
 (select answers->>'efe_group' from public.tnt_profile_answers where person_id=p.id),''))
 from public.tnt_people p where p.id=p_person;
$function$
;

CREATE OR REPLACE FUNCTION public.tnt_review_staff(p_person uuid, p_role text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.tnt_is_admin() then raise exception 'Solo un administrador puede revisar roles' using errcode='42501'; end if;
 if p_role is not null and p_role not in ('Pastor/a','Líder','Timoteo','Colaborador') then raise exception 'Elegí un rol válido'; end if;
 perform 1 from public.tnt_people where id=p_person and active and coalesce(data_notes->>'deleted_at','')='' for update;
 if not found then raise exception 'Primero restaurá el perfil para cambiar su rol'; end if;
 insert into public.tnt_accounts(person_id) values(p_person) on conflict(person_id) do nothing;
 update public.tnt_accounts set ministry_role=p_role,requested_ministry_role=p_role,staff_status=case when p_role is null then 'community' else 'approved' end,
  staff_reviewed_by=public.tnt_current_person_id(),staff_reviewed_at=now(),onboarding_completed_at=coalesce(onboarding_completed_at,now()) where person_id=p_person;
 update public.tnt_role_requests set status=case when p_role is null then 'rejected' else 'approved' end,
  approved_role=p_role,reviewed_by=public.tnt_current_person_id(),reviewed_at=now() where person_id=p_person and status='pending';
 if p_role is not null then
  insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled,granted_by)
  values(p_person,'organizacion','*','view',true,public.tnt_current_person_id()) on conflict(person_id,module,scope) do nothing;
 end if;
 update public.tnt_staff_invitations set status='accepted',responded_at=now() where person_id=p_person and status='pending';
end $function$
;

create or replace function tnt_actions.guard_community_requests() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.tnt_accounts%rowtype;
begin
 if auth.uid() is null or public.tnt_is_admin() then return new;end if;
 if tg_table_name='tnt_accounts' then
  if old.staff_status not in ('approved','pending') and (old.onboarding_completed_at is not null or old.staff_reviewed_at is not null)
   and (new.staff_status='pending' or new.requested_ministry_role is not null and new.requested_ministry_role is distinct from old.requested_ministry_role) then
   raise exception 'Los cambios de staff los realiza Administración.' using errcode='42501';end if;
 else
  select * into a from public.tnt_accounts where person_id=new.person_id;
  if tg_table_name='tnt_access_requests' and (not coalesce(a.enabled,false) or a.staff_status is distinct from 'approved') then
   raise exception 'Los accesos al equipo los administra TNT.' using errcode='42501';end if;
  if tg_table_name='tnt_role_requests' and a.staff_status not in ('approved','pending') and (a.onboarding_completed_at is not null or a.staff_reviewed_at is not null) then
   raise exception 'Los cambios de staff los realiza Administración.' using errcode='42501';end if;
 end if;
 return new;
end $$;
revoke all on function tnt_actions.guard_community_requests() from public,anon,authenticated;
create trigger tnt_community_membership_guard before update on public.tnt_accounts
 for each row execute function tnt_actions.guard_community_requests();
create trigger tnt_community_access_request_guard before insert on public.tnt_access_requests
 for each row execute function tnt_actions.guard_community_requests();
create trigger tnt_community_staff_request_guard before insert on public.tnt_role_requests
 for each row execute function tnt_actions.guard_community_requests();
create policy tnt_access_requests_staff_only on public.tnt_access_requests as restrictive for insert to authenticated
 with check(public.tnt_is_staff() or public.tnt_is_admin());
