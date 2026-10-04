-- Deletion is recoverable and preserves every attendance, payment and assignment.
-- Archiving remains a separate state; restoring from trash returns to that state.
CREATE OR REPLACE FUNCTION public.tnt_set_profile_active(p_person uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.tnt_people%rowtype; s public.tnt_profile_archive_state%rowtype; actor uuid:=public.tnt_current_person_id();
begin
 if actor is null or not (public.tnt_is_admin() or public.tnt_can_action('perfiles','delete','*')) then
  raise exception 'No tenés permiso para archivar o restaurar perfiles.' using errcode='42501';
 end if;
 if p_active is null then raise exception 'Elegí el estado del perfil';end if;
 select * into p from public.tnt_people where id=p_person for update;
 if not found then raise exception 'Perfil no encontrado';end if;
 if p.data_notes ? 'deleted_at' then raise exception 'Restaurá este perfil desde la Papelera antes de cambiar su estado.';end if;
 if p_person=actor and not p_active then raise exception 'No podés archivar tu propio perfil desde acá.';end if;
 if not public.tnt_is_admin() and exists(select 1 from public.tnt_accounts where person_id=p_person) then raise exception 'Los perfiles con cuenta Google los archiva o restaura un administrador TNT.' using errcode='42501';end if;
 if p.data_notes ? 'linked_to' then raise exception 'Este registro ya está vinculado a otro perfil.';end if;
 if p.active=p_active then return;end if;
 if not p_active then
  insert into public.tnt_profile_archive_state(person_id,account_enabled,saturday_active,efe_members)
   values(p_person,(select enabled from public.tnt_accounts where person_id=p_person),
    coalesce((select active from public.tnt_saturday_members where person_id=p_person),false),
    array(select id from public.tnt_efe_memberships where person_id=p_person and active))
   on conflict(person_id) do update set account_enabled=excluded.account_enabled,saturday_active=excluded.saturday_active,efe_members=excluded.efe_members,archived_at=now();
  update public.tnt_accounts set enabled=false where person_id=p_person;
  update public.tnt_saturday_members set active=false where person_id=p_person;
  update public.tnt_efe_memberships set active=false where person_id=p_person;
 else
  select * into s from public.tnt_profile_archive_state where person_id=p_person;
  if found then
   update public.tnt_accounts set enabled=s.account_enabled where person_id=p_person and s.account_enabled is not null;
   update public.tnt_saturday_members set active=s.saturday_active where person_id=p_person;
   update public.tnt_efe_memberships set active=true where person_id=p_person and id=any(s.efe_members);
   delete from public.tnt_profile_archive_state where person_id=p_person;
  end if;
 end if;
 update public.tnt_people set active=p_active,updated_at=now() where id=p_person;
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
  values(actor,'profile',p_person,case when p_active then 'profile_restored' else 'profile_archived' end,jsonb_build_object('name',p.full_name,'history_preserved',true));
end $function$;

create or replace function public.tnt_delete_profile(p_person uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare p public.tnt_people%rowtype;actor uuid:=public.tnt_current_person_id();
begin
 if actor is null or not public.tnt_can_action('perfiles','delete','*') then
  raise exception 'No tenés permiso para eliminar perfiles.' using errcode='42501';
 end if;
 select * into p from public.tnt_people where id=p_person for update;
 if not found then raise exception 'Perfil no encontrado.';end if;
 if p_person=actor then raise exception 'No podés eliminar tu propio perfil desde acá.';end if;
 if not public.tnt_is_admin() and exists(select 1 from public.tnt_accounts where person_id=p_person) then
  raise exception 'Los perfiles con una cuenta los elimina un administrador TNT.' using errcode='42501';
 end if;
 if p.data_notes ? 'linked_to' then raise exception 'Este registro ya se vinculó a otro perfil.';end if;
 if p.data_notes ? 'deleted_at' then return;end if;
 perform public.tnt_set_profile_active(p_person,false);
 update public.tnt_people set
  data_notes=coalesce(data_notes,'{}'::jsonb)||jsonb_build_object('deleted_at',now(),'deleted_by',actor,'deleted_previous_active',p.active),
  updated_at=now() where id=p_person;
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
  values(actor,'profile',p_person,'profile_deleted',jsonb_build_object('name',p.full_name,'recoverable',true,'history_preserved',true));
end $$;
revoke all on function public.tnt_delete_profile(uuid) from public,anon;
grant execute on function public.tnt_delete_profile(uuid) to authenticated;

create or replace function public.tnt_restore_deleted_profile(p_person uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare p public.tnt_people%rowtype;actor uuid:=public.tnt_current_person_id();was_active boolean;
begin
 if actor is null or not public.tnt_can_action('perfiles','delete','*') then
  raise exception 'No tenés permiso para restaurar perfiles.' using errcode='42501';
 end if;
 select * into p from public.tnt_people where id=p_person for update;
 if not found then raise exception 'Perfil no encontrado.';end if;
 if not public.tnt_is_admin() and exists(select 1 from public.tnt_accounts where person_id=p_person) then
  raise exception 'Los perfiles con una cuenta los restaura un administrador TNT.' using errcode='42501';
 end if;
 if not (p.data_notes ? 'deleted_at') then return;end if;
 was_active:=coalesce((p.data_notes->>'deleted_previous_active')::boolean,true);
 update public.tnt_people set data_notes=data_notes-'deleted_at'-'deleted_by'-'deleted_previous_active',updated_at=now()
  where id=p_person;
 perform public.tnt_set_profile_active(p_person,was_active);
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
  values(actor,'profile',p_person,'profile_restored_from_trash',jsonb_build_object('name',p.full_name,'active',was_active,'history_preserved',true));
end $$;
revoke all on function public.tnt_restore_deleted_profile(uuid) from public,anon;
grant execute on function public.tnt_restore_deleted_profile(uuid) to authenticated;
notify pgrst,'reload schema';
