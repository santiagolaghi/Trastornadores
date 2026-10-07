-- A staff invitation belongs to an existing, active profile; accepting it is the person's choice.
create table if not exists public.tnt_staff_invitations (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references public.tnt_people(id) on delete cascade,
 role text not null check (role in ('Pastor/a','Líder','Timoteo','Colaborador')),
 status text not null default 'pending' check (status in ('pending','accepted','declined')),
 invited_by uuid not null references public.tnt_people(id),
 created_at timestamptz not null default now(),
 responded_at timestamptz
);
create unique index if not exists tnt_staff_one_pending_invite on public.tnt_staff_invitations(person_id) where status='pending';
alter table public.tnt_staff_invitations enable row level security;
revoke all on public.tnt_staff_invitations from anon,authenticated;

create or replace function public.tnt_invite_staff(p_person uuid,p_role text) returns uuid
language plpgsql security definer set search_path='' as $$
declare invite_id uuid;
begin
 if not public.tnt_is_admin() then raise exception 'Solo un administrador puede invitar al staff' using errcode='42501';end if;
 if p_role not in ('Pastor/a','Líder','Timoteo','Colaborador') then raise exception 'Elegí un rol válido';end if;
 if not exists(select 1 from public.tnt_people p where p.id=p_person and p.active and not coalesce((p.data_notes->>'deleted_at')<>'',false)) then
  raise exception 'Primero restaurá este perfil desde Perfiles';
 end if;
 if exists(select 1 from public.tnt_accounts a where a.person_id=p_person and a.staff_status='approved') then
  raise exception 'Esta persona ya pertenece al staff';
 end if;
 if exists(select 1 from public.tnt_staff_invitations i where i.person_id=p_person and i.status='pending') then
  raise exception 'Ya tiene una invitación pendiente en sus Avisos';
 end if;
 insert into public.tnt_staff_invitations(person_id,role,invited_by)
 values(p_person,p_role,public.tnt_current_person_id()) returning id into invite_id;
 insert into public.tnt_notifications(person_id,scope,title,body,href,data)
 values(p_person,'personal','Te invitaron a ser parte del Staff',
  'Te invitaron a participar como '||p_role||'. Completá tu perfil y respondé la invitación desde Avisos.',
  '/?staff-invite=1',jsonb_build_object('staff_invitation_id',invite_id));
 return invite_id;
end $$;
revoke all on function public.tnt_invite_staff(uuid,text) from public,anon;
grant execute on function public.tnt_invite_staff(uuid,text) to authenticated;

create or replace function public.tnt_my_staff_invitations() returns setof jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(i) from public.tnt_staff_invitations i
 where i.person_id=public.tnt_current_person_id() and i.status='pending' order by i.created_at desc;
$$;
revoke all on function public.tnt_my_staff_invitations() from public,anon;
grant execute on function public.tnt_my_staff_invitations() to authenticated;

create or replace function public.tnt_respond_staff_invitation(p_invite uuid,p_accept boolean) returns void
language plpgsql security definer set search_path='' as $$
declare inv public.tnt_staff_invitations%rowtype;
begin
 if not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil antes de responder';end if;
 select * into inv from public.tnt_staff_invitations where id=p_invite and person_id=public.tnt_current_person_id() and status='pending' for update;
 if not found then raise exception 'La invitación no está disponible';end if;
 update public.tnt_staff_invitations set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now() where id=p_invite;
 if p_accept then
  update public.tnt_accounts set ministry_role=inv.role,staff_status='approved',staff_reviewed_by=inv.invited_by,staff_reviewed_at=now()
  where person_id=inv.person_id and enabled;
  if not found then raise exception 'La cuenta no está habilitada';end if;
  insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled,granted_by)
  values(inv.person_id,'organizacion','*','view',true,inv.invited_by)
  on conflict(person_id,module,scope) do update set enabled=true;
 end if;
end $$;
revoke all on function public.tnt_respond_staff_invitation(uuid,boolean) from public,anon;
grant execute on function public.tnt_respond_staff_invitation(uuid,boolean) to authenticated;

create or replace function public.tnt_notification_resolved(p_note public.tnt_notifications) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare tab text:=p_note.data->>'request_table'; req uuid; st text;
begin
 if p_note.data ? 'staff_invitation_id' then
  return not exists(select 1 from public.tnt_staff_invitations i
   where i.id=(p_note.data->>'staff_invitation_id')::uuid and i.status='pending');
 end if;
 if p_note.event_id is not null and not exists(select 1 from public.tnt_events where id=p_note.event_id and status<>'cancelled') then return true;end if;
 if p_note.task_id is not null and not exists(select 1 from public.tnt_tasks where id=p_note.task_id and archived_at is null and status not in('completed')) then return true;end if;
 if p_note.title='Nueva asignación' and p_note.task_id is not null then return not exists(select 1 from public.tnt_task_assignees where task_id=p_note.task_id and person_id=p_note.person_id and assignment_status in('assigned','read'));end if;
 if p_note.title='Necesita reemplazo' and p_note.task_id is not null then return not exists(select 1 from public.tnt_tasks where id=p_note.task_id and status='replacement');end if;
 if p_note.title='Actividad lista' and p_note.task_id is not null then return not exists(select 1 from public.tnt_tasks where id=p_note.task_id and status='ready');end if;
 if tab in('tnt_profile_change_requests','tnt_profile_link_requests','tnt_role_requests','tnt_access_requests','tnt_profile_public_requests') and coalesce(p_note.data->>'request_id','')~'^[0-9a-f-]{36}$' then
  req:=(p_note.data->>'request_id')::uuid;
  execute format('select status from public.%I where id=$1',tab) into st using req;
  return st is distinct from 'pending';
 end if;
 return false;
end $$;

-- Answers are configurable; the leadership scale is relevant only to leaders.
alter table public.tnt_notification_state add column if not exists purged_at timestamptz;
create or replace function public.tnt_my_notifications(p_include_dismissed boolean default false) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();
begin
 if pid is null or not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil para continuar.' using errcode='42501';end if;
 return query select to_jsonb(n)||jsonb_build_object('read_at',coalesce(s.read_at,n.read_at),'dismissed_at',s.dismissed_at,'resolved',public.tnt_notification_resolved(n))
 from public.tnt_notifications n left join public.tnt_notification_state s on s.notification_id=n.id and s.person_id=pid
 where public.tnt_notification_visible_for(n,pid) and s.purged_at is null
 and (p_include_dismissed or (s.dismissed_at is null and not public.tnt_notification_resolved(n)))
 order by n.created_at desc limit 200;
end $$;
create or replace function public.tnt_notification_action(p_ids uuid[],p_action text) returns integer
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); count_done integer;
begin
 if pid is null or not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil para continuar.' using errcode='42501';end if;
 if p_action not in('read','dismiss','restore','purge') or cardinality(p_ids)>200 then raise exception 'Acción no válida.';end if;
 if exists(select 1 from unnest(p_ids) wanted(id) where not exists(select 1 from public.tnt_notifications n where n.id=wanted.id and public.tnt_notification_visible_for(n,pid))) then
  raise exception 'Una notificación no pertenece a tu cuenta.' using errcode='42501';end if;
 insert into public.tnt_notification_state(notification_id,person_id,read_at,dismissed_at,purged_at)
 select id,pid,case when p_action='read' then now() end,case when p_action in('dismiss','purge') then now() end,
 case when p_action='purge' then now() end from unnest(p_ids) id
 on conflict(notification_id,person_id) do update set
 read_at=case when p_action='read' then now() else public.tnt_notification_state.read_at end,
 dismissed_at=case when p_action in('dismiss','purge') then now() when p_action='restore' then null else public.tnt_notification_state.dismissed_at end,
 purged_at=case when p_action='purge' then now() else public.tnt_notification_state.purged_at end;
 get diagnostics count_done=row_count;return count_done;
end $$;

update public.tnt_settings set value=value
 || jsonb_build_object('health',jsonb_build_object('label','¿Tenés alguna enfermedad, alergia o condición de salud que debamos conocer?','type','textarea','visible',true,'required',true),
 'leadership_strengths',jsonb_build_object('label','Fortalezas en el liderazgo (jóvenes y adolescentes)','type','leadership','visible',true,'required',false))
where key='profile_fields';

-- Sensitive health answers are available only to the person and administrators.
alter policy profile_answers_read on public.tnt_profile_answers
 using(person_id=(select public.tnt_current_person_id()) or (select public.tnt_is_admin()));
create or replace function public.tnt_profile_detail(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 if not public.tnt_has_access('perfiles','*','view') then raise exception 'No tenés acceso a Perfiles' using errcode='42501';end if;
 v:=public.tnt_profile_values(p_person);
 if not public.tnt_is_admin() and p_person is distinct from public.tnt_current_person_id() then v:=v-'dni'-'health';end if;
 return jsonb_build_object('values',v,'fields',public.tnt_profile_fields(),
  'groups',(select jsonb_agg(jsonb_build_object('code',code,'name',name)) from public.tnt_efe_groups));
end $$;

create or replace function public.tnt_save_profile_fields(p_fields jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare f record;
begin
 if not public.tnt_is_admin() then raise exception 'Solo administradores pueden configurar Perfiles' using errcode='42501';end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or (select count(*) from jsonb_object_keys(p_fields))>40 then raise exception 'Revisá la configuración';end if;
 for f in select * from jsonb_each(p_fields) loop
  if f.key !~ '^[a-z][a-z0-9_]{0,50}$' or jsonb_typeof(f.value)<>'object' or length(coalesce(f.value->>'label','')) not between 1 and 120
  or coalesce(f.value->>'type','') not in('text','textarea','date','tel','select','multiselect','efe','leadership')
  or coalesce(f.value->>'visible','') not in('true','false') or coalesce(f.value->>'required','') not in('true','false')
  then raise exception 'Revisá el campo %',f.key;end if;
  if f.value->>'type' in('select','multiselect') and (jsonb_typeof(f.value->'options') is distinct from 'array' or jsonb_array_length(f.value->'options')=0) then
   raise exception 'Agregá las opciones de %',f.value->>'label';end if;
 end loop;
 insert into public.tnt_settings(key,value) values('profile_fields',p_fields)
 on conflict(key) do update set value=excluded.value;
end $$;
