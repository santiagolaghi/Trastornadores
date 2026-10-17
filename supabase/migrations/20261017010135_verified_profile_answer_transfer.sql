-- A verified continuation may transfer this person's saved answers before the account FK moves.
create or replace function public.tnt_guard_sensitive_profile_answers() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb:='{}';entry record;
begin
 if tg_op='UPDATE' then previous:=old.answers;end if;
 if new.answers->'health' is distinct from previous->'health' and auth.uid() is not null
  and not public.tnt_is_admin() and new.person_id is distinct from public.tnt_current_person_id()
  and not exists(select 1 from tnt_actions.profile_claims c join public.tnt_accounts a on a.person_id=c.source_person
   where c.auth_user_id=auth.uid() and a.auth_user_id=auth.uid() and a.enabled
    and c.target_person=new.person_id and c.transaction_id=txid_current()) then
  raise exception 'Los datos de salud solo los edita la persona o un administrador' using errcode='42501';
 end if;
 if new.answers ? 'leadership_strengths' then
  if jsonb_typeof(new.answers->'leadership_strengths')<>'object' then raise exception 'Revisá tus fortalezas de liderazgo';end if;
  for entry in select * from jsonb_each(new.answers->'leadership_strengths') loop
   if entry.key not in ('Acompañar jóvenes','Acompañar adolescentes','Enseñar','Escuchar','Organizar equipos','Comunicar')
    or jsonb_typeof(entry.value)<>'number' then raise exception 'Revisá tus fortalezas de liderazgo';end if;
   if entry.value::text::numeric not between 0 and 100 then raise exception 'Cada porcentaje debe estar entre 0 y 100';end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function public.tnt_guard_sensitive_profile_answers() from public,anon,authenticated;
notify pgrst,'reload schema';
