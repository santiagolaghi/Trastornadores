create or replace function public.tnt_guard_account_sensitive_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return new;end if;
 if public.tnt_is_admin() then
  if old.system_role='admin' and old.enabled and (new.system_role<>'admin' or not new.enabled)
   and (select count(*) from public.tnt_accounts where system_role='admin' and enabled)<=1 then
   raise exception 'No se puede quitar o deshabilitar el último administrador';
  end if;
  return new;
 end if;
 -- Move only the account identity key after server-side verification; roles and permissions cannot change.
 if old.auth_user_id=auth.uid() and new.person_id is distinct from old.person_id
  and (to_jsonb(new)-array['person_id','updated_at'])=(to_jsonb(old)-array['person_id','updated_at'])
  and exists(select 1 from tnt_actions.profile_claims c
   where c.auth_user_id=auth.uid() and c.source_person=old.person_id and c.target_person=new.person_id
    and c.transaction_id=txid_current()) then return new;end if;
 -- Only the invitation RPC can create this accepted receipt in the current transaction.
 -- Every other account attribute must remain identical during consent.
 if old.auth_user_id=auth.uid() and old.staff_status is distinct from 'approved' and new.staff_status='approved'
  and (to_jsonb(new)-array['ministry_role','staff_status','staff_reviewed_by','staff_reviewed_at','updated_at'])
   =(to_jsonb(old)-array['ministry_role','staff_status','staff_reviewed_by','staff_reviewed_at','updated_at'])
  and exists(select 1 from public.tnt_staff_invitations i where i.person_id=old.person_id and i.status='accepted'
   and i.role=new.ministry_role and i.invited_by=new.staff_reviewed_by
   and i.responded_at=new.staff_reviewed_at and i.responded_at=now()) then return new;end if;
 if new.system_role is distinct from old.system_role or new.ministry_role is distinct from old.ministry_role
  or new.enabled is distinct from old.enabled or new.auth_user_id is distinct from old.auth_user_id
  or new.person_id is distinct from old.person_id or new.staff_reviewed_by is distinct from old.staff_reviewed_by
  or new.staff_reviewed_at is distinct from old.staff_reviewed_at
  or (new.staff_status is distinct from old.staff_status and (new.staff_status='approved' or old.staff_status='approved')) then
  raise exception 'Solo un administrador puede aprobar o modificar un rol y sus permisos' using errcode='42501';
 end if;
 if new.email is distinct from old.email and new.email is distinct from (select email from auth.users where id=auth.uid()) then
  raise exception 'El correo se toma de tu cuenta Google' using errcode='42501';
 end if;
 if new.onboarding_completed_at is distinct from old.onboarding_completed_at then
  if old.onboarding_completed_at is not null or new.onboarding_completed_at is null or jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(new.person_id)))>0 then
   raise exception 'Completá el formulario de bienvenida antes de continuar' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
notify pgrst,'reload schema';
