create or replace function public.tnt_complete_onboarding(p_staff boolean,p_role text default null,p_birthday date default null,p_sex text default 'U')
returns void language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); a public.tnt_accounts%rowtype; p public.tnt_people%rowtype;
begin
 if pid is null then raise exception 'Iniciá sesión nuevamente' using errcode='42501';end if;
 select * into a from public.tnt_accounts where person_id=pid for update;
 select * into p from public.tnt_people where id=pid;
 if not a.enabled or not p.active then raise exception 'La cuenta no está habilitada' using errcode='42501';end if;
 if p_staff is null then raise exception 'Indicá si sos parte del staff';end if;
 if p_birthday is null or p_birthday>current_date or p_birthday<date '1900-01-01' then raise exception 'Revisá tu fecha de nacimiento';end if;
 if coalesce(p_sex,'') not in ('M','F') then raise exception 'Elegí Mujer o Varón';end if;
 if a.onboarding_completed_at is null and (length(trim(coalesce(p.first_name,'')))<2 or length(trim(coalesce(p.last_name,'')))<2 or length(regexp_replace(coalesce(p.phone,''),'[^0-9]','','g'))<6) then raise exception 'Completá tus datos personales para continuar';end if;
 if a.onboarding_completed_at is not null and (p_birthday is distinct from p.birthday or p_sex is distinct from p.sex) then raise exception 'Solicitá cambios personales desde Mi perfil';end if;
 if a.staff_status='approved' and not p_staff then raise exception 'Pedile a un administrador que revise tu salida del staff';end if;
 if p_staff and coalesce(p_role,'') not in ('Pastor/a','Líder','Timoteo','Colaborador') then raise exception 'Elegí tu función en el equipo';end if;
 update public.tnt_people set birthday=p_birthday,sex=p_sex where id=pid and (birthday is distinct from p_birthday or sex is distinct from p_sex);
 update public.tnt_role_requests set status='cancelled' where person_id=pid and status='pending';
 if p_staff and (a.staff_status<>'approved' or p_role is distinct from a.ministry_role) then
  insert into public.tnt_role_requests(person_id,requested_role) values(pid,p_role);
 end if;
 update public.tnt_accounts set requested_ministry_role=case when p_staff then p_role else null end,
  staff_status=case when staff_status='approved' then staff_status when p_staff then 'pending' else 'community' end,onboarding_completed_at=coalesce(onboarding_completed_at,now()) where person_id=pid;
end $$;
revoke all on function public.tnt_complete_onboarding(boolean,text,date,text) from public,anon,authenticated;
-- Older open tabs can still request a role; the same validation prevents skipping personal data or changing an approved profile.
grant execute on function public.tnt_complete_onboarding(boolean,text,date,text) to authenticated;

create or replace function public.tnt_request_membership(p_staff boolean,p_role text default null)
returns void language plpgsql security definer set search_path='' as $$
declare p public.tnt_people%rowtype;
begin
 select * into p from public.tnt_people where id=public.tnt_current_person_id();
 if not exists(select 1 from public.tnt_accounts where person_id=p.id and onboarding_completed_at is not null) then raise exception 'Completá primero tu alta en TNT';end if;
 perform public.tnt_complete_onboarding(p_staff,p_role,p.birthday,p.sex);
end $$;
revoke all on function public.tnt_request_membership(boolean,text) from public,anon;
grant execute on function public.tnt_request_membership(boolean,text) to authenticated;

create or replace function public.tnt_finish_onboarding(p_values jsonb,p_staff boolean,p_role text default null)
returns void language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); a public.tnt_accounts%rowtype; fields jsonb; bday date;
begin
 if pid is null then raise exception 'Iniciá sesión nuevamente' using errcode='42501';end if;
 select * into a from public.tnt_accounts where person_id=pid for update;
 if not found or not a.enabled then raise exception 'La cuenta no está habilitada' using errcode='42501';end if;
 if a.onboarding_completed_at is not null then raise exception 'Tu alta ya está completa. Los cambios se solicitan desde Mi perfil.';end if;
 if length(trim(coalesce(p_values->>'first_name','')))<2 or length(trim(coalesce(p_values->>'last_name','')))<2 then raise exception 'Completá nombre y apellido';end if;
 if coalesce(p_values->>'sex','') not in ('M','F') then raise exception 'Elegí Mujer o Varón';end if;
 bday:=nullif(p_values->>'birthday','')::date;
 if bday is null or bday>current_date or bday<date '1900-01-01' then raise exception 'Revisá tu fecha de nacimiento';end if;
 if length(regexp_replace(coalesce(p_values->>'phone',''),'[^0-9]','','g'))<6 then raise exception 'Revisá el WhatsApp';end if;
 if coalesce(p_values->>'dni','')<>'' and (p_values->>'dni') !~ '^[0-9]{6,10}$' then raise exception 'Revisá el DNI';end if;
 fields:=public.tnt_profile_fields();
 if fields->'instagram'->>'visible' is distinct from 'false' and fields->'instagram'->>'required'='true' and nullif(trim(p_values->>'instagram'),'') is null then raise exception 'Completá Instagram';end if;
 if fields->'dni'->>'visible' is distinct from 'false' and fields->'dni'->>'required'='true' and nullif(trim(p_values->>'dni'),'') is null then raise exception 'Completá DNI';end if;
 update public.tnt_people set first_name=initcap(trim(p_values->>'first_name')),last_name=initcap(trim(p_values->>'last_name')),
  full_name=initcap(trim(p_values->>'first_name'))||' '||initcap(trim(p_values->>'last_name')),
  normalized_name=lower(regexp_replace(trim(p_values->>'first_name')||' '||trim(p_values->>'last_name'),'[[:space:]]+',' ','g')),
  phone=trim(p_values->>'phone'),instagram=nullif(trim(p_values->>'instagram'),''),birthday=bday,sex=p_values->>'sex',profile_consent=true,profile_updated_at=now(),updated_at=now() where id=pid;
 insert into public.tnt_profile_private_fields(person_id,dni) values(pid,coalesce(p_values->>'dni','')) on conflict(person_id) do update set dni=excluded.dni;
 perform public.tnt_complete_onboarding(p_staff,p_role,bday,p_values->>'sex');
end $$;
revoke all on function public.tnt_finish_onboarding(jsonb,boolean,text) from public,anon;
grant execute on function public.tnt_finish_onboarding(jsonb,boolean,text) to authenticated;

create or replace function public.tnt_profile_link_preview(p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.tnt_profile_link_requests%rowtype;
begin
 if public.tnt_current_person_id() is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden revisar vínculos' using errcode='42501';end if;
 select * into r from public.tnt_profile_link_requests where id=p_request;
 if not found then raise exception 'Solicitud no encontrada';end if;
 return jsonb_build_object('source',(select (to_jsonb(p)-'data_notes')||jsonb_build_object('dni',coalesce((select dni from public.tnt_profile_private_fields where person_id=p.id),'')) from public.tnt_people p where id=r.person_id),'target',(select (to_jsonb(p)-'data_notes')||jsonb_build_object('dni',coalesce((select dni from public.tnt_profile_private_fields where person_id=p.id),'')) from public.tnt_people p where id=r.target_person_id),'history',jsonb_build_object(
 'saturdays',(select count(*) from public.tnt_saturday_attendance where person_id=r.target_person_id),
 'efe',(select count(*) from public.tnt_efe_wednesday_attendance where person_id=r.target_person_id),
 'camps',(select count(*) from public.tnt_camp_registrations where person_id=r.target_person_id),
 'messages',(select count(*) from public.tnt_chat_messages where person_id=r.target_person_id)));
end $$;
revoke all on function public.tnt_profile_link_preview(uuid) from public,anon;
grant execute on function public.tnt_profile_link_preview(uuid) to authenticated;

create or replace function public.tnt_guard_account_sensitive_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return new;end if;
 if public.tnt_is_admin() then
  if old.system_role='admin' and old.enabled and (new.system_role<>'admin' or not new.enabled)
   and (select count(*) from public.tnt_accounts where system_role='admin' and enabled)<=1 then
   raise exception 'No se puede quitar o deshabilitar el último administrador';
  end if;
  return new;
 end if;
 if new.system_role is distinct from old.system_role or new.ministry_role is distinct from old.ministry_role
  or new.enabled is distinct from old.enabled or new.auth_user_id is distinct from old.auth_user_id
  or new.person_id is distinct from old.person_id or new.staff_reviewed_by is distinct from old.staff_reviewed_by
  or new.staff_reviewed_at is distinct from old.staff_reviewed_at
  or (new.staff_status is distinct from old.staff_status and (new.staff_status='approved' or old.staff_status='approved')) then
  raise exception 'Solo un administrador puede aprobar o modificar un rol y sus permisos' using errcode='42501';
 end if;
 if new.email is distinct from old.email and new.email is distinct from (select email from auth.users where id=auth.uid()) then
  raise exception 'El correo se toma de tu cuenta Google' using errcode='42501';
 end if;
 if new.onboarding_completed_at is distinct from old.onboarding_completed_at then
  if old.onboarding_completed_at is not null or new.onboarding_completed_at is null or not exists(select 1 from public.tnt_people p where p.id=new.person_id and p.active and length(trim(coalesce(p.first_name,'')))>=2 and length(trim(coalesce(p.last_name,'')))>=2 and p.birthday between date '1900-01-01' and current_date and p.sex in('M','F') and length(regexp_replace(coalesce(p.phone,''),'[^0-9]','','g'))>=6) then
   raise exception 'Completá el formulario de bienvenida antes de continuar' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.tnt_guard_account_sensitive_update() from public,anon,authenticated;
