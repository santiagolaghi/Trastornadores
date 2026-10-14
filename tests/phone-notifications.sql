-- Exercise the actual activation RPC and ownership policies. Nothing is retained.
begin;
do $$
declare first_auth uuid := gen_random_uuid(); second_auth uuid := gen_random_uuid(); auth_id uuid; push_pid uuid;
begin
  insert into auth.users(id, email) values
    (first_auth, 'tnt-push-test-' || first_auth || '@example.invalid'),
    (second_auth, 'tnt-push-test-' || second_auth || '@example.invalid');
  foreach auth_id in array array[first_auth,second_auth] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_id,'role','authenticated')::text,true);
    perform public.tnt_ensure_account();
    select a.person_id into push_pid from public.tnt_accounts a where a.auth_user_id=auth_id;
    perform set_config('request.jwt.claims','{}',true);
    update public.tnt_people set full_name='TNT Push Test '||auth_id,first_name='TNT',last_name='Push Test',birthday='2000-01-01',sex='M',phone='1100000000',instagram='@tnt_test',profile_consent=true where id=push_pid;
    update public.tnt_accounts a set onboarding_completed_at=now(),staff_status='community' where a.person_id=push_pid;
    insert into public.tnt_profile_private_fields(person_id,dni) values(push_pid,'00000000') on conflict on constraint tnt_profile_private_fields_pkey do update set dni=excluded.dni;
    insert into public.tnt_profile_answers(person_id,answers) values(push_pid,'{"interests":["Música"],"studies":"Prueba","dreams":"Prueba","health":"Ninguna","efe_group":"none"}') on conflict on constraint tnt_profile_answers_pkey do update set answers=excluded.answers;
  end loop;
  perform set_config('tnt.push.first_auth', first_auth::text, true);
  perform set_config('tnt.push.second_auth', second_auth::text, true);
  perform set_config('tnt.push.endpoint', 'https://push.example.invalid/tnt-test/' || gen_random_uuid(), true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('tnt.push.first_auth'),'role','authenticated')::text,true);
select public.tnt_ensure_account();
do $$
declare ep text := current_setting('tnt.push.endpoint');
begin
  perform public.tnt_push_subscribe(jsonb_build_object('endpoint',ep,'keys',jsonb_build_object('auth','fixture','p256dh','first')));
  perform public.tnt_push_subscribe(jsonb_build_object('endpoint',ep,'keys',jsonb_build_object('auth','fixture','p256dh','updated')));
  if (select count(*) from public.tnt_push_subscriptions where endpoint=ep) <> 1 then
    raise exception 'Repeated activation created more than one subscription';
  end if;
  if not exists(select 1 from public.tnt_push_subscriptions where endpoint=ep and subscription#>>'{keys,p256dh}'='updated') then
    raise exception 'Activation did not update the device subscription';
  end if;
  begin
    perform public.tnt_push_subscribe('{}'::jsonb);
    raise exception 'Empty endpoint accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
do $$
declare first_test jsonb; repeated jsonb;
begin
 first_test:=public.tnt_push_test(current_setting('tnt.push.endpoint'));
 repeated:=public.tnt_push_test(current_setting('tnt.push.endpoint'));
 if first_test->>'id' is distinct from repeated->>'id' or first_test->>'status'<>'pending' then
  raise exception 'Double tap created duplicate tests or returned the wrong status';end if;
 if public.tnt_push_test_status((first_test->>'id')::uuid)->>'status'<>'pending' then
  raise exception 'Own queued test is not visible';end if;
 perform set_config('tnt.push.test_id',first_test->>'id',true);
end $$;
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('tnt.push.second_auth'),'role','authenticated')::text,true);
select public.tnt_ensure_account();
do $$
begin
  if exists(select 1 from public.tnt_push_subscriptions where endpoint=current_setting('tnt.push.endpoint')) then
    raise exception 'Another account can read the first account subscription';
  end if;
  perform public.tnt_push_unsubscribe(current_setting('tnt.push.endpoint'));
  begin
   perform public.tnt_push_test(current_setting('tnt.push.endpoint'));
   raise exception 'Another account can send a test to this device';
  exception when insufficient_privilege then null;end;
  begin
   perform public.tnt_push_test_status(current_setting('tnt.push.test_id')::uuid);
   raise exception 'Another account can see this test status';
  exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('tnt.push.first_auth'),'role','authenticated')::text,true);
do $$
begin
  if not exists(select 1 from public.tnt_push_subscriptions where endpoint=current_setting('tnt.push.endpoint')) then
    raise exception 'Another account removed the device subscription';
  end if;
  perform public.tnt_push_unsubscribe(current_setting('tnt.push.endpoint'));
  if exists(select 1 from public.tnt_push_subscriptions where endpoint=current_setting('tnt.push.endpoint')) then
    raise exception 'Own unsubscribe did not remove the device subscription';
  end if;
end $$;
do $$begin
 if public.tnt_push_test_status(current_setting('tnt.push.test_id')::uuid)->>'status'<>'skipped' then
  raise exception 'Unsubscribe left a test eligible for delivery';end if;
end $$;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$
begin
  begin
    perform public.tnt_push_subscribe('{"endpoint":"https://push.example.invalid/no-account"}'::jsonb);
    raise exception 'Unauthenticated activation accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$begin
 begin
  perform public.tnt_push_test(current_setting('tnt.push.endpoint'));
  raise exception 'Unauthenticated test accepted';
 exception when insufficient_privilege then null;end;
 begin
  perform public.tnt_push_test_status(current_setting('tnt.push.test_id')::uuid);
  raise exception 'Unauthenticated status accepted';
 exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.tnt_push_test(text)','execute')
  or has_function_privilege('anon','public.tnt_push_test_status(uuid)','execute') then
  raise exception 'Public caller can execute the phone test RPCs';end if;
end $$;
select 'activation, key update, device isolation, test rate limit, own test status, unsubscribe cancels test, unauthenticated rejection' as passed;
rollback;
