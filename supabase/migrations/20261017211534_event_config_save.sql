CREATE OR REPLACE FUNCTION public.tnt_update_event_config(p_event uuid, p_values jsonb, p_days jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_event public.tnt_events;
  v_name text;
  v_start date;
  v_end date;
  v_status text;
  v_ids uuid[];
  v_bad uuid;
  x jsonb;
  v_ord bigint;
  v_day_date date;
begin
  select * into v_event from public.tnt_events where id=p_event;
  if v_event.id is null then raise exception 'El encuentro ya no existe.' using errcode='22023'; end if;
  if not public.tnt_can_manage_event(p_event) then
    raise exception 'No tenés permiso para editar este encuentro.' using errcode='42501';
  end if;

  v_name:=coalesce(nullif(trim(p_values->>'name'),''),v_event.name);
  v_start:=case when v_event.kind='saturday' then v_event.start_date else coalesce(nullif(p_values->>'start_date','')::date,v_event.start_date) end;
  v_end:=case when v_event.kind='saturday' then v_event.end_date else coalesce(nullif(p_values->>'end_date','')::date,v_start) end;
  v_status:=coalesce(nullif(p_values->>'status',''),v_event.status);

  if v_end<v_start then raise exception 'Revisá el intervalo de fechas.' using errcode='22023'; end if;
  if v_status not in ('planning','confirmed','live','completed','cancelled') then raise exception 'Estado no válido.' using errcode='22023'; end if;

  if v_event.kind<>'saturday' then
    if p_days is null then p_days:='[]'::jsonb; end if;
    if jsonb_typeof(p_days)<>'array' then raise exception 'La configuración de días no es válida.' using errcode='22023'; end if;
    for x,v_ord in select value,ordinality from jsonb_array_elements(p_days) with ordinality loop
      v_day_date:=nullif(x->>'date','')::date;
      if v_day_date is not null and (v_day_date<v_start or v_day_date>v_end) then
        raise exception 'El día % queda fuera de las fechas del evento.',coalesce(nullif(x->>'label',''),'Día '||v_ord::text) using errcode='22023';
      end if;
    end loop;

    select coalesce(array_agg((d->>'id')::uuid),'{}'::uuid[]) into v_ids
    from jsonb_array_elements(p_days) d where nullif(d->>'id','') is not null;

    select sd.id into v_bad
    from public.tnt_schedule_days sd
    where sd.event_id=p_event and not(sd.id=any(v_ids))
      and exists(select 1 from public.tnt_schedule_items i where i.day_id=sd.id)
    limit 1;
    if v_bad is not null then
      raise exception 'No podés borrar un día que todavía tiene actividades. Movelas o eliminálas primero.' using errcode='22023';
    end if;
  end if;

  update public.tnt_events set
    name=v_name,
    description=nullif(trim(p_values->>'description'),''),
    location=nullif(trim(p_values->>'location'),''),
    start_date=v_start,
    end_date=v_end,
    status=v_status,
    community_visible=case when p_values ? 'community_visible' then (p_values->>'community_visible')::boolean else community_visible end,
    updated_at=now()
  where id=p_event;

  if v_event.kind='saturday' then
    delete from public.tnt_schedule_days d
    where d.event_id=p_event and d.date<>v_start
      and not exists(select 1 from public.tnt_schedule_items i where i.day_id=d.id);
    insert into public.tnt_schedule_days(event_id,label,date,sort_order)
    select p_event,'Sábado',v_start,0
    where not exists(select 1 from public.tnt_schedule_days where event_id=p_event and date=v_start);
    update public.tnt_schedule_days set label='Sábado',sort_order=0
    where event_id=p_event and date=v_start;
  else
    delete from public.tnt_schedule_days d
    where d.event_id=p_event and not(d.id=any(v_ids))
      and not exists(select 1 from public.tnt_schedule_items i where i.day_id=d.id);

    insert into public.tnt_schedule_days(id,event_id,label,date,sort_order)
    select coalesce(nullif(a.d->>'id','')::uuid,gen_random_uuid()),p_event,
           coalesce(nullif(trim(a.d->>'label'),''),'Día '||a.ord::text),
           nullif(a.d->>'date','')::date,a.ord-1
    from jsonb_array_elements(p_days) with ordinality a(d,ord)
    where nullif(a.d->>'id','') is null;

    update public.tnt_schedule_days sd
    set label=coalesce(nullif(trim(a.d->>'label'),''),sd.label),
        date=nullif(a.d->>'date','')::date,
        sort_order=a.ord-1
    from jsonb_array_elements(p_days) with ordinality a(d,ord)
    where nullif(a.d->>'id','') is not null
      and sd.id=(a.d->>'id')::uuid
      and sd.event_id=p_event;
  end if;

  return p_event;
end $function$;
