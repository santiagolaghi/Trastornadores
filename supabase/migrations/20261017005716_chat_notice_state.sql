CREATE OR REPLACE FUNCTION public.tnt_notification_resolved(p_note tnt_notifications)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tab text:=p_note.data->>'request_table'; req uuid; st text;
begin
 if p_note.data->>'kind'='chat_message' then
  return exists(select 1 from public.tnt_chat_messages msg join public.tnt_chat_members m on m.thread_id=msg.thread_id and m.person_id=p_note.person_id where msg.id::text=p_note.data->>'message_id' and m.last_read_at>=msg.created_at);
 end if;
 if p_note.data ? 'staff_invitation_id' then
  return not exists(select 1 from public.tnt_staff_invitations i
   where i.id=(p_note.data->>'staff_invitation_id')::uuid and i.status='pending');
 end if;
 if p_note.event_id is not null and not exists(select 1 from public.tnt_events where id=p_note.event_id and status<>'cancelled') then return true;end if;
 if p_note.task_id is not null and not exists(select 1 from public.tnt_tasks where id=p_note.task_id and archived_at is null and status not in('completed')) then return true;end if;
 if p_note.title='🔔 No confirmaste tu asignación' then return true;end if;
 if (p_note.title='Nueva asignación' or p_note.data->>'kind'='assignment') and p_note.task_id is not null then return not exists(select 1 from public.tnt_task_assignees where task_id=p_note.task_id and person_id=p_note.person_id and assignment_status<>'declined');end if;
 if p_note.title='Necesita reemplazo' and p_note.task_id is not null then return not exists(select 1 from public.tnt_tasks where id=p_note.task_id and status='replacement');end if;
 if p_note.title='Actividad lista' and p_note.task_id is not null then return not exists(select 1 from public.tnt_tasks where id=p_note.task_id and status='ready');end if;
 if tab in('tnt_profile_change_requests','tnt_profile_link_requests','tnt_role_requests','tnt_access_requests','tnt_profile_public_requests') and coalesce(p_note.data->>'request_id','')~'^[0-9a-f-]{36}$' then
  req:=(p_note.data->>'request_id')::uuid;
  execute format('select status from public.%I where id=$1',tab) into st using req;
  return st is distinct from 'pending';
 end if;
 return false;
end $function$
;

-- Chat notices disappear when read and never disclose messages after membership changes.
create or replace function public.tnt_notification_visible_for(p_note public.tnt_notifications,p_person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id where a.person_id=p_person and a.enabled and p.active and a.onboarding_completed_at is not null and jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(p_person)))=0
  and (p_note.person_id=p_person or (p_note.person_id is null and (p_note.scope='general' or p_note.scope='team' and (a.staff_status='approved' or a.system_role='admin')))))
  and case when p_note.data->>'kind'='chat_message' then exists(
    select 1 from public.tnt_chat_messages msg join public.tnt_chat_members m on m.thread_id=msg.thread_id and m.person_id=p_person join public.tnt_chat_threads t on t.id=msg.thread_id
    where msg.id::text=p_note.data->>'message_id' and msg.deleted_at is null and not t.is_archived
     and (msg.audience_person_ids is null or p_person=any(msg.audience_person_ids)) and public.tnt_recipient_has_module(p_person,'chat'))
   when p_note.href like '/organizacion/%' or p_note.event_id is not null or p_note.task_id is not null then public.tnt_recipient_has_module(p_person,'organizacion')
   when p_note.href like '/admin/%' then public.tnt_recipient_has_module(p_person,'admin') else true end;
$$;


notify pgrst,'reload schema';
