-- Active account attendance and automatic Saturday defaults.
CREATE OR REPLACE FUNCTION public.tnt_mark_attendance(p_mode text, p_person uuid, p_date date, p_status text, p_group uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid:=public.tnt_current_person_id();
  v_actor_name text;
  v_scope text;
  v_old text;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Iniciá sesión.' USING errcode='42501';
  END IF;

  IF p_status NOT IN ('present','absent','pending') THEN
    RAISE EXCEPTION 'Estado inválido.' USING errcode='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tnt_people p JOIN public.tnt_accounts a ON a.person_id=p.id WHERE p.id=p_person AND p.active AND a.enabled AND a.auth_user_id IS NOT NULL AND NOT (coalesce(p.data_notes,'{}'::jsonb) ? 'deleted_at') AND NOT (coalesce(p.data_notes,'{}'::jsonb) ? 'linked_to')
  ) THEN
    RAISE EXCEPTION 'La persona ya no está activa.' USING errcode='22023';
  END IF;

  SELECT full_name INTO v_actor_name
  FROM public.tnt_people WHERE id=v_actor;

  IF p_mode='efe' THEN
    SELECT code INTO v_scope FROM public.tnt_efe_groups WHERE id=p_group;

    IF v_scope IS NULL
       OR NOT public.tnt_can_action('efe','attendance',v_scope) THEN
      RAISE EXCEPTION 'No tenés permiso para pasar lista en este EFE.'
        USING errcode='42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.tnt_efe_meetings
      WHERE group_id=p_group AND meeting_date=p_date AND active
    ) THEN
      RAISE EXCEPTION 'Este miércoles no está activo. Elegí otro encuentro.'
        USING errcode='22023';
    END IF;


    SELECT status INTO v_old
    FROM public.tnt_efe_wednesday_attendance
    WHERE person_id=p_person AND group_id=p_group AND wednesday_date=p_date;

    INSERT INTO public.tnt_efe_wednesday_attendance(
      person_id,group_id,wednesday_date,status,taken_by,updated_at
    )
    VALUES(p_person,p_group,p_date,p_status,v_actor_name,now())
    ON CONFLICT(person_id,group_id,wednesday_date) DO UPDATE
    SET status=excluded.status,
      taken_by=excluded.taken_by,updated_at=now()
    RETURNING id INTO v_id;

  ELSIF p_mode='sabados' THEN
    IF NOT (
      public.tnt_is_admin()
      OR public.tnt_can_action('lista-sabados','attendance','*')
    ) THEN
      RAISE EXCEPTION 'No tenés permiso para pasar la lista del sábado.'
        USING errcode='42501';
    END IF;


    SELECT status INTO v_old
    FROM public.tnt_saturday_attendance
    WHERE person_id=p_person AND saturday_date=p_date;

    INSERT INTO public.tnt_saturday_attendance(
      person_id,saturday_date,status,taken_by,updated_at
    )
    VALUES(p_person,p_date,p_status,v_actor_name,now())
    ON CONFLICT(person_id,saturday_date) DO UPDATE
    SET status=excluded.status,
      taken_by=excluded.taken_by,updated_at=now()
    RETURNING id INTO v_id;

  ELSE
    RAISE EXCEPTION 'Submódulo inválido.' USING errcode='22023';
  END IF;

  IF v_old IS DISTINCT FROM p_status THEN
    INSERT INTO public.tnt_attendance_audit(
      mode,person_id,group_id,attendance_date,
      from_status,to_status,actor_person_id
    )
    VALUES(
      p_mode,p_person,
      CASE WHEN p_mode='efe' THEN p_group ELSE NULL END,
      p_date,v_old,p_status,v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'id',v_id,'status',p_status,
    'taken_by',v_actor_name,'updated_at',now()
  );
END;
$function$
;
-- Keep upcoming Saturdays complete without rewriting previous encounters.
create or replace function tnt_actions.sync_saturday_staff() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.tnt_event_members(event_id,person_id,event_role,include_in_groups)
 select e.id,p.id,'participant',false
 from public.tnt_events e cross join public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
 where e.kind='saturday' and e.end_date>=current_date and e.status<>'cancelled'
   and p.active and a.enabled and (a.staff_status='approved' or a.system_role='admin')
 on conflict(event_id,person_id) do nothing;
 return null;
end $$;
revoke all on function tnt_actions.sync_saturday_staff() from public,anon,authenticated;
create trigger tnt_active_saturday_event after insert or update of kind,start_date,end_date on public.tnt_events
for each statement execute function tnt_actions.sync_saturday_staff();
create trigger tnt_active_saturday_account after insert or update of enabled,staff_status,system_role on public.tnt_accounts
for each statement execute function tnt_actions.sync_saturday_staff();
create trigger tnt_active_saturday_person after update of active on public.tnt_people
for each statement execute function tnt_actions.sync_saturday_staff();

insert into public.tnt_event_members(event_id,person_id,event_role,include_in_groups)
select e.id,p.id,'participant',false from public.tnt_events e cross join public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
where e.kind='saturday' and e.end_date>=current_date and e.status<>'cancelled'
 and p.active and a.enabled and (a.staff_status='approved' or a.system_role='admin')
on conflict(event_id,person_id) do nothing;


create or replace function public.tnt_profile_purge_available() returns boolean
language sql stable security invoker set search_path='' as $$
 select public.tnt_is_admin() and public.tnt_can_action('perfiles','delete','*')
   and to_regprocedure('tnt_actions.purge_profile(uuid,text)') is not null
$$;
revoke all on function public.tnt_profile_purge_available() from public,anon;
grant execute on function public.tnt_profile_purge_available() to authenticated;
notify pgrst,'reload schema';
