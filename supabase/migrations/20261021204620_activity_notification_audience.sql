-- Activity conversations notify the current activity team, regardless of event roles.
-- Keep the check in one place for creation, the inbox, RLS and queued push delivery.
create or replace function tnt_actions.activity_notification_member(p_task uuid,p_person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_task_assignees a
  join public.tnt_tasks t on t.id=a.task_id join public.tnt_events e on e.id=t.event_id
  where a.task_id=p_task and a.person_id=p_person and a.assignment_status<>'declined'
   and t.archived_at is null and e.status<>'cancelled');
$$;
revoke all on function tnt_actions.activity_notification_member(uuid,uuid) from public,anon,authenticated;

create or replace function tnt_actions.notify_activity(p_task uuid,p_actor uuid,p_kind text,p_action text,p_body text,p_extra jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare context jsonb:=tnt_actions.notice_context(p_task);who jsonb:=coalesce(tnt_actions.notice_actor(p_actor),'{}');ev uuid;target text;
begin
 if context is null then return;end if;ev:=(context->>'event_id')::uuid;
 target:='/organizacion/?task='||p_task;
 if p_extra ? 'comment_id' then target:=target||'&tab=team&comment='||(p_extra->>'comment_id');end if;
 insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href,data)
 select a.person_id,'team',ev,p_task,coalesce(who->>'sender_name','Equipo TNT')||' '||p_action||' · '||(context->>'task_title'),
  left(coalesce(p_body,''),600),target,context||who||jsonb_build_object('kind',p_kind)||p_extra
 from public.tnt_task_assignees a
 where a.task_id=p_task and a.person_id is distinct from p_actor
  and tnt_actions.activity_notification_member(p_task,a.person_id)
  and public.tnt_recipient_has_module(a.person_id,'organizacion');
end $$;
revoke all on function tnt_actions.notify_activity(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.tnt_notification_visible_for(p_note public.tnt_notifications,p_person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
  where a.person_id=p_person and a.enabled and p.active and a.onboarding_completed_at is not null
  and jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(p_person)))=0
  and (p_note.person_id=p_person or (p_note.person_id is null and (p_note.scope='general' or p_note.scope='team' and (a.staff_status='approved' or a.system_role='admin')))))
 and case
  when p_note.data->>'kind'='chat_message' then public.tnt_recipient_has_module(p_person,'chat')
   and exists(select 1 from public.tnt_chat_members m join public.tnt_chat_threads t on t.id=m.thread_id
    join public.tnt_chat_messages msg on msg.thread_id=t.id
    where m.person_id=p_person and not t.is_archived and msg.id::text=p_note.data->>'message_id' and msg.deleted_at is null
    and (msg.audience_person_ids is null or p_person=any(msg.audience_person_ids))
    and (t.task_id is null or tnt_actions.activity_notification_member(t.task_id,p_person)))
  when p_note.href like '/organizacion/%' or p_note.event_id is not null or p_note.task_id is not null then public.tnt_recipient_has_module(p_person,'organizacion')
  when p_note.href like '/admin/%' then public.tnt_recipient_has_module(p_person,'admin')
  else true end
 and (p_note.task_id is null or not(p_note.scope='team' or coalesce(p_note.data->>'kind','') like 'activity_%' or p_note.data ? 'comment_id')
  or tnt_actions.activity_notification_member(p_note.task_id,p_person))
 and (not(p_note.data ? 'comment_id') or exists(select 1 from public.tnt_task_comments c where c.id::text=p_note.data->>'comment_id' and c.task_id=p_note.task_id));
$$;
revoke all on function public.tnt_notification_visible_for(public.tnt_notifications,uuid) from public,anon,authenticated;
grant execute on function public.tnt_notification_visible_for(public.tnt_notifications,uuid) to service_role;

-- Also cover activity chat rooms and older clients that insert team notices.
create or replace function tnt_actions.guard_activity_notification_audience() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.person_id is not null and (new.data->>'kind'='chat_message' or new.data ? 'comment_id'
  or coalesce(new.data->>'kind','') like 'activity_%' or new.scope='team' and new.task_id is not null)
  and not public.tnt_notification_visible_for(new,new.person_id) then return null;end if;
 return new;
end $$;
revoke all on function tnt_actions.guard_activity_notification_audience() from public,anon,authenticated;
create trigger tnt_activity_notification_audience before insert on public.tnt_notifications
 for each row execute function tnt_actions.guard_activity_notification_audience();

-- The RLS helper accepts no caller-selected identity and lives outside the Data API.
create or replace function tnt_actions.my_notification_visible(p_note public.tnt_notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.tnt_notification_visible_for(p_note,public.tnt_current_person_id());
$$;
revoke all on function tnt_actions.my_notification_visible(public.tnt_notifications) from public,anon;
grant usage on schema tnt_actions to authenticated;
grant execute on function tnt_actions.my_notification_visible(public.tnt_notifications) to authenticated;
alter policy tnt_notifications_own on public.tnt_notifications using(tnt_actions.my_notification_visible(tnt_notifications));
