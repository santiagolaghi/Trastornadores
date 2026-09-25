-- Remove anonymous access to user-facing SECURITY DEFINER functions.
revoke all on function public.tnt_create_event_from_template(uuid,text,date,date,text,text) from public, anon;
revoke all on function public.tnt_create_saturday(date,text) from public, anon;
revoke all on function public.tnt_generate_personal_reminders() from public, anon;
revoke all on function public.tnt_touch_last_seen() from public, anon;
grant execute on function public.tnt_create_event_from_template(uuid,text,date,date,text,text) to authenticated;
grant execute on function public.tnt_create_saturday(date,text) to authenticated;
grant execute on function public.tnt_generate_personal_reminders() to authenticated;
grant execute on function public.tnt_touch_last_seen() to authenticated;
