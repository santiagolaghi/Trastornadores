-- Remove only the untouched copies created by the previous automatic scheduler.
-- A Saturday with any user work, chat, assignment, attendance or changed task is retained.
with pristine as (
 select e.id from public.tnt_events e
 where e.kind='saturday' and e.auto_generated and e.status='planning'
  and e.start_date>=(now() at time zone 'America/Argentina/Buenos_Aires')::date
  and e.name='Sábado TNT · '||to_char(e.start_date,'DD/MM')
  and e.updated_at<=e.created_at+interval '1 second'
  and (select count(*) from public.tnt_tasks t where t.event_id=e.id)=7
  and (select array_agg(t.title order by t.sort_order) from public.tnt_tasks t where t.event_id=e.id)
    =array['Bienvenida','Dinámica','Ofrenda','Ministración','Palabra','Merienda','Cierre']
  and (select count(*) from public.tnt_schedule_items i join public.tnt_schedule_days d on d.id=i.day_id where d.event_id=e.id)=7
  and not exists(select 1 from public.tnt_tasks t where t.event_id=e.id and (t.updated_at>t.created_at+interval '1 second' or t.description is not null or t.materials is not null))
  and not exists(select 1 from public.tnt_task_assignees a join public.tnt_tasks t on t.id=a.task_id where t.event_id=e.id)
  and not exists(select 1 from public.tnt_task_comments c join public.tnt_tasks t on t.id=c.task_id where t.event_id=e.id)
  and not exists(select 1 from public.tnt_task_checklist c join public.tnt_tasks t on t.id=c.task_id where t.event_id=e.id)
  and not exists(select 1 from public.tnt_task_links c join public.tnt_tasks t on t.id=c.task_id where t.event_id=e.id)
  and not exists(select 1 from public.tnt_task_files c join public.tnt_tasks t on t.id=c.task_id where t.event_id=e.id)
  and not exists(select 1 from public.tnt_schedule_items i join public.tnt_schedule_days d on d.id=i.day_id where d.event_id=e.id and (i.description is not null or i.materials is not null or coalesce(i.run_status,'pending')<>'pending'))
  and not exists(select 1 from public.tnt_chat_threads c where c.event_id=e.id)
  and not exists(select 1 from public.tnt_checkins c where c.event_id=e.id)
  and not exists(select 1 from public.tnt_groups g where g.event_id=e.id)
  and not exists(select 1 from public.tnt_group_configs g where g.event_id=e.id)
  and not exists(select 1 from public.tnt_notifications n where n.event_id=e.id)
  and not exists(select 1 from public.tnt_library_items l where l.event_id=e.id)
  and (select count(*) from public.tnt_event_members m where m.event_id=e.id)=1
)
delete from public.tnt_events e using pristine p where e.id=p.id;
