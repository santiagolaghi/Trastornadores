-- Validate every publisher, including older installed clients, without changing draft history.
create or replace function tnt_actions.validate_appearance() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.config ? 'appearance' and (
  jsonb_typeof(new.config->'appearance')<>'object'
  or coalesce(new.config->'appearance'->>'style','') not in('graphic','editorial','studio')
 ) then raise exception 'Elegí un estilo de TNT válido.';end if;
 return new;
end $$;
revoke all on function tnt_actions.validate_appearance() from public,anon,authenticated;
create or replace trigger tnt_validate_appearance_before_write
before insert or update of config on public.tnt_experience
for each row execute function tnt_actions.validate_appearance();
update public.tnt_experience set config=jsonb_set(config,'{appearance}','{"style":"graphic"}'),revision=revision+1,updated_at=now()
where id and not (config ? 'appearance');
notify pgrst,'reload schema';
