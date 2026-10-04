-- Verify recipient access again when queuing and delivering phone notifications.
create or replace function public.tnt_recipient_has_module(p_person uuid,p_module text) returns boolean language sql stable security definer set search_path='' as $$
 select public.tnt_module_enabled(p_module) and coalesce((select
  case when p_module='admin' then a.system_role='admin'
   when a.system_role='admin' then true
   when a.staff_status<>'approved' then false
   else coalesce(
    (select o.allowed from public.tnt_person_permission_overrides o where o.person_id=p_person and o.module=p_module and o.action='view' and o.scope='*' limit 1),
    (select r.allowed from public.tnt_role_permission_presets r where r.role=a.ministry_role and r.module=p_module and r.action='view' and r.scope='*' limit 1),
    exists(select 1 from public.tnt_access_grants g where g.person_id=p_person and g.module=p_module and g.enabled and public.tnt_access_rank(g.access_level)>=1 and (g.valid_from is null or g.valid_from<=now()) and (g.valid_until is null or g.valid_until>=now())))
  end
 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id where a.person_id=p_person and a.enabled and p.active and a.onboarding_completed_at is not null and jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(p_person)))=0),false)
$$;
create or replace function public.tnt_notification_visible_for(p_note public.tnt_notifications,p_person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id where a.person_id=p_person and a.enabled and p.active and a.onboarding_completed_at is not null and jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(p_person)))=0
  and (p_note.person_id=p_person or (p_note.person_id is null and (p_note.scope='general' or p_note.scope='team' and (a.staff_status='approved' or a.system_role='admin')))))
  and case when p_note.href like '/organizacion/%' or p_note.event_id is not null or p_note.task_id is not null then public.tnt_recipient_has_module(p_person,'organizacion')
   when p_note.href like '/admin/%' then public.tnt_recipient_has_module(p_person,'admin')
   else true end
$$;
revoke all on function public.tnt_recipient_has_module(uuid,text),public.tnt_notification_visible_for(public.tnt_notifications,uuid) from public,anon,authenticated;
grant execute on function public.tnt_recipient_has_module(uuid,text),public.tnt_notification_visible_for(public.tnt_notifications,uuid) to service_role;
alter policy tnt_notifications_own on public.tnt_notifications using(person_id=public.tnt_current_person_id() or (person_id is null and (scope='general' or scope='team' and (public.tnt_is_staff() or public.tnt_is_admin()))));
create or replace function public.tnt_my_notifications(p_include_dismissed boolean default false) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();begin
 if pid is null or not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil para continuar.' using errcode='42501';end if;
 return query select to_jsonb(n)||jsonb_build_object('read_at',coalesce(s.read_at,n.read_at),'dismissed_at',s.dismissed_at,'resolved',public.tnt_notification_resolved(n)) from public.tnt_notifications n left join public.tnt_notification_state s on s.notification_id=n.id and s.person_id=pid
 where public.tnt_notification_visible_for(n,pid) and (p_include_dismissed or (s.dismissed_at is null and not public.tnt_notification_resolved(n))) order by n.created_at desc limit 200;
end $$;
create or replace function public.tnt_notification_action(p_ids uuid[],p_action text) returns integer language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); count_done integer;begin
 if pid is null or not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil para continuar.' using errcode='42501';end if;
 if p_action not in('read','dismiss','restore') or cardinality(p_ids)>200 then raise exception 'Acción no válida.';end if;
 if exists(select 1 from unnest(p_ids) id where not exists(select 1 from public.tnt_notifications where tnt_notifications.id=id and public.tnt_notification_visible_for(tnt_notifications,pid))) then raise exception 'Una notificación no pertenece a tu cuenta.' using errcode='42501';end if;
 insert into public.tnt_notification_state(notification_id,person_id,read_at,dismissed_at) select id,pid,case when p_action='read' then now() end,case when p_action='dismiss' then now() end from unnest(p_ids) id
 on conflict(notification_id,person_id) do update set read_at=case when p_action='read' then now() else public.tnt_notification_state.read_at end,dismissed_at=case when p_action='dismiss' then now() when p_action='restore' then null else public.tnt_notification_state.dismissed_at end;
 get diagnostics count_done=row_count;return count_done;
end $$;

create or replace function public.tnt_enqueue_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='tnt_notifications' then
  insert into public.tnt_push_outbox(source_key,person_id,endpoint,payload)
  select 'notification:'||new.id,s.person_id,s.endpoint,jsonb_build_object('title',new.title,'body',coalesce(new.body,''),'url',coalesce(new.href,'/'),'tag','tnt-notification-'||new.id,'notification_id',new.id)
  from public.tnt_push_subscriptions s join public.tnt_accounts a on a.person_id=s.person_id
  where a.enabled and a.auth_user_id is not null and public.tnt_notification_visible_for(new,s.person_id)
   and exists(select 1 from public.tnt_people where id=a.person_id and active);
 else
  if new.deleted_at is not null or not public.tnt_module_enabled('chat') then return new;end if;
  insert into public.tnt_push_outbox(source_key,person_id,endpoint,payload)
  select 'message:'||new.id,s.person_id,s.endpoint,jsonb_build_object('title',t.title,'body',coalesce(nullif(left(new.body,180),''),'Nuevo archivo o audio'),'url','/chat/?thread='||new.thread_id,'tag','tnt-message-'||new.id,'message_id',new.id)
  from public.tnt_chat_members m join public.tnt_push_subscriptions s on s.person_id=m.person_id join public.tnt_accounts a on a.person_id=m.person_id join public.tnt_chat_threads t on t.id=m.thread_id
  where m.thread_id=new.thread_id and m.person_id<>new.person_id and public.tnt_recipient_has_module(a.person_id,'chat') and not t.is_archived and (new.audience_person_ids is null or m.person_id=any(new.audience_person_ids));
 end if;
 return new;
end $$;
