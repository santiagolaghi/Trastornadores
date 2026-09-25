-- Harden only the functions introduced by TNT Organization v8.
-- Do not modify legacy EFE/Lista tables or functions here.

create or replace function public.tnt_touch_updated_at()
returns trigger
language plpgsql
set search_path=public
as $$ begin new.updated_at=now(); return new; end $$;

revoke all on function public.tnt_current_person_id() from public, anon;
revoke all on function public.tnt_is_admin() from public, anon;
revoke all on function public.tnt_is_pastor_or_admin() from public, anon;
revoke all on function public.tnt_can_manage_event(uuid) from public, anon;
revoke all on function public.tnt_is_task_assignee(uuid) from public, anon;
revoke all on function public.tnt_set_assignment_response(uuid,text,text) from public, anon;
revoke all on function public.tnt_set_task_status(uuid,text) from public, anon;
revoke all on function public.tnt_set_admin(uuid,boolean) from public, anon;
revoke all on function public.tnt_handle_new_user() from public, anon;
revoke all on function public.tnt_notify_assignment() from public, anon;
revoke all on function public.tnt_audit_task_changes() from public, anon;
revoke all on function public.tnt_notify_task_activity() from public, anon;
revoke all on function public.tnt_notify_schedule_change() from public, anon;
revoke all on function public.tnt_generate_daily_notifications() from public, anon;

grant execute on function public.tnt_current_person_id() to authenticated;
grant execute on function public.tnt_is_admin() to authenticated;
grant execute on function public.tnt_is_pastor_or_admin() to authenticated;
grant execute on function public.tnt_can_manage_event(uuid) to authenticated;
grant execute on function public.tnt_is_task_assignee(uuid) to authenticated;
grant execute on function public.tnt_set_assignment_response(uuid,text,text) to authenticated;
grant execute on function public.tnt_set_task_status(uuid,text) to authenticated;
grant execute on function public.tnt_set_admin(uuid,boolean) to authenticated;

revoke all on function public.tnt_handle_new_user() from authenticated;
revoke all on function public.tnt_notify_assignment() from authenticated;
revoke all on function public.tnt_audit_task_changes() from authenticated;
revoke all on function public.tnt_notify_task_activity() from authenticated;
revoke all on function public.tnt_notify_schedule_change() from authenticated;
revoke all on function public.tnt_generate_daily_notifications() from authenticated;