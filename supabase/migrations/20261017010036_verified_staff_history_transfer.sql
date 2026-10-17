-- Historical assignments may belong to a directory entry with no account yet.
-- Only a server-verified, transaction-bound transfer can carry approved staff history.
create or replace function private.tnt_require_staff_member() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not public.tnt_is_staff(new.person_id)
  and not (tg_table_name='tnt_chat_members' and exists(
   select 1 from public.tnt_accounts where person_id=new.person_id and enabled and system_role='admin'))
  and not exists (
   select 1 from tnt_actions.profile_claims c
   join public.tnt_accounts a on a.person_id=c.source_person
   where c.target_person=new.person_id and c.auth_user_id=auth.uid()
    and c.transaction_id=txid_current() and a.auth_user_id=auth.uid()
    and a.enabled and a.staff_status='approved'
  ) then raise exception 'Elegí una persona del staff aprobado' using errcode='23514';end if;
 return new;
end $$;
notify pgrst,'reload schema';
