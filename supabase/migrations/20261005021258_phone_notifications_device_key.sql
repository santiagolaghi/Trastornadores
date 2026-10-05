-- A device belongs to a TNT person. Repeat activation updates that same row.
-- The subscriptions table has no "active" column; unsubscribe removes the row.
create or replace function public.tnt_push_subscribe(p_subscription jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  pid uuid := public.tnt_current_person_id();
  ep text := nullif(p_subscription->>'endpoint', '');
begin
  if pid is null then
    raise exception 'Iniciá sesión.' using errcode = '42501';
  end if;
  if ep is null then
    raise exception 'Suscripción inválida.' using errcode = '22023';
  end if;
  insert into public.tnt_push_subscriptions(person_id, endpoint, subscription, updated_at)
  values (pid, ep, p_subscription, now())
  on conflict (person_id, endpoint) do update
    set subscription = excluded.subscription, updated_at = now();
end;
$$;
