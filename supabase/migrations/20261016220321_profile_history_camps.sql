create function tnt_actions.merge_profile_camps(p_source uuid,p_target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare src public.tnt_people%rowtype;dst public.tnt_people%rowtype;history jsonb:='[]';camp record;child record;rows_before jsonb;
begin
 select * into src from public.tnt_people where id=p_source;select * into dst from public.tnt_people where id=p_target;
 -- A duplicate camp registration is archived, with financial rows moved to the active one.
 -- Clinical text is combined, not overwritten. Both original health rows remain in the audit.
 for camp in select s.id as source_id,d.id as target_id from public.tnt_camp_registrations s join public.tnt_camp_registrations d on d.camp_id=s.camp_id and d.person_id=dst.id and d.deleted_at is null where s.person_id=src.id and s.deleted_at is null loop
  for child in select t.relname as table_name,a.attname as column_name from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.contype='f' and c.confrelid='public.tnt_camp_registrations'::regclass and n.nspname='public' loop
   execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where %I in($1,$2)',child.table_name,child.column_name) into rows_before using camp.source_id,camp.target_id;
   history:=history||jsonb_build_array(jsonb_build_object('table',child.table_name,'column',child.column_name,'rows',rows_before));
   if child.table_name not in('tnt_camp_health','tnt_camp_assignments','tnt_camp_penalties') then
    execute format('update public.%I set %I=$1 where %I=$2',child.table_name,child.column_name,child.column_name) using camp.target_id,camp.source_id;
   end if;
  end loop;
  insert into public.tnt_camp_health(registration_id,allergies,conditions,medication,dietary,emergency_name,emergency_phone)
   select camp.target_id,allergies,conditions,medication,dietary,emergency_name,emergency_phone from public.tnt_camp_health where registration_id=camp.source_id
   on conflict(registration_id) do update set
    allergies=case when public.tnt_camp_health.allergies=excluded.allergies then excluded.allergies else concat_ws(E'\n',nullif(public.tnt_camp_health.allergies,''),nullif(excluded.allergies,'')) end,
    conditions=case when public.tnt_camp_health.conditions=excluded.conditions then excluded.conditions else concat_ws(E'\n',nullif(public.tnt_camp_health.conditions,''),nullif(excluded.conditions,'')) end,
    medication=case when public.tnt_camp_health.medication=excluded.medication then excluded.medication else concat_ws(E'\n',nullif(public.tnt_camp_health.medication,''),nullif(excluded.medication,'')) end,
    dietary=case when public.tnt_camp_health.dietary=excluded.dietary then excluded.dietary else concat_ws(E'\n',nullif(public.tnt_camp_health.dietary,''),nullif(excluded.dietary,'')) end,
    emergency_name=coalesce(nullif(excluded.emergency_name,''),public.tnt_camp_health.emergency_name),emergency_phone=coalesce(nullif(excluded.emergency_phone,''),public.tnt_camp_health.emergency_phone);
  insert into public.tnt_camp_assignments(registration_id,kind,resource_id) select camp.target_id,kind,resource_id from public.tnt_camp_assignments where registration_id=camp.source_id on conflict do nothing;
  update public.tnt_camp_penalties s set registration_id=camp.target_id where s.registration_id=camp.source_id and not exists(select 1 from public.tnt_camp_penalties d where d.registration_id=camp.target_id and d.installment_id is not distinct from s.installment_id and d.reason=s.reason);
  update public.tnt_camp_registrations d set notes=concat_ws(E'\n',nullif(d.notes,''),nullif(s.notes,'')),admin_notes=concat_ws(E'\n',nullif(d.admin_notes,''),nullif(s.admin_notes,'')),answers=s.answers||d.answers,"authorization"=d."authorization" or s."authorization",checked_in_at=coalesce(d.checked_in_at,s.checked_in_at),checked_out_at=coalesce(d.checked_out_at,s.checked_out_at) from public.tnt_camp_registrations s where s.id=camp.source_id and d.id=camp.target_id;
  update public.tnt_camp_registrations set deleted_at=now(),admin_notes=concat_ws(E'\n',admin_notes,'Perfil vinculado. Inscripción activa: '||camp.target_id) where id=camp.source_id;
 end loop;


 return history;
end $$;
revoke all on function tnt_actions.merge_profile_camps(uuid,uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
