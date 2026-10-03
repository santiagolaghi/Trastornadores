create table public.tnt_profile_private_fields(person_id uuid primary key references public.tnt_people(id),dni text not null default '');
alter table public.tnt_profile_private_fields enable row level security;
revoke all on public.tnt_profile_private_fields from anon,authenticated;
grant select on public.tnt_profile_private_fields to authenticated;
create policy profile_private_read on public.tnt_profile_private_fields for select to authenticated using(person_id=public.tnt_current_person_id() or public.tnt_is_admin() or public.tnt_can_action('perfiles','view','*'));
insert into public.tnt_profile_private_fields(person_id,dni) select id,data_notes->>'dni' from public.tnt_people where coalesce(data_notes->>'dni','')<>'';
update public.tnt_people set data_notes=data_notes-'dni' where data_notes ? 'dni';
CREATE OR REPLACE FUNCTION public.tnt_request_profile_change(p_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid:=public.tnt_current_person_id(); p public.tnt_people%rowtype; proposed jsonb; previous jsonb; rid uuid; fields jsonb;
begin
 if pid is null then raise exception 'Iniciá sesión' using errcode='42501'; end if;
 select * into p from public.tnt_people where id=pid for update;
 if not p.active or not exists(select 1 from public.tnt_accounts where person_id=pid and enabled) then raise exception 'La cuenta no está habilitada' using errcode='42501';end if;
 if nullif(trim(p_values->>'first_name'),'') is null or nullif(trim(p_values->>'last_name'),'') is null then raise exception 'Completá nombre y apellido'; end if;
 if coalesce(p_values->>'sex','') not in ('M','F') then raise exception 'Elegí Mujer o Varón';end if;
 if nullif(p_values->>'birthday','') is null or (p_values->>'birthday')::date>current_date or (p_values->>'birthday')::date<date '1900-01-01' then raise exception 'Revisá la fecha de nacimiento';end if;
 if length(regexp_replace(coalesce(p_values->>'phone',''),'[^0-9]','','g'))<6 then raise exception 'Revisá el WhatsApp';end if;
 if coalesce(p_values->>'dni','')<>'' and (p_values->>'dni') !~ '^[0-9]{6,10}$' then raise exception 'Revisá el DNI';end if;
 fields:=public.tnt_profile_fields();
 if fields->'instagram'->>'visible' is distinct from 'false' and fields->'instagram'->>'required'='true' and nullif(trim(p_values->>'instagram'),'') is null then raise exception 'Completá Instagram';end if;
 if fields->'dni'->>'visible' is distinct from 'false' and fields->'dni'->>'required'='true' and nullif(trim(p_values->>'dni'),'') is null then raise exception 'Completá DNI';end if;
 proposed:=jsonb_build_object('first_name',initcap(trim(p_values->>'first_name')),'last_name',initcap(trim(p_values->>'last_name')),'birthday',p_values->>'birthday','sex',p_values->>'sex','phone',trim(p_values->>'phone'),'instagram',coalesce(trim(p_values->>'instagram'),''),'dni',coalesce(p_values->>'dni',''));
 previous:=jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),'birthday',coalesce(p.birthday::text,''),'sex',p.sex,'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''),'dni',coalesce((select dni from public.tnt_profile_private_fields where person_id=p.id),''));
 if proposed=previous then raise exception 'No cambiaste tus datos personales';end if;
 update public.tnt_profile_change_requests set status='cancelled' where person_id=pid and status='pending';
 insert into public.tnt_profile_change_requests(person_id,before_values,proposed_values) values(pid,previous,proposed) returning id into rid;
 return rid;
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_review_profile_change(p_request uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.tnt_profile_change_requests%rowtype; v jsonb; current_values jsonb; p public.tnt_people%rowtype; pid uuid:=public.tnt_current_person_id();
begin
 if pid is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden revisar perfiles' using errcode='42501';end if;
 select * into r from public.tnt_profile_change_requests where id=p_request for update;
 if not found or r.status<>'pending' then raise exception 'La solicitud ya fue resuelta o no existe';end if;
 if p_approve then
  select * into p from public.tnt_people where id=r.person_id for update;
  current_values:=jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),'birthday',coalesce(p.birthday::text,''),'sex',p.sex,'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''),'dni',coalesce((select dni from public.tnt_profile_private_fields where person_id=p.id),''));
  if current_values is distinct from r.before_values then raise exception 'El perfil cambió después de esta solicitud. Pedile a la persona que revise y reenvíe sus datos.';end if;
  v:=r.proposed_values;
  perform public.tnt_save_central_profile(r.person_id,v);
  insert into public.tnt_profile_private_fields(person_id,dni) values(r.person_id,coalesce(v->>'dni','')) on conflict(person_id) do update set dni=excluded.dni;
  update public.tnt_people set profile_consent=true where id=r.person_id;
 end if;
 update public.tnt_profile_change_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=pid where id=r.id;
 insert into public.tnt_notifications(person_id,title,body,href) values(r.person_id,'Cambio de perfil revisado',case when p_approve then 'Se aprobaron tus nuevos datos.' else 'No se aprobaron los cambios. Consultá con un administrador.' end,'/?profile=1');
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details) values(pid,'profile',r.person_id,case when p_approve then 'profile_change_approved' else 'profile_change_rejected' end,jsonb_build_object('request_id',r.id,'before',r.before_values,'proposed',r.proposed_values));
end $function$;
