-- Actividades creadas explícitamente, perfiles integrados y recordatorios legibles.
alter table public.tnt_events add column if not exists activity_type_id uuid references public.tnt_templates(id) on delete set null;
grant select,update,delete on public.perfiles_registros to authenticated;
drop policy if exists perfiles_admin_read on public.perfiles_registros;
drop policy if exists perfiles_admin_update on public.perfiles_registros;
drop policy if exists perfiles_admin_delete on public.perfiles_registros;
create policy perfiles_admin_read on public.perfiles_registros for select to authenticated using (public.tnt_is_pastor_or_admin());
create policy perfiles_admin_update on public.perfiles_registros for update to authenticated using (public.tnt_is_pastor_or_admin()) with check (public.tnt_is_pastor_or_admin());
create policy perfiles_admin_delete on public.perfiles_registros for delete to authenticated using (public.tnt_is_pastor_or_admin());
update public.tnt_events set status='cancelled' where auto_generated=true and status<>'cancelled';
update public.tnt_notifications n set read_at=now() where n.read_at is null and exists(select 1 from public.tnt_events e where e.id=n.event_id and e.auto_generated=true and e.status='cancelled');
update public.tnt_notifications set body=regexp_replace(body,' sigue en unread$',' sigue sin iniciar') where body like '% sigue en unread';
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
end $$;

