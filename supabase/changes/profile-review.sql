-- Profile changes are reviewed without changing the central identity until approval.
create table if not exists public.tnt_profile_change_requests (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references public.tnt_people(id),
 before_values jsonb not null, proposed_values jsonb not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 reviewed_by uuid references public.tnt_people(id)
);
create unique index if not exists tnt_profile_change_one_pending on public.tnt_profile_change_requests(person_id) where status='pending';
alter table public.tnt_profile_change_requests enable row level security;
revoke all on public.tnt_profile_change_requests from anon,authenticated;
grant select on public.tnt_profile_change_requests to authenticated;
create policy profile_requests_read on public.tnt_profile_change_requests for select to authenticated using(person_id=public.tnt_current_person_id() or public.tnt_is_admin());

create or replace function public.tnt_request_profile_change(p_values jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); p public.tnt_people%rowtype; proposed jsonb; previous jsonb; rid uuid;
begin
 if pid is null then raise exception 'Iniciá sesión' using errcode='42501'; end if;
 select * into p from public.tnt_people where id=pid for update;
 if not p.active or not exists(select 1 from public.tnt_accounts where person_id=pid and enabled) then raise exception 'La cuenta no está habilitada' using errcode='42501';end if;
 if nullif(trim(p_values->>'first_name'),'') is null or nullif(trim(p_values->>'last_name'),'') is null then raise exception 'Completá nombre y apellido'; end if;
 if coalesce(p_values->>'sex','') not in ('M','F') then raise exception 'Elegí Mujer o Varón';end if;
 if nullif(p_values->>'birthday','') is null or (p_values->>'birthday')::date>current_date or (p_values->>'birthday')::date<date '1900-01-01' then raise exception 'Revisá la fecha de nacimiento';end if;
 if length(regexp_replace(coalesce(p_values->>'phone',''),'[^0-9]','','g'))<6 then raise exception 'Revisá el WhatsApp';end if;
 if coalesce(p_values->>'dni','')<>'' and (p_values->>'dni') !~ '^[0-9]{6,10}$' then raise exception 'Revisá el DNI';end if;
 proposed:=jsonb_build_object('first_name',initcap(trim(p_values->>'first_name')),'last_name',initcap(trim(p_values->>'last_name')),'birthday',p_values->>'birthday','sex',p_values->>'sex','phone',trim(p_values->>'phone'),'instagram',coalesce(trim(p_values->>'instagram'),''),'dni',coalesce(p_values->>'dni',''));
 previous:=jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),'birthday',coalesce(p.birthday::text,''),'sex',p.sex,'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''),'dni',coalesce(p.data_notes->>'dni',''));
 if proposed=previous then raise exception 'No cambiaste tus datos personales';end if;
 update public.tnt_profile_change_requests set status='cancelled' where person_id=pid and status='pending';
 insert into public.tnt_profile_change_requests(person_id,before_values,proposed_values) values(pid,previous,proposed) returning id into rid;
 return rid;
end $$;
revoke all on function public.tnt_request_profile_change(jsonb) from public,anon;
grant execute on function public.tnt_request_profile_change(jsonb) to authenticated;

create or replace function public.tnt_review_profile_change(p_request uuid,p_approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r public.tnt_profile_change_requests%rowtype; v jsonb; pid uuid:=public.tnt_current_person_id();
begin
 if pid is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden revisar perfiles' using errcode='42501';end if;
 select * into r from public.tnt_profile_change_requests where id=p_request for update;
 if not found or r.status<>'pending' then raise exception 'La solicitud ya fue resuelta o no existe';end if;
 if p_approve then
  v:=r.proposed_values;
  perform public.tnt_save_central_profile(r.person_id,v);
  update public.tnt_people set data_notes=coalesce(data_notes,'{}'::jsonb)||jsonb_build_object('dni',v->>'dni'),profile_consent=true where id=r.person_id;
 end if;
 update public.tnt_profile_change_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=pid where id=r.id;
 insert into public.tnt_notifications(person_id,title,body,href) values(r.person_id,'Cambio de perfil revisado',case when p_approve then 'Se aprobaron tus nuevos datos.' else 'No se aprobaron los cambios. Consultá con un administrador.' end,'/?profile=1');
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details) values(pid,'profile',r.person_id,case when p_approve then 'profile_change_approved' else 'profile_change_rejected' end,jsonb_build_object('request_id',r.id,'before',r.before_values,'proposed',r.proposed_values));
end $$;
revoke all on function public.tnt_review_profile_change(uuid,boolean) from public,anon;
grant execute on function public.tnt_review_profile_change(uuid,boolean) to authenticated;

create or replace function public.tnt_notify_review_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.tnt_notifications(person_id,title,body,href,data)
 select person_id,case tg_table_name when 'tnt_profile_change_requests' then 'Cambio de perfil pendiente' when 'tnt_role_requests' then 'Función del staff pendiente' else 'Solicitud de acceso pendiente' end,
 'Hay una solicitud para revisar en Administración.','/admin/?tab=requests',jsonb_build_object('request_id',new.id,'request_table',tg_table_name)
 from public.tnt_accounts where system_role='admin' and enabled;
 return new;
end $$;
revoke all on function public.tnt_notify_review_request() from public,anon,authenticated;
create trigger profile_request_notice after insert on public.tnt_profile_change_requests for each row execute function public.tnt_notify_review_request();
create trigger access_request_notice after insert on public.tnt_access_requests for each row execute function public.tnt_notify_review_request();
create trigger role_request_notice after insert on public.tnt_role_requests for each row execute function public.tnt_notify_review_request();

-- Personal attendance does not grant access to other attendees or the staff module.
create or replace function public.tnt_my_attendance() returns table(meeting_date date,area text,status text)
language sql security definer set search_path='' as $$
 select saturday_date,'Sábado'::text,status from public.tnt_saturday_attendance where person_id=public.tnt_current_person_id() and exists(select 1 from public.tnt_accounts where person_id=public.tnt_current_person_id() and enabled)
 union all
 select a.wednesday_date,'EFE · '||g.name,a.status from public.tnt_efe_wednesday_attendance a join public.tnt_efe_groups g on g.id=a.group_id where a.person_id=public.tnt_current_person_id() and exists(select 1 from public.tnt_accounts where person_id=public.tnt_current_person_id() and enabled)
 order by 1 desc limit 100;
$$;
revoke all on function public.tnt_my_attendance() from public,anon;
grant execute on function public.tnt_my_attendance() to authenticated;
