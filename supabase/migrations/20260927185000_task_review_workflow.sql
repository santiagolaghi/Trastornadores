create or replace function public.tnt_set_task_status(p_task uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare
  pid uuid;
  ev uuid;
  current_status text;
  task_title text;
  manager boolean;
  assignee boolean;
begin
  pid := public.tnt_current_person_id();
  select event_id,status,title into ev,current_status,task_title from public.tnt_tasks where id=p_task;
  if ev is null or pid is null then raise exception 'Tarea no encontrada'; end if;
  manager := public.tnt_can_manage_event(ev);
  select exists(select 1 from public.tnt_task_assignees where task_id=p_task and person_id=pid and assignment_status='accepted') into assignee;
  if p_status='review' then
    if not assignee then raise exception 'Aceptá la tarea antes de solicitar revisión'; end if;
    if current_status in ('review','ready','completed') then raise exception 'Esta tarea ya fue enviada o finalizada'; end if;
  elsif p_status='progress' then
    if current_status='review' then
      if not manager then raise exception 'Solo un organizador puede pedir ajustes'; end if;
    elsif not (manager or assignee) then raise exception 'Sin permiso para actualizar la tarea'; end if;
  elsif p_status='ready' then
    if not manager then raise exception 'Solo un organizador puede aprobar la tarea'; end if;
  elsif p_status='completed' then
    if not manager or current_status<>'ready' then raise exception 'Primero aprobá la tarea'; end if;
  else
    raise exception 'Usá las acciones de avance y revisión de la tarea';
  end if;
  if current_status=p_status then return; end if;
  update public.tnt_tasks set status=p_status where id=p_task;
  if p_status='review' then
    insert into public.tnt_notifications(person_id,event_id,task_id,title,body,href)
    select distinct recipient,ev,p_task,'Revisión solicitada',task_title,'/organizacion/?task='||p_task::text
    from (select person_id as recipient from public.tnt_event_members where event_id=ev and event_role='organizer'
          union select person_id from public.tnt_accounts where system_role='admin' and enabled) recipients
    where recipient<>pid;
  elsif p_status in ('ready','progress') and current_status='review' then
    insert into public.tnt_notifications(person_id,event_id,task_id,title,body,href)
    select distinct person_id,ev,p_task,case when p_status='ready' then 'Tarea aprobada' else 'Se pidieron ajustes' end,task_title,'/organizacion/?task='||p_task::text
    from public.tnt_task_assignees where task_id=p_task and person_id<>pid and assignment_status<>'declined';
  end if;
end $$;
revoke all on function public.tnt_set_task_status(uuid,text) from public, anon;
grant execute on function public.tnt_set_task_status(uuid,text) to authenticated;
