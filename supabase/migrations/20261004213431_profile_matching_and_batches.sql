-- Name suggestions disclose only a name. Identity/history transfer remains reviewed.
create or replace function public.tnt_match_profile_names(p_name text,p_birthday date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();search text;begin
 if auth.uid() is null or pid is null then raise exception 'Iniciá sesión con tu cuenta.' using errcode='42501';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=pid and enabled and system_role<>'admin' and staff_status<>'approved') then return '[]';end if;
 search:=regexp_replace(translate(lower(trim(p_name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g');
 if length(search)<7 or length(p_name)>150 or array_length(regexp_split_to_array(trim(p_name),'\s+'),1)<2 then return '[]';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'full_name',full_name)),'[]') from (
  select p.id,p.full_name from public.tnt_people p where p.active and p.id<>pid
   and not exists(select 1 from public.tnt_accounts where person_id=p.id)
   and (p_birthday is null or p.birthday=p_birthday)
   and regexp_replace(translate(lower(p.full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g') like search||'%'
  order by length(p.full_name),p.full_name limit 3
 ) candidates);
end $$;
revoke all on function public.tnt_match_profile_names(text,date) from public,anon;
grant execute on function public.tnt_match_profile_names(text,date) to authenticated;

create or replace function public.tnt_bulk_profiles(p_ids uuid[],p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid;results jsonb:='[]';begin
 if not public.tnt_can_action('perfiles','delete','*') then raise exception 'No tenés permiso para gestionar estos perfiles.' using errcode='42501';end if;
 if p_action not in('archive','activate','delete','restore_deleted') or cardinality(p_ids)>100 then raise exception 'Elegí una acción y hasta 100 perfiles.';end if;
 for pid in select distinct unnest(p_ids) loop
  begin
   if p_action='delete' then perform public.tnt_delete_profile(pid);
   elsif p_action='restore_deleted' then perform public.tnt_restore_deleted_profile(pid);
   else perform public.tnt_set_profile_active(pid,p_action='activate');end if;
   results:=results||jsonb_build_array(jsonb_build_object('id',pid,'ok',true));
  exception when others then results:=results||jsonb_build_array(jsonb_build_object('id',pid,'ok',false,'error',sqlerrm));end;
 end loop;
 return results;
end $$;
revoke all on function public.tnt_bulk_profiles(uuid[],text) from public,anon;
grant execute on function public.tnt_bulk_profiles(uuid[],text) to authenticated;

CREATE OR REPLACE FUNCTION public.tnt_can_read_thread(p_thread uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select public.tnt_has_access('chat','*','view') and auth.uid() is not null and public.tnt_current_person_id() is not null and
 (public.tnt_is_admin() or (public.tnt_is_staff() and exists(select 1 from public.tnt_chat_threads t
  join public.tnt_chat_members m on m.thread_id=t.id where t.id=p_thread and not t.is_archived and m.person_id=public.tnt_current_person_id())))
$function$;
CREATE OR REPLACE FUNCTION public.tnt_set_assignment_response(p_task uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pid uuid; ev uuid; ttl text;
begin
 if not public.tnt_module_available('organizacion') or not public.tnt_profile_is_complete() then raise exception 'Organización no está disponible para tu cuenta.' using errcode='42501';end if;
 if not exists(select 1 from public.tnt_tasks t join public.tnt_events e on e.id=t.event_id where t.id=p_task and t.archived_at is null and e.status<>'cancelled') then raise exception 'La actividad ya no está disponible.';end if;
 if p_status not in ('read','accepted','declined') then raise exception 'Estado inválido'; end if;
 pid:=public.tnt_current_person_id(); if pid is null then raise exception 'Sin perfil TNT'; end if;
 update public.tnt_task_assignees set assignment_status=p_status,response_note=p_note,
 read_at=case when p_status in ('read','accepted','declined') then coalesce(read_at,now()) else read_at end,
 responded_at=case when p_status in ('accepted','declined') then now() else responded_at end
 where task_id=p_task and person_id=pid;
 if not found then raise exception 'No estás asignado a esta tarea'; end if;
 select event_id,title into ev,ttl from public.tnt_tasks where id=p_task;
 if p_status='declined' then
   update public.tnt_tasks set status='replacement' where id=p_task and status<>'completed';
   insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href)
   select em.person_id,'personal',ev,p_task,'Necesita reemplazo',(select coalesce(a.nickname,p.full_name) from public.tnt_people p left join public.tnt_accounts a on a.person_id=p.id where p.id=pid)||' no puede hacer '||ttl,'/organizacion/?task='||p_task
   from public.tnt_event_members em where em.event_id=ev and em.event_role='organizer';
 end if;
end $function$;
CREATE OR REPLACE FUNCTION public.tnt_community_home()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid:=public.tnt_current_person_id();
begin
 if pid is null or not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil para continuar' using errcode='42501';end if;
 return jsonb_build_object(
 'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (select id,name,start_date,end_date,location,kind from public.tnt_events
  where public.tnt_module_enabled('organizacion') and community_visible and status in('confirmed','live') and end_date>=current_date order by start_date limit 12) e),
 'news',(select coalesce(jsonb_agg(n),'[]') from jsonb_array_elements(coalesce((select value from public.tnt_settings where key='community_news'),'[]')) n where coalesce(n->>'audience','all')='all' or (n->>'audience'='staff' and (public.tnt_is_staff() or public.tnt_is_admin())) or (n->>'audience'='community' and not (public.tnt_is_staff() or public.tnt_is_admin()))),
 'efe',(select jsonb_build_object('name',g.name,'code',g.code,'leader',m.leader_name) from public.tnt_efe_memberships m join public.tnt_efe_groups g on g.id=m.group_id where m.person_id=pid and m.active order by m.id limit 1),
 'notes',(select coalesce(jsonb_agg(n),'[]') from public.tnt_my_notifications(false) n));
end $function$;


-- Recovering an activity never restores another encounter outside the actor's scope.
create or replace function public.tnt_archive_activities(p_ids uuid[],p_restore boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid;ev uuid;batch uuid:=gen_random_uuid();results jsonb:='[]';begin
 if cardinality(p_ids)>100 then raise exception 'Elegí hasta 100 actividades por vez.';end if;
 for pid in select distinct unnest(p_ids) loop
  begin
   select event_id into ev from public.tnt_tasks where id=pid;
   if ev is null or not public.tnt_event_can_action(ev,'delete_activity') then raise exception 'No tenés permiso para esta actividad.' using errcode='42501';end if;
   if p_restore then
    update public.tnt_tasks set archived_at=null,archive_batch=null where archive_batch=(select archive_batch from public.tnt_tasks where id=pid) and public.tnt_event_can_action(event_id,'delete_activity');
   else
    update public.tnt_tasks set archived_at=now(),archive_batch=batch where event_id=ev and archived_at is null and id in(with recursive sub as(select id from public.tnt_tasks where id=pid union all select t.id from public.tnt_tasks t join sub s on t.parent_task_id=s.id where t.event_id=ev) select id from sub);
   end if;
   results:=results||jsonb_build_array(jsonb_build_object('id',pid,'ok',true));
  exception when others then results:=results||jsonb_build_array(jsonb_build_object('id',pid,'ok',false,'error',sqlerrm));end;
 end loop;return results;
end $$;
