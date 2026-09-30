-- Administrative supervision is independent of a person's ministry function.
create or replace function private.tnt_require_staff_member() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not public.tnt_is_staff(new.person_id) and not (tg_table_name='tnt_chat_members' and exists(
  select 1 from public.tnt_accounts where person_id=new.person_id and enabled and system_role='admin')) then
  raise exception 'Elegí una persona del staff aprobado' using errcode='23514';
 end if;
 return new;
end $$;
notify pgrst,'reload schema';
