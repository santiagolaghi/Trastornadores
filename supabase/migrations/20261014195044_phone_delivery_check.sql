-- A signed-in person can test only their own subscribed device. The privileged
-- queue access stays in the unexposed private schema; public RPCs are invokers.
create or replace function private.tnt_push_test(p_endpoint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); item public.tnt_push_outbox%rowtype; test_id uuid;
begin
 if auth.uid() is null or pid is null or not exists(
  select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
  where a.person_id=pid and a.enabled and p.active
 ) then raise exception 'Iniciá sesión con una cuenta habilitada' using errcode='42501';end if;
 -- Serialize requests for this device, including retries and double taps.
 perform 1 from public.tnt_push_subscriptions where person_id=pid and endpoint=p_endpoint for update;
 if not found then raise exception 'Activá los avisos en este teléfono antes de probarlos' using errcode='42501';end if;
 select * into item from public.tnt_push_outbox
 where person_id=pid and endpoint=p_endpoint and source_key like 'phone-test:%'
  and created_at>now()-interval '1 minute' order by created_at desc limit 1;
 if not found then
  test_id:=gen_random_uuid();
  insert into public.tnt_push_outbox(id,source_key,person_id,endpoint,payload)
  values(test_id,'phone-test:'||test_id,pid,p_endpoint,jsonb_build_object(
   'title','Prueba de avisos TNT','body','Este aviso llegó desde TNT. Ya podés recibir las novedades en este teléfono.',
   'url','/','tag','tnt-phone-test-'||test_id,'test_id',test_id)) returning * into item;
 end if;
 return jsonb_build_object('id',item.id,'status',item.status,'attempts',item.attempts,'sent_at',item.sent_at);
end $$;

create or replace function private.tnt_push_test_status(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); item public.tnt_push_outbox%rowtype;
begin
 if auth.uid() is null or pid is null then raise exception 'Iniciá sesión' using errcode='42501';end if;
 select * into item from public.tnt_push_outbox
 where id=p_id and person_id=pid and source_key like 'phone-test:%' and created_at>now()-interval '24 hours';
 if not found then raise exception 'Esta prueba no pertenece a tu cuenta o ya venció' using errcode='42501';end if;
 return jsonb_build_object('id',item.id,'status',item.status,'attempts',item.attempts,'sent_at',item.sent_at);
end $$;

create or replace function public.tnt_push_test(p_endpoint text) returns jsonb
language sql security invoker set search_path='' as $$select private.tnt_push_test(p_endpoint)$$;
create or replace function public.tnt_push_test_status(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.tnt_push_test_status(p_id)$$;

revoke all on function private.tnt_push_test(text),private.tnt_push_test_status(uuid),
 public.tnt_push_test(text),public.tnt_push_test_status(uuid) from public,anon;
grant execute on function private.tnt_push_test(text),private.tnt_push_test_status(uuid),
 public.tnt_push_test(text),public.tnt_push_test_status(uuid) to authenticated;
