create or replace function public.tnt_guard_own_profile_review() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.id=public.tnt_current_person_id() and not public.tnt_is_admin()
 and not public.tnt_can_action('perfiles','edit','*')
 and exists(select 1 from public.tnt_accounts where person_id=old.id and onboarding_completed_at is not null)
 and (new.full_name,new.first_name,new.last_name,new.birthday,new.sex,new.phone,new.instagram,new.data_notes,new.active)
 is distinct from (old.full_name,old.first_name,old.last_name,old.birthday,old.sex,old.phone,old.instagram,old.data_notes,old.active)
 then raise exception 'Enviá tus cambios de perfil a revisión' using errcode='42501';end if;
 return new;
end $$;
revoke all on function public.tnt_guard_own_profile_review() from public,anon,authenticated;
create trigger own_profile_review_guard before update on public.tnt_people for each row execute function public.tnt_guard_own_profile_review();
