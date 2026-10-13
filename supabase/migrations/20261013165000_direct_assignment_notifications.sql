CREATE OR REPLACE FUNCTION public.tnt_notification_resolved(p_note tnt_notifications)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tab text:=p_note.data->>'request_table'; req uuid; st text;
begin
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
end $function$;

-- Existing staff invitation and request resolution remains unchanged.
notify pgrst,'reload schema';

