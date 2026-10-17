-- Skills are required for the entire staff; saved answers are retained.
update public.tnt_settings set value=jsonb_set(value,'{leadership_strengths,roles}',
 '["Admin","Pastor/a","Líder","Timoteo","Colaborador"]') where key='profile_fields';

create function tnt_actions.copy_role_permissions(p_from text,p_to text) returns integer
language plpgsql security definer set search_path='' as $$
declare copied integer;
begin
 if not public.tnt_is_admin() then raise exception 'Solo administradores pueden copiar permisos' using errcode='42501';end if;
 if p_from=p_to or p_from not in('Pastor/a','Líder','Timoteo','Colaborador') or p_to not in('Pastor/a','Líder','Timoteo','Colaborador') then
  raise exception 'Elegí dos roles diferentes';end if;
 perform pg_advisory_xact_lock(hashtextextended('tnt-role-permissions',0));
 if not exists(select 1 from public.tnt_role_permission_presets where role=p_from) then raise exception 'El rol de origen no tiene permisos configurados';end if;
 delete from public.tnt_role_permission_presets where role=p_to;
 insert into public.tnt_role_permission_presets(role,module,scope,action,allowed,updated_by)
  select p_to,module,scope,action,allowed,public.tnt_current_person_id() from public.tnt_role_permission_presets where role=p_from;
 get diagnostics copied=row_count;
 insert into public.tnt_audit_log(person_id,entity_type,action,details) values(public.tnt_current_person_id(),'permissions','role_permissions_copied',jsonb_build_object('from',p_from,'to',p_to,'count',copied));
 return copied;
end $$;
create function public.tnt_copy_role_permissions(p_from text,p_to text) returns integer
language sql security invoker set search_path='' as $$select tnt_actions.copy_role_permissions(p_from,p_to)$$;
revoke all on function public.tnt_copy_role_permissions(text,text),tnt_actions.copy_role_permissions(text,text) from public,anon;
grant execute on function public.tnt_copy_role_permissions(text,text),tnt_actions.copy_role_permissions(text,text) to authenticated;


notify pgrst,'reload schema';
