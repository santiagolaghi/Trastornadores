create or replace function public.tnt_enqueue_push() returns trigger
language plpgsql security definer set search_path='' as $$
declare sender text;portrait text;preview text;
begin
 if tg_table_name='tnt_notifications' then
  insert into public.tnt_push_outbox(source_key,person_id,endpoint,payload)
  select 'notification:'||new.id,s.person_id,s.endpoint,jsonb_build_object('title',new.title,'body',coalesce(new.body,''),'url',coalesce(new.href,'/'),'tag',case when new.data->>'kind'='chat_message' then 'tnt-chat-'||(new.data->>'thread_id') else 'tnt-notification-'||new.id end,'notification_id',new.id)
  from public.tnt_push_subscriptions s join public.tnt_accounts a on a.person_id=s.person_id
  where a.enabled and a.auth_user_id is not null and public.tnt_notification_visible_for(new,s.person_id)
   and exists(select 1 from public.tnt_people where id=a.person_id and active);
 else
  if new.deleted_at is not null or not public.tnt_module_enabled('chat') then return new;end if;
  select coalesce(nullif(a.nickname,''),p.full_name),a.avatar_url into sender,portrait from public.tnt_people p left join public.tnt_accounts a on a.person_id=p.id where p.id=new.person_id;
  preview:=coalesce(nullif(left(new.body,180),''),case when exists(select 1 from jsonb_array_elements(coalesce(new.attachments,'[]')) f where f->>'type' like 'audio/%') then '🎙 Mensaje de voz' when exists(select 1 from jsonb_array_elements(coalesce(new.attachments,'[]')) f where f->>'type' like 'image/%') then '📷 Foto' else '📎 Archivo adjunto' end);
  -- Notifications are the single source for both foreground previews and Web Push.
  insert into public.tnt_notifications(person_id,title,body,href,data)
  select m.person_id,coalesce(sender,'Equipo TNT')||case when t.thread_type='direct' then '' else ' · '||t.title end,preview,'/chat/?thread='||new.thread_id,
   jsonb_build_object('kind','chat_message','message_id',new.id,'thread_id',new.thread_id,'sender_id',new.person_id,'sender_name',sender,'sender_avatar',portrait)
  from public.tnt_chat_members m join public.tnt_chat_threads t on t.id=m.thread_id
  where m.thread_id=new.thread_id and m.person_id<>new.person_id and public.tnt_recipient_has_module(m.person_id,'chat')
   and not t.is_archived and (new.audience_person_ids is null or m.person_id=any(new.audience_person_ids));
 end if;
 return new;
end $$;


notify pgrst,'reload schema';
