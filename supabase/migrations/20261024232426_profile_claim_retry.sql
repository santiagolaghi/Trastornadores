-- Verified profile continuation, retryable matching and administrative review of two Google accounts.
create or replace function tnt_actions.profile_phone(p_phone text) returns text language sql immutable set search_path='' as $$
 with raw as(select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') n),international as(select case when n like '00%' then substr(n,3) else n end n from raw)
 select case when length(n)=13 and n like '549%' then substr(n,4) when length(n)=12 and n like '54%' then substr(n,3) when length(n)=11 and n like '0%' then substr(n,2) else n end from international;
$$;
revoke all on function tnt_actions.profile_phone(text) from public,anon,authenticated;

create or replace function public.tnt_match_profile_names(p_name text,p_birthday date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare own uuid:=public.tnt_current_person_id();n text:=tnt_actions.profile_name(p_name);
begin
 if own is null or length(n)<7 or array_length(string_to_array(n,' '),1)<2 then return '[]';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'has_account',has_account)),'[]') from (
  select p.id,p.full_name,exists(select 1 from public.tnt_accounts a where a.person_id=p.id and a.auth_user_id is not null) as has_account from public.tnt_people p where p.active and p.id<>own
   and (string_to_array(n,' ')<@string_to_array(tnt_actions.profile_name(p.full_name),' ')
    or string_to_array(tnt_actions.profile_name(p.full_name),' ')<@string_to_array(n,' '))
   and (p_birthday is null or p.birthday=p_birthday) order by p.full_name,p.id limit 3) matches);
end $$;



-- Corroborating data is compared inside the database and never returned to a client.
create or replace function tnt_actions.profile_claim_matches(p_target uuid,p_birthday date,p_phone text,p_dni text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_people p left join public.tnt_profile_private_fields f on f.person_id=p.id
 where p.id=p_target and p.active and p.birthday=p_birthday
  and (length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'))>=8 and tnt_actions.profile_phone(p_phone)=tnt_actions.profile_phone(p.phone)
   or length(regexp_replace(coalesce(p_dni,''),'[^0-9]','','g'))>=7 and regexp_replace(p_dni,'[^0-9]','','g')=regexp_replace(coalesce(f.dni,''),'[^0-9]','','g')));
$$;
revoke all on function tnt_actions.profile_claim_matches(uuid,date,text,text) from public,anon,authenticated;

create or replace function tnt_actions.continue_profile(p_target uuid,p_values jsonb,p_confirm boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare own uuid:=public.tnt_current_person_id();a public.tnt_accounts%rowtype;src public.tnt_people%rowtype;
 dst public.tnt_people%rowtype;v jsonb;matches jsonb;candidate jsonb;birthday date;verified boolean:=false;has_account boolean;request_id uuid;lookup_name text;request_source uuid;request_target uuid;
begin
 if own is null or auth.uid() is null then raise exception 'Ingresá con Google para continuar' using errcode='42501';end if;
 select * into a from public.tnt_accounts where person_id=own and auth_user_id=auth.uid() and enabled for update;
 if not found then raise exception 'Esta cuenta no está habilitada' using errcode='42501';end if;
 select * into src from public.tnt_people where id=own and active;
 if not found then raise exception 'Tu perfil no está disponible';end if;
 v:=public.tnt_profile_values(own);
 lookup_name:=case when p_confirm and length(trim(coalesce(p_values->>'first_name','')))>=2 and length(trim(coalesce(p_values->>'last_name','')))>=2 then trim(p_values->>'first_name')||' '||trim(p_values->>'last_name') else src.full_name end;
 matches:=public.tnt_match_profile_names(lookup_name,null);
 if p_target is null then
  if jsonb_array_length(matches)<>1 then return jsonb_build_object('linked',false);end if;
  candidate:=matches->0;p_target:=(candidate->>'id')::uuid;
 else
  if not exists(select 1 from jsonb_array_elements(matches) m where m->>'id'=p_target::text) then
   raise exception 'El perfil ya está vinculado o no coincide con tu identidad';end if;
 end if;
 -- Serialize claims to the same directory person and recheck the account under the lock.
 perform id from public.tnt_people where id in(own,p_target) order by id for update;
 select * into dst from public.tnt_people where id=p_target and active;
 if not found then raise exception 'Este perfil ya no está disponible';end if;
 has_account:=exists(select 1 from public.tnt_accounts where person_id=p_target and auth_user_id is not null);
 begin birthday:=nullif(case when p_confirm then p_values->>'birthday' else v->>'birthday' end,'')::date;
 exception when invalid_datetime_format or datetime_field_overflow then birthday:=null;end;
 verified:=tnt_actions.profile_claim_matches(p_target,birthday,case when p_confirm then p_values->>'phone' else v->>'phone' end,case when p_confirm then p_values->>'dni' else v->>'dni' end);
 if p_confirm then
  insert into tnt_actions.profile_claim_attempts(auth_user_id,attempts) values(auth.uid(),1)
   on conflict(auth_user_id) do update set attempts=case when tnt_actions.profile_claim_attempts.window_start<now()-interval '15 minutes' then 1 else tnt_actions.profile_claim_attempts.attempts+1 end,
    window_start=case when tnt_actions.profile_claim_attempts.window_start<now()-interval '15 minutes' then now() else tnt_actions.profile_claim_attempts.window_start end;
  if exists(select 1 from tnt_actions.profile_claim_attempts where auth_user_id=auth.uid() and attempts>8) then return jsonb_build_object('linked',false,'error','Esperá unos minutos antes de volver a confirmar tu perfil.');end if;
 end if;
 if not coalesce(verified,false) then
  if p_confirm then return jsonb_build_object('linked',false,'error','No coinciden la fecha de nacimiento y el WhatsApp o DNI del perfil. Revisá los datos.');end if;
  return jsonb_build_object('linked',false,'candidate',jsonb_build_object('id',dst.id,'full_name',dst.full_name,'has_account',has_account));
 end if;
 if has_account then
  if not p_confirm then return jsonb_build_object('linked',false,'candidate',jsonb_build_object('id',dst.id,'full_name',dst.full_name,'has_account',true));end if;
  request_source:=own;request_target:=p_target;
  if a.system_role='admin' and not exists(select 1 from public.tnt_accounts where person_id=p_target and system_role='admin') then request_source:=p_target;request_target:=own;end if;
  insert into public.tnt_profile_link_requests(person_id,target_person_id) values(request_source,request_target)
   on conflict(person_id,target_person_id) where status='pending' do update set person_id=excluded.person_id returning id into request_id;
  return jsonb_build_object('linked',false,'pending_review',true,'request_id',request_id,'error','Este perfil ya tiene una cuenta Google. Un administrador revisará cómo reunir el historial sin cambiar la cuenta principal.');
 end if;
 perform tnt_actions.link_verified_profile(own,p_target);
 return jsonb_build_object('linked',true,'person_id',p_target);
end $$;

CREATE OR REPLACE FUNCTION public.tnt_review_profile_link(p_request uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.tnt_profile_link_requests%rowtype; src public.tnt_people%rowtype; dst public.tnt_people%rowtype;
 actor uuid:=public.tnt_current_person_id(); ref record; camp record; child record; rows_before jsonb; history jsonb:='[]'; dn_src text; dn_dst text; keep_destination boolean:=false;
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
 keep_destination:=exists(select 1 from public.tnt_accounts where person_id=dst.id and auth_user_id is not null);
 if keep_destination and not public.tnt_is_admin() then raise exception 'La unión de dos cuentas Google requiere revisión administrativa.' using errcode='42501';end if;
 if keep_destination then
  if exists(select 1 from public.tnt_accounts where person_id=src.id and system_role='admin') and not exists(select 1 from public.tnt_accounts where person_id=dst.id and system_role='admin') then raise exception 'Conservá la cuenta administradora como principal e invertí el vínculo.';end if;
  if not exists(select 1 from public.tnt_accounts where person_id=dst.id and enabled) then raise exception 'La cuenta principal no está habilitada.';end if;
  insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
  values(actor,'profile',dst.id,'duplicate_google_account_replaced',jsonb_build_object('source_account',(select to_jsonb(a) from public.tnt_accounts a where person_id=src.id),'primary_account',(select to_jsonb(a) from public.tnt_accounts a where person_id=dst.id)));
  update public.tnt_accounts set enabled=false where person_id=src.id;
 end if;
 if not keep_destination and exists(select 1 from public.tnt_accounts where person_id=dst.id) then
  -- Preserve pending/historical role requests before removing an unclaimed stub.
  -- The verified Google account retains its original permissions.
  insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
  values(actor,'profile',dst.id,'unclaimed_account_replaced',jsonb_build_object('account',(select to_jsonb(a) from public.tnt_accounts a where person_id=dst.id),'role_requests',(select jsonb_agg(to_jsonb(q)) from public.tnt_role_requests q where person_id=dst.id)));
  update public.tnt_role_requests set status='cancelled' where person_id=dst.id and status='pending';
  update public.tnt_role_requests set person_id=src.id where person_id=dst.id;
  delete from public.tnt_accounts where person_id=dst.id and auth_user_id is null;
 end if;
 if not exists(select 1 from public.tnt_accounts where person_id=src.id and (enabled or keep_destination)) then raise exception 'La cuenta de origen no está habilitada.';end if;
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
   and ns.nspname='public' and t.relname not in('tnt_profile_link_requests','tnt_profile_archive_state') and not (keep_destination and t.relname='tnt_accounts' and a.attname='person_id') and not (a.attname='person_id' and t.relname in('tnt_access_grants','tnt_person_permission_overrides','tnt_module_access')) order by 1,2,3
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
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_resolve_profile_link(p_request uuid, p_approve boolean, p_choices jsonb DEFAULT '{}'::jsonb, p_revision text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.tnt_profile_link_requests%rowtype;preview jsonb;s jsonb;t jsonb;merged jsonb;keep_destination boolean;
begin
 if public.tnt_current_person_id() is null or not tnt_actions.can_link_request(p_request) then raise exception 'Solo administradores pueden vincular perfiles' using errcode='42501';end if;
 if not p_approve then perform public.tnt_review_profile_link(p_request,false);return;end if;
 select * into r from public.tnt_profile_link_requests where id=p_request and status='pending' for update;
 if not found then raise exception 'La solicitud ya fue atendida';end if;
 perform id from public.tnt_people where id in(r.person_id,r.target_person_id) order by id for update;
 preview:=public.tnt_profile_link_preview(p_request);
 if p_revision<>'' and preview->>'revision'<>p_revision then raise exception 'Los datos cambiaron. Volvé a abrir la revisión.';end if;
 s:=preview->'source';t:=preview->'target';
 keep_destination:=exists(select 1 from public.tnt_accounts where person_id=r.target_person_id and auth_user_id is not null);
 if keep_destination and not public.tnt_is_admin() then raise exception 'Dos cuentas Google requieren revisión administrativa.' using errcode='42501';end if;
 merged:=case when keep_destination then public.tnt_merge_profile_values(t,s,p_choices) else public.tnt_merge_profile_values(s,t,p_choices) end;
 if not keep_destination and tnt_actions.profile_name(s->>'full_name')<>tnt_actions.profile_name(t->>'full_name') then
  merged:=merged||jsonb_build_object('first_name',coalesce(nullif(t->>'first_name',''),split_part(t->>'full_name',' ',1)),'last_name',coalesce(nullif(t->>'last_name',''),trim(substr(t->>'full_name',length(split_part(t->>'full_name',' ',1))+1))));
 end if;
 -- Account permissions come from the signed-in source, never from the old directory entry.
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
 values(public.tnt_current_person_id(),'profile',r.target_person_id,'profile_merge_choices',
 jsonb_build_object('request_id',r.id,'source_values',s,'target_values',t,'resolution','google_account_priority',
 'old_grants',(select jsonb_agg(to_jsonb(g)) from public.tnt_access_grants g where person_id=r.target_person_id),
 'old_overrides',(select jsonb_agg(to_jsonb(g)) from public.tnt_person_permission_overrides g where person_id=r.target_person_id)));
 if not keep_destination then perform public.tnt_copy_link_permissions(r.person_id,r.target_person_id);end if;
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
 perform public.tnt_apply_profile_answers(r.target_person_id,merged);
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_profile_link_preview(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.tnt_profile_link_requests%rowtype;s jsonb;t jsonb;
begin
 if public.tnt_current_person_id() is null or not tnt_actions.can_link_request(p_request) then raise exception 'Solo administradores pueden revisar vínculos' using errcode='42501';end if;
 select * into r from public.tnt_profile_link_requests where id=p_request and status='pending';
 if not found then raise exception 'La solicitud ya fue atendida';end if;
 select (to_jsonb(p)-'data_notes')||public.tnt_profile_values(p.id) into s from public.tnt_people p where p.id=r.person_id;
 select (to_jsonb(p)-'data_notes')||public.tnt_profile_values(p.id) into t from public.tnt_people p where p.id=r.target_person_id;
 return jsonb_build_object('source',s,'target',t,'keep_destination_account',exists(select 1 from public.tnt_accounts where person_id=r.target_person_id and auth_user_id is not null),'primary_account',(select jsonb_build_object('email',email,'system_role',system_role,'avatar_url',avatar_url) from public.tnt_accounts where person_id=r.target_person_id and auth_user_id is not null),'fields',public.tnt_profile_fields(),'revision',md5(s::text||t::text),'history',jsonb_build_object(
 'saturdays',(select count(*) from public.tnt_saturday_attendance where person_id in(r.person_id,r.target_person_id)),
 'efe',(select count(*) from public.tnt_efe_wednesday_attendance where person_id in(r.person_id,r.target_person_id)),
 'camps',(select count(*) from public.tnt_camp_registrations where person_id in(r.person_id,r.target_person_id)),
 'messages',(select count(*) from public.tnt_chat_messages where person_id in(r.person_id,r.target_person_id))));
end $function$;

notify pgrst,'reload schema';
