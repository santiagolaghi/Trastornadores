create or replace function public.tnt_notify_task_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare tid uuid; actor uuid; ev uuid; ttl text; msg text;
begin
  actor:=public.tnt_current_person_id();
  if tg_table_name='tnt_task_comments' then tid:=new.task_id; ttl:='Nuevo comentario'; msg:='Hay un comentario nuevo en la tarea.';
  elsif tg_table_name='tnt_task_files' then tid:=new.task_id; ttl:='Nuevo archivo'; msg:='Se agregó un archivo a la tarea.';
  else tid:=new.task_id; ttl:='Nueva referencia'; msg:='Se agregó un link o referencia a la tarea.'; end if;
  select event_id into ev from public.tnt_tasks where id=tid;
  insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href)
  select q.person_id,'team',ev,tid,ttl,msg,'/organizacion/?task='||tid
  from (
    select person_id from public.tnt_task_assignees where task_id=tid
    union
    select person_id from public.tnt_event_members where event_id=ev and event_role='organizer'
  ) q
  where q.person_id is distinct from actor;
  return new;
end $$;

drop trigger if exists tnt_comment_notify on public.tnt_task_comments;
create trigger tnt_comment_notify after insert on public.tnt_task_comments for each row execute procedure public.tnt_notify_task_activity();
drop trigger if exists tnt_file_notify on public.tnt_task_files;
create trigger tnt_file_notify after insert on public.tnt_task_files for each row execute procedure public.tnt_notify_task_activity();
drop trigger if exists tnt_link_notify on public.tnt_task_links;
create trigger tnt_link_notify after insert on public.tnt_task_links for each row execute procedure public.tnt_notify_task_activity();

create or replace function public.tnt_notify_schedule_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare ev uuid; actor uuid;
begin
  if new.starts_at is not distinct from old.starts_at and new.title is not distinct from old.title then return new; end if;
  actor:=public.tnt_current_person_id();
  select d.event_id into ev from public.tnt_schedule_days d where d.id=new.day_id;
  insert into public.tnt_notifications(person_id,scope,event_id,title,body,href)
  select distinct em.person_id,'team',ev,'Cambio de horario','Cambió el cronograma: '||new.title||coalesce(' · '||to_char(new.starts_at,'HH24:MI'),''),'/organizacion/?event='||ev
  from public.tnt_event_members em where em.event_id=ev and em.person_id is distinct from actor;
  return new;
end $$;
drop trigger if exists tnt_schedule_change_notify on public.tnt_schedule_items;
create trigger tnt_schedule_change_notify after update on public.tnt_schedule_items for each row execute procedure public.tnt_notify_schedule_change();

create or replace function public.tnt_generate_daily_notifications()
returns void language plpgsql security definer set search_path=public as $$
begin
  -- Birthdays: one general-personal notification per active TNT account.
  insert into public.tnt_notifications(person_id,scope,title,body,href)
  select a.person_id,'general','🎂 Cumpleaños TNT','Hoy cumple '||coalesce(ba.nickname,bp.full_name)||'.','/organizacion/'
  from public.tnt_people bp
  left join public.tnt_accounts ba on ba.person_id=bp.id
  cross join public.tnt_accounts a
  where bp.active and bp.birthday is not null and extract(month from bp.birthday)=extract(month from current_date) and extract(day from bp.birthday)=extract(day from current_date)
    and a.enabled and a.auth_user_id is not null and a.person_id<>bp.id
    and not exists(select 1 from public.tnt_notifications n where n.person_id=a.person_id and n.title='🎂 Cumpleaños TNT' and n.body='Hoy cumple '||coalesce(ba.nickname,bp.full_name)||'.' and n.created_at::date=current_date);

  -- Events starting tomorrow.
  insert into public.tnt_notifications(person_id,scope,event_id,title,body,href)
  select a.person_id,'general',e.id,'📅 El evento comienza mañana',e.name,'/organizacion/?event='||e.id
  from public.tnt_events e cross join public.tnt_accounts a
  where e.start_date=current_date+1 and e.status not in ('completed','cancelled') and a.enabled and a.auth_user_id is not null
    and not exists(select 1 from public.tnt_notifications n where n.person_id=a.person_id and n.event_id=e.id and n.title='📅 El evento comienza mañana' and n.created_at::date=current_date);

  -- Assignment still unread after 24h.
  insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href)
  select ta.person_id,'personal',t.event_id,t.id,'🔔 No confirmaste tu asignación',t.title,'/organizacion/?task='||t.id
  from public.tnt_task_assignees ta join public.tnt_tasks t on t.id=ta.task_id
  where ta.assignment_status='assigned' and ta.created_at<now()-interval '24 hours' and t.status<>'completed'
    and not exists(select 1 from public.tnt_notifications n where n.person_id=ta.person_id and n.task_id=t.id and n.title='🔔 No confirmaste tu asignación' and n.created_at::date=current_date);

  -- Due tomorrow.
  insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href)
  select ta.person_id,'personal',t.event_id,t.id,'⏰ Tu tarea vence mañana',t.title,'/organizacion/?task='||t.id
  from public.tnt_task_assignees ta join public.tnt_tasks t on t.id=ta.task_id
  where t.due_at::date=current_date+1 and t.status<>'completed' and ta.assignment_status<>'declined'
    and not exists(select 1 from public.tnt_notifications n where n.person_id=ta.person_id and n.task_id=t.id and n.title='⏰ Tu tarea vence mañana' and n.created_at::date=current_date);

  -- Organizers: a task is still preparing three days before due date.
  insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href)
  select em.person_id,'team',t.event_id,t.id,'⚠️ Tarea próxima a vencer',t.title||' sigue en '||t.status,'/organizacion/?task='||t.id
  from public.tnt_tasks t join public.tnt_event_members em on em.event_id=t.event_id and em.event_role='organizer'
  where t.due_at::date between current_date and current_date+3 and t.status in ('unread','preparing','progress','replacement')
    and not exists(select 1 from public.tnt_notifications n where n.person_id=em.person_id and n.task_id=t.id and n.title='⚠️ Tarea próxima a vencer' and n.created_at::date=current_date);
end $$;

create extension if not exists pg_cron with schema extensions;
DO $$ declare jid bigint; begin
  for jid in select jobid from cron.job where jobname='tnt-daily-reminders' loop perform cron.unschedule(jid); end loop;
  perform cron.schedule('tnt-daily-reminders','0 12 * * *','select public.tnt_generate_daily_notifications();');
end $$;