-- Use the same eligible profiles as the birthday calendar.
create or replace function tnt_actions.birthday_notice_people(p_day date)
returns table(person_id uuid,display_name text,legacy_name text)
language sql stable security invoker set search_path='' as $$
  select p.id,chosen.name,coalesce(a.nickname,p.full_name)
  from public.tnt_people p
  join public.tnt_accounts a on a.person_id=p.id and a.enabled and a.auth_user_id is not null
  cross join lateral (select coalesce(nullif(btrim(a.nickname),''),nullif(btrim(p.full_name),'')) as name) chosen
  where p.active and p.birthday is not null and chosen.name is not null
    and to_char(p.birthday,'MMDD')=to_char(p_day,'MMDD')
    and exists(select 1 from public.tnt_community_modules where id='birthdays' and enabled)
$$;
revoke all on function tnt_actions.birthday_notice_people(date) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tnt_generate_daily_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d date:=tnt_actions.community_today();
  birthday record;
begin
  for birthday in
    select a.person_id as recipient,b.person_id,b.display_name
    from tnt_actions.birthday_notice_people(d) b
    join public.tnt_accounts a on a.enabled and a.auth_user_id is not null and a.person_id<>b.person_id
  loop
    perform tnt_actions.community_notify(birthday.recipient,'community:birthday:'||d||':'||birthday.person_id,
      'birthdays','🎂 Cumpleaños TNT','Hoy cumple '||birthday.display_name||'.','/comunidad?module=birthdays',
      jsonb_build_object('birthday_person',birthday.person_id,'birthday_day',d));
  end loop;

  -- Events starting tomorrow.
  insert into public.tnt_notifications(person_id,scope,event_id,title,body,href)
  select a.person_id,'general',e.id,'📅 El evento comienza mañana',e.name,'/organizacion/?event='||e.id
  from public.tnt_events e cross join public.tnt_accounts a
  where e.start_date=current_date+1 and e.status not in ('completed','cancelled') and a.enabled and a.auth_user_id is not null
    and not exists(select 1 from public.tnt_notifications n where n.person_id=a.person_id and n.event_id=e.id and n.title='📅 El evento comienza mañana' and n.created_at::date=current_date);

  -- Assignment still unread after 24h.
  insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href)
  select ta.person_id,'personal',t.event_id,t.id,'🔔 No confirmaste tu asignación',t.title,'/organizacion/?task='||t.id
  from public.tnt_task_assignees ta join public.tnt_tasks t on t.id=ta.task_id join public.tnt_events e on e.id=t.event_id and e.status<>'cancelled'
  where ta.assignment_status='assigned' and ta.created_at<now()-interval '24 hours' and t.status<>'completed'
    and not exists(select 1 from public.tnt_notifications n where n.person_id=ta.person_id and n.task_id=t.id and n.title='🔔 No confirmaste tu asignación' and n.created_at::date=current_date);

  -- Due tomorrow.
  insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href)
  select ta.person_id,'personal',t.event_id,t.id,'⏰ Tu tarea vence mañana',t.title,'/organizacion/?task='||t.id
  from public.tnt_task_assignees ta join public.tnt_tasks t on t.id=ta.task_id join public.tnt_events e on e.id=t.event_id and e.status<>'cancelled'
  where t.due_at::date=current_date+1 and t.status<>'completed' and ta.assignment_status<>'declined'
    and not exists(select 1 from public.tnt_notifications n where n.person_id=ta.person_id and n.task_id=t.id and n.title='⏰ Tu tarea vence mañana' and n.created_at::date=current_date);

  -- Organizers: a task is still preparing three days before due date.
  insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href)
  select em.person_id,'team',t.event_id,t.id,'⚠️ Tarea próxima a vencer',t.title||' · '||case t.status when 'unread' then 'sin iniciar' when 'preparing' then 'en preparación' when 'progress' then 'en curso' else 'necesita reemplazo' end,'/organizacion/?task='||t.id
  from public.tnt_tasks t join public.tnt_events e on e.id=t.event_id and e.status<>'cancelled' join public.tnt_event_members em on em.event_id=t.event_id and em.event_role='organizer'
  where t.due_at::date between current_date and current_date+3 and t.status in ('unread','preparing','progress','replacement')
    and not exists(select 1 from public.tnt_notifications n where n.person_id=em.person_id and n.task_id=t.id and n.title='⚠️ Tarea próxima a vencer' and n.created_at::date=current_date);
end $function$;
revoke all on function public.tnt_generate_daily_notifications() from public,anon,authenticated;

-- Repair the current day's unambiguous legacy notices in place.
with matches as (
  select n.id,b.person_id,b.display_name,count(*) over (partition by n.id) as matched
  from public.tnt_notifications n
  cross join tnt_actions.birthday_notice_people(tnt_actions.community_today()) b
  where n.title='🎂 Cumpleaños TNT' and n.href='/organizacion/' and n.event_id is null and n.task_id is null
    and n.person_id<>b.person_id
    and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date=tnt_actions.community_today()
    and n.body='Hoy cumple '||b.legacy_name||'.'
)
update public.tnt_notifications n
set body='Hoy cumple '||b.display_name||'.',href='/comunidad?module=birthdays',
    data=coalesce(n.data,'{}'::jsonb)||jsonb_build_object(
      'kind','community','community_module','birthdays','birthday_person',b.person_id,'birthday_day',tnt_actions.community_today())
from matches b where n.id=b.id and b.matched=1;

insert into public.tnt_community_notice_keys(source_key,person_id)
select 'community:birthday:'||(n.data->>'birthday_day')||':'||(n.data->>'birthday_person'),n.person_id
from public.tnt_notifications n
where n.title='🎂 Cumpleaños TNT' and n.data->>'birthday_day'=tnt_actions.community_today()::text
  and n.data ? 'birthday_person' and n.person_id is not null
on conflict do nothing;

-- Older alerts still open the calendar. Only fill in a name when the person is known.
update public.tnt_notifications
set href='/comunidad?module=birthdays',
    body=case when body~*'^Hoy cumple[[:space:]]*\.$' then 'Mirá los cumpleaños en Comunidad.' else body end,
    data=coalesce(data,'{}'::jsonb)||jsonb_build_object('kind','community','community_module','birthdays')
where title='🎂 Cumpleaños TNT' and href='/organizacion/' and event_id is null and task_id is null;

create or replace function tnt_actions.daily_verse_notice_due() returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(
    select 1 from public.tnt_community_modules
    where id='daily' and enabled
      and extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')
        >=least(23,greatest(0,coalesce((config->>'notification_hour')::integer,9)))
  )
$$;
revoke all on function tnt_actions.daily_verse_notice_due() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION tnt_actions.community_prepare_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d date:=tnt_actions.community_today();c public.tnt_community_content%rowtype;who record;n integer:=0;verse_ref text;begin
 perform tnt_actions.community_ensure_day();
 -- Scheduled publications are moved into the same history/notice workflow exactly once.
 for c in select * from public.tnt_community_content where status='scheduled' and starts_at<=now() for update skip locked loop
  update public.tnt_community_content set status='published',updated_at=now() where id=c.id;
  insert into public.tnt_community_history(module,action,actor,subject_id,details) values(c.module,'save_content',c.updated_by,c.id::text,'{}');n=n+1;
 end loop;
 -- The worker resolves the authorized public-domain text before inserting a notice.
 if tnt_actions.daily_verse_notice_due() and exists(
   select 1 from public.tnt_community_preferences p
   where p.daily_push and tnt_actions.community_active_person(p.person_id)
     and (not exists(select 1 from public.tnt_community_notice_keys k
                     where k.person_id=p.person_id and k.source_key='community:daily:'||d)
       or exists(select 1 from public.tnt_notifications n
                 where n.person_id=p.person_id and n.data->>'community_module'='daily'
                   and n.data->>'day'=d::text and n.title='Una Palabra para hoy'
                   and n.href='/comunidad?module=daily'))
 ) then
   select reference into verse_ref from public.tnt_community_days where day=d;
 end if;
 for who in select e.person_id,cc.id,cc.module,cc.title,cc.ends_at from public.tnt_community_enrollments e join public.tnt_community_content cc on cc.id=e.content_id left join public.tnt_community_preferences p on p.person_id=e.person_id
  where e.status='active' and coalesce(p.reminders,true) and cc.ends_at>now() and cc.ends_at<=now()+interval '24 hours' and tnt_actions.community_content_visible(cc.id,e.person_id) loop
  perform tnt_actions.community_notify(who.person_id,'community:reminder:'||who.id||':'||who.ends_at,who.module,'Tu próximo paso en TNT',who.title||' termina pronto. Podés retomar tu progreso.','/comunidad?module='||who.module||'&item='||who.id,jsonb_build_object('kind','community_reminder','content_id',who.id));
 end loop;
 return jsonb_build_object('scheduled',n,'day',d,'verse_reference',verse_ref);
end $function$;

create or replace function tnt_actions.publish_daily_verse_notice(p_day date,p_reference text,p_label text,p_body text)
returns void language plpgsql security definer set search_path='' as $$
declare
  target uuid;
  notice_title text:='Versículo del día · '||btrim(p_label)||' · RVR 1909';
  notice_body text:=btrim(p_body);
  notice_href text:='/biblia?ref='||p_reference||'&v=1909';
  notice_data jsonb:=jsonb_build_object('day',p_day,'verse_reference',p_reference,'verse_version',1909);
begin
  if p_day is distinct from tnt_actions.community_today() or not tnt_actions.daily_verse_notice_due()
    or coalesce(length(btrim(p_label)),0) not between 1 and 80
    or coalesce(length(notice_body),0) not between 1 and 950 then
    return;
  end if;
  -- Recheck the edition-independent reference after the worker fetches the passage.
  perform 1 from public.tnt_community_days where day=p_day and reference=p_reference for share;
  if not found then return;end if;

  update public.tnt_notifications n
  set title=notice_title,body=notice_body,href=notice_href,data=n.data||notice_data
  from public.tnt_community_preferences p
  where n.person_id=p.person_id and p.daily_push and tnt_actions.community_active_person(p.person_id)
    and n.data->>'community_module'='daily' and n.data->>'day'=p_day::text
    and n.title='Una Palabra para hoy' and n.href='/comunidad?module=daily';

  for target in
    select p.person_id from public.tnt_community_preferences p
    where p.daily_push and not exists(select 1 from public.tnt_notifications n
      where n.person_id=p.person_id and n.data->>'community_module'='daily' and n.data->>'day'=p_day::text)
  loop
    perform tnt_actions.community_notify(target,'community:daily:'||p_day,'daily',notice_title,notice_body,notice_href,notice_data);
  end loop;
end $$;
revoke all on function tnt_actions.publish_daily_verse_notice(date,text,text,text) from public,anon,authenticated;
grant execute on function tnt_actions.publish_daily_verse_notice(date,text,text,text) to service_role;

create or replace function public.tnt_publish_daily_verse_notice(p_day date,p_reference text,p_label text,p_body text)
returns void language sql security invoker set search_path='' as $$
  select tnt_actions.publish_daily_verse_notice(p_day,p_reference,p_label,p_body)
$$;
revoke all on function public.tnt_publish_daily_verse_notice(date,text,text,text) from public,anon,authenticated;
grant execute on function public.tnt_publish_daily_verse_notice(date,text,text,text) to service_role;
