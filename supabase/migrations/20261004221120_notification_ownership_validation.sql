create or replace function public.tnt_notification_action(p_ids uuid[],p_action text) returns integer language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); count_done integer;begin
 if pid is null or not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil para continuar.' using errcode='42501';end if;
 if p_action not in('read','dismiss','restore') or cardinality(p_ids)>200 then raise exception 'Acción no válida.';end if;
 if exists(select 1 from unnest(p_ids) wanted(id) where not exists(select 1 from public.tnt_notifications n where n.id=wanted.id and public.tnt_notification_visible_for(n,pid))) then raise exception 'Una notificación no pertenece a tu cuenta.' using errcode='42501';end if;
 insert into public.tnt_notification_state(notification_id,person_id,read_at,dismissed_at) select id,pid,case when p_action='read' then now() end,case when p_action='dismiss' then now() end from unnest(p_ids) id
 on conflict(notification_id,person_id) do update set read_at=case when p_action='read' then now() else public.tnt_notification_state.read_at end,dismissed_at=case when p_action='dismiss' then now() when p_action='restore' then null else public.tnt_notification_state.dismissed_at end;
 get diagnostics count_done=row_count;return count_done;
end $$;

