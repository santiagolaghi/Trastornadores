-- One configurable profile for account onboarding, public profiles and staff.
create table public.tnt_profile_answers (
 person_id uuid primary key references public.tnt_people(id) on delete cascade,
 answers jsonb not null default '{}'::jsonb check(jsonb_typeof(answers)='object'),
 completed_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.tnt_profile_answers enable row level security;
revoke all on public.tnt_profile_answers from anon,authenticated;
grant select on public.tnt_profile_answers to authenticated;
create policy profile_answers_read on public.tnt_profile_answers for select to authenticated
 using(person_id=(select public.tnt_current_person_id()) or (select public.tnt_has_access('perfiles','*','view')));

insert into public.tnt_settings(key,value) values('profile_fields',
 '{"first_name":{"label":"Nombre","type":"text","visible":true,"required":true},
 "last_name":{"label":"Apellido","type":"text","visible":true,"required":true},
 "birthday":{"label":"Fecha de nacimiento","type":"date","visible":true,"required":true},
 "sex":{"label":"Sexo","type":"select","visible":true,"required":true,"options":["M","F"]},
 "phone":{"label":"WhatsApp","type":"tel","visible":true,"required":true},
 "instagram":{"label":"Instagram","type":"text","visible":true,"required":true},
 "dni":{"label":"DNI","type":"text","visible":true,"required":true},
 "interests":{"label":"¿Qué te gusta hacer?","type":"multiselect","visible":true,"required":true,"options":["Música","Dibujar","Cantar","Bailar","Deportes","Leer","Tecnología","Crear contenido","Todavía estoy descubriéndolo"]},
 "studies":{"label":"¿Qué estudiás o a qué te dedicás?","type":"text","visible":true,"required":true},
 "dreams":{"label":"¿Cuáles son tus sueños?","type":"textarea","visible":true,"required":true},
 "efe_group":{"label":"¿A qué EFE vas?","type":"efe","visible":true,"required":true}}'::jsonb)
on conflict(key) do update set value=excluded.value;

create or replace function public.tnt_profile_fields() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select value from public.tnt_settings where key='profile_fields'),'{}'::jsonb);
$$;
revoke all on function public.tnt_profile_fields() from public;
grant execute on function public.tnt_profile_fields() to anon,authenticated;

create or replace function public.tnt_profile_values(p_person uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select answers from public.tnt_profile_answers where person_id=p.id),'{}'::jsonb)
 ||jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),
 'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),
 'birthday',coalesce(p.birthday::text,''),'sex',case when p.sex='U' then '' else p.sex end,
 'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''),
 'dni',coalesce((select dni from public.tnt_profile_private_fields where person_id=p.id),''),
 'efe_group',coalesce((select g.code from public.tnt_efe_memberships m join public.tnt_efe_groups g on g.id=m.group_id where m.person_id=p.id and m.active order by m.id limit 1),
 (select answers->>'efe_group' from public.tnt_profile_answers where person_id=p.id),''))
 from public.tnt_people p where p.id=p_person;
$$;
revoke all on function public.tnt_profile_values(uuid) from public,anon,authenticated;

create or replace function public.tnt_profile_missing_values(p_values jsonb) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'label',coalesce(value->>'label',key))),'[]'::jsonb)
 from jsonb_each(public.tnt_profile_fields()) f
 where value->>'visible' is distinct from 'false' and value->>'required'='true'
 and (p_values->key is null or p_values->key='null'::jsonb or p_values->key='[]'::jsonb
 or trim(coalesce(p_values->>key,''))='' or (key='sex' and p_values->>key not in('M','F')));
$$;
revoke all on function public.tnt_profile_missing_values(jsonb) from public,anon,authenticated;

create or replace function public.tnt_profile_is_complete() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
 where a.auth_user_id=auth.uid() and a.enabled and p.active and a.onboarding_completed_at is not null
 and jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(p.id)))=0);
$$;
revoke all on function public.tnt_profile_is_complete() from public,anon;
grant execute on function public.tnt_profile_is_complete() to authenticated;

create or replace function public.tnt_profile_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); v jsonb;
begin
 if pid is null then raise exception 'Iniciá sesión' using errcode='42501';end if;
 v:=public.tnt_profile_values(pid);
 return jsonb_build_object('fields',public.tnt_profile_fields(),'values',v,
 'missing',public.tnt_profile_missing_values(v),'complete',public.tnt_profile_is_complete(),
 'groups',(select jsonb_agg(jsonb_build_object('code',code,'name',name) order by code) from public.tnt_efe_groups));
end $$;
revoke all on function public.tnt_profile_context() from public,anon;
grant execute on function public.tnt_profile_context() to authenticated;

create or replace function public.tnt_validate_profile_values(p_values jsonb) returns void
language plpgsql stable set search_path='' as $$
declare missing jsonb; f record; v text;
begin
 if p_values is null or jsonb_typeof(p_values)<>'object' then raise exception 'Revisá los datos del perfil';end if;
 missing:=public.tnt_profile_missing_values(p_values);
 if jsonb_array_length(missing)>0 then raise exception 'Completá: %',(select string_agg(x->>'label',', ') from jsonb_array_elements(missing) x);end if;
 for f in select * from jsonb_each(public.tnt_profile_fields()) loop
  if f.value->>'visible'='false' then continue;end if;
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
end $$;
revoke all on function public.tnt_validate_profile_values(jsonb) from public,anon,authenticated;

-- An explicit EFE choice is membership, never a staff permission.
create or replace function public.tnt_apply_profile_answers(p_person uuid,p_values jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare extras jsonb; gid uuid; selected text:=p_values->>'efe_group';
begin
 select coalesce(jsonb_object_agg(f.key,p_values->f.key),'{}'::jsonb) into extras
 from jsonb_each(public.tnt_profile_fields()) f
 where f.key not in('first_name','last_name','birthday','sex','phone','instagram','dni') and p_values ? f.key;
 insert into public.tnt_profile_answers(person_id,answers,completed_at) values(p_person,extras,now())
 on conflict(person_id) do update set answers=public.tnt_profile_answers.answers||excluded.answers,completed_at=now(),updated_at=now();
 if selected is not null and selected<>'' then
  if selected<>'none' then select id into gid from public.tnt_efe_groups where code=selected;if gid is null then raise exception 'EFE no encontrado';end if;end if;
  update public.tnt_efe_memberships set active=false where person_id=p_person and active and group_id is distinct from gid;
  if gid is not null then insert into public.tnt_efe_memberships(person_id,group_id,active) values(p_person,gid,true)
   on conflict(person_id,group_id) do update set active=true;end if;
 end if;
end $$;
revoke all on function public.tnt_apply_profile_answers(uuid,jsonb) from public,anon,authenticated;

create or replace function public.tnt_sync_efe_membership() returns trigger
language plpgsql set search_path='' as $$
declare gid uuid; years integer;
begin
 if not new.active then return new;end if;
 -- Preserve existing/manual membership and an explicit "none" choice.
 if exists(select 1 from public.tnt_efe_memberships where person_id=new.id and active)
 or exists(select 1 from public.tnt_profile_answers where person_id=new.id and answers ? 'efe_group') then return new;end if;
 if new.sex='M' then select id into gid from public.tnt_efe_groups where code='varones';
 elsif new.sex='F' and new.birthday is not null then
  years:=extract(year from age(current_date,new.birthday));
  select id into gid from public.tnt_efe_groups where code=case when years>=18 then 'mujeres18' when years between 12 and 14 then 'mujeres12_14' when years between 15 and 17 then 'mujeres15_17' end;
 end if;
 if gid is not null then insert into public.tnt_efe_memberships(person_id,group_id,active) values(new.id,gid,true)
  on conflict(person_id,group_id) do update set active=true;end if;
 return new;
end $$;

create or replace function public.tnt_complete_profile(p_values jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); a public.tnt_accounts%rowtype; old_values jsonb; v jsonb; k text;
begin
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
end $$;
revoke all on function public.tnt_complete_profile(jsonb) from public,anon;
grant execute on function public.tnt_complete_profile(jsonb) to authenticated;

create or replace function public.tnt_guard_own_profile_review() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user not in('postgres','supabase_admin') and old.id=public.tnt_current_person_id()
 and not public.tnt_is_admin() and not public.tnt_can_action('perfiles','edit','*')
 and exists(select 1 from public.tnt_accounts where person_id=old.id and onboarding_completed_at is not null)
 and (new.full_name,new.first_name,new.last_name,new.birthday,new.sex,new.phone,new.instagram,new.data_notes,new.active)
 is distinct from (old.full_name,old.first_name,old.last_name,old.birthday,old.sex,old.phone,old.instagram,old.data_notes,old.active)
 then raise exception 'Enviá tus cambios de perfil a revisión' using errcode='42501';end if;
 return new;
end $$;

create or replace function public.tnt_complete_onboarding(p_staff boolean,p_role text default null,p_birthday date default null,p_sex text default 'U')
returns void language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); a public.tnt_accounts%rowtype;
begin
 if pid is null then raise exception 'Iniciá sesión' using errcode='42501';end if;
 select * into a from public.tnt_accounts where person_id=pid for update;
 if jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(pid)))>0 then raise exception 'Completá todos los campos obligatorios de tu perfil';end if;
 if p_staff is null then raise exception 'Indicá si sos parte del staff';end if;
 if a.staff_status='approved' and not p_staff then raise exception 'Pedile a un administrador que revise tu salida del staff';end if;
 if p_staff and coalesce(p_role,'') not in('Pastor/a','Líder','Timoteo','Colaborador') then raise exception 'Elegí tu función';end if;
 update public.tnt_role_requests set status='cancelled' where person_id=pid and status='pending';
 if p_staff and (a.staff_status<>'approved' or p_role is distinct from a.ministry_role) then
  insert into public.tnt_role_requests(person_id,requested_role) values(pid,p_role);
 end if;
 update public.tnt_accounts set requested_ministry_role=case when p_staff then p_role else null end,
 staff_status=case when staff_status='approved' then staff_status when p_staff then 'pending' else 'community' end,
 onboarding_completed_at=coalesce(onboarding_completed_at,now()) where person_id=pid;
end $$;

create or replace function public.tnt_finish_onboarding(p_values jsonb,p_staff boolean,p_role text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.tnt_complete_profile(p_values);
 perform public.tnt_complete_onboarding(p_staff,p_role);
end $$;

-- Gate database authorization too, including direct links and already signed-in staff.
create or replace function public.tnt_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select public.tnt_profile_is_complete() and exists(select 1 from public.tnt_accounts where auth_user_id=auth.uid() and system_role='admin' and enabled);
$$;
create or replace function public.tnt_is_staff(p_person uuid default public.tnt_current_person_id()) returns boolean
language sql stable security definer set search_path='' as $$
 select (auth.uid() is null or public.tnt_profile_is_complete()) and exists(select 1 from public.tnt_accounts where person_id=p_person and enabled and staff_status='approved');
$$;

-- Deliberately publish only safe, selected community information.
alter table public.tnt_events add column community_visible boolean not null default false;
create or replace function public.tnt_community_home() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();
begin
 if pid is null or not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil para continuar' using errcode='42501';end if;
 return jsonb_build_object(
 'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (select id,name,start_date,end_date,location,kind from public.tnt_events
  where community_visible and status in('confirmed','live') and end_date>=current_date order by start_date limit 12) e),
 'news',coalesce((select value from public.tnt_settings where key='community_news'),'[]'::jsonb),
 'efe',(select jsonb_build_object('name',g.name,'code',g.code,'leader',m.leader_name) from public.tnt_efe_memberships m join public.tnt_efe_groups g on g.id=m.group_id where m.person_id=pid and m.active order by m.id limit 1),
 'notes',(select coalesce(jsonb_agg(to_jsonb(n)),'[]') from (select id,title,body,read_at,created_at from public.tnt_notifications where person_id=pid order by created_at desc limit 8) n));
end $$;
revoke all on function public.tnt_community_home() from public,anon;
grant execute on function public.tnt_community_home() to authenticated;

-- Public form uses the exact same fields without exposing existing profiles.
create or replace function public.tnt_public_profile_form() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('fields',public.tnt_profile_fields(),'groups',(select jsonb_agg(jsonb_build_object('code',code,'name',name) order by code) from public.tnt_efe_groups));
$$;
revoke all on function public.tnt_public_profile_form() from public;
grant execute on function public.tnt_public_profile_form() to anon,authenticated;

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
CREATE OR REPLACE FUNCTION public.tnt_can_action(p_module text, p_action text, p_scope text DEFAULT '*'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pid uuid;
  v_role text;
  v_staff text;
  v_system text;
  v_allowed boolean;
  v_required text;
begin
  v_pid:=public.tnt_current_person_id();
  if v_pid is null or not public.tnt_profile_is_complete() then return false; end if;
  select ministry_role,staff_status,system_role into v_role,v_staff,v_system
  from public.tnt_accounts where person_id=v_pid and enabled limit 1;

  if v_system='admin' and p_module<>'efe' then return true; end if;
  if p_action='view' then return public.tnt_has_access(p_module,p_scope,'view'); end if;
  if not public.tnt_has_access(p_module,p_scope,'view') then return false; end if;

  select o.allowed into v_allowed
  from public.tnt_person_permission_overrides o
  where o.person_id=v_pid and o.module=p_module and o.action=p_action
    and o.scope in (p_scope,'*')
  order by case when o.scope=p_scope then 0 else 1 end
  limit 1;
  if found then return v_allowed; end if;

  select rp.allowed into v_allowed
  from public.tnt_role_permission_presets rp
  where rp.role=v_role and rp.module=p_module and rp.action=p_action
    and rp.scope in (p_scope,'*')
  order by case when rp.scope=p_scope then 0 else 1 end
  limit 1;
  if found then return v_allowed; end if;

  v_required:=case
    when p_action in ('edit','attendance','send_message','update_own_activity','create_activity','edit_activity','assign_people','edit_people','sell','edit_stock') then 'edit'
    when p_action in ('manage','create_saturday','edit_event','manage_people','templates','create_chat','manage_members','delete_chat','history','reports','delete') then 'manage'
    else null
  end;
  if v_required is null then return false; end if;
  return public.tnt_has_access(p_module,p_scope,v_required);
end $function$;
CREATE OR REPLACE FUNCTION public.tnt_save_central_profile(p_person uuid, p_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.tnt_people%rowtype; v_first text; v_last text; v_full text; v_birthday date; v_sex text; v_phone text; v_instagram text;
begin
 if public.tnt_current_person_id() is null or not (public.tnt_is_admin() or public.tnt_can_action('perfiles','edit','*')) then raise exception 'No tenés permiso para editar Perfiles.' using errcode='42501';end if;
 select * into p from public.tnt_people where id=p_person for update;
 if not found then raise exception 'Perfil no encontrado.';end if;
 v_first:=coalesce(nullif(trim(p_values->>'first_name'),''),nullif(p.first_name,''),split_part(p.full_name,' ',1));
 v_last:=coalesce(nullif(trim(p_values->>'last_name'),''),nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1)));
 v_full:=coalesce(nullif(trim(p_values->>'full_name'),''),trim(v_first||' '||v_last));
 v_birthday:=case when p_values ? 'birthday' then nullif(p_values->>'birthday','')::date else p.birthday end;
 v_sex:=coalesce(nullif(p_values->>'sex',''),p.sex);
 v_phone:=case when p_values ? 'phone' then nullif(trim(p_values->>'phone'),'') else p.phone end;
 v_instagram:=case when p_values ? 'instagram' then nullif(trim(p_values->>'instagram'),'') else p.instagram end;
 if length(v_full) not between 2 and 201 or length(v_first)>100 or length(v_last)>100 then raise exception 'Revisá el nombre.';end if;
 if v_birthday is not null and (v_birthday>current_date or v_birthday<date '1900-01-01') then raise exception 'Revisá la fecha de nacimiento.';end if;
 if coalesce(v_sex,'') not in('M','F','U') then raise exception 'Revisá el sexo.';end if;
 if v_phone is not null and (length(regexp_replace(v_phone,'[^0-9]','','g')) not between 6 and 20 or length(v_phone)>30) then raise exception 'Revisá el WhatsApp.';end if;
 if length(coalesce(v_instagram,''))>100 then raise exception 'Revisá Instagram.';end if;
 update public.tnt_people set first_name=v_first,last_name=v_last,full_name=v_full,
  normalized_name=lower(trim(regexp_replace(v_full,'[[:space:]]+',' ','g'))),birthday=v_birthday,phone=v_phone,instagram=v_instagram,sex=v_sex,profile_updated_at=now(),updated_at=now() where id=p_person;
 if p_values ? 'dni' then
  if coalesce(p_values->>'dni','')<>'' and (p_values->>'dni') !~ '^[0-9]{6,10}$' then raise exception 'Revisá el DNI';end if;
  insert into public.tnt_profile_private_fields(person_id,dni) values(p_person,coalesce(p_values->>'dni','')) on conflict(person_id) do update set dni=excluded.dni;
 end if;
 perform public.tnt_apply_profile_answers(p_person,p_values);
 return p_person;
end $function$;
create or replace function public.tnt_save_my_interests(p_values jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();
begin
 if pid is null then raise exception 'Iniciá sesión' using errcode='42501';end if;
 perform 1 from public.tnt_people where id=pid and active for update;
 if not found then raise exception 'Perfil no disponible';end if;
 perform public.tnt_validate_profile_values(public.tnt_profile_values(pid)||p_values);
 perform public.tnt_apply_profile_answers(pid,p_values);
end $$;
revoke all on function public.tnt_save_my_interests(jsonb) from public,anon;
grant execute on function public.tnt_save_my_interests(jsonb) to authenticated;

create or replace function public.tnt_request_profile_change(p_values jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); v jsonb; proposed jsonb; previous jsonb; rid uuid;
begin
 if pid is null then raise exception 'Iniciá sesión' using errcode='42501';end if;
 perform 1 from public.tnt_people where id=pid and active for update;
 if not found then raise exception 'Tu perfil está archivado';end if;
 v:=public.tnt_profile_values(pid);
 perform public.tnt_validate_profile_values(v||p_values);
 select jsonb_object_agg(k,coalesce(v->k,'""'::jsonb)) into previous
 from unnest(array['first_name','last_name','birthday','sex','phone','instagram','dni']) k;
 proposed:=previous||p_values;
 select jsonb_object_agg(k,coalesce(proposed->k,'""'::jsonb)) into proposed
 from unnest(array['first_name','last_name','birthday','sex','phone','instagram','dni']) k;
 if proposed=previous then raise exception 'No cambiaste tus datos personales';end if;
 update public.tnt_profile_change_requests set status='cancelled' where person_id=pid and status='pending';
 insert into public.tnt_profile_change_requests(person_id,before_values,proposed_values) values(pid,previous,proposed) returning id into rid;
 return rid;
end $$;

create or replace function public.tnt_submit_public_profile(p_values jsonb,p_consent boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare v jsonb:=p_values; norm text; fullname text; bday date; p public.tnt_people%rowtype; rid uuid; matches integer; previous jsonb;
begin
 if p_consent is distinct from true then raise exception 'Necesitamos tu autorización para guardar el perfil';end if;
 perform public.tnt_validate_profile_values(v);
 bday:=nullif(v->>'birthday','')::date;
 fullname:=trim(coalesce(v->>'first_name','')||' '||coalesce(v->>'last_name',''));
 norm:=regexp_replace(translate(lower(fullname),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(norm||':'||coalesce(bday::text,''),0));
 if bday is not null and fullname<>'' then
  select count(*) into matches from public.tnt_people where birthday=bday and not (coalesce(data_notes,'{}') ? 'linked_to')
  and regexp_replace(translate(lower(full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')=norm;
 else matches:=0;end if;
 if matches>1 then raise exception 'Un administrador necesita revisar perfiles que coinciden con estos datos';end if;
 if matches=0 then
  insert into public.tnt_people(full_name,normalized_name,birthday,sex,phone,source,active,first_name,last_name,instagram,profile_consent,profile_created_at,profile_updated_at)
  values(coalesce(nullif(fullname,''),'Perfil TNT'),norm,bday,coalesce(nullif(v->>'sex',''),'U'),nullif(trim(v->>'phone'),''),'profiles',true,trim(v->>'first_name'),trim(v->>'last_name'),nullif(trim(v->>'instagram'),''),true,now(),now()) returning id into rid;
  insert into public.tnt_profile_private_fields(person_id,dni) values(rid,coalesce(v->>'dni',''));
  perform public.tnt_apply_profile_answers(rid,v);
  return rid;
 end if;
 select * into p from public.tnt_people where birthday=bday and not (coalesce(data_notes,'{}') ? 'linked_to')
 and regexp_replace(translate(lower(full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')=norm for update;
 previous:=jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),
 'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),
 'birthday',p.birthday::text,'sex',p.sex,'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''));
 -- An anonymous match never exposes or overwrites the existing record.
 insert into public.tnt_profile_public_requests(person_id,before_values,proposed_values) values(p.id,previous,v)
 on conflict(person_id) where status='pending' do nothing returning id into rid;
 if rid is null then select id into rid from public.tnt_profile_public_requests where person_id=p.id and status='pending';end if;
 return rid;
end $$;
revoke all on function public.tnt_submit_public_profile(jsonb,boolean) from public;
grant execute on function public.tnt_submit_public_profile(jsonb,boolean) to anon,authenticated;
-- Retire the narrow public endpoint so old clients cannot omit the new required fields.
revoke all on function public.tnt_create_public_profile(text,text,date,text,text,text,boolean) from public,anon,authenticated;

create or replace function public.tnt_save_profile_fields(p_fields jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare f record;
begin
 if not public.tnt_is_admin() then raise exception 'Solo administradores pueden configurar Perfiles' using errcode='42501';end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or (select count(*) from jsonb_object_keys(p_fields))>40 then raise exception 'Revisá la configuración';end if;
 for f in select * from jsonb_each(p_fields) loop
  if f.key !~ '^[a-z][a-z0-9_]{0,50}$' or jsonb_typeof(f.value)<>'object' or length(coalesce(f.value->>'label','')) not between 1 and 120
  or coalesce(f.value->>'type','') not in('text','textarea','date','tel','select','multiselect','efe')
  or coalesce(f.value->>'visible','') not in('true','false') or coalesce(f.value->>'required','') not in('true','false')
  then raise exception 'Revisá el campo %',f.key;end if;
  if f.value->>'type' in('select','multiselect') and (jsonb_typeof(f.value->'options') is distinct from 'array' or jsonb_array_length(f.value->'options')=0) then raise exception 'Agregá las opciones de %',f.value->>'label';end if;
 end loop;
 insert into public.tnt_settings(key,value) values('profile_fields',p_fields) on conflict(key) do update set value=excluded.value;
end $$;
revoke all on function public.tnt_save_profile_fields(jsonb) from public,anon;
grant execute on function public.tnt_save_profile_fields(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.tnt_guard_account_sensitive_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if old.onboarding_completed_at is not null or new.onboarding_completed_at is null or jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(new.person_id)))>0 then
   raise exception 'Completá el formulario de bienvenida antes de continuar' using errcode='42501';
  end if;
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.tnt_update_event_config(p_event uuid, p_values jsonb, p_days jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_event public.tnt_events;
  v_name text;
  v_start date;
  v_end date;
  v_status text;
  v_ids uuid[];
  v_bad uuid;
  x jsonb;
  ord bigint;
  v_day_date date;
begin
  select * into v_event from public.tnt_events where id=p_event;
  if v_event.id is null then raise exception 'El encuentro ya no existe.' using errcode='22023'; end if;
  if not public.tnt_can_manage_event(p_event) then
    raise exception 'No tenés permiso para editar este encuentro.' using errcode='42501';
  end if;

  v_name:=coalesce(nullif(trim(p_values->>'name'),''),v_event.name);
  v_start:=case when v_event.kind='saturday' then v_event.start_date else coalesce(nullif(p_values->>'start_date','')::date,v_event.start_date) end;
  v_end:=case when v_event.kind='saturday' then v_event.end_date else coalesce(nullif(p_values->>'end_date','')::date,v_start) end;
  v_status:=coalesce(nullif(p_values->>'status',''),v_event.status);

  if v_end<v_start then raise exception 'Revisá el intervalo de fechas.' using errcode='22023'; end if;
  if v_status not in ('planning','confirmed','live','completed','cancelled') then raise exception 'Estado no válido.' using errcode='22023'; end if;

  if v_event.kind<>'saturday' then
    if p_days is null then p_days:='[]'::jsonb; end if;
    if jsonb_typeof(p_days)<>'array' then raise exception 'La configuración de días no es válida.' using errcode='22023'; end if;
    for x,ord in select value,ordinality from jsonb_array_elements(p_days) with ordinality loop
      v_day_date:=nullif(x->>'date','')::date;
      if v_day_date is not null and (v_day_date<v_start or v_day_date>v_end) then
        raise exception 'El día % queda fuera de las fechas del evento.',coalesce(nullif(x->>'label',''),'Día '||ord::text) using errcode='22023';
      end if;
    end loop;

    select coalesce(array_agg((d->>'id')::uuid),'{}'::uuid[]) into v_ids
    from jsonb_array_elements(p_days) d where nullif(d->>'id','') is not null;

    select sd.id into v_bad
    from public.tnt_schedule_days sd
    where sd.event_id=p_event and not(sd.id=any(v_ids))
      and exists(select 1 from public.tnt_schedule_items i where i.day_id=sd.id)
    limit 1;
    if v_bad is not null then
      raise exception 'No podés borrar un día que todavía tiene actividades. Movelas o eliminálas primero.' using errcode='22023';
    end if;
  end if;

  update public.tnt_events set
    name=v_name,
    description=nullif(trim(p_values->>'description'),''),
    location=nullif(trim(p_values->>'location'),''),
    start_date=v_start,
    end_date=v_end,
    status=v_status,
    community_visible=case when p_values ? 'community_visible' then (p_values->>'community_visible')::boolean else community_visible end,
    updated_at=now()
  where id=p_event;

  if v_event.kind='saturday' then
    delete from public.tnt_schedule_days d
    where d.event_id=p_event and d.date<>v_start
      and not exists(select 1 from public.tnt_schedule_items i where i.day_id=d.id);
    insert into public.tnt_schedule_days(event_id,label,date,sort_order)
    select p_event,'Sábado',v_start,0
    where not exists(select 1 from public.tnt_schedule_days where event_id=p_event and date=v_start);
    update public.tnt_schedule_days set label='Sábado',sort_order=0
    where event_id=p_event and date=v_start;
  else
    delete from public.tnt_schedule_days d
    where d.event_id=p_event and not(d.id=any(v_ids))
      and not exists(select 1 from public.tnt_schedule_items i where i.day_id=d.id);

    insert into public.tnt_schedule_days(id,event_id,label,date,sort_order)
    select coalesce(nullif(d->>'id','')::uuid,gen_random_uuid()),p_event,
           coalesce(nullif(trim(d->>'label'),''),'Día '||ord::text),
           nullif(d->>'date','')::date,ord-1
    from jsonb_array_elements(p_days) with ordinality a(d,ord)
    where nullif(d->>'id','') is null;

    update public.tnt_schedule_days sd
    set label=coalesce(nullif(trim(d->>'label'),''),sd.label),
        date=nullif(d->>'date','')::date,
        sort_order=ord-1
    from jsonb_array_elements(p_days) with ordinality a(d,ord)
    where nullif(d->>'id','') is not null
      and sd.id=(d->>'id')::uuid
      and sd.event_id=p_event;
  end if;

  return p_event;
end $function$;
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
create or replace function public.tnt_profile_detail(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 if not public.tnt_has_access('perfiles','*','view') then raise exception 'No tenés acceso a Perfiles' using errcode='42501';end if;
 v:=public.tnt_profile_values(p_person);
 if not public.tnt_is_admin() and p_person is distinct from public.tnt_current_person_id() then v:=v-'dni';end if;
 return jsonb_build_object('values',v,'fields',public.tnt_profile_fields(),'groups',(select jsonb_agg(jsonb_build_object('code',code,'name',name)) from public.tnt_efe_groups));
end $$;
revoke all on function public.tnt_profile_detail(uuid) from public,anon;
grant execute on function public.tnt_profile_detail(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.tnt_is_pastor_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select public.tnt_profile_is_complete() and exists(select 1 from public.tnt_accounts where auth_user_id=auth.uid() and enabled
 and (system_role='admin' or (staff_status='approved' and ministry_role='Pastor/a')))
$function$;
CREATE OR REPLACE FUNCTION public.tnt_can_manage_event(p_event uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.tnt_profile_is_complete() and (public.tnt_is_admin()
    or exists(
      select 1 from public.tnt_event_members em
      where em.event_id=p_event
        and em.event_role='organizer'
        and em.person_id=public.tnt_current_person_id()
    )
    or public.tnt_can_action('organizacion','edit_event','*'))
$function$;
CREATE OR REPLACE FUNCTION public.tnt_my_attendance()
 RETURNS TABLE(meeting_date date, area text, status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select saturday_date,'Sábado'::text,status from public.tnt_saturday_attendance where public.tnt_profile_is_complete() and person_id=public.tnt_current_person_id() and exists(select 1 from public.tnt_accounts where public.tnt_profile_is_complete() and person_id=public.tnt_current_person_id() and enabled)
 union all
 select a.wednesday_date,'EFE · '||g.name,a.status from public.tnt_efe_wednesday_attendance a join public.tnt_efe_groups g on g.id=a.group_id where public.tnt_profile_is_complete() and a.person_id=public.tnt_current_person_id() and exists(select 1 from public.tnt_accounts where public.tnt_profile_is_complete() and person_id=public.tnt_current_person_id() and enabled)
 order by 1 desc limit 100;
$function$;
-- Restrictive policies also gate old clients that still hold a valid session.
do $$ declare t record;
begin
 for t in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity
 and c.relname not in('tnt_accounts','tnt_people','tnt_profile_answers','tnt_settings','tnt_access_grants',
 'tnt_module_access','tnt_role_permission_presets','tnt_person_permission_overrides','tnt_profile_private_fields',
 'tnt_profile_change_requests','tnt_profile_link_requests','tnt_role_requests','tnt_access_requests',
 'tnt_profile_public_requests','tnt_profile_archive_state','tnt_efe_groups','bootstrap')
 loop
  execute format('create policy tnt_complete_profile_required on public.%I as restrictive for all to authenticated using ((select public.tnt_profile_is_complete())) with check ((select public.tnt_profile_is_complete()))',t.relname);
 end loop;
end $$;
notify pgrst,'reload schema';
