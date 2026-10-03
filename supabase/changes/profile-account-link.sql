create table public.tnt_profile_link_requests (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references public.tnt_people(id),
 target_person_id uuid not null references public.tnt_people(id),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 created_at timestamptz not null default now(),reviewed_at timestamptz,
 reviewed_by uuid references public.tnt_people(id),
 check(person_id<>target_person_id)
);
create unique index profile_link_pending on public.tnt_profile_link_requests(person_id,target_person_id) where status='pending';
alter table public.tnt_profile_link_requests enable row level security;
revoke all on public.tnt_profile_link_requests from anon,authenticated;
grant select on public.tnt_profile_link_requests to authenticated;
create policy profile_link_read on public.tnt_profile_link_requests for select to authenticated using(person_id=public.tnt_current_person_id() or public.tnt_is_admin());

create or replace function public.tnt_detect_profile_link() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.source<>'auth' or not new.active or new.birthday is null then return new;end if;
 if not exists(select 1 from public.tnt_accounts where person_id=new.id and enabled and system_role='user' and staff_status<>'approved') then return new;end if;
 insert into public.tnt_profile_link_requests(person_id,target_person_id)
 select new.id,p.id from public.tnt_people p where p.id<>new.id and p.active and p.birthday=new.birthday
  and regexp_replace(translate(lower(p.full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')=regexp_replace(translate(lower(new.full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')
  and not exists(select 1 from public.tnt_accounts where person_id=p.id)
  and not exists(select 1 from public.tnt_profile_link_requests where person_id=new.id and target_person_id=p.id);
 return new;
end $$;
revoke all on function public.tnt_detect_profile_link() from public,anon,authenticated;
create trigger profile_link_match after update of full_name,birthday on public.tnt_people for each row execute function public.tnt_detect_profile_link();

create or replace function public.tnt_notify_profile_link() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.tnt_notifications(person_id,title,body,href,data)
 select person_id,'Vinculación de perfil pendiente','Una cuenta Google coincide con un perfil que ya tiene registros. Revisá la identidad antes de vincular.','/admin/?tab=requests',jsonb_build_object('request_id',new.id,'request_table','tnt_profile_link_requests')
 from public.tnt_accounts where system_role='admin' and enabled;
 return new;
end $$;
revoke all on function public.tnt_notify_profile_link() from public,anon,authenticated;
create trigger profile_link_notice after insert on public.tnt_profile_link_requests for each row execute function public.tnt_notify_profile_link();

-- The account key is transferred atomically together with its role requests.
alter table public.tnt_role_requests alter constraint tnt_role_requests_person_id_fkey deferrable initially immediate;
create or replace function public.tnt_review_profile_link(p_request uuid,p_approve boolean) returns void
language plpgsql security definer set search_path='' as $$
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
 if not src.active or not dst.active or src.birthday is distinct from dst.birthday or regexp_replace(translate(lower(src.full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')<>regexp_replace(translate(lower(dst.full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g') then raise exception 'Los perfiles cambiaron. Revisá nombre y nacimiento antes de vincular.';end if;
 if src.sex in('M','F') and dst.sex in('M','F') and src.sex<>dst.sex then raise exception 'Los registros indican sexos distintos. Revisá el perfil antes de vincular.';end if;
 perform person_id from public.tnt_accounts where person_id in(src.id,dst.id) order by person_id for update;
 if exists(select 1 from public.tnt_accounts where person_id=dst.id) then raise exception 'El perfil de destino ya tiene una cuenta Google. Se conservan las dos cuentas.';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=src.id and enabled and system_role='user' and staff_status<>'approved') then raise exception 'Esta cuenta ya pertenece al staff o no está habilitada. No se vincula automáticamente.';end if;
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
end $$;
revoke all on function public.tnt_review_profile_link(uuid,boolean) from public,anon;
grant execute on function public.tnt_review_profile_link(uuid,boolean) to authenticated;

-- This helper belongs to Auth and the current-user wrapper, never to the public API.
revoke all on function public.tnt_ensure_account_for_user(uuid) from public,anon,authenticated;
create or replace function public.tnt_ensure_account() returns uuid
language sql security definer set search_path='' as $$select public.tnt_ensure_account_for_user(auth.uid())$$;
revoke all on function public.tnt_ensure_account() from public,anon;
grant execute on function public.tnt_ensure_account() to authenticated;
