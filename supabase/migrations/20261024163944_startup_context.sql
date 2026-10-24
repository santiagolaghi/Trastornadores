-- One authenticated round trip for a fresh identity. Authorization is never cached
-- in the browser: all reads retain the caller's existing RLS policies.
create or replace function public.tnt_startup_context(p_sync boolean default false,p_continue boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 uid uuid:=auth.uid(); a public.tnt_accounts%rowtype; p public.tnt_people%rowtype;
 continuation jsonb:='{}'::jsonb; experience jsonb;
begin
 if uid is null then raise exception 'Iniciá sesión' using errcode='42501';end if;
 select * into a from public.tnt_accounts where auth_user_id=uid;
 if not found or p_sync then
  perform public.tnt_ensure_account();
  select * into a from public.tnt_accounts where auth_user_id=uid;
 end if;
 if a.person_id is null or not a.enabled then
  raise exception 'Tu cuenta no está habilitada. Consultá con un administrador.' using errcode='42501';
 end if;
 if p_continue then
  -- Matching is optional, as in the existing client. A failed match must not
  -- prevent an otherwise valid account from opening TNT.
  begin
   continuation:=public.tnt_continue_profile(null,'{}'::jsonb,false);
  exception when others then
   continuation:=jsonb_build_object('linked',false,'error',sqlerrm);
  end;
  select * into a from public.tnt_accounts where auth_user_id=uid;
 end if;
 select * into p from public.tnt_people where id=a.person_id;
 if p.id is null or not p.active then
  raise exception 'Tu perfil no está disponible. Consultá con un administrador.' using errcode='42501';
 end if;
 select jsonb_build_object('config',config,'revision',revision) into experience
 from public.tnt_experience where id=true;
 return jsonb_build_object(
  'account',to_jsonb(a),'person',to_jsonb(p),'profile',public.tnt_profile_context(),
  'grants',coalesce((select jsonb_agg(to_jsonb(g)) from public.tnt_access_grants g where person_id=a.person_id),'[]'::jsonb),
  'legacy',coalesce((select jsonb_agg(to_jsonb(g)) from public.tnt_module_access g where person_id=a.person_id),'[]'::jsonb),
  'role_permissions',coalesce((select jsonb_agg(to_jsonb(g)) from public.tnt_role_permission_presets g where role=a.ministry_role),'[]'::jsonb),
  'person_permissions',coalesce((select jsonb_agg(to_jsonb(g)) from public.tnt_person_permission_overrides g where person_id=a.person_id and archived_at is null),'[]'::jsonb),
  'experience',coalesce(experience,'{}'::jsonb),'continuation',continuation,
  'reading',coalesce((select reading from public.tnt_community_preferences where person_id=a.person_id),'{}'::jsonb));
end $$;
revoke all on function public.tnt_startup_context(boolean,boolean) from public,anon;
grant execute on function public.tnt_startup_context(boolean,boolean) to authenticated;

-- The home screen needs one coherent activity snapshot, not nine concurrent
-- requests competing for database connections. Every table still uses RLS.
create or replace function public.tnt_home_context()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.tnt_profile_is_complete()
  or not (public.tnt_is_staff() or public.tnt_is_admin()) then
  raise exception 'Este espacio requiere un perfil habilitado del equipo.' using errcode='42501';
 end if;
 return jsonb_build_object(
  'events',coalesce((select jsonb_agg(to_jsonb(e)) from public.tnt_events e where status<>'cancelled'),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t)) from public.tnt_tasks t where archived_at is null
   and exists(select 1 from public.tnt_events e where e.id=t.event_id and e.status<>'cancelled')),'[]'::jsonb),
  'assignees',coalesce((select jsonb_agg(to_jsonb(a)) from public.tnt_task_assignees a
   where exists(select 1 from public.tnt_tasks t where t.id=a.task_id and t.archived_at is null)),'[]'::jsonb),
  'days',coalesce((select jsonb_agg(to_jsonb(d)) from public.tnt_schedule_days d),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(to_jsonb(i)) from public.tnt_schedule_items i where archived_at is null),'[]'::jsonb),
  'responsibles',coalesce((select jsonb_agg(to_jsonb(r)) from public.tnt_schedule_responsibles r),'[]'::jsonb),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'active',active)) from public.tnt_people),'[]'::jsonb),
  'accounts',coalesce((select jsonb_agg(jsonb_build_object('person_id',person_id,'nickname',nickname,'avatar_url',avatar_url)) from public.tnt_accounts),'[]'::jsonb),
  'members',coalesce((select jsonb_agg(to_jsonb(m)) from public.tnt_event_members m),'[]'::jsonb));
end $$;
revoke all on function public.tnt_home_context() from public,anon;
grant execute on function public.tnt_home_context() to authenticated;
notify pgrst,'reload schema';
