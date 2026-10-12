CREATE OR REPLACE FUNCTION public.tnt_profile_values(p_person uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((select answers from public.tnt_profile_answers where person_id=p.id),'{}'::jsonb)
 ||jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),
 'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),
 'birthday',coalesce(p.birthday::text,''),'sex',case when p.sex='U' then '' else p.sex end,
 'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''),
 'dni',coalesce((select dni from public.tnt_profile_private_fields where person_id=p.id),''),
 '_ministry_role',coalesce((select coalesce(ministry_role,requested_ministry_role) from public.tnt_accounts where person_id=p.id),'Comunidad'),
 '_profile_roles',coalesce((select to_jsonb(array_remove(array[coalesce(ministry_role,requested_ministry_role),case when system_role='admin' then 'Admin' end,case when staff_status not in('approved','pending') then 'Comunidad' end],null)) from public.tnt_accounts where person_id=p.id),'["Comunidad"]'::jsonb),
 'efe_group',coalesce((select g.code from public.tnt_efe_memberships m join public.tnt_efe_groups g on g.id=m.group_id where m.person_id=p.id and m.active order by m.id limit 1),
 (select answers->>'efe_group' from public.tnt_profile_answers where person_id=p.id),''))
 from public.tnt_people p where p.id=p_person;
$function$;


CREATE OR REPLACE FUNCTION public.tnt_review_profile_link(p_request uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.tnt_profile_link_requests%rowtype; src public.tnt_people%rowtype; dst public.tnt_people%rowtype;
 actor uuid:=public.tnt_current_person_id(); ref record; rows_before jsonb; history jsonb:='[]'; dn_src text; dn_dst text;
begin
 if actor is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden vincular perfiles' using errcode='42501';end if;
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
 -- Pending personal edits contain the old snapshot and must be re-submitted after linking.
 update public.tnt_profile_change_requests set status='cancelled' where person_id=src.id and status='pending';
 set constraints public.tnt_role_requests_person_id_fkey deferred;
 for ref in select distinct ns.nspname as schema_name,t.relname as table_name,a.attname as column_name
  from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.contype='f' and c.confrelid in('public.tnt_people'::regclass,'public.tnt_accounts'::regclass)
   and ns.nspname='public' and t.relname not in('tnt_profile_link_requests','tnt_profile_archive_state') order by 1,2,3
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
 raise exception 'Los dos registros tienen historial superpuesto. Se conserva todo y no se realiza la vinculación. Un administrador debe revisar el conflicto.';
end $function$;

-- Role-specific requirements apply to old and new accounts alike.
create or replace function public.tnt_profile_field_applies(p_field jsonb,p_values jsonb) returns boolean
language sql stable set search_path='' as $$
 select not (p_field ? 'roles') or p_field->'roles'='[]'::jsonb
 or coalesce(p_field->'roles' ? (p_values->>'_ministry_role'),false)
 or exists(select 1 from jsonb_array_elements_text(coalesce(p_values->'_profile_roles','[]'::jsonb)) r(role)
           where p_field->'roles' ? r.role);
$$;
revoke all on function public.tnt_profile_field_applies(jsonb,jsonb) from public,anon;
grant execute on function public.tnt_profile_field_applies(jsonb,jsonb) to authenticated;

create or replace function public.tnt_profile_missing_values(p_values jsonb) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'label',coalesce(value->>'label',key))),'[]'::jsonb)
 from jsonb_each(public.tnt_profile_fields()) f
 where value->>'visible' is distinct from 'false' and value->>'required'='true'
 and public.tnt_profile_field_applies(value,p_values)
 and (p_values->key is null or p_values->key in ('null'::jsonb,'[]'::jsonb,'{}'::jsonb)
 or trim(coalesce(p_values->>key,''))='' or (key='sex' and p_values->>key not in('M','F'))
 or (value->>'type'='leadership' and
   (jsonb_typeof(p_values->key) is distinct from 'object' or
    not coalesce(p_values->key ?& array['Acompañar jóvenes','Acompañar adolescentes','Enseñar','Escuchar','Organizar equipos','Comunicar'],false))));
$$;

create or replace function public.tnt_save_profile_fields(p_fields jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare f record;role_value text;
begin
 if public.tnt_current_person_id() is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden configurar Perfiles' using errcode='42501';end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or (select count(*) from jsonb_object_keys(p_fields))>40 then raise exception 'Revisá la configuración';end if;
 for f in select * from jsonb_each(p_fields) loop
  if f.key !~ '^[a-z][a-z0-9_]{0,50}$' or jsonb_typeof(f.value)<>'object' or length(coalesce(f.value->>'label','')) not between 1 and 120
  or coalesce(f.value->>'type','') not in('text','textarea','date','tel','select','multiselect','efe','leadership')
  or coalesce(f.value->>'visible','') not in('true','false') or coalesce(f.value->>'required','') not in('true','false')
  then raise exception 'Revisá el campo %',f.key;end if;
  if f.value ? 'roles' then
   if jsonb_typeof(f.value->'roles')<>'array' then raise exception 'Revisá los roles del campo %',f.key;end if;
   for role_value in select jsonb_array_elements_text(f.value->'roles') loop
    if role_value not in ('Admin','Pastor/a','Líder','Timoteo','Colaborador','Comunidad') then raise exception 'Rol no válido: %',role_value;end if;
   end loop;
  end if;
  if f.value->>'type' in('select','multiselect') and (jsonb_typeof(f.value->'options') is distinct from 'array' or jsonb_array_length(f.value->'options')=0) then
   raise exception 'Agregá las opciones de %',f.value->>'label';end if;
  if f.value->>'type'='leadership' and f.value ? 'default' and
    (jsonb_typeof(f.value->'default')<>'number' or (f.value->>'default')::numeric not between 0 and 100) then
   raise exception 'El porcentaje inicial debe estar entre 0 y 100';end if;
 end loop;
 insert into public.tnt_settings(key,value) values('profile_fields',p_fields)
 on conflict(key) do update set value=excluded.value;
end $$;

create or replace function public.tnt_save_my_profile(p_values jsonb,p_presentation jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();previous jsonb;proposed jsonb;request_id uuid;
begin
 if pid is null then raise exception 'Iniciá sesión' using errcode='42501';end if;
 perform 1 from public.tnt_people where id=pid and active for update;
 if not found or not exists(select 1 from public.tnt_accounts where person_id=pid and enabled) then raise exception 'Perfil no disponible';end if;
 p_values:=p_values-array['_ministry_role','_profile_roles'];
 previous:=public.tnt_profile_values(pid);
 perform public.tnt_validate_profile_values(previous||p_values);
 select coalesce(jsonb_object_agg(f.key,coalesce(p_values->f.key,previous->f.key)),'{}') into proposed
 from jsonb_each(public.tnt_profile_fields()) f
 where f.key in ('first_name','last_name','birthday','sex','phone','instagram','dni');
 if exists(select 1 from jsonb_each(proposed) f where f.value is distinct from previous->f.key) then
  request_id:=public.tnt_request_profile_change(proposed);
 end if;
 perform public.tnt_apply_profile_answers(pid,p_values);
 if jsonb_typeof(p_presentation)<>'object' or length(coalesce(p_presentation->>'nickname',''))>80 or
    length(coalesce(p_presentation->>'bio',''))>500 then raise exception 'Revisá tu presentación';end if;
 update public.tnt_accounts set
 nickname=coalesce(nullif(trim(p_presentation->>'nickname'),''),nickname),
 bio=case when p_presentation ? 'bio' then p_presentation->>'bio' else bio end,
 avatar_url=case when p_presentation ? 'avatar_url' then p_presentation->>'avatar_url' else avatar_url end,
 skills=case when jsonb_typeof(p_presentation->'skills')='array' then array(select jsonb_array_elements_text(p_presentation->'skills')) else skills end,
 service_areas=case when jsonb_typeof(p_presentation->'service_areas')='array' then array(select jsonb_array_elements_text(p_presentation->'service_areas')) else service_areas end,
 availability_days=case when jsonb_typeof(p_presentation->'availability_days')='array' then array(select jsonb_array_elements_text(p_presentation->'availability_days')) else availability_days end
 where person_id=pid;
 return jsonb_build_object('identity_pending',request_id is not null);
end $$;
revoke all on function public.tnt_save_my_profile(jsonb,jsonb) from public,anon;
grant execute on function public.tnt_save_my_profile(jsonb,jsonb) to authenticated;

-- The person's own profile is available independently of directory access.
create or replace function public.tnt_profile_detail(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb;pid uuid:=public.tnt_current_person_id();
begin
 if pid is null or (p_person<>pid and not public.tnt_has_access('perfiles','*','view')) then
  raise exception 'No tenés acceso a Perfiles' using errcode='42501';end if;
 v:=public.tnt_profile_values(p_person);
 if not public.tnt_is_admin() and p_person<>pid then v:=v-'dni'-'health';end if;
 return jsonb_build_object('values',v,'fields',public.tnt_profile_fields(),
  'groups',(select jsonb_agg(jsonb_build_object('code',code,'name',name)) from public.tnt_efe_groups));
end $$;

create or replace function public.tnt_profile_link_preview(p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.tnt_profile_link_requests%rowtype;s jsonb;t jsonb;
begin
 if public.tnt_current_person_id() is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden revisar vínculos' using errcode='42501';end if;
 select * into r from public.tnt_profile_link_requests where id=p_request and status='pending';
 if not found then raise exception 'La solicitud ya fue atendida';end if;
 select (to_jsonb(p)-'data_notes')||public.tnt_profile_values(p.id) into s from public.tnt_people p where p.id=r.person_id;
 select (to_jsonb(p)-'data_notes')||public.tnt_profile_values(p.id) into t from public.tnt_people p where p.id=r.target_person_id;
 return jsonb_build_object('source',s,'target',t,'fields',public.tnt_profile_fields(),'revision',md5(s::text||t::text),'history',jsonb_build_object(
 'saturdays',(select count(*) from public.tnt_saturday_attendance where person_id in(r.person_id,r.target_person_id)),
 'efe',(select count(*) from public.tnt_efe_wednesday_attendance where person_id in(r.person_id,r.target_person_id)),
 'camps',(select count(*) from public.tnt_camp_registrations where person_id in(r.person_id,r.target_person_id)),
 'messages',(select count(*) from public.tnt_chat_messages where person_id in(r.person_id,r.target_person_id))));
end $$;

create or replace function public.tnt_merge_profile_values(s jsonb,t jsonb,p_choices jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare merged jsonb:='{}';f record;k text;sv jsonb;tv jsonb;chosen text;sub record;obj jsonb;
begin
 for f in select * from jsonb_each(public.tnt_profile_fields()) loop
  k:=f.key;sv:=s->k;tv:=t->k;
  if sv is null or sv in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb) then merged:=merged||jsonb_build_object(k,tv);continue;end if;
  if tv is null or tv in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb) or sv=tv then merged:=merged||jsonb_build_object(k,sv);continue;end if;
  if f.value->>'type'='leadership' then
   obj:='{}';
   for sub in select key from jsonb_each(sv||tv) loop
    if sv->sub.key is null then obj:=obj||jsonb_build_object(sub.key,tv->sub.key);
    elsif tv->sub.key is null or sv->sub.key=tv->sub.key then obj:=obj||jsonb_build_object(sub.key,sv->sub.key);
    else
     chosen:=p_choices->>(k||'.'||sub.key);
     if chosen not in('source','target') or chosen is null then raise exception 'Elegí con qué valor quedarte en %',sub.key;end if;
     obj:=obj||jsonb_build_object(sub.key,case when chosen='source' then sv->sub.key else tv->sub.key end);
    end if;
   end loop;
   merged:=merged||jsonb_build_object(k,obj);continue;
  end if;
  chosen:=p_choices->>k;
  if chosen='combine' and f.value->>'type'='multiselect' then
   merged:=merged||jsonb_build_object(k,(select jsonb_agg(value) from (select distinct value from jsonb_array_elements(sv||tv)) combined));continue;
  end if;
  if chosen not in('source','target') or chosen is null then raise exception 'Elegí con qué dato quedarte en %',f.value->>'label';end if;
  merged:=merged||jsonb_build_object(k,case when chosen='source' then sv else tv end);
 end loop;
 return merged;
end $$;
revoke all on function public.tnt_merge_profile_values(jsonb,jsonb,jsonb) from public,anon,authenticated;
alter table public.tnt_person_permission_overrides add column if not exists archived_at timestamptz;
create or replace function public.tnt_copy_link_permissions(p_source uuid,p_target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.tnt_access_grants set enabled=false,updated_at=now() where person_id=p_target;
 update public.tnt_person_permission_overrides set archived_at=now(),updated_at=now() where person_id=p_target;
 update public.tnt_module_access set enabled=false where person_id=p_target;
 insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled,valid_from,valid_until,granted_by)
 select p_target,module,scope,access_level,enabled,valid_from,valid_until,granted_by from public.tnt_access_grants where person_id=p_source
 on conflict(person_id,module,scope) do update set access_level=excluded.access_level,enabled=excluded.enabled,valid_from=excluded.valid_from,valid_until=excluded.valid_until,granted_by=excluded.granted_by,updated_at=now();
 insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed,updated_by,archived_at)
 select p_target,module,scope,action,allowed,updated_by,null from public.tnt_person_permission_overrides where person_id=p_source and archived_at is null
 on conflict(person_id,module,scope,action) do update set allowed=excluded.allowed,updated_by=excluded.updated_by,archived_at=null,updated_at=now();
 insert into public.tnt_module_access(person_id,module,enabled,access_level)
 select p_target,module,enabled,access_level from public.tnt_module_access where person_id=p_source
 on conflict(person_id,module) do update set enabled=excluded.enabled,access_level=excluded.access_level;
end $$;
revoke all on function public.tnt_copy_link_permissions(uuid,uuid) from public,anon,authenticated;
create or replace function public.tnt_resolve_profile_link(p_request uuid,p_approve boolean,p_choices jsonb default '{}',p_revision text default '') returns void
language plpgsql security definer set search_path='' as $$
declare r public.tnt_profile_link_requests%rowtype;preview jsonb;s jsonb;t jsonb;merged jsonb;
begin
 if public.tnt_current_person_id() is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden vincular perfiles' using errcode='42501';end if;
 if not p_approve then perform public.tnt_review_profile_link(p_request,false);return;end if;
 select * into r from public.tnt_profile_link_requests where id=p_request and status='pending' for update;
 if not found then raise exception 'La solicitud ya fue atendida';end if;
 perform id from public.tnt_people where id in(r.person_id,r.target_person_id) order by id for update;
 preview:=public.tnt_profile_link_preview(p_request);
 if p_revision<>'' and preview->>'revision'<>p_revision then raise exception 'Los datos cambiaron. Volvé a abrir la revisión.';end if;
 s:=preview->'source';t:=preview->'target';
 merged:=public.tnt_merge_profile_values(s,t,p_choices);
 -- Account permissions come from the signed-in source, never from the old directory entry.
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
 values(public.tnt_current_person_id(),'profile',r.target_person_id,'profile_merge_choices',
 jsonb_build_object('request_id',r.id,'source_values',s,'target_values',t,'choices',p_choices,
 'old_grants',(select jsonb_agg(to_jsonb(g)) from public.tnt_access_grants g where person_id=r.target_person_id),
 'old_overrides',(select jsonb_agg(to_jsonb(g)) from public.tnt_person_permission_overrides g where person_id=r.target_person_id)));
 perform public.tnt_copy_link_permissions(r.person_id,r.target_person_id);
 update public.tnt_people set first_name=coalesce(merged->>'first_name',first_name),last_name=coalesce(merged->>'last_name',last_name),
 full_name=trim(coalesce(merged->>'first_name',first_name)||' '||coalesce(merged->>'last_name',last_name)),
 normalized_name=lower(trim(coalesce(merged->>'first_name',first_name)||' '||coalesce(merged->>'last_name',last_name))),
 birthday=coalesce(nullif(merged->>'birthday','')::date,birthday),sex=coalesce(nullif(merged->>'sex',''),sex),
 phone=coalesce(merged->>'phone',phone),instagram=coalesce(merged->>'instagram',instagram) where id=r.target_person_id;
 if merged ? 'dni' then
  insert into public.tnt_profile_private_fields(person_id,dni) values(r.target_person_id,coalesce(merged->>'dni',''))
   on conflict(person_id) do update set dni=excluded.dni;
  update public.tnt_profile_private_fields set dni=coalesce(merged->>'dni','') where person_id=r.person_id;
 end if;
 perform public.tnt_apply_profile_answers(r.target_person_id,merged);
 perform public.tnt_review_profile_link(p_request,true);
end $$;
revoke all on function public.tnt_resolve_profile_link(uuid,boolean,jsonb,text) from public,anon;
grant execute on function public.tnt_resolve_profile_link(uuid,boolean,jsonb,text) to authenticated;

-- Future submissions start at 50%; unanswered existing profiles remain incomplete.
update public.tnt_settings set value=jsonb_set(value,'{leadership_strengths}',
 coalesce(value->'leadership_strengths','{}')||jsonb_build_object('required',true,'roles',jsonb_build_array('Líder','Pastor/a'),'default',50))
where key='profile_fields';
CREATE OR REPLACE FUNCTION public.tnt_has_access(p_module text, p_scope text DEFAULT '*'::text, p_min_level text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pid uuid;
  v_role text;
  v_staff text;
  v_system text;
  v_override boolean;
  v_role_view boolean;
begin
  if p_min_level not in ('none','view','user','edit','editor','manage','manager','admin') then
    return public.tnt_can_action(p_module,p_min_level,p_scope);
  end if;
  if not public.tnt_module_available(p_module) then return false; end if;
  v_pid:=public.tnt_current_person_id();
  if v_pid is null or not public.tnt_profile_is_complete() then return false; end if;

  select ministry_role,staff_status,system_role
  into v_role,v_staff,v_system
  from public.tnt_accounts
  where person_id=v_pid and enabled
  limit 1;

  if v_system is null or (v_system<>'admin' and v_staff is distinct from 'approved') then return false; end if;
  if v_system='admin' and p_module<>'efe' then return true; end if;

    select o.allowed into v_override
    from public.tnt_person_permission_overrides o
    where o.person_id=v_pid
      and o.module=p_module
      and o.action='view'
      and o.scope in (p_scope,'*')
    order by case when o.scope=p_scope then 0 else 1 end
    limit 1;
    if found then
      if not v_override then return false; end if;
      if public.tnt_access_rank(p_min_level)<=1 then return true; end if;
    end if;

    if v_override is null and v_staff='approved' then
      select rp.allowed into v_role_view
      from public.tnt_role_permission_presets rp
      where rp.role=v_role
        and rp.module=p_module
        and rp.action='view'
        and rp.scope in (p_scope,'*')
      order by case when rp.scope=p_scope then 0 else 1 end
      limit 1;
      if found then
        if not v_role_view then return false; end if;
        if public.tnt_access_rank(p_min_level)<=1 then return true; end if;
      end if;
    end if;

  return (v_system='admin' or v_staff='approved') and (
    (p_module='chat' and v_staff='approved' and public.tnt_access_rank(p_min_level)<=1)
    or exists(
      select 1 from public.tnt_access_grants g
      where g.person_id=v_pid
        and g.module=p_module
        and g.enabled
        and (
          g.scope=p_scope
          or (
            g.scope='*'
            and not exists(
              select 1 from public.tnt_access_grants exact
              where exact.person_id=g.person_id
                and exact.module=g.module
                and exact.scope=p_scope
            )
          )
        )
        and (g.valid_from is null or g.valid_from<=now())
        and (g.valid_until is null or g.valid_until>=now())
        and public.tnt_access_rank(g.access_level)>=public.tnt_access_rank(p_min_level)
    )
    or (
      p_module<>'efe'
      and exists(
        select 1 from public.tnt_module_access m
        where m.person_id=v_pid
          and m.module=p_module
          and m.enabled
          and not exists(
            select 1 from public.tnt_access_grants g
            where g.person_id=m.person_id
              and g.module=p_module
              and g.scope='*'
          )
          and public.tnt_access_rank(
            case m.access_level
              when 'manager' then 'manage'
              when 'editor' then 'edit'
              else 'view'
            end
          )>=public.tnt_access_rank(p_min_level)
      )
    )
  );
end $function$;


CREATE OR REPLACE FUNCTION public.tnt_save_my_interests(p_values jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid:=public.tnt_current_person_id();
begin
 p_values:=p_values-array['_ministry_role','_profile_roles'];
 if pid is null then raise exception 'Iniciá sesión' using errcode='42501';end if;
 perform 1 from public.tnt_people where id=pid and active for update;
 if not found then raise exception 'Perfil no disponible';end if;
 perform public.tnt_validate_profile_values(public.tnt_profile_values(pid)||p_values);
 perform public.tnt_apply_profile_answers(pid,p_values);
end $function$;


CREATE OR REPLACE FUNCTION public.tnt_validate_profile_values(p_values jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare missing jsonb; f record; v text;
begin
 if p_values is null or jsonb_typeof(p_values)<>'object' then raise exception 'Revisá los datos del perfil';end if;
 missing:=public.tnt_profile_missing_values(p_values);
 if jsonb_array_length(missing)>0 then raise exception 'Completá: %',(select string_agg(x->>'label',', ') from jsonb_array_elements(missing) x);end if;
 for f in select * from jsonb_each(public.tnt_profile_fields()) loop
  if f.value->>'visible'='false' or not public.tnt_profile_field_applies(f.value,p_values) then continue;end if;
  v:=nullif(trim(p_values->>f.key),'');
  if v is null then continue;end if;
  if length(v)>2000 then raise exception 'La respuesta de % es demasiado larga',f.value->>'label';end if;
  if f.key in('first_name','last_name') and length(v)>100 then raise exception 'Revisá el nombre y apellido';end if;
  if f.value->>'type'='date' then perform v::date;end if;
  if f.key='birthday' and (v::date>current_date or v::date<date '1900-01-01') then raise exception 'Revisá tu fecha de nacimiento';end if;
  if f.key='sex' and v not in('M','F') then raise exception 'Elegí Mujer o Varón';end if;
  if f.key='phone' and (length(regexp_replace(v,'[^0-9]','','g')) not between 6 and 20 or length(v)>30) then raise exception 'Revisá el WhatsApp';end if;
  if f.key='dni' and v !~ '^[0-9]{6,10}$' then raise exception 'Revisá el DNI';end if;
  if f.key='efe_group' and v<>'none' and not exists(select 1 from public.tnt_efe_groups where code=v) then raise exception 'Elegí un EFE válido';end if;
  if f.value->>'type'='multiselect' and (jsonb_typeof(p_values->f.key)<>'array' or jsonb_array_length(p_values->f.key)>25) then raise exception 'Revisá tus intereses';end if;
  if f.value->>'type'='select' and f.key<>'sex' and not (coalesce(f.value->'options','[]') ? v) then raise exception 'Elegí una opción válida en %',f.value->>'label';end if;
 end loop;
end $function$;
create or replace function public.tnt_save_news(p_news jsonb,p_expected jsonb default '[]') returns void
language plpgsql security definer set search_path='' as $$
declare current_news jsonb;n jsonb;
begin
 if public.tnt_current_person_id() is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden publicar novedades' using errcode='42501';end if;
 if jsonb_typeof(p_news)<>'array' or jsonb_array_length(p_news)>100 then raise exception 'Revisá las novedades';end if;
 -- Lock the setting even when this is the first publication.
 insert into public.tnt_settings(key,value) values('community_news','[]') on conflict(key) do nothing;
 select value into current_news from public.tnt_settings where key='community_news' for update;
 if current_news is distinct from p_expected then raise exception 'Otro administrador actualizó las novedades. Volvé a abrirlas para tomar esos cambios.';end if;
 for n in select jsonb_array_elements(p_news) loop
  if jsonb_typeof(n)<>'object' or length(coalesce(n->>'title','')) not between 1 and 120 or length(coalesce(n->>'body',''))>2000
   or coalesce(n->>'audience','all') not in ('all','staff','community') then raise exception 'Revisá título, mensaje y destinatarios';end if;
  if coalesce(n->>'href','')<>'' and n->>'href' !~ '^(https?://|/)' then raise exception 'Revisá el enlace de la novedad';end if;
 end loop;
 update public.tnt_settings set value=p_news where key='community_news';
end $$;
revoke all on function public.tnt_save_news(jsonb,jsonb) from public,anon;
grant execute on function public.tnt_save_news(jsonb,jsonb) to authenticated;

-- A single push queue handles per-person read/dismiss state. The older route sent duplicates.
create or replace function public.tnt_notification_push_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin return new;end $$;
create unique index if not exists tnt_push_browser_endpoint on public.tnt_push_subscriptions(endpoint);
create or replace function public.tnt_push_subscribe(p_subscription jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();ep text:=nullif(p_subscription->>'endpoint','');
begin
 if pid is null or not exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id where a.person_id=pid and a.enabled and p.active) then
  raise exception 'Iniciá sesión con una cuenta habilitada' using errcode='42501';end if;
 if ep is null or ep !~ '^https://' or length(ep)>2048 or
    nullif(p_subscription#>>'{keys,auth}','') is null or nullif(p_subscription#>>'{keys,p256dh}','') is null then
  raise exception 'Suscripción de teléfono inválida' using errcode='22023';end if;
 -- One browser subscription follows its current signed-in person.
 insert into public.tnt_push_subscriptions(person_id,endpoint,subscription,updated_at) values(pid,ep,p_subscription,now())
 on conflict(endpoint) do update set person_id=excluded.person_id,subscription=excluded.subscription,updated_at=now();
end $$;
CREATE OR REPLACE FUNCTION public.tnt_complete_profile(p_values jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid:=public.tnt_current_person_id(); a public.tnt_accounts%rowtype; old_values jsonb; v jsonb; k text;
begin
 p_values:=p_values-array['_ministry_role','_profile_roles'];
 if pid is null then raise exception 'Iniciá sesión' using errcode='42501';end if;
 select * into a from public.tnt_accounts where person_id=pid for update;
 perform 1 from public.tnt_people where id=pid and active for update;
 if not found then raise exception 'Tu perfil está archivado';end if;
 old_values:=public.tnt_profile_values(pid);v:=old_values||p_values;
 -- Existing verified identity fields can only be filled, not silently replaced.
 if a.onboarding_completed_at is not null then
  foreach k in array array['first_name','last_name','birthday','sex','phone','instagram','dni'] loop
   if nullif(old_values->>k,'') is not null and p_values ? k and p_values->>k is distinct from old_values->>k then
    raise exception 'Solicitá el cambio de % desde Mi perfil',coalesce(public.tnt_profile_fields()->k->>'label',k);
   end if;
  end loop;
 end if;
 perform public.tnt_validate_profile_values(v);
 update public.tnt_people set first_name=trim(v->>'first_name'),last_name=trim(v->>'last_name'),
 full_name=coalesce(nullif(trim(coalesce(v->>'first_name','')||' '||coalesce(v->>'last_name','')),''),full_name),
 normalized_name=lower(trim(coalesce(v->>'first_name','')||' '||coalesce(v->>'last_name',''))),
 birthday=nullif(v->>'birthday','')::date,sex=coalesce(nullif(v->>'sex',''),'U'),phone=nullif(trim(v->>'phone'),''),
 instagram=nullif(trim(v->>'instagram'),''),profile_consent=true,profile_updated_at=now(),updated_at=now() where id=pid;
 insert into public.tnt_profile_private_fields(person_id,dni) values(pid,coalesce(v->>'dni',''))
 on conflict(person_id) do update set dni=excluded.dni;
 perform public.tnt_apply_profile_answers(pid,v);
end $function$;
select cron.alter_job(jobid,schedule:='30 seconds')
from cron.job where jobname='tnt-camp-notifications-every-2-min';
-- Checkout updates stock through its guarded atomic RPC. A seller cannot edit stock directly.
alter policy buffet_write on public.tnt_menu_items
 using (public.tnt_can_action('buffet','edit_stock','*'))
 with check (public.tnt_can_action('buffet','edit_stock','*'));
do $patch$
declare signature text;definition text;prefix text;suffix text;split_at integer;
begin
 foreach signature in array array['public.tnt_has_access(text,text,text)','public.tnt_can_action(text,text,text)','public.tnt_recipient_has_module(uuid,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=replace(definition,'where o.person_id=','where o.archived_at is null and o.person_id=');
  execute definition||';';
 end loop;
 definition:=pg_get_functiondef('public.tnt_review_access_request(uuid,boolean)'::regprocedure);
 definition:=replace(definition,'do update set allowed=true,updated_by=reviewer','do update set archived_at=null,allowed=true,updated_by=reviewer');
 execute definition||';';
 definition:=pg_get_functiondef('public.tnt_review_profile_link(uuid,boolean)'::regprocedure);
 split_at:=strpos(definition,'set constraints public.tnt_role_requests_person_id_fkey deferred;');
 if split_at=0 then raise exception 'No se encontró el traslado de referencias';end if;
 prefix:=substr(definition,1,split_at-1);suffix:=substr(definition,split_at);
 suffix:=replace(suffix,'order by 1,2,3',
  'and not (a.attname=''person_id'' and t.relname in(''tnt_access_grants'',''tnt_person_permission_overrides'',''tnt_module_access'')) order by 1,2,3');
 execute prefix||suffix||';';
end $patch$;
