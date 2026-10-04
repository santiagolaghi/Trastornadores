-- Shared published experience. Drafts and version history stay admin-only.
create table public.tnt_experience(id boolean primary key default true check(id), revision bigint not null default 0, config jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
insert into public.tnt_experience(id) values(true);
create table public.tnt_experience_drafts(person_id uuid primary key references public.tnt_people(id) on delete cascade, base_revision bigint not null, config jsonb not null, updated_at timestamptz not null default now());
create table public.tnt_experience_versions(revision bigint primary key, config jsonb not null, published_by uuid references public.tnt_people(id) on delete set null, created_at timestamptz not null default now());
insert into public.tnt_experience_versions(revision,config) values(0,'{}');
alter table public.tnt_experience enable row level security;
alter table public.tnt_experience_drafts enable row level security;
alter table public.tnt_experience_versions enable row level security;
create policy tnt_experience_read on public.tnt_experience for select to authenticated using(true);
create policy tnt_experience_draft_own on public.tnt_experience_drafts for all to authenticated using((select public.tnt_is_admin()) and person_id=(select public.tnt_current_person_id())) with check((select public.tnt_is_admin()) and person_id=(select public.tnt_current_person_id()));
create policy tnt_experience_versions_admin on public.tnt_experience_versions for select to authenticated using((select public.tnt_is_admin()));
grant select on public.tnt_experience,public.tnt_experience_versions to authenticated;
grant select,insert,update,delete on public.tnt_experience_drafts to authenticated;

create or replace function public.tnt_module_enabled(p_module text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select (config->'modules'->(case when p_module in('efe','lista-sabados') then 'asistencia' else p_module end)->>'enabled')::boolean from public.tnt_experience where id),true)
$$;
create or replace function public.tnt_module_available(p_module text) returns boolean language sql stable security definer set search_path='' as $$
 select public.tnt_is_admin() or public.tnt_module_enabled(p_module)
$$;
create or replace function public.tnt_publish_experience(p_config jsonb,p_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare v_revision bigint; entry record; m record;begin
 if not public.tnt_is_admin() then raise exception 'Solo administradores pueden publicar la configuración.' using errcode='42501';end if;
 if jsonb_typeof(p_config)<>'object' or octet_length(p_config::text)>500000 then raise exception 'La configuración no es válida.';end if;
 if p_config ? 'modules' and jsonb_typeof(p_config->'modules')<>'object' then raise exception 'La configuración de módulos no es válida.';end if;
 for m in select key,value from jsonb_each(coalesce(p_config->'modules','{}')) loop
  if m.key not in('home','organizacion','chat','asistencia','campamento','glosario','buffet','perfiles') or jsonb_typeof(m.value)<>'object' then raise exception 'Módulo desconocido.';end if;
  if m.value ? 'enabled' and jsonb_typeof(m.value->'enabled')<>'boolean' then raise exception 'Elegí si el módulo está habilitado.';end if;
  if m.key='home' and m.value->>'enabled'='false' then raise exception 'El inicio siempre está disponible.';end if;
  if m.value ? 'accent' and m.value->>'accent' !~ '^#[0-9a-fA-F]{6}$' then raise exception 'El color no es válido.';end if;
  if length(coalesce(m.value->>'cover',''))>2000 or (coalesce(m.value->>'cover','')<>'' and m.value->>'cover' !~ '^https://') then raise exception 'La portada necesita un enlace HTTPS.';end if;
 end loop;
 if p_config ? 'copy' and jsonb_typeof(p_config->'copy')<>'object' then raise exception 'Los textos no son válidos.';end if;
 for entry in select key,value from jsonb_each(coalesce(p_config->'copy','{}')) loop
  if jsonb_typeof(entry.value)<>'string' or length(entry.value#>>'{}')>1500 then raise exception 'Un texto supera el máximo de 1500 caracteres.';end if;
 end loop;
 select revision into v_revision from public.tnt_experience where id for update;
 if v_revision<>p_revision then raise exception 'Otro administrador publicó cambios. Reabrí el estudio para revisar la nueva versión antes de publicar.' using errcode='40001';end if;
 v_revision:=v_revision+1;
 update public.tnt_experience set config=p_config,revision=v_revision,updated_at=now() where id;
 insert into public.tnt_experience_versions(revision,config,published_by) values(v_revision,p_config,public.tnt_current_person_id());
 delete from public.tnt_experience_drafts where person_id=public.tnt_current_person_id();
 insert into public.tnt_audit_log(person_id,entity_type,action,details) values(public.tnt_current_person_id(),'settings','experience_published',jsonb_build_object('revision',v_revision));
 return v_revision;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tnt-brand','tnt-brand',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy tnt_brand_read on storage.objects for select to public using(bucket_id='tnt-brand');
create policy tnt_brand_upload on storage.objects for insert to authenticated with check(bucket_id='tnt-brand' and (select public.tnt_is_admin()) and (storage.foldername(name))[1]=(select public.tnt_current_person_id())::text);
create policy tnt_brand_delete on storage.objects for delete to authenticated using(bucket_id='tnt-brand' and (select public.tnt_is_admin()));

-- An action requires both its explicit permission and coordination of this event.
create or replace function public.tnt_event_can_action(p_event uuid,p_action text) returns boolean language sql stable security definer set search_path='' as $$
 select public.tnt_profile_is_complete() and public.tnt_module_available('organizacion') and (public.tnt_is_admin() or (
  public.tnt_can_action('organizacion',p_action,'*') and exists(select 1 from public.tnt_event_members where event_id=p_event and event_role='organizer' and person_id=public.tnt_current_person_id())
 ))
$$;
create or replace function public.tnt_can_manage_event(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$select public.tnt_event_can_action(p_event,'edit_event')$$;
drop policy tnt_tasks_manage on public.tnt_tasks;
create policy tnt_tasks_create on public.tnt_tasks for insert to authenticated with check(public.tnt_event_can_action(event_id,'create_activity'));
create policy tnt_tasks_edit on public.tnt_tasks for update to authenticated using(public.tnt_event_can_action(event_id,'edit_activity')) with check(public.tnt_event_can_action(event_id,'edit_activity'));
create policy tnt_tasks_delete on public.tnt_tasks for delete to authenticated using(public.tnt_event_can_action(event_id,'delete_activity'));
alter policy tnt_assignees_manage on public.tnt_task_assignees using(public.tnt_event_can_action((select event_id from public.tnt_tasks where id=task_id),'assign_people')) with check(public.tnt_event_can_action((select event_id from public.tnt_tasks where id=task_id),'assign_people'));
alter policy tnt_event_members_organizer_insert on public.tnt_event_members with check(public.tnt_event_can_action(event_id,'manage_people'));
alter policy tnt_event_members_organizer_update on public.tnt_event_members using(public.tnt_event_can_action(event_id,'manage_people')) with check(public.tnt_event_can_action(event_id,'manage_people'));
alter policy tnt_event_members_organizer_delete on public.tnt_event_members using(public.tnt_event_can_action(event_id,'manage_people'));

-- Per-person state also works for announcements addressed to the whole team.
create table public.tnt_notification_state(notification_id uuid not null references public.tnt_notifications(id) on delete cascade,person_id uuid not null references public.tnt_people(id) on delete cascade,read_at timestamptz,dismissed_at timestamptz,primary key(notification_id,person_id));
create index tnt_notification_state_person on public.tnt_notification_state(person_id,notification_id);
alter table public.tnt_notification_state enable row level security;
create policy tnt_notification_state_own on public.tnt_notification_state for select to authenticated using(person_id=(select public.tnt_current_person_id()));
grant select on public.tnt_notification_state to authenticated;
create or replace function public.tnt_notification_resolved(p_note public.tnt_notifications) returns boolean language plpgsql stable security definer set search_path='' as $$
declare tab text:=p_note.data->>'request_table'; req uuid; st text;begin
 if p_note.event_id is not null and not exists(select 1 from public.tnt_events where id=p_note.event_id and status<>'cancelled') then return true;end if;
 if p_note.task_id is not null and not exists(select 1 from public.tnt_tasks where id=p_note.task_id and archived_at is null and status not in('completed')) then return true;end if;
 if p_note.title='Nueva asignación' and p_note.task_id is not null then return not exists(select 1 from public.tnt_task_assignees where task_id=p_note.task_id and person_id=p_note.person_id and assignment_status in('assigned','read'));end if;
 if p_note.title='Necesita reemplazo' and p_note.task_id is not null then return not exists(select 1 from public.tnt_tasks where id=p_note.task_id and status='replacement');end if;
 if p_note.title='Actividad lista' and p_note.task_id is not null then return not exists(select 1 from public.tnt_tasks where id=p_note.task_id and status='ready');end if;
 if tab in('tnt_profile_change_requests','tnt_profile_link_requests','tnt_role_requests','tnt_access_requests','tnt_profile_public_requests') and coalesce(p_note.data->>'request_id','')~'^[0-9a-f-]{36}$' then
  req:=(p_note.data->>'request_id')::uuid;execute format('select status from public.%I where id=$1',tab) into st using req;return st is distinct from 'pending';
 end if;
 return false;
end $$;
create or replace function public.tnt_my_notifications(p_include_dismissed boolean default false) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();begin
 if pid is null or not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil para continuar.' using errcode='42501';end if;
 return query select to_jsonb(n)||jsonb_build_object('read_at',coalesce(s.read_at,n.read_at),'dismissed_at',s.dismissed_at,'resolved',public.tnt_notification_resolved(n)) from public.tnt_notifications n left join public.tnt_notification_state s on s.notification_id=n.id and s.person_id=pid
 where (n.person_id=pid or n.person_id is null) and (p_include_dismissed or (s.dismissed_at is null and not public.tnt_notification_resolved(n))) order by n.created_at desc limit 200;
end $$;
create or replace function public.tnt_notification_action(p_ids uuid[],p_action text) returns integer language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); count_done integer;begin
 if pid is null or not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil para continuar.' using errcode='42501';end if;
 if p_action not in('read','dismiss','restore') or cardinality(p_ids)>200 then raise exception 'Acción no válida.';end if;
 if exists(select 1 from unnest(p_ids) id where not exists(select 1 from public.tnt_notifications where tnt_notifications.id=id and (person_id=pid or person_id is null))) then raise exception 'Una notificación no pertenece a tu cuenta.' using errcode='42501';end if;
 insert into public.tnt_notification_state(notification_id,person_id,read_at,dismissed_at) select id,pid,case when p_action='read' then now() end,case when p_action='dismiss' then now() end from unnest(p_ids) id
 on conflict(notification_id,person_id) do update set read_at=case when p_action='read' then now() else public.tnt_notification_state.read_at end,dismissed_at=case when p_action='dismiss' then now() when p_action='restore' then null else public.tnt_notification_state.dismissed_at end;
 get diagnostics count_done=row_count;return count_done;
end $$;

alter table public.tnt_tasks add column archived_at timestamptz,add column archive_batch uuid;
create index tnt_tasks_active_event on public.tnt_tasks(event_id) where archived_at is null;
create or replace function public.tnt_archive_activities(p_ids uuid[],p_restore boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid; ev uuid;batch uuid:=gen_random_uuid();results jsonb:='[]';begin
 if cardinality(p_ids)>100 then raise exception 'Elegí hasta 100 actividades por vez.';end if;
 for pid in select distinct unnest(p_ids) loop
  begin
   select event_id into ev from public.tnt_tasks where id=pid;
   if ev is null or not public.tnt_event_can_action(ev,'delete_activity') then raise exception 'No tenés permiso para esta actividad.' using errcode='42501';end if;
   if p_restore then
    update public.tnt_tasks set archived_at=null,archive_batch=null where archive_batch=(select archive_batch from public.tnt_tasks where id=pid);
   else
    update public.tnt_tasks set archived_at=now(),archive_batch=batch where archived_at is null and id in(with recursive sub as(select id from public.tnt_tasks where id=pid union all select t.id from public.tnt_tasks t join sub s on t.parent_task_id=s.id) select id from sub);
   end if;
   results:=results||jsonb_build_array(jsonb_build_object('id',pid,'ok',true));
  exception when others then results:=results||jsonb_build_array(jsonb_build_object('id',pid,'ok',false,'error',sqlerrm));end;
 end loop;
 return results;
end $$;

-- Push delivery is queued only for new notifications; it never backfills old alerts.
create table public.tnt_push_outbox(id uuid primary key default gen_random_uuid(),source_key text not null,person_id uuid not null references public.tnt_people(id) on delete cascade,endpoint text not null,payload jsonb not null,status text not null default 'pending' check(status in('pending','sending','sent','failed','skipped')),attempts integer not null default 0,available_at timestamptz not null default now(),created_at timestamptz not null default now(),sent_at timestamptz,last_error text,unique(source_key,endpoint));
create index tnt_push_outbox_pending on public.tnt_push_outbox(available_at) where status in('pending','failed','sending');
create index tnt_push_outbox_person on public.tnt_push_outbox(person_id);
alter table public.tnt_push_outbox enable row level security;
revoke all on public.tnt_push_outbox from anon,authenticated;
grant all on public.tnt_push_outbox to service_role;
create or replace function public.tnt_enqueue_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='tnt_notifications' then
  insert into public.tnt_push_outbox(source_key,person_id,endpoint,payload)
  select 'notification:'||new.id,s.person_id,s.endpoint,jsonb_build_object('title',new.title,'body',coalesce(new.body,''),'url',coalesce(new.href,'/'),'tag','tnt-notification-'||new.id,'notification_id',new.id)
  from public.tnt_push_subscriptions s join public.tnt_accounts a on a.person_id=s.person_id
  where a.enabled and a.auth_user_id is not null and (new.person_id is null or new.person_id=s.person_id)
   and exists(select 1 from public.tnt_people where id=a.person_id and active);
 else
  if new.deleted_at is not null or not public.tnt_module_enabled('chat') then return new;end if;
  insert into public.tnt_push_outbox(source_key,person_id,endpoint,payload)
  select 'message:'||new.id,s.person_id,s.endpoint,jsonb_build_object('title',t.title,'body',coalesce(nullif(left(new.body,180),''),'Nuevo archivo o audio'),'url','/chat/?thread='||new.thread_id,'tag','tnt-message-'||new.id,'message_id',new.id)
  from public.tnt_chat_members m join public.tnt_push_subscriptions s on s.person_id=m.person_id join public.tnt_accounts a on a.person_id=m.person_id join public.tnt_chat_threads t on t.id=m.thread_id
  where m.thread_id=new.thread_id and m.person_id<>new.person_id and a.enabled and not t.is_archived and (new.audience_person_ids is null or m.person_id=any(new.audience_person_ids));
 end if;
 return new;
end $$;
create trigger tnt_new_notification_push after insert on public.tnt_notifications for each row execute function public.tnt_enqueue_push();
create trigger tnt_new_chat_message_push after insert on public.tnt_chat_messages for each row execute function public.tnt_enqueue_push();
create or replace function public.tnt_claim_push(p_limit integer default 100) returns setof public.tnt_push_outbox language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden' using errcode='42501';end if;
 return query update public.tnt_push_outbox set status='sending',attempts=attempts+1,available_at=now()+interval '5 minutes'
 where id in(select id from public.tnt_push_outbox where status in('pending','failed','sending') and attempts<3 and available_at<=now() and created_at>now()-interval '24 hours' order by created_at limit least(greatest(p_limit,1),200) for update skip locked) returning *;
end $$;
create or replace function public.tnt_push_unsubscribe(p_endpoint text) returns void language plpgsql security definer set search_path='' as $$begin
 if public.tnt_current_person_id() is null then raise exception 'Iniciá sesión.' using errcode='42501';end if;
 delete from public.tnt_push_subscriptions where person_id=public.tnt_current_person_id() and endpoint=p_endpoint;
 update public.tnt_push_outbox set status='skipped',last_error='Teléfono desactivado' where person_id=public.tnt_current_person_id() and endpoint=p_endpoint and status in('pending','failed');
end $$;

-- Restrictive policies protect direct table calls while a module is paused.
do $$declare r record;mod text;begin
 for r in select tablename from pg_tables where schemaname='public' and tablename in(
 'tnt_events','tnt_event_members','tnt_tasks','tnt_task_assignees','tnt_task_checklist','tnt_task_comments','tnt_task_files','tnt_task_links','tnt_schedule_days','tnt_schedule_items','tnt_schedule_responsibles','tnt_templates','tnt_template_items','tnt_groups','tnt_group_members','tnt_group_configs',
 'tnt_chat_threads','tnt_chat_members','tnt_chat_messages','tnt_chat_reactions','tnt_saturday_attendance','tnt_saturday_members','tnt_efe_wednesday_attendance','tnt_efe_meetings','tnt_efe_followups',
 'tnt_library_items','tnt_products','tnt_sales','tnt_sale_items','tnt_menu_items','tnt_orders','tnt_debts','tnt_debt_payments','tnt_cash_closures','tnt_expenses','tnt_shifts','tnt_buffet_settings','tnt_buffet_audit',
 'tnt_camp_editions','tnt_camp_registrations','tnt_camp_payments','tnt_camp_health','tnt_camp_assignments','tnt_camp_resources','tnt_camp_form_fields','tnt_camp_payment_plans','tnt_camp_plan_installments','tnt_camp_payment_exceptions','tnt_camp_messages') loop
 mod:=case when r.tablename like 'tnt_chat_%' then 'chat' when r.tablename like 'tnt_camp_%' then 'campamento' when r.tablename like 'tnt_saturday_%' or r.tablename like 'tnt_efe_%' then 'asistencia' when r.tablename='tnt_library_items' then 'glosario' when r.tablename in('tnt_products','tnt_sales','tnt_sale_items','tnt_menu_items','tnt_orders','tnt_debts','tnt_debt_payments','tnt_cash_closures','tnt_expenses','tnt_shifts','tnt_buffet_settings','tnt_buffet_audit') then 'buffet' else 'organizacion' end;
 execute format('create policy tnt_module_required on public.%I as restrictive for all to authenticated using(public.tnt_module_available(%L)) with check(public.tnt_module_available(%L))',r.tablename,mod,mod);
 end loop;
end $$;
do $$declare t text;begin
 foreach t in array array['tnt_experience','tnt_settings','tnt_events','tnt_event_members','tnt_tasks','tnt_task_assignees','tnt_schedule_days','tnt_schedule_items','tnt_schedule_responsibles','tnt_notifications','tnt_notification_state','tnt_chat_threads','tnt_chat_members','tnt_chat_messages','tnt_chat_reactions','tnt_people','tnt_accounts','tnt_access_grants','tnt_role_permission_presets','tnt_person_permission_overrides'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;
end $$;
revoke all on function public.tnt_module_enabled(text),public.tnt_module_available(text),public.tnt_publish_experience(jsonb,bigint),public.tnt_event_can_action(uuid,text),public.tnt_notification_resolved(public.tnt_notifications),public.tnt_my_notifications(boolean),public.tnt_notification_action(uuid[],text),public.tnt_archive_activities(uuid[],boolean),public.tnt_claim_push(integer),public.tnt_push_unsubscribe(text) from public,anon;
grant execute on function public.tnt_module_enabled(text),public.tnt_module_available(text),public.tnt_publish_experience(jsonb,bigint),public.tnt_event_can_action(uuid,text),public.tnt_my_notifications(boolean),public.tnt_notification_action(uuid[],text),public.tnt_archive_activities(uuid[],boolean),public.tnt_push_unsubscribe(text) to authenticated;
grant execute on function public.tnt_claim_push(integer),public.tnt_module_enabled(text),public.tnt_notification_resolved(public.tnt_notifications) to service_role;

-- Existing RPCs use the same context checks as the interface.
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

CREATE OR REPLACE FUNCTION public.tnt_camp_public_form(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.tnt_camp_editions; s public.tnt_camp_settings; result jsonb;begin
 if not public.tnt_module_enabled('campamento') then return jsonb_build_object('available',false,'message','Campamento está en pausa por el momento.');end if;
 select * into c from public.tnt_camp_editions where public_slug=p_slug;
 if c.id is null then return jsonb_build_object('available',false,'message','Formulario no encontrado.'); end if;
 select * into s from public.tnt_camp_settings where camp_id=c.id;
 if not coalesce(s.form_open,false) or c.status in ('closed','archived') or (s.registration_deadline is not null and current_date>s.registration_deadline) then
  return jsonb_build_object('available',false,'message','Las inscripciones no están abiertas en este momento.','camp',jsonb_build_object('name',c.name));
 end if;
 select jsonb_build_object(
  'available',true,
  'camp',jsonb_build_object('id',c.id,'name',c.name,'start_date',c.start_date,'end_date',c.end_date,'location',c.location,'capacity',c.capacity),
  'settings',jsonb_build_object('title',s.form_title,'intro',s.form_intro,'deadline',s.registration_deadline),
  'fields',coalesce((select jsonb_agg(jsonb_build_object('key',f.field_key,'label',f.label,'type',f.field_type,'required',f.required,'options',f.options) order by f.sort_order) from public.tnt_camp_form_fields f where f.camp_id=c.id and f.active),'[]'::jsonb),
  'churches',coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'name',ch.name) order by ch.sort_order,ch.name) from public.tnt_camp_churches ch where ch.active),'[]'::jsonb),
  'plans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'total_amount',p.total_amount,'description',p.description,'installments',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'no',i.installment_no,'label',i.label,'amount',i.amount,'due_date',i.due_date,'grace_days',i.grace_days) order by i.installment_no) from public.tnt_camp_plan_installments i where i.plan_id=p.id),'[]'::jsonb)) order by p.sort_order,p.name) from public.tnt_camp_payment_plans p where p.camp_id=c.id and p.active),'[]'::jsonb)
 ) into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_save_quick_schedule(p_event uuid, p_date date, p_rows jsonb, p_request uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor uuid:=public.tnt_current_person_id();e public.tnt_events;receipt public.tnt_quick_schedule_requests;
 payload jsonb:=jsonb_build_object('event',p_event,'date',p_date,'rows',p_rows);
 row_value jsonb;ids uuid[]:='{}';people uuid[];task uuid;v_position integer;title text;clock text;
begin
 if actor is null or not public.tnt_profile_is_complete() then
  raise exception 'Completá tu perfil para armar el cronograma.' using errcode='42501';
 end if;
 select * into e from public.tnt_events where id=p_event for update;
 if e.id is null or e.status='cancelled' then raise exception 'Este encuentro ya no está disponible.';end if;
 if not public.tnt_event_can_action(p_event,'create_activity') then
  raise exception 'No tenés permiso para crear actividades.' using errcode='42501';
 end if;
 if p_request is null or p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Revisá las filas del cronograma.';end if;
 if jsonb_array_length(p_rows) not between 1 and 20 then raise exception 'Agregá entre una y veinte actividades.';end if;
 if p_date is null or p_date<e.start_date or p_date>e.end_date or (e.kind='saturday' and p_date<>e.start_date) then
  raise exception 'La fecha debe pertenecer a este encuentro.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request::text,0));
 select * into receipt from public.tnt_quick_schedule_requests where created_by=actor and request_id=p_request;
 if receipt.request_id is not null then
  if receipt.payload is distinct from payload then raise exception 'Este cronograma ya se guardó. Actualizá la vista antes de cambiarlo.';end if;
  return receipt.task_ids;
 end if;
 select coalesce(max(sort_order),-1)+1 into v_position from public.tnt_tasks where event_id=p_event;
 for row_value in select value from jsonb_array_elements(p_rows) loop
  title:=nullif(trim(row_value->>'title'),'');clock:=row_value->>'time';
  if jsonb_typeof(row_value)<>'object' or title is null or length(title)>200 or clock is null or clock!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then
   raise exception 'Cada actividad necesita un nombre y una hora válida.';
  end if;
  people:=case when nullif(row_value->>'person_id','') is null then '{}'::uuid[] else array[(row_value->>'person_id')::uuid] end;
  if cardinality(people)>0 and not exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
   where a.person_id=people[1] and a.enabled and a.staff_status='approved' and p.active) then
   raise exception 'Elegí un responsable activo del staff o dejá la actividad sin asignar.';
  end if;
  task:=public.tnt_save_task(null,p_event,jsonb_build_object('title',title,'task_type','simple','priority','medium',
   'assignee_mode','single','planned_start',(p_date+clock::time) at time zone 'America/Argentina/Buenos_Aires','sort_order',v_position),people);
  ids:=array_append(ids,task);v_position:=v_position+1;
 end loop;
 insert into public.tnt_quick_schedule_requests(created_by,request_id,event_id,payload,task_ids) values(actor,p_request,p_event,payload,ids);
 return ids;
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_save_schedule_item(p_id uuid, p_day uuid, p_values jsonb, p_people uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_event uuid; v_id uuid; v_task uuid;
begin
 select event_id into v_event from public.tnt_schedule_days where id=p_day;
 if v_event is null or not public.tnt_event_can_action(v_event,case when p_id is null then 'create_activity' else 'edit_activity' end) then raise exception 'No tenés permiso para editar esta actividad.' using errcode='42501'; end if;
 if nullif(trim(p_values->>'title'),'') is null then raise exception 'La actividad necesita un nombre.'; end if;
 if p_id is not null and not exists(select 1 from public.tnt_schedule_items where id=p_id and day_id=p_day) then raise exception 'La actividad cambió. Volvé a abrirla.'; end if;
 v_id:=coalesce(p_id,gen_random_uuid());
 insert into public.tnt_schedule_items(id,day_id,title,item_type,starts_at,duration_minutes,description,video_url,materials,location,sort_order)
 values(v_id,p_day,trim(p_values->>'title'),coalesce(p_values->>'item_type','activity'),nullif(p_values->>'starts_at','')::time,
 (p_values->>'duration_minutes')::int,p_values->>'description',p_values->>'video_url',p_values->>'materials',p_values->>'location',coalesce((p_values->>'sort_order')::int,0))
 on conflict(id) do update set title=excluded.title,item_type=excluded.item_type,starts_at=excluded.starts_at,duration_minutes=excluded.duration_minutes,
 description=excluded.description,video_url=excluded.video_url,materials=excluded.materials,location=excluded.location,sort_order=excluded.sort_order
 returning task_id into v_task;
 delete from public.tnt_schedule_responsibles where item_id=v_id and not(person_id=any(coalesce(p_people,'{}'::uuid[])));
 insert into public.tnt_schedule_responsibles(item_id,person_id) select v_id,x from unnest(coalesce(p_people,'{}'::uuid[])) x on conflict do nothing;
 if v_task is null then
   insert into public.tnt_tasks(event_id,title,created_by) values(v_event,trim(p_values->>'title'),public.tnt_current_person_id()) returning id into v_task;
   update public.tnt_schedule_items set task_id=v_task where id=v_id;
 end if;
 if v_task is not null then
   update public.tnt_tasks set title=trim(p_values->>'title'),description=p_values->>'description',materials=p_values->>'materials',
   duration_minutes=(p_values->>'duration_minutes')::int,
   planned_start=(select (d.date+nullif(p_values->>'starts_at','')::time) at time zone 'America/Argentina/Buenos_Aires' from public.tnt_schedule_days d where d.id=p_day) where id=v_task;
   delete from public.tnt_task_assignees where task_id=v_task and not(person_id=any(coalesce(p_people,'{}'::uuid[])));
   insert into public.tnt_task_assignees(task_id,person_id) select v_task,x from unnest(coalesce(p_people,'{}'::uuid[])) x on conflict do nothing;
 end if;
 return v_id;
end $function$;


alter table public.tnt_schedule_items add column archived_at timestamptz;
-- Archive linked activity rows through their tasks; standalone rows stay recoverable.
create or replace function public.tnt_archive_schedule_item(p_item uuid,p_restore boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare ev uuid;tid uuid;begin
 select d.event_id,i.task_id into ev,tid from public.tnt_schedule_items i join public.tnt_schedule_days d on d.id=i.day_id where i.id=p_item;
 if ev is null or not public.tnt_event_can_action(ev,'delete_activity') then raise exception 'No tenés permiso para esta actividad.' using errcode='42501';end if;
 if tid is not null then perform public.tnt_archive_activities(array[tid],p_restore);else update public.tnt_schedule_items set archived_at=case when p_restore then null else now() end where id=p_item;end if;
end $$;
revoke all on function public.tnt_archive_schedule_item(uuid,boolean) from public,anon;
grant execute on function public.tnt_archive_schedule_item(uuid,boolean) to authenticated;
-- Private worker authentication is held in Vault; the browser never receives it.
do $$declare job bigint;begin
 if not exists(select 1 from vault.secrets where name='tnt_worker_dispatch') then perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'tnt_worker_dispatch','TNT scheduled notifications worker authentication');end if;
 select jobid into job from cron.job where jobname='tnt-camp-notifications-every-2-min';
 if job is not null then perform cron.alter_job(job,command:=$job$select net.http_post(url:='https://oeodnnomgiddkblnlzay.supabase.co/functions/v1/camp-notifications',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='tnt_worker_dispatch' limit 1)),body:='{}'::jsonb);$job$);end if;
end $$;



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
  if not public.tnt_module_available(p_module) then return false; end if;
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
    when p_action in ('manage','create_saturday','edit_event','manage_people','templates','create_chat','manage_members','delete_chat','history','reports','delete','delete_activity','delete_event') then 'manage'
    else null
  end;
  if v_required is null then return false; end if;
  return public.tnt_has_access(p_module,p_scope,v_required);
end $function$;


CREATE OR REPLACE FUNCTION public.tnt_save_task(p_id uuid, p_event uuid, p_values jsonb, p_people uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_parent uuid;
  v_start timestamptz;
  v_date date;
  v_day uuid;
  v_event public.tnt_events;
  v_mode text;
  v_people uuid[];
  v_old_people uuid[];
  v_existing boolean;
  v_manager boolean;
begin
  select * into v_event from public.tnt_events where id=p_event;
  if v_event.id is null or v_event.status='cancelled' then raise exception 'El encuentro ya no está disponible.'; end if;

  v_existing:=p_id is not null and exists(select 1 from public.tnt_tasks where id=p_id and event_id=p_event and archived_at is null);
  v_manager:=public.tnt_event_can_action(p_event,case when p_id is null then 'create_activity' else 'edit_activity' end);

  if p_id is null then
    if not v_manager then
      raise exception 'No tenés permiso para crear actividades.' using errcode='42501';
    end if;
  else
    if not v_existing then raise exception 'La actividad cambió. Volvé a abrirla.'; end if;
    if not v_manager then
      raise exception 'No tenés permiso para editar esta actividad.' using errcode='42501';
    end if;
  end if;

  if nullif(trim(p_values->>'title'),'') is null then
    raise exception 'La actividad necesita un nombre.';
  end if;

  v_parent:=nullif(p_values->>'parent_task_id','')::uuid;
  if v_parent is not null and (v_parent=p_id or not exists(select 1 from public.tnt_tasks where id=v_parent and event_id=p_event)) then
    raise exception 'La actividad principal no es válida.';
  end if;
  if p_id is not null and v_parent is not null and exists(
    with recursive descendants as(
      select id from public.tnt_tasks where parent_task_id=p_id
      union all
      select t.id from public.tnt_tasks t join descendants d on t.parent_task_id=d.id
    )
    select 1 from descendants where id=v_parent
  ) then
    raise exception 'Una actividad no puede depender de su propia subtarea.';
  end if;

  v_mode:=coalesce(nullif(p_values->>'assignee_mode',''),'single');
  if v_mode not in ('single','multiple') then v_mode:='single'; end if;

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into v_people
  from unnest(coalesce(p_people,'{}'::uuid[])) x;

  if v_mode='single' and cardinality(v_people)>1 then
    raise exception 'Esta actividad necesita una sola persona responsable.';
  end if;

  if p_id is not null then
    select coalesce(array_agg(person_id order by person_id),'{}'::uuid[]) into v_old_people
    from public.tnt_task_assignees
    where task_id=p_id and assignment_status<>'declined';
  else
    v_old_people:='{}'::uuid[];
  end if;

  if v_people is distinct from v_old_people
     and not public.tnt_event_can_action(p_event,'assign_people') then
    raise exception 'No tenés permiso para cambiar responsables.' using errcode='42501';
  end if;

  v_id:=coalesce(p_id,gen_random_uuid());
  v_start:=nullif(p_values->>'planned_start','')::timestamptz;
  v_date:=(v_start at time zone 'America/Argentina/Buenos_Aires')::date;

  if v_event.kind='saturday' and v_start is not null and v_date<>v_event.start_date then
    raise exception 'Las actividades de un sábado usan automáticamente la fecha del sábado.';
  end if;
  if v_date is not null and (v_date<v_event.start_date or v_date>v_event.end_date) then
    raise exception 'El horario de la actividad debe estar dentro de las fechas del encuentro.';
  end if;

  insert into public.tnt_tasks(
    id,event_id,parent_task_id,title,task_type,priority,description,materials,due_at,
    planned_start,duration_minutes,budget_estimated,sort_order,created_by,assignee_mode
  )
  values(
    v_id,p_event,v_parent,trim(p_values->>'title'),coalesce(p_values->>'task_type','simple'),
    coalesce(p_values->>'priority','medium'),p_values->>'description',p_values->>'materials',
    nullif(p_values->>'due_at','')::timestamptz,v_start,(p_values->>'duration_minutes')::int,
    (p_values->>'budget_estimated')::numeric,coalesce((p_values->>'sort_order')::int,0),
    public.tnt_current_person_id(),v_mode
  )
  on conflict(id) do update set
    parent_task_id=excluded.parent_task_id,
    title=excluded.title,
    task_type=excluded.task_type,
    priority=excluded.priority,
    description=excluded.description,
    materials=excluded.materials,
    due_at=excluded.due_at,
    planned_start=excluded.planned_start,
    duration_minutes=excluded.duration_minutes,
    budget_estimated=excluded.budget_estimated,
    assignee_mode=excluded.assignee_mode;

  delete from public.tnt_task_assignees
   where task_id=v_id and not(person_id=any(v_people));
  insert into public.tnt_task_assignees(task_id,person_id)
   select v_id,x from unnest(v_people) x on conflict do nothing;

  if v_date is not null then
    select id into v_day from public.tnt_schedule_days
     where event_id=p_event and date=v_date order by sort_order limit 1;
    if v_day is null then
      insert into public.tnt_schedule_days(event_id,label,date,sort_order)
      values(
        p_event,
        case when v_event.kind='saturday' then 'Sábado' else to_char(v_date,'DD/MM') end,
        v_date,
        (select count(*) from public.tnt_schedule_days where event_id=p_event)
      )
      returning id into v_day;
    end if;
    if not exists(select 1 from public.tnt_schedule_items where task_id=v_id) then
      insert into public.tnt_schedule_items(day_id,title,task_id,sort_order)
      values(v_day,trim(p_values->>'title'),v_id,(select count(*) from public.tnt_schedule_items where day_id=v_day));
    end if;
  end if;

  update public.tnt_schedule_items
     set day_id=coalesce(v_day,day_id),
         title=trim(p_values->>'title'),
         description=p_values->>'description',
         materials=p_values->>'materials',
         duration_minutes=(p_values->>'duration_minutes')::int,
         starts_at=(v_start at time zone 'America/Argentina/Buenos_Aires')::time
   where task_id=v_id;

  delete from public.tnt_schedule_responsibles
   where item_id in(select id from public.tnt_schedule_items where task_id=v_id)
     and not(person_id=any(v_people));
  insert into public.tnt_schedule_responsibles(item_id,person_id)
   select i.id,p from public.tnt_schedule_items i cross join unnest(v_people) p
   where i.task_id=v_id on conflict do nothing;

  return v_id;
end $function$;


CREATE OR REPLACE FUNCTION public.tnt_create_chat(p_title text, p_event uuid DEFAULT NULL::uuid, p_task uuid DEFAULT NULL::uuid, p_general boolean DEFAULT false, p_all boolean DEFAULT false, p_people uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_actor uuid;
  v_admin boolean;
  v_can_create boolean;
  v_event uuid;
  v_kind text;
  v_date date;
  v_ids uuid[];
  v_required uuid[];
begin
  v_actor:=public.tnt_current_person_id();
  v_admin:=public.tnt_is_admin();
  v_can_create:=public.tnt_module_available('chat') and (v_admin or (p_event is not null and public.tnt_event_can_action(p_event,'create_chat')));

  if auth.uid() is null or v_actor is null then
    raise exception 'Iniciá sesión para crear el chat.' using errcode='42501';
  end if;
  if not v_can_create then
    raise exception 'No tenés permiso para crear conversaciones.' using errcode='42501';
  end if;
  if (p_general::int+(p_event is not null)::int+(p_task is not null)::int)<>1 then
    raise exception 'Elegí un solo contexto.' using errcode='22023';
  end if;
  if length(trim(coalesce(p_title,'')))<3 or length(trim(p_title))>100 then
    raise exception 'Escribí un nombre de 3 a 100 caracteres.' using errcode='22023';
  end if;

  if p_general and not v_admin then
    raise exception 'El chat General TNT solo puede crearlo un Admin.' using errcode='42501';
  end if;

  if p_event is not null then
    select kind,start_date into v_kind,v_date
    from public.tnt_events
    where id=p_event and status<>'cancelled';
    v_event:=p_event;
    if v_kind is null then
      raise exception 'El encuentro no está disponible para crear este chat.' using errcode='42501';
    end if;
  end if;

  if p_task is not null then raise exception 'Los chats se crean para encuentros o grupos, no para actividades individuales.' using errcode='22023'; end if;

  if p_task is not null then
    select t.event_id,e.kind,e.start_date into v_event,v_kind,v_date
    from public.tnt_tasks t
    join public.tnt_events e on e.id=t.event_id
    where t.id=p_task and e.status<>'cancelled';

    if v_event is null or v_kind='saturday' or v_date<(now() at time zone 'America/Argentina/Buenos_Aires')::date then
      raise exception 'La actividad no está disponible para crear este chat.' using errcode='42501';
    end if;
    if not exists(
      select 1
      from public.tnt_task_assignees a
      join public.tnt_accounts ac on ac.person_id=a.person_id
      where a.task_id=p_task
        and a.assignment_status<>'declined'
        and ac.enabled
        and (ac.staff_status='approved' or ac.system_role='admin')
        and ac.auth_user_id is not null
    ) then
      raise exception 'Primero asigná una persona responsable a esta actividad en Organización.' using errcode='22023';
    end if;
  end if;

  if exists(
    select 1
    from unnest(coalesce(p_people,'{}'::uuid[])) pid
    where not exists(
      select 1 from public.tnt_accounts a
      where a.person_id=pid
        and a.enabled
        and (a.staff_status='approved' or a.system_role='admin')
        and a.auth_user_id is not null
        and (
          p_general
          or v_kind='saturday'
          or exists(select 1 from public.tnt_event_members em where em.event_id=v_event and em.person_id=pid)
          or exists(
            select 1
            from public.tnt_tasks t
            join public.tnt_task_assignees ta on ta.task_id=t.id
            where t.event_id=v_event and ta.person_id=pid and ta.assignment_status<>'declined'
          )
        )
    )
  ) then
    raise exception 'Una persona elegida no pertenece al equipo de este encuentro.' using errcode='42501';
  end if;

  select coalesce(array_agg(distinct pid),'{}'::uuid[])
  into v_required
  from (
    select a.person_id pid
    from public.tnt_task_assignees a
    join public.tnt_accounts ac on ac.person_id=a.person_id
    where a.task_id=p_task
      and a.assignment_status<>'declined'
      and ac.enabled
      and (ac.staff_status='approved' or ac.system_role='admin')
      and ac.auth_user_id is not null
    union
    select em.person_id
    from public.tnt_event_members em
    join public.tnt_accounts ac on ac.person_id=em.person_id
    where em.event_id=v_event
      and em.event_role='organizer'
      and ac.system_role<>'admin'
      and ac.enabled
      and (ac.staff_status='approved' or ac.system_role='admin')
      and ac.auth_user_id is not null
  ) required;

  if p_all then
    select coalesce(array_agg(a.person_id),'{}'::uuid[])
    into v_ids
    from public.tnt_accounts a
    where a.enabled
      and (a.staff_status='approved' or a.system_role='admin')
      and a.auth_user_id is not null
      and a.system_role<>'admin'
      and (
        p_general
        or v_kind='saturday'
        or exists(select 1 from public.tnt_event_members em where em.event_id=v_event and em.person_id=a.person_id)
        or exists(
          select 1
          from public.tnt_tasks t
          join public.tnt_task_assignees ta on ta.task_id=t.id
          where t.event_id=v_event and ta.person_id=a.person_id and ta.assignment_status<>'declined'
        )
      );
  else
    v_ids:=coalesce(p_people,'{}'::uuid[]);
  end if;

  v_ids:=coalesce(v_ids,'{}'::uuid[])||v_required;
  if not v_admin then v_ids:=array_append(v_ids,v_actor); end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tnt-chat-new:'||coalesce(coalesce(p_task,p_event)::text,'general'),0)
  );

  select id into v_id from public.tnt_chat_threads
    where not is_archived and ((p_general and thread_type='general') or (p_event is not null and thread_type='event' and event_id=p_event)) limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.tnt_chat_threads(title,thread_type,event_id,task_id,created_by,is_pinned)
  values(
    trim(p_title),
    case when p_general then 'general' when p_task is not null then 'task' else 'event' end,
    p_event,p_task,v_actor,p_general
  )
  returning id into v_id;

  insert into public.tnt_chat_members(thread_id,person_id,member_role)
  select v_id,pid,case when pid=v_actor then 'moderator' else 'member' end
  from (select distinct unnest(v_ids) pid) chosen
  where pid is not null;

  return v_id;
end $function$;


CREATE OR REPLACE FUNCTION public.tnt_delete_event(p_event uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_event public.tnt_events;
begin
  select * into v_event from public.tnt_events where id=p_event;
  if v_event.id is null then return; end if;

  if not public.tnt_event_can_action(p_event,'delete_event') then
    raise exception 'No tenés permiso para eliminar este encuentro.' using errcode='42501';
  end if;

  delete from public.tnt_events where id=p_event;
end $function$;


CREATE OR REPLACE FUNCTION public.tnt_delete_activity(p_task uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.tnt_tasks where id=p_task and public.tnt_event_can_action(event_id,'delete_activity')) then raise exception 'No tenés permiso para eliminar esta actividad.' using errcode='42501'; end if;
 delete from public.tnt_schedule_items where task_id in(with recursive subtree as(select id from public.tnt_tasks where id=p_task union all select t.id from public.tnt_tasks t join subtree s on t.parent_task_id=s.id) select id from subtree);
 delete from public.tnt_tasks where id=p_task;
end $function$;
