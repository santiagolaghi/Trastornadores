CREATE OR REPLACE FUNCTION public.tnt_review_profile_link(p_request uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.tnt_profile_link_requests%rowtype; src public.tnt_people%rowtype; dst public.tnt_people%rowtype;
 actor uuid:=public.tnt_current_person_id(); ref record; camp record; child record; rows_before jsonb; history jsonb:='[]'; dn_src text; dn_dst text;
begin
 if actor is null or not tnt_actions.can_link_request(p_request) then raise exception 'Solo administradores pueden vincular perfiles' using errcode='42501';end if;
 if p_approve is null then raise exception 'Elegí una respuesta';end if;
 select * into r from public.tnt_profile_link_requests where id=p_request for update;
 if not found or r.status<>'pending' then raise exception 'La solicitud ya fue resuelta';end if;
 if not p_approve then
  update public.tnt_profile_link_requests set status='rejected',reviewed_at=now(),reviewed_by=actor where id=r.id;
  insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details) values(actor,'profile',r.person_id,'profile_link_rejected',jsonb_build_object('request_id',r.id,'target_person_id',r.target_person_id));
  return;
 end if;
 -- Stable lock order prevents simultaneous reviews of the same people.
 perform id from public.tnt_people where id in(r.person_id,r.target_person_id) order by id for update;
 select * into src from public.tnt_people where id=r.person_id;
 select * into dst from public.tnt_people where id=r.target_person_id;
 if src.id=dst.id or not src.active or not dst.active then raise exception 'Revisá que sean dos perfiles activos de la misma persona.';end if;

 perform person_id from public.tnt_accounts where person_id in(src.id,dst.id) order by person_id for update;
 if exists(select 1 from public.tnt_accounts where person_id=dst.id) then raise exception 'El perfil de destino ya tiene una cuenta Google. Se conservan las dos cuentas.';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=src.id and enabled) then raise exception 'La cuenta de origen no está habilitada.';end if;
 -- Keep full rows before transferring references, including consolidated memberships.
 for ref in select distinct ns.nspname as schema_name,t.relname as table_name,a.attname as column_name
  from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.contype='f' and c.confrelid in('public.tnt_people'::regclass,'public.tnt_accounts'::regclass)
   and ns.nspname='public' and t.relname not in('tnt_profile_link_requests','tnt_profile_archive_state') order by 1,2,3
 loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I t where %I=$1',ref.schema_name,ref.table_name,ref.column_name) into rows_before using src.id;
  if rows_before<>'[]'::jsonb then history:=history||jsonb_build_array(jsonb_build_object('table',ref.table_name,'column',ref.column_name,'rows',rows_before));end if;
 end loop;
 select dni into dn_src from public.tnt_profile_private_fields where person_id=src.id;
 select dni into dn_dst from public.tnt_profile_private_fields where person_id=dst.id;
 if coalesce(dn_src,'')<>'' and coalesce(dn_dst,'')<>'' and dn_src<>dn_dst then raise exception 'Los DNI no coinciden. Revisá los datos antes de vincular.';end if;
 if dn_src is not null and dn_dst is not null then
  update public.tnt_profile_private_fields set dni=coalesce(nullif(dn_dst,''),dn_src) where person_id=dst.id;
  delete from public.tnt_profile_private_fields where person_id=src.id;
 end if;
 insert into public.tnt_profile_answers(person_id,answers,completed_at)
 select dst.id,answers,completed_at from public.tnt_profile_answers where person_id=src.id
 on conflict(person_id) do update set answers=excluded.answers||public.tnt_profile_answers.answers,
 completed_at=coalesce(public.tnt_profile_answers.completed_at,excluded.completed_at),updated_at=now();
 delete from public.tnt_profile_answers where person_id=src.id;
 -- Preserve the historical EFE when transferring the new account's memberships.
 update public.tnt_efe_memberships set active=false where person_id=src.id and active
 and (exists(select 1 from public.tnt_efe_memberships where person_id=dst.id and active) or exists(select 1 from public.tnt_profile_answers where person_id=dst.id and answers->>'efe_group'='none'));
 delete from public.tnt_saturday_members s where s.person_id=src.id and exists(select 1 from public.tnt_saturday_members where person_id=dst.id);
 update public.tnt_efe_memberships d set leader_name=coalesce(nullif(d.leader_name,''),s.leader_name) from public.tnt_efe_memberships s where d.person_id=dst.id and s.person_id=src.id and d.group_id=s.group_id;
 delete from public.tnt_efe_memberships s where s.person_id=src.id and exists(select 1 from public.tnt_efe_memberships where person_id=dst.id and group_id=s.group_id);
 history:=history||tnt_actions.merge_profile_relations(src.id,dst.id)||tnt_actions.merge_profile_camps(src.id,dst.id);
 -- Pending personal edits contain the old snapshot and must be re-submitted after linking.
 update public.tnt_profile_change_requests set status='cancelled' where person_id=src.id and status='pending';
 set constraints public.tnt_role_requests_person_id_fkey deferred;
 for ref in select distinct ns.nspname as schema_name,t.relname as table_name,a.attname as column_name
  from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.contype='f' and c.confrelid in('public.tnt_people'::regclass,'public.tnt_accounts'::regclass)
   and ns.nspname='public' and t.relname not in('tnt_profile_link_requests','tnt_profile_archive_state') and not (a.attname='person_id' and t.relname in('tnt_access_grants','tnt_person_permission_overrides','tnt_module_access')) order by 1,2,3
 loop
  execute format('update %I.%I set %I=$1 where %I=$2',ref.schema_name,ref.table_name,ref.column_name,ref.column_name) using dst.id,src.id;
 end loop;
 set constraints public.tnt_role_requests_person_id_fkey immediate;
 -- Existing central data has precedence; only fill its missing contact fields.
 update public.tnt_people set phone=coalesce(nullif(phone,''),src.phone),instagram=coalesce(nullif(instagram,''),src.instagram),sex=case when sex='U' and src.sex in('M','F') then src.sex else sex end,first_name=coalesce(nullif(first_name,''),split_part(full_name,' ',1)),last_name=coalesce(nullif(last_name,''),trim(substr(full_name,length(split_part(full_name,' ',1))+1))),profile_consent=profile_consent or src.profile_consent,updated_at=now() where id=dst.id;
 update public.tnt_people set active=false,data_notes=coalesce(data_notes,'{}')||jsonb_build_object('linked_to',dst.id,'linked_at',now()),updated_at=now() where id=src.id;
 update public.tnt_profile_link_requests set status=case when id=r.id then 'approved' else 'cancelled' end,reviewed_at=now(),reviewed_by=actor where person_id=src.id and status='pending';
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details) values(actor,'profile',dst.id,'profile_link_approved',jsonb_build_object('request_id',r.id,'source',to_jsonb(src),'destination',to_jsonb(dst),'references_before',history));
 insert into public.tnt_notifications(person_id,title,body,href) values(dst.id,'Tu perfil quedó vinculado','Tu cuenta Google ahora usa tu perfil de TNT y su historial. Revisá tus datos desde Mi perfil.','/?profile=1');
exception when unique_violation then
 raise exception 'No pudimos consolidar un registro compartido. Tus datos y tu historial se conservaron; podés reintentar.';
end $function$
;


notify pgrst,'reload schema';
