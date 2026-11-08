CREATE OR REPLACE FUNCTION public.tnt_create_saturday(p_date date, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid;v_actor uuid;
begin
 v_actor:=public.tnt_current_person_id();
 if auth.uid() is null or v_actor is null or not public.tnt_can_action('organizacion','create_saturday','*') then
  raise exception 'No tenés permiso para preparar sábados.' using errcode='42501';
 end if;
 if p_date is null or extract(dow from p_date)<>6 or p_date<(now() at time zone 'America/Argentina/Buenos_Aires')::date then
  raise exception 'Elegí un sábado que todavía no pasó.' using errcode='22023';
 end if;
 if length(trim(coalesce(p_name,'')))>100 then raise exception 'El nombre es demasiado largo.' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tnt-saturday:'||p_date::text,0));

 select id into v_id
 from public.tnt_events
 where kind='saturday' and start_date=p_date
 order by created_at desc
 limit 1;

 if v_id is not null then
   update public.tnt_events
   set status=case when status='cancelled' then 'planning' else status end,
       name=coalesce(nullif(trim(p_name),''),name),
       updated_at=now()
   where id=v_id;
 else
   insert into public.tnt_events(kind,name,start_date,end_date,created_by,auto_generated,status)
   values('saturday',coalesce(nullif(trim(p_name),''),'Sábado TNT'),p_date,p_date,v_actor,false,'planning')
   returning id into v_id;
 end if;

 -- El alta del encuentro puede haber incluido al creador como participante.
 insert into public.tnt_event_members(event_id,person_id,event_role)
 values(v_id,v_actor,'organizer')
 on conflict(event_id,person_id) do update set event_role=excluded.event_role
 where tnt_event_members.event_role is distinct from excluded.event_role;

 insert into public.tnt_schedule_days(event_id,label,date,sort_order)
 select v_id,'Sábado',p_date,0
 where not exists(select 1 from public.tnt_schedule_days where event_id=v_id and date=p_date);
 return v_id;
end $function$;
revoke all on function public.tnt_create_saturday(date,text) from public,anon;
grant execute on function public.tnt_create_saturday(date,text) to authenticated;
