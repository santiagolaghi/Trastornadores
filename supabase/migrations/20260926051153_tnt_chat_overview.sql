-- Exact unread counts without downloading the conversation history.
create or replace function public.tnt_chat_overview()
returns table(thread_id uuid,last_body text,last_created_at timestamptz,unread_count bigint)
language sql stable security invoker set search_path='' as $$
 select t.id,
 case when last_message.deleted_at is not null then 'Mensaje eliminado'
 else coalesce(nullif(last_message.body,''),last_message.attachment_name) end,
 last_message.created_at,
 (select count(*) from public.tnt_chat_messages msg where msg.thread_id=t.id and msg.person_id<>public.tnt_current_person_id()
  and msg.deleted_at is null and msg.created_at>coalesce(member.last_read_at,'-infinity'::timestamptz))
 from public.tnt_chat_threads t
 left join public.tnt_chat_members member on member.thread_id=t.id and member.person_id=public.tnt_current_person_id()
 left join lateral(select m.body,m.created_at,m.attachment_name,m.deleted_at from public.tnt_chat_messages m where m.thread_id=t.id order by m.created_at desc,m.id desc limit 1) last_message on true
 where not t.is_archived
$$;
revoke all on function public.tnt_chat_overview() from public,anon;
grant execute on function public.tnt_chat_overview() to authenticated;
notify pgrst,'reload schema';
