create or replace function public.tnt_push_subscribe(p_subscription jsonb)
returns void language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
declare pid uuid := public.tnt_current_person_id(); ep text;
begin
  if pid is null then raise exception 'Iniciá sesión.' using errcode='42501'; end if;
  ep := nullif(p_subscription->>'endpoint','');
  if ep is null then raise exception 'Suscripción inválida.' using errcode='22023'; end if;
  insert into public.tnt_push_subscriptions(person_id,endpoint,subscription,updated_at)
  values(pid,ep,p_subscription,now())
  on conflict(person_id,endpoint) do update set subscription=excluded.subscription,active=true,updated_at=now();
end $$;
