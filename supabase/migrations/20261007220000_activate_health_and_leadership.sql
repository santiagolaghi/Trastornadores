-- Apply only after the client with health and leadership field controls is live.
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
 -- Only the invitation RPC can create this accepted receipt in the current transaction.
 -- Every other account attribute must remain identical during consent.
 if old.auth_user_id=auth.uid() and old.staff_status is distinct from 'approved' and new.staff_status='approved'
  and (to_jsonb(new)-array['ministry_role','staff_status','staff_reviewed_by','staff_reviewed_at','updated_at'])
   =(to_jsonb(old)-array['ministry_role','staff_status','staff_reviewed_by','staff_reviewed_at','updated_at'])
  and exists(select 1 from public.tnt_staff_invitations i where i.person_id=old.person_id and i.status='accepted'
   and i.role=new.ministry_role and i.invited_by=new.staff_reviewed_by
   and i.responded_at=new.staff_reviewed_at and i.responded_at=now()) then return new;end if;
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
  if old.onboarding_completed_at is not null or new.onboarding_completed_at is null or jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(new.person_id)))>0 then
   raise exception 'Completá el formulario de bienvenida antes de continuar' using errcode='42501';
  end if;
 end if;
 return new;
end $$;

create or replace function public.tnt_guard_sensitive_profile_answers() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb:='{}'; entry record;
begin
 if tg_op='UPDATE' then previous:=old.answers;end if;
 if new.answers->'health' is distinct from previous->'health' and auth.uid() is not null
  and not public.tnt_is_admin() and new.person_id is distinct from public.tnt_current_person_id() then
  raise exception 'Los datos de salud solo los edita la persona o un administrador' using errcode='42501';
 end if;
 if new.answers ? 'leadership_strengths' then
  if jsonb_typeof(new.answers->'leadership_strengths')<>'object' then raise exception 'Revisá tus fortalezas de liderazgo';end if;
  for entry in select * from jsonb_each(new.answers->'leadership_strengths') loop
   if entry.key not in ('Acompañar jóvenes','Acompañar adolescentes','Enseñar','Escuchar','Organizar equipos','Comunicar')
    or jsonb_typeof(entry.value)<>'number' then raise exception 'Revisá tus fortalezas de liderazgo';end if;
   if entry.value::text::numeric not between 0 and 100 then raise exception 'Cada porcentaje debe estar entre 0 y 100';end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function public.tnt_guard_sensitive_profile_answers() from public,anon,authenticated;
drop trigger if exists tnt_sensitive_profile_answers on public.tnt_profile_answers;
create trigger tnt_sensitive_profile_answers before insert or update on public.tnt_profile_answers
 for each row execute function public.tnt_guard_sensitive_profile_answers();

create or replace function public.tnt_profile_values(p_person uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select answers from public.tnt_profile_answers where person_id=p.id),'{}'::jsonb)
 ||jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),
 'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),
 'birthday',coalesce(p.birthday::text,''),'sex',case when p.sex='U' then '' else p.sex end,
 'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''),
 'dni',coalesce((select dni from public.tnt_profile_private_fields where person_id=p.id),''),
 '_ministry_role',coalesce((select ministry_role from public.tnt_accounts where person_id=p.id),''),
 'efe_group',coalesce((select g.code from public.tnt_efe_memberships m join public.tnt_efe_groups g on g.id=m.group_id where m.person_id=p.id and m.active order by m.id limit 1),
 (select answers->>'efe_group' from public.tnt_profile_answers where person_id=p.id),''))
 from public.tnt_people p where p.id=p_person;
$$;
create or replace function public.tnt_profile_missing_values(p_values jsonb) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'label',coalesce(value->>'label',key))),'[]'::jsonb)
 from jsonb_each(public.tnt_profile_fields()) f
 where value->>'visible' is distinct from 'false' and value->>'required'='true'
 and (not (value ? 'roles') or coalesce(value->'roles' ? (p_values->>'_ministry_role'),false))
 and (p_values->key is null or p_values->key='null'::jsonb or p_values->key='[]'::jsonb or p_values->key='{}'::jsonb
 or trim(coalesce(p_values->>key,''))='' or (key='sex' and p_values->>key not in('M','F')));
$$;

update public.tnt_settings set value=value
 || jsonb_build_object('health',jsonb_build_object(
  'label','¿Tenés alguna enfermedad, alergia o condición de salud que debamos conocer?',
  'type','textarea','visible',true,'required',true),
 'leadership_strengths',jsonb_build_object(
  'label','Fortalezas en el liderazgo (jóvenes y adolescentes)',
  'type','leadership','visible',true,'required',false,'roles',jsonb_build_array('Líder')))
where key='profile_fields';
