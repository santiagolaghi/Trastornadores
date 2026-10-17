CREATE OR REPLACE FUNCTION public.tnt_review_staff(p_person uuid, p_role text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 update public.tnt_staff_invitations set status='accepted',responded_at=now() where person_id=p_person and status='pending';
end $function$
;

-- Compatibility for older installed clients: assigning a role is an admin decision.
create or replace function public.tnt_invite_staff(p_person uuid,p_role text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform public.tnt_review_staff(p_person,p_role);
 insert into public.tnt_staff_invitations(person_id,role,status,invited_by,responded_at)
 values(p_person,p_role,'accepted',public.tnt_current_person_id(),now()) returning id into result;
 return result;
end $$;

-- Apply existing admin assignments without asking the person to accept a role.
update public.tnt_accounts a set ministry_role=i.role,staff_status='approved',staff_reviewed_by=i.invited_by,staff_reviewed_at=now()
 from public.tnt_staff_invitations i join public.tnt_accounts admin on admin.person_id=i.invited_by and admin.enabled and admin.system_role='admin'
 where i.person_id=a.person_id and i.status='pending' and a.enabled;
update public.tnt_staff_invitations set status='accepted',responded_at=now() where status='pending';


notify pgrst,'reload schema';
