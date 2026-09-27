-- A restricted message is visible only to its author, admins, and the selected people.
-- Existing messages keep the ordinary room audience.
alter table public.tnt_chat_messages add column if not exists audience_person_ids uuid[];
alter table public.tnt_chat_messages drop constraint if exists tnt_chat_audience_valid;
alter table public.tnt_chat_messages add constraint tnt_chat_audience_valid
  check(audience_person_ids is null or cardinality(audience_person_ids) between 1 and 100);

create or replace function public.tnt_can_read_message(p_message uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
   select 1 from public.tnt_chat_messages m where m.id=p_message
   and public.tnt_can_read_thread(m.thread_id)
   and (m.audience_person_ids is null or public.tnt_is_admin()
     or m.person_id=public.tnt_current_person_id()
     or public.tnt_current_person_id()=any(m.audience_person_ids))
 )
$$;
revoke all on function public.tnt_can_read_message(uuid) from public,anon;
grant execute on function public.tnt_can_read_message(uuid) to authenticated;

drop policy if exists tnt_chat_messages_read on public.tnt_chat_messages;
create policy tnt_chat_messages_read on public.tnt_chat_messages for select to authenticated using(
 public.tnt_can_read_thread(thread_id) and
 (audience_person_ids is null or public.tnt_is_admin() or person_id=public.tnt_current_person_id()
   or public.tnt_current_person_id()=any(audience_person_ids))
);

create or replace function private.tnt_protect_chat_message()
returns trigger language plpgsql set search_path='' as $$
declare f jsonb;
begin
 if tg_op='UPDATE' then
   if new.id<>old.id or new.thread_id<>old.thread_id or new.person_id is distinct from old.person_id then
     raise exception 'No se puede mover un mensaje.' using errcode='42501';
   end if;
   if new.audience_person_ids is distinct from old.audience_person_ids then
     raise exception 'No se puede cambiar el público de un mensaje enviado.' using errcode='42501';
   end if;
 end if;
 if auth.uid() is not null and not public.tnt_can_read_thread(new.thread_id) then
   raise exception 'No tenés acceso a esta conversación.' using errcode='42501';
 end if;
 if tg_op='INSERT' and new.audience_person_ids is not null and not public.tnt_is_admin() then
   raise exception 'Solo un administrador puede elegir destinatarios.' using errcode='42501';
 end if;
 if new.reply_to is not null and not public.tnt_can_read_message(new.reply_to) then
   raise exception 'No podés responder a un mensaje fuera de tu conversación.' using errcode='42501';
 end if;
 if new.attachment_url like 'tnt-chat-files/%' and split_part(new.attachment_url,'/',2)<>new.thread_id::text then
   raise exception 'Archivo de otra conversación.';
 end if;
 for f in select value from pg_catalog.jsonb_array_elements(new.attachments) loop
   if coalesce(f->>'path','') not like 'tnt-chat-files/'||new.thread_id::text||'/%' then
     raise exception 'Archivo de otra conversación.';
   end if;
   if new.audience_person_ids is not null and coalesce(f->>'path','') not like
      'tnt-chat-files/'||new.thread_id::text||'/'||new.person_id::text||'/'||new.id::text||'/%' then
     raise exception 'Los archivos privados deben pertenecer a este mensaje.';
   end if;
 end loop;
 if length(coalesce(new.body,''))>10000 or length(coalesce(new.body_rich,''))>100000 then
   raise exception 'Mensaje demasiado largo.';
 end if;
 return new;
end $$;

create or replace function private.tnt_chat_file_message(p_name text)
returns uuid language sql immutable security invoker set search_path='' as $$
 select case when pg_catalog.split_part(p_name,'/',3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then pg_catalog.split_part(p_name,'/',3)::uuid else null end
$$;
revoke all on function private.tnt_chat_file_message(text) from public,anon;
grant execute on function private.tnt_chat_file_message(text) to authenticated;

drop policy if exists tnt_chat_files_read on storage.objects;
create policy tnt_chat_files_read on storage.objects for select to authenticated using(
 bucket_id='tnt-chat-files' and
 (case when private.tnt_chat_file_message(name) is null
   then public.tnt_can_read_thread(private.tnt_chat_file_thread(name))
   else public.tnt_can_read_message(private.tnt_chat_file_message(name)) end)
);
notify pgrst,'reload schema';
