-- Management visibility never adds somebody to an announcement's intended audience.
create or replace function tnt_actions.community_content_recipient(p_id uuid,p_person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select tnt_actions.community_active_person(p_person) and exists(select 1 from public.tnt_community_content c join public.tnt_community_modules m on m.id=c.module
 where c.id=p_id and m.enabled and c.status in('published','scheduled') and (c.starts_at is null or c.starts_at<=now())
 and (c.audience='all' or c.audience='staff' and exists(select 1 from public.tnt_accounts a where a.person_id=p_person and (a.staff_status='approved' or a.system_role='admin'))
 or c.audience='selected' and exists(select 1 from public.tnt_community_audience x where x.content_id=c.id and x.person_id=p_person)
 or c.audience='families' and exists(select 1 from public.tnt_community_family_links f where f.caregiver_id=p_person and f.status='verified'))
 and (c.module<>'families' or exists(select 1 from public.tnt_community_family_links f where f.caregiver_id=p_person and f.status='verified')))
$$;
revoke all on function tnt_actions.community_content_recipient(uuid,uuid) from public,anon,authenticated;
-- One in-app notice is the source for every phone/device delivery.
create or replace function tnt_actions.community_notice_visible(p_note public.tnt_notifications,p_person uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare m text:=p_note.data->>'community_module';subj uuid;begin
 if not tnt_actions.community_active_person(p_person) or not exists(select 1 from public.tnt_community_modules where id=m and enabled) then return false;end if;
 if m='daily' and p_note.data ? 'day' and not exists(select 1 from public.tnt_community_preferences where person_id=p_person and daily_push) then return false;end if;
 if p_note.data ? 'content_id' then
  subj=(p_note.data->>'content_id')::uuid;
  if not tnt_actions.community_content_recipient(subj,p_person) then return false;end if;
  if p_note.data->>'kind'='community_reminder' and not exists(select 1 from public.tnt_community_enrollments where content_id=subj and person_id=p_person and status='active') then return false;end if;
 elsif p_note.data ? 'question_id' then
  return exists(select 1 from public.tnt_community_questions where id=(p_note.data->>'question_id')::uuid and (person_id=p_person or tnt_actions.community_can_for(p_person,'questions',1) or status='published' and visibility='community'));
 elsif p_note.data ? 'family_link_id' then
  return exists(select 1 from public.tnt_community_family_links where id=(p_note.data->>'family_link_id')::uuid and (caregiver_id=p_person or member_id=p_person or tnt_actions.community_can_for(p_person,'families',3)));
 elsif p_note.data ? 'welcome_person' then
  return exists(select 1 from public.tnt_accounts where person_id=p_person and system_role='admin') or p_person=(p_note.data->>'welcome_person')::uuid or exists(select 1 from public.tnt_community_accompaniment where person_id=(p_note.data->>'welcome_person')::uuid and referent_id=p_person and status in('pending','accepted'));
 elsif p_note.data ? 'baptism_person' then
  return p_person=(p_note.data->>'baptism_person')::uuid or tnt_actions.community_can_for(p_person,'baptisms',3);
 end if;
 return true;
exception when invalid_text_representation then return false;
end $$;
revoke all on function tnt_actions.community_notice_visible(public.tnt_notifications,uuid) from public,anon,authenticated;
grant execute on function tnt_actions.community_notice_visible(public.tnt_notifications,uuid) to service_role;

create or replace function tnt_actions.community_notify(p_person uuid,p_key text,p_module text,p_title text,p_body text,p_href text,p_extra jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if not tnt_actions.community_active_person(p_person) then return;end if;
 insert into public.tnt_community_notice_keys(source_key,person_id) values(p_key,p_person) on conflict do nothing;
 if not found then return;end if;
 insert into public.tnt_notifications(person_id,title,body,href,data) values(p_person,p_title,p_body,p_href,jsonb_build_object('kind','community','community_module',p_module)||p_extra);
end $$;
revoke all on function tnt_actions.community_notify(uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;

create or replace function tnt_actions.community_history_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.tnt_community_content%rowtype;q public.tnt_community_questions%rowtype;f public.tnt_community_family_links%rowtype;a public.tnt_community_accompaniment%rowtype;
 target uuid;person uuid;subject uuid;dest text;label text;extra jsonb;key text;begin
 key='community:'||new.action||':'||new.subject_id;subject=case when new.subject_id~'^[0-9a-f-]{36}$' then new.subject_id::uuid else null end;
 dest='/comunidad?module='||new.module;
 if new.action='save_content' then
  select * into c from public.tnt_community_content where id=subject;
  if c.status not in('published','scheduled') or c.starts_at>now() then return new;end if;
  if coalesce(new.details#>>'{before,status}','') in('published','scheduled') and not coalesce((new.details->>'notify')::boolean,false) and (new.details#>>'{before,starts_at}')::timestamptz is not distinct from c.starts_at then return new;end if;
  extra=jsonb_build_object('content_id',c.id);key='community:publish:'||c.id||':'||c.version;
  for target in select x.person_id from public.tnt_accounts x where x.person_id<>new.actor and tnt_actions.community_content_recipient(c.id,x.person_id) loop
   perform tnt_actions.community_notify(target,key,c.module,c.title,case when c.module='polls' then 'Tu opinión cuenta. Hay una encuesta para vos.' when c.module='bible' then 'Un nuevo plan para leer y compartir.' else 'Hay una novedad para vos en TNT.' end,dest||'&item='||c.id,extra);
  end loop;
 elsif new.action='ask' then
  select * into q from public.tnt_community_questions where id=subject;extra=jsonb_build_object('question_id',q.id);
  for target in select person_id from public.tnt_accounts where person_id<>new.actor and tnt_actions.community_can_for(person_id,'questions',2) loop
   perform tnt_actions.community_notify(target,key,'questions','Nueva pregunta de fe','Hay una consulta para acompañar.','/comunidad?module=questions&manage=1&question='||q.id,extra);
  end loop;
 elsif new.action='answer' then
  select * into q from public.tnt_community_questions where id=subject;
  if q.status in('answered','published') then perform tnt_actions.community_notify(q.person_id,key||':'||q.updated_at,'questions','Tu pregunta tiene respuesta','El equipo respondió tu consulta.',dest||'&question='||q.id,jsonb_build_object('question_id',q.id));end if;
 elsif new.action='request_welcome' then
  for target in select person_id from public.tnt_accounts where system_role='admin' and person_id<>new.actor loop
   perform tnt_actions.community_notify(target,key,'welcome','Una persona pidió acompañamiento','Podés elegir un referente y enviarle una invitación.','/comunidad?module=welcome&manage=1',jsonb_build_object('welcome_person',subject));
  end loop;
 elsif new.action='assign_referent' then
  select * into a from public.tnt_community_accompaniment where person_id=subject;
  if a.referent_id is not null then perform tnt_actions.community_notify(a.referent_id,key||':'||a.assigned_at,'welcome','¿Podés acompañar a esta persona?','Administración te invitó como referente. Confirmá si podés acompañarla.',dest,jsonb_build_object('welcome_person',a.person_id));end if;
 elsif new.action='respond_referent' then
  select * into a from public.tnt_community_accompaniment where person_id=subject;
  for target in select person_id from public.tnt_accounts where system_role='admin' loop
   perform tnt_actions.community_notify(target,key||':'||a.responded_at,'welcome',case when a.status='accepted' then 'Referente confirmado' else 'Hace falta elegir otro referente' end,'La invitación de acompañamiento ya tiene respuesta.',dest||'&manage=1',jsonb_build_object('welcome_person',a.person_id));
  end loop;
  if a.status='accepted' then perform tnt_actions.community_notify(a.person_id,key||':'||a.responded_at,'welcome','Ya tenés un referente confirmado','Tu referente aceptó acompañarte en TNT.',dest,jsonb_build_object('welcome_person',a.person_id));end if;
 elsif new.action='followup' then
  select person_id into person from public.tnt_community_followups where id=subject and shared;
  if person is not null then perform tnt_actions.community_notify(person,key,'welcome','Tu acompañamiento tiene una novedad','Tu referente compartió un registro con vos.',dest,jsonb_build_object('welcome_person',person));end if;
 elsif new.action='request_family' then
  extra=jsonb_build_object('family_link_id',subject);
  for target in select person_id from public.tnt_accounts where tnt_actions.community_can_for(person_id,'families',3) loop
   perform tnt_actions.community_notify(target,key,'families','Nueva solicitud de una familia','Hay una vinculación familiar para revisar.',dest||'&manage=1',extra);
  end loop;
 elsif new.action='review_family' then
  select * into f from public.tnt_community_family_links where id=subject;
  perform tnt_actions.community_notify(f.caregiver_id,key||':'||f.reviewed_at,'families','Tu solicitud familiar tiene respuesta',case when f.status='verified' then 'Ya podés ver los avisos y autorizaciones de Familias TNT.' else 'Acercate al equipo para revisar la vinculación solicitada.' end,dest,jsonb_build_object('family_link_id',f.id));
 elsif new.action='request_baptism' then
  for target in select person_id from public.tnt_accounts where tnt_actions.community_can_for(person_id,'baptisms',3) loop
   perform tnt_actions.community_notify(target,key,'baptisms','Una persona se interesa por el bautismo','Podés acompañar su preparación.',dest||'&manage=1',jsonb_build_object('baptism_person',subject));
  end loop;
 elsif new.action='save_baptism' then
  perform tnt_actions.community_notify(subject,key||':'||new.id,'baptisms','Novedades de tu preparación','El equipo actualizó los próximos pasos de tu bautismo.',dest,jsonb_build_object('baptism_person',subject));
 end if;
 return new;
end $$;
revoke all on function tnt_actions.community_history_notice() from public,anon,authenticated;
create trigger tnt_community_workflow_notices after insert on public.tnt_community_history for each row execute function tnt_actions.community_history_notice();

create or replace function tnt_actions.community_prepare_notifications() returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=tnt_actions.community_today();c public.tnt_community_content%rowtype;target uuid;who record;n integer:=0;hh integer;begin
 perform tnt_actions.community_ensure_day();
 -- Scheduled publications are moved into the same history/notice workflow exactly once.
 for c in select * from public.tnt_community_content where status='scheduled' and starts_at<=now() for update skip locked loop
  update public.tnt_community_content set status='published',updated_at=now() where id=c.id;
  insert into public.tnt_community_history(module,action,actor,subject_id,details) values(c.module,'save_content',c.updated_by,c.id::text,'{}');n=n+1;
 end loop;
 select least(23,greatest(0,coalesce((config->>'notification_hour')::integer,9))) into hh from public.tnt_community_modules where id='daily';
 if extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')>=hh then
  for target in select p.person_id from public.tnt_community_preferences p join public.tnt_community_modules m on m.id='daily' where p.daily_push and m.enabled loop
   perform tnt_actions.community_notify(target,'community:daily:'||d,'daily','Una Palabra para hoy','El versículo y la frase de hoy ya están en TNT.','/comunidad?module=daily',jsonb_build_object('day',d));
  end loop;
 end if;
 for who in select e.person_id,cc.id,cc.module,cc.title,cc.ends_at from public.tnt_community_enrollments e join public.tnt_community_content cc on cc.id=e.content_id left join public.tnt_community_preferences p on p.person_id=e.person_id
  where e.status='active' and coalesce(p.reminders,true) and cc.ends_at>now() and cc.ends_at<=now()+interval '24 hours' and tnt_actions.community_content_visible(cc.id,e.person_id) loop
  perform tnt_actions.community_notify(who.person_id,'community:reminder:'||who.id||':'||who.ends_at,who.module,'Tu próximo paso en TNT',who.title||' termina pronto. Podés retomar tu progreso.','/comunidad?module='||who.module||'&item='||who.id,jsonb_build_object('kind','community_reminder','content_id',who.id));
 end loop;
 return jsonb_build_object('scheduled',n,'day',d);
end $$;
revoke all on function tnt_actions.community_prepare_notifications() from public,anon,authenticated;
grant execute on function tnt_actions.community_prepare_notifications() to service_role;
create or replace function public.tnt_community_prepare_notifications() returns jsonb language sql security invoker set search_path='' as $$select tnt_actions.community_prepare_notifications()$$;
revoke all on function public.tnt_community_prepare_notifications() from public,anon,authenticated;
grant execute on function public.tnt_community_prepare_notifications() to service_role;

-- Aggregate delivery diagnostics without exposing device endpoints or push credentials.
create or replace function tnt_actions.community_delivery_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();begin
 if auth.uid() is null or not public.tnt_is_admin() then raise exception 'Solo Administración puede revisar los envíos.' using errcode='42501';end if;
 return jsonb_build_object('devices',(select count(*) from public.tnt_push_subscriptions),'states',(select coalesce(jsonb_agg(x),'[]') from(select status,count(*) count from public.tnt_push_outbox where created_at>now()-interval '7 days' group by status)x),'failures',(select coalesce(jsonb_agg(x),'[]') from(select id,person_id,status,attempts,available_at,left(last_error,160) error from public.tnt_push_outbox where status='failed' order by available_at desc limit 20)x));
end $$;
revoke all on function tnt_actions.community_delivery_status() from public,anon;
grant execute on function tnt_actions.community_delivery_status() to authenticated;
create or replace function public.tnt_community_delivery_status() returns jsonb language sql security invoker set search_path='' as $$select tnt_actions.community_delivery_status()$$;
revoke all on function public.tnt_community_delivery_status() from public,anon;
grant execute on function public.tnt_community_delivery_status() to authenticated;

CREATE OR REPLACE FUNCTION public.tnt_notification_visible_for(p_note tnt_notifications, p_person uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
  where a.person_id=p_person and a.enabled and p.active and a.onboarding_completed_at is not null
  and jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(p_person)))=0
  and (p_note.person_id=p_person or (p_note.person_id is null and (p_note.scope='general' or p_note.scope='team' and (a.staff_status='approved' or a.system_role='admin')))))
 and (not(p_note.data ? 'community_module') or tnt_actions.community_notice_visible(p_note,p_person))
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
$function$;

create or replace function public.tnt_push_subscribe(p_subscription jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();ep text:=nullif(p_subscription->>'endpoint','');begin
 if pid is null or not tnt_actions.community_active_person(pid) then raise exception 'Iniciá sesión con una cuenta habilitada' using errcode='42501';end if;
 if ep is null or ep !~ '^https://' or length(ep)>2048 or nullif(p_subscription#>>'{keys,auth}','') is null or nullif(p_subscription#>>'{keys,p256dh}','') is null then raise exception 'Suscripción de teléfono inválida' using errcode='22023';end if;
 insert into public.tnt_push_subscriptions(person_id,endpoint,subscription,updated_at) values(pid,ep,p_subscription,now()) on conflict(endpoint) do update set person_id=excluded.person_id,subscription=excluded.subscription,updated_at=now();
 insert into public.tnt_push_outbox(source_key,person_id,endpoint,payload)
 select 'notification:'||n.id,pid,ep,jsonb_build_object('notification_id',n.id,'title',n.title,'body',n.body,'url',n.href,'tag','tnt-notification-'||n.id)||coalesce(n.data,'{}')
 from public.tnt_notifications n left join public.tnt_notification_state s on s.notification_id=n.id and s.person_id=pid
 where n.created_at>now()-interval '24 hours' and n.data ? 'community_module' and n.read_at is null and s.read_at is null and s.dismissed_at is null
 and public.tnt_notification_visible_for(n,pid) and not public.tnt_notification_resolved(n)
 order by n.created_at desc limit 30 on conflict(source_key,endpoint) do nothing;
end $$;

revoke all on function public.tnt_push_subscribe(jsonb) from public,anon;
grant execute on function public.tnt_push_subscribe(jsonb) to authenticated;
