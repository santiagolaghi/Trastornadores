-- Give these two RPCs their own unexposed schema without broadening access to
-- existing private administration functions.
create schema if not exists tnt_phone;
revoke all on schema tnt_phone from public,anon;
grant usage on schema tnt_phone to authenticated;
alter function private.tnt_push_test(text) set schema tnt_phone;
alter function private.tnt_push_test_status(uuid) set schema tnt_phone;
create or replace function public.tnt_push_test(p_endpoint text) returns jsonb
language sql security invoker set search_path='' as $$select tnt_phone.tnt_push_test(p_endpoint)$$;
create or replace function public.tnt_push_test_status(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select tnt_phone.tnt_push_test_status(p_id)$$;
revoke all on function tnt_phone.tnt_push_test(text),tnt_phone.tnt_push_test_status(uuid),
 public.tnt_push_test(text),public.tnt_push_test_status(uuid) from public,anon;
grant execute on function tnt_phone.tnt_push_test(text),tnt_phone.tnt_push_test_status(uuid),
 public.tnt_push_test(text),public.tnt_push_test_status(uuid) to authenticated;
