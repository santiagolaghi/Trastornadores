-- Featured state belongs to each activity occurrence, never to a template.
alter table public.tnt_tasks add column if not exists is_featured boolean not null default false;
alter table public.tnt_tasks add column if not exists feature_color text not null default 'lime' check(feature_color in ('lime','peach','lilac','blue','rose'));

CREATE OR REPLACE FUNCTION public.tnt_save_schedule_item(p_id uuid, p_day uuid, p_values jsonb, p_people uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_event uuid; v_id uuid; v_task uuid;
begin
 select event_id into v_event from public.tnt_schedule_days where id=p_day;
 if v_event is null or not public.tnt_event_can_action(v_event,case when p_id is null then 'create_activity' else 'edit_activity' end) then raise exception 'No tenés permiso para editar esta actividad.' using errcode='42501'; end if;
 if nullif(trim(p_values->>'title'),'') is null then raise exception 'La actividad necesita un nombre.'; end if;
 if p_id is not null and not exists(select 1 from public.tnt_schedule_items where id=p_id and day_id=p_day) then raise exception 'La actividad cambió. Volvé a abrirla.'; end if;
 v_id:=coalesce(p_id,gen_random_uuid());
 insert into public.tnt_schedule_items(id,day_id,title,item_type,starts_at,duration_minutes,description,video_url,materials,location,sort_order)
 values(v_id,p_day,trim(p_values->>'title'),coalesce(p_values->>'item_type','activity'),nullif(p_values->>'starts_at','')::time,
 (p_values->>'duration_minutes')::int,p_values->>'description',p_values->>'video_url',p_values->>'materials',p_values->>'location',coalesce((p_values->>'sort_order')::int,0))
 on conflict(id) do update set title=excluded.title,item_type=excluded.item_type,starts_at=excluded.starts_at,duration_minutes=excluded.duration_minutes,
 description=excluded.description,video_url=excluded.video_url,materials=excluded.materials,location=excluded.location,sort_order=excluded.sort_order
 returning task_id into v_task;
 delete from public.tnt_schedule_responsibles where item_id=v_id and not(person_id=any(coalesce(p_people,'{}'::uuid[])));
 insert into public.tnt_schedule_responsibles(item_id,person_id) select v_id,x from unnest(coalesce(p_people,'{}'::uuid[])) x on conflict do nothing;
 if v_task is null then
   insert into public.tnt_tasks(event_id,title,created_by) values(v_event,trim(p_values->>'title'),public.tnt_current_person_id()) returning id into v_task;
   update public.tnt_schedule_items set task_id=v_task where id=v_id;
 end if;
 if v_task is not null then
   update public.tnt_tasks set title=trim(p_values->>'title'),description=p_values->>'description',materials=p_values->>'materials',
   task_type=coalesce(nullif(p_values->>'task_type',''),task_type),
   is_featured=case when p_values ? 'is_featured' then coalesce((p_values->>'is_featured')::boolean,false) else is_featured end,
   feature_color=coalesce(nullif(p_values->>'feature_color',''),feature_color),
   duration_minutes=(p_values->>'duration_minutes')::int,
   planned_start=(select (d.date+nullif(p_values->>'starts_at','')::time) at time zone 'America/Argentina/Buenos_Aires' from public.tnt_schedule_days d where d.id=p_day) where id=v_task;
   delete from public.tnt_task_assignees where task_id=v_task and not(person_id=any(coalesce(p_people,'{}'::uuid[])));
   insert into public.tnt_task_assignees(task_id,person_id) select v_task,x from unnest(coalesce(p_people,'{}'::uuid[])) x on conflict do nothing;
 end if;
 return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_save_task(p_id uuid, p_event uuid, p_values jsonb, p_people uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_parent uuid;
  v_start timestamptz;
  v_date date;
  v_day uuid;
  v_event public.tnt_events;
  v_mode text;
  v_people uuid[];
  v_old_people uuid[];
  v_existing boolean;
  v_manager boolean;
begin
  select * into v_event from public.tnt_events where id=p_event;
  if v_event.id is null or v_event.status='cancelled' then raise exception 'El encuentro ya no está disponible.'; end if;

  v_existing:=p_id is not null and exists(select 1 from public.tnt_tasks where id=p_id and event_id=p_event and archived_at is null);
  v_manager:=public.tnt_event_can_action(p_event,case when p_id is null then 'create_activity' else 'edit_activity' end);

  if p_id is null then
    if not v_manager then
      raise exception 'No tenés permiso para crear actividades.' using errcode='42501';
    end if;
  else
    if not v_existing then raise exception 'La actividad cambió. Volvé a abrirla.'; end if;
    if not v_manager then
      raise exception 'No tenés permiso para editar esta actividad.' using errcode='42501';
    end if;
  end if;

  if nullif(trim(p_values->>'title'),'') is null then
    raise exception 'La actividad necesita un nombre.';
  end if;

  v_parent:=nullif(p_values->>'parent_task_id','')::uuid;
  if v_parent is not null and (v_parent=p_id or not exists(select 1 from public.tnt_tasks where id=v_parent and event_id=p_event)) then
    raise exception 'La actividad principal no es válida.';
  end if;
  if p_id is not null and v_parent is not null and exists(
    with recursive descendants as(
      select id from public.tnt_tasks where parent_task_id=p_id
      union all
      select t.id from public.tnt_tasks t join descendants d on t.parent_task_id=d.id
    )
    select 1 from descendants where id=v_parent
  ) then
    raise exception 'Una actividad no puede depender de su propia subtarea.';
  end if;

  v_mode:=coalesce(nullif(p_values->>'assignee_mode',''),'single');
  if v_mode not in ('single','multiple') then v_mode:='single'; end if;

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into v_people
  from unnest(coalesce(p_people,'{}'::uuid[])) x;

  if v_mode='single' and cardinality(v_people)>1 then
    raise exception 'Esta actividad necesita una sola persona responsable.';
  end if;

  if p_id is not null then
    select coalesce(array_agg(person_id order by person_id),'{}'::uuid[]) into v_old_people
    from public.tnt_task_assignees
    where task_id=p_id and assignment_status<>'declined';
  else
    v_old_people:='{}'::uuid[];
  end if;

  if v_people is distinct from v_old_people
     and not public.tnt_event_can_action(p_event,'assign_people') then
    raise exception 'No tenés permiso para cambiar responsables.' using errcode='42501';
  end if;

  v_id:=coalesce(p_id,gen_random_uuid());
  v_start:=nullif(p_values->>'planned_start','')::timestamptz;
  v_date:=(v_start at time zone 'America/Argentina/Buenos_Aires')::date;

  if v_event.kind='saturday' and v_start is not null and v_date<>v_event.start_date then
    raise exception 'Las actividades de un sábado usan automáticamente la fecha del sábado.';
  end if;
  if v_date is not null and (v_date<v_event.start_date or v_date>v_event.end_date) then
    raise exception 'El horario de la actividad debe estar dentro de las fechas del encuentro.';
  end if;

  insert into public.tnt_tasks(
    id,event_id,parent_task_id,title,task_type,priority,description,materials,due_at,
    planned_start,duration_minutes,budget_estimated,sort_order,created_by,assignee_mode
  )
  values(
    v_id,p_event,v_parent,trim(p_values->>'title'),coalesce(p_values->>'task_type','simple'),
    coalesce(p_values->>'priority','medium'),p_values->>'description',p_values->>'materials',
    nullif(p_values->>'due_at','')::timestamptz,v_start,(p_values->>'duration_minutes')::int,
    (p_values->>'budget_estimated')::numeric,coalesce((p_values->>'sort_order')::int,0),
    public.tnt_current_person_id(),v_mode
  )
  on conflict(id) do update set
    parent_task_id=excluded.parent_task_id,
    title=excluded.title,
    task_type=excluded.task_type,
    priority=excluded.priority,
    description=excluded.description,
    materials=excluded.materials,
    due_at=excluded.due_at,
    planned_start=excluded.planned_start,
    duration_minutes=excluded.duration_minutes,
    budget_estimated=excluded.budget_estimated,
    assignee_mode=excluded.assignee_mode;

  update public.tnt_tasks set
    is_featured=case when p_values ? 'is_featured' then coalesce((p_values->>'is_featured')::boolean,false) else is_featured end,
    feature_color=coalesce(nullif(p_values->>'feature_color',''),feature_color)
  where id=v_id;

  delete from public.tnt_task_assignees
   where task_id=v_id and not(person_id=any(v_people));
  insert into public.tnt_task_assignees(task_id,person_id)
   select v_id,x from unnest(v_people) x on conflict do nothing;

  if v_date is not null then
    select id into v_day from public.tnt_schedule_days
     where event_id=p_event and date=v_date order by sort_order limit 1;
    if v_day is null then
      insert into public.tnt_schedule_days(event_id,label,date,sort_order)
      values(
        p_event,
        case when v_event.kind='saturday' then 'Sábado' else to_char(v_date,'DD/MM') end,
        v_date,
        (select count(*) from public.tnt_schedule_days where event_id=p_event)
      )
      returning id into v_day;
    end if;
    if not exists(select 1 from public.tnt_schedule_items where task_id=v_id) then
      insert into public.tnt_schedule_items(day_id,title,task_id,sort_order)
      values(v_day,trim(p_values->>'title'),v_id,(select count(*) from public.tnt_schedule_items where day_id=v_day));
    end if;
  end if;

  update public.tnt_schedule_items
     set day_id=coalesce(v_day,day_id),
         title=trim(p_values->>'title'),
         description=p_values->>'description',
         materials=p_values->>'materials',
         duration_minutes=(p_values->>'duration_minutes')::int,
         starts_at=(v_start at time zone 'America/Argentina/Buenos_Aires')::time
   where task_id=v_id;

  delete from public.tnt_schedule_responsibles
   where item_id in(select id from public.tnt_schedule_items where task_id=v_id)
     and not(person_id=any(v_people));
  insert into public.tnt_schedule_responsibles(item_id,person_id)
   select i.id,p from public.tnt_schedule_items i cross join unnest(v_people) p
   where i.task_id=v_id on conflict do nothing;

  return v_id;
end $function$;
