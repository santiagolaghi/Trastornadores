create function tnt_actions.merge_profile_relations(p_source uuid,p_target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare src public.tnt_people%rowtype;dst public.tnt_people%rowtype;history jsonb:='[]';camp record;child record;rows_before jsonb;
begin
 select * into src from public.tnt_people where id=p_source;select * into dst from public.tnt_people where id=p_target;
 -- Consolidate overlapping relations after saving their original rows above.
 update public.tnt_chat_members d set last_read_at=greatest(d.last_read_at,s.last_read_at),
  joined_at=least(d.joined_at,s.joined_at),member_role=case when 'moderator' in(d.member_role,s.member_role) then 'moderator' else d.member_role end
 from public.tnt_chat_members s where d.person_id=dst.id and s.person_id=src.id and d.thread_id=s.thread_id;
 delete from public.tnt_chat_members s where s.person_id=src.id and exists(select 1 from public.tnt_chat_members d where d.person_id=dst.id and d.thread_id=s.thread_id);
 update public.tnt_event_members d set event_role=case when 'organizer' in(d.event_role,s.event_role) then 'organizer' else d.event_role end,include_in_groups=d.include_in_groups or s.include_in_groups
 from public.tnt_event_members s where d.person_id=dst.id and s.person_id=src.id and d.event_id=s.event_id;
 delete from public.tnt_event_members s where s.person_id=src.id and exists(select 1 from public.tnt_event_members d where d.person_id=dst.id and d.event_id=s.event_id);
 update public.tnt_task_assignees d set assignment_status='confirmed',read_at=greatest(d.read_at,s.read_at),responded_at=greatest(d.responded_at,s.responded_at),response_note=concat_ws(E'\n',nullif(d.response_note,''),nullif(s.response_note,''))
 from public.tnt_task_assignees s where d.person_id=dst.id and s.person_id=src.id and d.task_id=s.task_id;
 delete from public.tnt_task_assignees s where s.person_id=src.id and exists(select 1 from public.tnt_task_assignees d where d.person_id=dst.id and d.task_id=s.task_id);
 delete from public.tnt_schedule_responsibles s where s.person_id=src.id and exists(select 1 from public.tnt_schedule_responsibles d where d.person_id=dst.id and d.item_id=s.item_id);
 delete from public.tnt_group_members s where s.person_id=src.id and exists(select 1 from public.tnt_group_members d where d.person_id=dst.id and d.group_id=s.group_id);
 delete from public.tnt_chat_reactions s where s.person_id=src.id and exists(select 1 from public.tnt_chat_reactions d where d.person_id=dst.id and d.message_id=s.message_id and d.reaction=s.reaction);
 delete from public.tnt_favorites s where s.person_id=src.id and exists(select 1 from public.tnt_favorites d where d.person_id=dst.id and d.entity_type=s.entity_type and d.entity_id=s.entity_id);
 update public.tnt_saturday_attendance d set status=case when 'present' in(d.status,s.status) then 'present' else d.status end,updated_at=greatest(d.updated_at,s.updated_at)
 from public.tnt_saturday_attendance s where d.person_id=dst.id and s.person_id=src.id and d.saturday_date=s.saturday_date;
 delete from public.tnt_saturday_attendance s where s.person_id=src.id and exists(select 1 from public.tnt_saturday_attendance d where d.person_id=dst.id and d.saturday_date=s.saturday_date);
 update public.tnt_efe_wednesday_attendance d set status=case when 'present' in(d.status,s.status) then 'present' else d.status end,updated_at=greatest(d.updated_at,s.updated_at)
 from public.tnt_efe_wednesday_attendance s where d.person_id=dst.id and s.person_id=src.id and d.group_id=s.group_id and d.wednesday_date=s.wednesday_date;
 delete from public.tnt_efe_wednesday_attendance s where s.person_id=src.id and exists(select 1 from public.tnt_efe_wednesday_attendance d where d.person_id=dst.id and d.group_id=s.group_id and d.wednesday_date=s.wednesday_date);
 update public.tnt_efe_followups d set note=concat_ws(E'\n',nullif(d.note,''),nullif(s.note,'')),status=case when s.updated_at>d.updated_at then s.status else d.status end,updated_at=greatest(d.updated_at,s.updated_at)
 from public.tnt_efe_followups s where d.person_id=dst.id and s.person_id=src.id and d.group_id=s.group_id and d.wednesday_date=s.wednesday_date;
 delete from public.tnt_efe_followups s where s.person_id=src.id and exists(select 1 from public.tnt_efe_followups d where d.person_id=dst.id and d.group_id=s.group_id and d.wednesday_date=s.wednesday_date);
 update public.tnt_checkins d set checked_in_at=least(d.checked_in_at,s.checked_in_at),checked_out_at=greatest(d.checked_out_at,s.checked_out_at),note=concat_ws(E'\n',nullif(d.note,''),nullif(s.note,''))
 from public.tnt_checkins s where d.person_id=dst.id and s.person_id=src.id and d.event_id=s.event_id;
 delete from public.tnt_checkins s where s.person_id=src.id and exists(select 1 from public.tnt_checkins d where d.person_id=dst.id and d.event_id=s.event_id);
 update public.tnt_availability d set status=case when s.updated_at>d.updated_at then s.status else d.status end,note=concat_ws(E'\n',nullif(d.note,''),nullif(s.note,'')),updated_at=greatest(d.updated_at,s.updated_at)
 from public.tnt_availability s where d.person_id=dst.id and s.person_id=src.id and d.date=s.date;
 delete from public.tnt_availability s where s.person_id=src.id and exists(select 1 from public.tnt_availability d where d.person_id=dst.id and d.date=s.date);
 update public.tnt_notification_state d set read_at=greatest(d.read_at,s.read_at),dismissed_at=greatest(d.dismissed_at,s.dismissed_at),purged_at=greatest(d.purged_at,s.purged_at)
 from public.tnt_notification_state s where d.person_id=dst.id and s.person_id=src.id and d.notification_id=s.notification_id;
 delete from public.tnt_notification_state s where s.person_id=src.id and exists(select 1 from public.tnt_notification_state d where d.person_id=dst.id and d.notification_id=s.notification_id);
 delete from public.tnt_experience_drafts d where d.person_id=dst.id and exists(select 1 from public.tnt_experience_drafts s where s.person_id=src.id and s.updated_at>=d.updated_at);
 delete from public.tnt_experience_drafts s where s.person_id=src.id and exists(select 1 from public.tnt_experience_drafts d where d.person_id=dst.id);
 update public.tnt_role_requests set status='cancelled' where person_id=src.id and status='pending' and exists(select 1 from public.tnt_role_requests where person_id=dst.id and status='pending');
 update public.tnt_profile_public_requests set status='cancelled' where person_id=src.id and status='pending' and exists(select 1 from public.tnt_profile_public_requests where person_id=dst.id and status='pending');
 update public.tnt_staff_invitations set status='declined' where person_id=src.id and status='pending' and exists(select 1 from public.tnt_staff_invitations where person_id=dst.id and status='pending');

 return history;
end $$;
revoke all on function tnt_actions.merge_profile_relations(uuid,uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
