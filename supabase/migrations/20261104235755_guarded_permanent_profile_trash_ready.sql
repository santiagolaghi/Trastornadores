-- A history identity contains no personal data. Required shared references
-- (camp payments, invitations and authorship) survive removal of the profile.
create or replace function tnt_actions.purge_profile(p_person uuid,p_confirmation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.tnt_current_person_id(); p public.tnt_people%rowtype; ref record; needed boolean; history_person uuid;
begin
 if auth.uid() is null or actor is null or not public.tnt_is_admin() or not public.tnt_can_action('perfiles','delete','*') then
  raise exception 'Solo Administración puede eliminar perfiles definitivamente.' using errcode='42501';
 end if;
 if p_confirmation is distinct from 'ELIMINAR' then raise exception 'Confirmá la eliminación definitiva.' using errcode='22023';end if;
 select * into p from public.tnt_people where id=p_person for update;
 if not found then raise exception 'El perfil ya no existe.' using errcode='22023';end if;
 if p_person=actor then raise exception 'No podés eliminar tu propio perfil.' using errcode='42501';end if;
 if not coalesce(p.data_notes ? 'deleted_at',false) or coalesce(p.data_notes ? 'system_history',false) then
  raise exception 'Primero mové el perfil a la Papelera.' using errcode='22023';
 end if;
 delete from public.tnt_profile_archive_state where person_id=p_person;
 delete from public.tnt_profile_private_fields where person_id=p_person;
 delete from public.tnt_profile_change_requests where person_id=p_person;
 delete from public.tnt_profile_public_requests where person_id=p_person;
 delete from public.tnt_profile_link_requests where person_id=p_person or target_person_id=p_person;
 delete from public.tnt_saturday_members where person_id=p_person;
 for ref in
  select ns.nspname,cl.relname,a.attname,a.attnotnull
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class cl on cl.oid=c.conrelid
  join pg_catalog.pg_namespace ns on ns.oid=cl.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.confrelid='public.tnt_people'::regclass and c.confdeltype in ('a','r')
    and cardinality(c.conkey)=1 and ns.nspname='public' and cl.relname like 'tnt_%'
 loop
  if ref.attnotnull then
   execute format('select exists(select 1 from %I.%I where %I=$1)',ref.nspname,ref.relname,ref.attname) into needed using p_person;
   if not needed then continue;end if;
   if history_person is null then
    history_person:=gen_random_uuid();
    insert into public.tnt_people(id,full_name,normalized_name,active,data_notes)
    values(history_person,'Perfil eliminado','perfil eliminado',false,'{"system_history":true}'::jsonb);
   end if;
   execute format('update %I.%I set %I=$1 where %I=$2',ref.nspname,ref.relname,ref.attname,ref.attname) using history_person,p_person;
  else
   execute format('update %I.%I set %I=null where %I=$1',ref.nspname,ref.relname,ref.attname,ref.attname) using p_person;
  end if;
 end loop;
 delete from public.tnt_people where id=p_person;
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
 values(actor,'profile',p_person,'profile_purged',jsonb_build_object('recoverable',false,'shared_history_preserved',true));
 return jsonb_build_object('removed',true,'history_preserved',history_person is not null);
end $$;
revoke all on function tnt_actions.purge_profile(uuid,text) from public,anon;
grant execute on function tnt_actions.purge_profile(uuid,text) to authenticated;

create or replace function public.tnt_purge_profile(p_person uuid,p_confirmation text) returns jsonb
language sql security invoker set search_path='' as $$select tnt_actions.purge_profile(p_person,p_confirmation)$$;
revoke all on function public.tnt_purge_profile(uuid,text) from public,anon;
grant execute on function public.tnt_purge_profile(uuid,text) to authenticated;

create or replace function tnt_actions.guard_history_identity() returns trigger
language plpgsql set search_path='' as $$
begin
 if coalesce(old.data_notes ? 'system_history',false) then
  raise exception 'El perfil se eliminó definitivamente. Su referencia de historial no se puede restaurar.' using errcode='22023';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function tnt_actions.guard_history_identity() from public,anon,authenticated;
create trigger tnt_history_identity_guard before update or delete on public.tnt_people
for each row execute function tnt_actions.guard_history_identity();
notify pgrst,'reload schema';
