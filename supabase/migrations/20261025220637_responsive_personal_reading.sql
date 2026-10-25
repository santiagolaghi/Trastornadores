-- Scope denials, community birthdays and identifying notifications.
CREATE OR REPLACE FUNCTION public.tnt_has_access(p_module text, p_scope text DEFAULT '*'::text, p_min_level text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pid uuid;
  v_role text;
  v_staff text;
  v_system text;
  v_override boolean;
  v_role_view boolean;
begin
  if p_min_level not in ('none','view','user','edit','editor','manage','manager','admin') then
    return public.tnt_can_action(p_module,p_min_level,p_scope);
  end if;
  if not public.tnt_module_available(p_module) then return false; end if;
  v_pid:=public.tnt_current_person_id();
  if v_pid is null or not public.tnt_profile_is_complete() then return false; end if;

  select ministry_role,staff_status,system_role
  into v_role,v_staff,v_system
  from public.tnt_accounts
  where person_id=v_pid and enabled
  limit 1;

  if v_system is null or (v_system<>'admin' and v_staff is distinct from 'approved') then return false; end if;
  if v_system='admin' and p_module<>'efe' then return true; end if;

  -- A deliberately disabled scope wins over a role's default view permission.
  if p_module='efe' and exists(select 1 from public.tnt_access_grants g
   where g.person_id=v_pid and g.module=p_module and (g.scope=p_scope or (g.scope='*' and not exists(select 1 from public.tnt_access_grants x where x.person_id=v_pid and x.module=p_module and x.scope=p_scope)))
   and (not g.enabled or public.tnt_access_rank(g.access_level)=0)) then return false;end if;

    select o.allowed into v_override
    from public.tnt_person_permission_overrides o
    where o.archived_at is null and o.person_id=v_pid
      and o.module=p_module
      and o.action='view'
      and o.scope in (p_scope,'*')
    order by case when o.scope=p_scope then 0 else 1 end
    limit 1;
    if found then
      if not v_override then return false; end if;
      if public.tnt_access_rank(p_min_level)<=1 then return true; end if;
    end if;

    if v_override is null and v_staff='approved' then
      select rp.allowed into v_role_view
      from public.tnt_role_permission_presets rp
      where rp.role=v_role
        and rp.module=p_module
        and rp.action='view'
        and rp.scope in (p_scope,'*')
      order by case when rp.scope=p_scope then 0 else 1 end
      limit 1;
      if found then
        if not v_role_view then return false; end if;
        if public.tnt_access_rank(p_min_level)<=1 then return true; end if;
      end if;
    end if;

  return (v_system='admin' or v_staff='approved') and (
    (p_module='chat' and v_staff='approved' and public.tnt_access_rank(p_min_level)<=1)
    or exists(
      select 1 from public.tnt_access_grants g
      where g.person_id=v_pid
        and g.module=p_module
        and g.enabled
        and (
          g.scope=p_scope
          or (
            g.scope='*'
            and not exists(
              select 1 from public.tnt_access_grants exact
              where exact.person_id=g.person_id
                and exact.module=g.module
                and exact.scope=p_scope
            )
          )
        )
        and (g.valid_from is null or g.valid_from<=now())
        and (g.valid_until is null or g.valid_until>=now())
        and public.tnt_access_rank(g.access_level)>=public.tnt_access_rank(p_min_level)
    )
    or (
      p_module<>'efe'
      and exists(
        select 1 from public.tnt_module_access m
        where m.person_id=v_pid
          and m.module=p_module
          and m.enabled
          and not exists(
            select 1 from public.tnt_access_grants g
            where g.person_id=m.person_id
              and g.module=p_module
              and g.scope='*'
          )
          and public.tnt_access_rank(
            case m.access_level
              when 'manager' then 'manage'
              when 'editor' then 'edit'
              else 'view'
            end
          )>=public.tnt_access_rank(p_min_level)
      )
    )
  );
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_can_action(p_module text, p_action text, p_scope text DEFAULT '*'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pid uuid;
  v_role text;
  v_staff text;
  v_system text;
  v_allowed boolean;
  v_required text;
begin
  if not public.tnt_module_available(p_module) then return false; end if;
  v_pid:=public.tnt_current_person_id();
  if v_pid is null or not public.tnt_profile_is_complete() then return false; end if;
  select ministry_role,staff_status,system_role into v_role,v_staff,v_system
  from public.tnt_accounts where person_id=v_pid and enabled limit 1;

  if v_system='admin' and p_module<>'efe' then return true; end if;
  if p_action='view' then return public.tnt_has_access(p_module,p_scope,'view'); end if;
  if not public.tnt_has_access(p_module,p_scope,'view') then return false; end if;

  select o.allowed into v_allowed
  from public.tnt_person_permission_overrides o
  where o.archived_at is null and o.person_id=v_pid and o.module=p_module and o.action=p_action
    and o.scope in (p_scope,'*')
  order by case when o.scope=p_scope then 0 else 1 end
  limit 1;
  if found then return v_allowed; end if;
  if v_system='admin' then return true;end if;

  select rp.allowed into v_allowed
  from public.tnt_role_permission_presets rp
  where rp.role=v_role and rp.module=p_module and rp.action=p_action
    and rp.scope in (p_scope,'*')
  order by case when rp.scope=p_scope then 0 else 1 end
  limit 1;
  if found then return v_allowed; end if;

  v_required:=case
    when p_action in ('edit','attendance','send_message','update_own_activity','create_activity','edit_activity','assign_people','edit_people','sell','edit_stock') then 'edit'
    when p_action in ('manage','create_saturday','edit_event','manage_people','templates','create_chat','manage_members','delete_chat','history','reports','delete','delete_activity','delete_event') then 'manage'
    else null
  end;
  if v_required is null then return false; end if;
  return public.tnt_has_access(p_module,p_scope,v_required);
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_ensure_efe_wednesdays(p_group uuid, p_from date, p_to date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope text;
  v_count integer:=0;
begin
  select code into v_scope from public.tnt_efe_groups where id=p_group;
  if v_scope is null then raise exception 'EFE no encontrado.' using errcode='22023'; end if;
  if not (public.tnt_has_access('efe',v_scope,'view')) then
    raise exception 'No tenés acceso a este EFE.' using errcode='42501';
  end if;
  if p_from is null or p_to is null or p_to<p_from then
    raise exception 'Rango de fechas inválido.' using errcode='22023';
  end if;

  with dates as (
    select d::date as day
    from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
    where extract(isodow from d)=3
  ), ins as (
    insert into public.tnt_efe_meetings(group_id,scheduled_date,meeting_date,title,active,auto_generated)
    select p_group,day,day,'Miércoles EFE',true,true
    from dates
    on conflict(group_id,scheduled_date) do nothing
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_update_efe_meeting(p_meeting uuid, p_date date, p_title text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m public.tnt_efe_meetings;
  v_scope text;
  v_title text;
begin
  select * into m from public.tnt_efe_meetings where id=p_meeting;
  if m.id is null then raise exception 'Miércoles no encontrado.' using errcode='22023'; end if;
  select code into v_scope from public.tnt_efe_groups where id=m.group_id;
  if not (public.tnt_can_action('efe','manage_meetings',v_scope)) then
    raise exception 'No tenés permiso para editar los miércoles de este EFE.' using errcode='42501';
  end if;
  if p_date is null then raise exception 'Elegí una fecha.' using errcode='22023'; end if;

  if exists(
    select 1 from public.tnt_efe_meetings x
    where x.group_id=m.group_id and x.active and x.id<>m.id and x.meeting_date=p_date
  ) then raise exception 'Ya existe otro encuentro de este EFE en esa fecha.' using errcode='23505'; end if;

  if p_date<>m.meeting_date and (
    exists(select 1 from public.tnt_efe_wednesday_attendance where group_id=m.group_id and wednesday_date=p_date)
    or exists(select 1 from public.tnt_efe_followups where group_id=m.group_id and wednesday_date=p_date)
  ) then raise exception 'Esa fecha ya tiene datos de asistencia o seguimiento.' using errcode='23505'; end if;

  if p_date<>m.meeting_date then
    update public.tnt_efe_wednesday_attendance
      set wednesday_date=p_date,updated_at=now()
      where group_id=m.group_id and wednesday_date=m.meeting_date;
    update public.tnt_efe_followups
      set wednesday_date=p_date,updated_at=now()
      where group_id=m.group_id and wednesday_date=m.meeting_date;
    update public.tnt_attendance_audit
      set attendance_date=p_date
      where mode='efe' and group_id=m.group_id and attendance_date=m.meeting_date;
  end if;

  v_title:=coalesce(nullif(trim(p_title),''),'Miércoles EFE');
  update public.tnt_efe_meetings
  set meeting_date=p_date,title=v_title,updated_at=now()
  where id=m.id;
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_delete_efe_meeting(p_meeting uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m public.tnt_efe_meetings;
  v_scope text;
begin
  select * into m from public.tnt_efe_meetings where id=p_meeting;
  if m.id is null then raise exception 'Miércoles no encontrado.' using errcode='22023'; end if;
  select code into v_scope from public.tnt_efe_groups where id=m.group_id;
  if not (public.tnt_can_action('efe','manage_meetings',v_scope)) then
    raise exception 'No tenés permiso para eliminar los miércoles de este EFE.' using errcode='42501';
  end if;
  update public.tnt_efe_meetings set active=false,updated_at=now() where id=m.id;
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_restore_efe_meeting(p_meeting uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m public.tnt_efe_meetings;
  v_scope text;
begin
  select * into m from public.tnt_efe_meetings where id=p_meeting;
  if m.id is null then raise exception 'Miércoles no encontrado.' using errcode='22023'; end if;
  select code into v_scope from public.tnt_efe_groups where id=m.group_id;
  if not (public.tnt_can_action('efe','manage_meetings',v_scope)) then
    raise exception 'No tenés permiso para restaurar los miércoles de este EFE.' using errcode='42501';
  end if;
  if exists(
    select 1 from public.tnt_efe_meetings x
    where x.group_id=m.group_id and x.active and x.id<>m.id and x.meeting_date=m.meeting_date
  ) then raise exception 'Ya existe otro encuentro activo en esa fecha.' using errcode='23505'; end if;
  update public.tnt_efe_meetings set active=true,updated_at=now() where id=m.id;
end $function$;

CREATE OR REPLACE FUNCTION tnt_actions.community_bootstrap()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid:=public.tnt_current_person_id();result jsonb;manage boolean;begin
 if auth.uid() is null or not tnt_actions.community_active_person(pid) then raise exception 'Iniciá sesión con tu perfil completo.' using errcode='42501';end if;
 perform tnt_actions.community_ensure_day();
 select exists(select 1 from public.tnt_community_modules m where tnt_actions.community_can_for(pid,m.id,1)) into manage;
 result=jsonb_build_object(
 'community_size',(select count(distinct a.auth_user_id) from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id where a.enabled and p.active and a.auth_user_id is not null),
 'modules',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('permission',case when tnt_actions.community_can_for(pid,m.id,3) then 3 when tnt_actions.community_can_for(pid,m.id,2) then 2 when tnt_actions.community_can_for(pid,m.id,1) then 1 else 0 end) order by m.id),'[]') from public.tnt_community_modules m where m.enabled or tnt_actions.community_can_for(pid,m.id,1)),
 'content',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('people',case when tnt_actions.community_can_for(pid,c.module,1) then coalesce((select jsonb_agg(person_id) from public.tnt_community_audience x where x.content_id=c.id),'[]') else '[]'::jsonb end) order by c.created_at desc),'[]') from public.tnt_community_content c where tnt_actions.community_content_visible(c.id,pid)),
 'enrollments',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.tnt_community_enrollments e join public.tnt_community_content c on c.id=e.content_id where (e.person_id=pid or tnt_actions.community_can_for(pid,c.module,3)) and tnt_actions.community_content_visible(c.id,pid)),
 'polls',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'mine',(select option_index from public.tnt_community_votes where content_id=c.id and person_id=pid),'counts',case when coalesce(c.config->>'results','after_vote')='after_close' and (c.ends_at is null or c.ends_at>now()) and not tnt_actions.community_can_for(pid,'polls',3) or coalesce(c.config->>'results','after_vote')='after_vote' and not exists(select 1 from public.tnt_community_votes where content_id=c.id and person_id=pid) and not tnt_actions.community_can_for(pid,'polls',3) then null else (select jsonb_agg((select count(*) from public.tnt_community_votes where content_id=c.id and option_index=i)) from generate_series(1,jsonb_array_length(c.config->'options')) i) end)),'[]') from public.tnt_community_content c where c.module='polls' and tnt_actions.community_content_visible(c.id,pid)),
 'questions',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('name',case when q.person_id=pid or tnt_actions.community_can_for(pid,'questions',1) then (select full_name from public.tnt_people where id=q.person_id) else null end) order by q.created_at desc),'[]') from public.tnt_community_questions q where q.person_id=pid or tnt_actions.community_can_for(pid,'questions',1) or q.status='published' and q.visibility='community'),
 'accompaniment',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('name',(select full_name from public.tnt_people where id=a.person_id),'referent_name',(select full_name from public.tnt_people where id=a.referent_id))),'[]') from public.tnt_community_accompaniment a where a.person_id=pid or a.referent_id=pid or public.tnt_is_admin()),
 'followups',(select coalesce(jsonb_agg(to_jsonb(f) order by f.contact_on desc),'[]') from public.tnt_community_followups f where public.tnt_is_admin() or f.person_id=pid and f.shared or exists(select 1 from public.tnt_community_accompaniment a where a.person_id=f.person_id and a.referent_id=pid and a.status='accepted')),
 'families',(select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('caregiver_name',(select full_name from public.tnt_people where id=f.caregiver_id),'member_name',(select full_name from public.tnt_people where id=f.member_id)) order by f.created_at desc),'[]') from public.tnt_community_family_links f where f.caregiver_id=pid or f.member_id=pid or tnt_actions.community_can_for(pid,'families',3)),
 'consents',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.tnt_community_consents x join public.tnt_community_family_links f on f.id=x.link_id where tnt_actions.community_can_for(pid,'families',3) or f.caregiver_id=pid and f.status='verified'),
 'baptisms',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('name',(select full_name from public.tnt_people where id=b.person_id))),'[]') from public.tnt_community_baptisms b where b.person_id=pid or tnt_actions.community_can_for(pid,'baptisms',3)),
 'preferences',coalesce((select to_jsonb(p) from public.tnt_community_preferences p where p.person_id=pid),jsonb_build_object('birthday_public',false,'daily_push',false,'reminders',true,'reading','{}'::jsonb)),
 'daily',(select to_jsonb(d) from public.tnt_community_days d where day=tnt_actions.community_today()),
 'days',case when tnt_actions.community_can_for(pid,'daily',1) then coalesce((select jsonb_agg(d order by d.day) from public.tnt_community_days d where day>=tnt_actions.community_today()),'[]') else '[]'::jsonb end,
 'phrases',case when tnt_actions.community_can_for(pid,'daily',1) then coalesce((select jsonb_agg(p order by p.updated_at desc) from public.tnt_community_phrases p),'[]') else '[]'::jsonb end,
 'games',(select coalesce(jsonb_agg(x),'[]') from(select kind,difficulty,max(score) best,count(*) plays,count(*) filter(where won) wins from public.tnt_community_game_runs where person_id=pid group by kind,difficulty)x),
 'birthdays',(select coalesce(jsonb_agg(jsonb_build_object('person_id',p.id,'name',p.full_name,'month',extract(month from p.birthday),'day',extract(day from p.birthday),'year',extract(year from p.birthday),'avatar_url',a.avatar_url) order by to_char(p.birthday,'MMDD')),'[]') from public.tnt_people p join public.tnt_accounts a on a.person_id=p.id where a.auth_user_id is not null and a.enabled and p.active and p.birthday is not null),
 'people',case when manage or exists(select 1 from public.tnt_community_accompaniment a where a.referent_id=pid and a.status in('pending','accepted')) then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'avatar_url',a.avatar_url,'staff',a.staff_status='approved' or a.system_role='admin')) from public.tnt_people p left join public.tnt_accounts a on a.person_id=p.id where p.active and (manage or exists(select 1 from public.tnt_community_accompaniment x where x.person_id=p.id and x.referent_id=pid and x.status in('pending','accepted')))),'[]') else '[]'::jsonb end,
 'grants',case when public.tnt_is_admin() then coalesce((select jsonb_agg(g) from public.tnt_community_grants g),'[]') else '[]'::jsonb end,
 'history',(select coalesce(jsonb_agg(x),'[]') from(select h.* from public.tnt_community_history h where tnt_actions.community_can_for(pid,h.module,3) order by created_at desc limit 60)x)
 );return result;
end $function$;

CREATE OR REPLACE FUNCTION tnt_actions.community_action_personal(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid:=public.tnt_current_person_id();mod text:=p_data->>'module';item uuid:=nullif(p_data->>'id','')::uuid;target uuid:=nullif(p_data->>'person_id','')::uuid;
 c public.tnt_community_content%rowtype;e public.tnt_community_enrollments%rowtype;q public.tnt_community_questions%rowtype;
 a public.tnt_community_accompaniment%rowtype;f public.tnt_community_family_links%rowtype;ph public.tnt_community_phrases%rowtype;
 old_data jsonb;st text;cfg jsonb;steps jsonb;chosen integer;ver integer;result jsonb:='{}';new_id uuid;ref uuid;is_admin boolean:=public.tnt_is_admin();d date;dt date;vlevel integer;
begin
 if auth.uid() is null or not tnt_actions.community_active_person(pid) then raise exception 'Completá tu perfil e iniciá sesión para continuar.' using errcode='42501';end if;
 if p_action='preferences' then
  mod='daily';insert into public.tnt_community_preferences(person_id) values(pid) on conflict do nothing;
  update public.tnt_community_preferences set birthday_public=true,daily_push=coalesce((p_data->>'daily_push')::boolean,daily_push),reminders=coalesce((p_data->>'reminders')::boolean,reminders),reading=case when p_data ? 'reading' and octet_length((p_data->'reading')::text)<2000 then p_data->'reading' else reading end,updated_at=now() where person_id=pid;
 elsif p_action='save_phrase' then
  mod='daily';if not tnt_actions.community_can_for(pid,mod,2) then raise exception 'Necesitás permiso para publicar frases.' using errcode='42501';end if;
  item=coalesce(item,gen_random_uuid());select to_jsonb(x) into old_data from public.tnt_community_phrases x where id=item;
  insert into public.tnt_community_phrases(id,text,author,active,created_by) values(item,trim(p_data->>'text'),coalesce(p_data->>'author',''),coalesce((p_data->>'active')::boolean,true),pid)
  on conflict(id) do update set text=excluded.text,author=excluded.author,active=excluded.active,updated_at=now();result=jsonb_build_object('id',item);
 elsif p_action='save_day' then
  mod='daily';if not tnt_actions.community_can_for(pid,mod,2) then raise exception 'Necesitás permiso para programar el contenido diario.' using errcode='42501';end if;
  d=(p_data->>'day')::date;if d<tnt_actions.community_today() then raise exception 'El contenido de días anteriores queda en el historial.';end if;
  select to_jsonb(x) into old_data from public.tnt_community_days x where day=d;
  insert into public.tnt_community_days(day,reference,version,phrase,author,manual,updated_by) values(d,p_data->>'reference',coalesce((p_data->>'bible_version')::integer,128),trim(p_data->>'phrase'),coalesce(p_data->>'author',''),true,pid)
  on conflict(day) do update set reference=excluded.reference,version=excluded.version,phrase=excluded.phrase,author=excluded.author,manual=true,updated_by=pid;
 elsif p_action='save_game' then
  mod='games';insert into public.tnt_community_game_runs(id,person_id,kind,difficulty,score,won,lives,duration) values(item,pid,p_data->>'kind',p_data->>'difficulty',(p_data->>'score')::integer,(p_data->>'won')::boolean,(p_data->>'lives')::integer,(p_data->>'duration')::integer) on conflict(id) do nothing;
 elsif p_action='poll_report' then
  select * into c from public.tnt_community_content where id=item;mod='polls';
  if c.module is distinct from mod or not tnt_actions.community_can_for(pid,mod,3) then raise exception 'No tenés permiso para consultar participantes.' using errcode='42501';end if;
  if coalesce((c.config->>'anonymous')::boolean,true) then raise exception 'Esta encuesta es anónima y muestra solo resultados agrupados.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('person_id',v.person_id,'name',p.full_name,'option_index',v.option_index)),'[]') into result from public.tnt_community_votes v join public.tnt_people p on p.id=v.person_id where content_id=item;return result;
 else raise exception 'Acción no disponible.' using errcode='22023';end if;
 insert into public.tnt_community_history(module,action,actor,subject_id,details) values(coalesce(mod,'daily'),p_action,pid,coalesce(item::text,target::text,pid::text),jsonb_build_object('before',old_data,'notify',coalesce((p_data->>'notify')::boolean,false)));
 return result;
end $function$;

CREATE OR REPLACE FUNCTION tnt_actions.community_history_notice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.tnt_community_content%rowtype;q public.tnt_community_questions%rowtype;f public.tnt_community_family_links%rowtype;a public.tnt_community_accompaniment%rowtype;
 target uuid;person uuid;subject uuid;dest text;label text;extra jsonb;key text;begin
 key='community:'||new.action||':'||new.subject_id;subject=case when new.subject_id~'^[0-9a-f-]{36}$' then new.subject_id::uuid else null end;
 dest='/comunidad?module='||new.module;
 if new.action='save_content' then
  select * into c from public.tnt_community_content where id=subject;
  if c.status not in('published','scheduled') or c.starts_at>now() then return new;end if;
  if coalesce(new.details#>>'{before,status}','') in('published','scheduled') and not coalesce((new.details->>'notify')::boolean,false) and (new.details#>>'{before,starts_at}')::timestamptz is not distinct from c.starts_at then return new;end if;
  extra=jsonb_build_object('content_id',c.id);key='community:publish:'||c.id||':'||c.version;
  for target in select x.person_id from public.tnt_accounts x where x.person_id<>new.actor and tnt_actions.community_content_recipient(c.id,x.person_id) loop
   perform tnt_actions.community_notify(target,key,c.module,c.title,case when c.module='polls' then 'Tu opinión cuenta. Hay una encuesta para vos.' when c.module='bible' then 'Un nuevo plan para leer y compartir.' else 'Hay una novedad para vos en TNT.' end,dest||'&item='||c.id,extra);
  end loop;
 elsif new.action='ask' then
  select * into q from public.tnt_community_questions where id=subject;extra=jsonb_build_object('question_id',q.id);
  for target in select person_id from public.tnt_accounts where person_id<>new.actor and tnt_actions.community_can_for(person_id,'questions',2) loop
   perform tnt_actions.community_notify(target,key,'questions','Nueva pregunta de fe','Hay una consulta para acompañar.','/comunidad?module=questions&manage=1&question='||q.id,extra);
  end loop;
 elsif new.action='answer' then
  select * into q from public.tnt_community_questions where id=subject;
  if q.status in('answered','published') then perform tnt_actions.community_notify(q.person_id,key||':'||q.updated_at,'questions','Tu pregunta tiene respuesta','El equipo respondió tu consulta.',dest||'&question='||q.id,jsonb_build_object('question_id',q.id));end if;
 elsif new.action='request_welcome' then
  subject:=new.actor;key:='community:request_welcome:'||subject;
  select full_name into label from public.tnt_people where id=subject;
  extra=jsonb_build_object('welcome_person',subject,'sender_id',subject,'sender_name',label,'sender_avatar',(select avatar_url from public.tnt_accounts where person_id=subject));
  for target in select person_id from public.tnt_accounts where system_role='admin' and person_id<>new.actor loop
   perform tnt_actions.community_notify(target,key,'welcome',coalesce(label,'Una persona de TNT')||' pidió acompañamiento','Podés elegir un referente y enviarle una invitación.','/comunidad?module=welcome&manage=1&person='||subject,extra);
  end loop;
 elsif new.action='assign_referent' then
  select * into a from public.tnt_community_accompaniment where person_id=subject;
  if a.referent_id is not null then perform tnt_actions.community_notify(a.referent_id,key||':'||a.assigned_at,'welcome','¿Podés acompañar a '||coalesce((select full_name from public.tnt_people where id=a.person_id),'esta persona')||'?','Administración te invitó como referente. Confirmá si podés acompañarla.',dest,jsonb_build_object('welcome_person',a.person_id));end if;
 elsif new.action='respond_referent' then
  select * into a from public.tnt_community_accompaniment where person_id=subject;
  for target in select person_id from public.tnt_accounts where system_role='admin' loop
   perform tnt_actions.community_notify(target,key||':'||a.responded_at,'welcome',case when a.status='accepted' then 'Referente confirmado' else 'Hace falta elegir otro referente' end,'La invitación de acompañamiento ya tiene respuesta.',dest||'&manage=1',jsonb_build_object('welcome_person',a.person_id));
  end loop;
  if a.status='accepted' then perform tnt_actions.community_notify(a.person_id,key||':'||a.responded_at,'welcome','Ya tenés un referente confirmado','Tu referente aceptó acompañarte en TNT.',dest,jsonb_build_object('welcome_person',a.person_id));end if;
 elsif new.action='followup' then
  select person_id into person from public.tnt_community_followups where id=subject and shared;
  if person is not null then perform tnt_actions.community_notify(person,key,'welcome','Tu acompañamiento tiene una novedad','Tu referente compartió un registro con vos.',dest,jsonb_build_object('welcome_person',person));end if;
 elsif new.action='request_family' then
  extra=jsonb_build_object('family_link_id',subject);
  for target in select person_id from public.tnt_accounts where tnt_actions.community_can_for(person_id,'families',3) loop
   perform tnt_actions.community_notify(target,key,'families','Nueva solicitud de una familia','Hay una vinculación familiar para revisar.',dest||'&manage=1',extra);
  end loop;
 elsif new.action='review_family' then
  select * into f from public.tnt_community_family_links where id=subject;
  perform tnt_actions.community_notify(f.caregiver_id,key||':'||f.reviewed_at,'families','Tu solicitud familiar tiene respuesta',case when f.status='verified' then 'Ya podés ver los avisos y autorizaciones de Familias TNT.' else 'Acercate al equipo para revisar la vinculación solicitada.' end,dest,jsonb_build_object('family_link_id',f.id));
 elsif new.action='request_baptism' then
  for target in select person_id from public.tnt_accounts where tnt_actions.community_can_for(person_id,'baptisms',3) loop
   perform tnt_actions.community_notify(target,key,'baptisms','Una persona se interesa por el bautismo','Podés acompañar su preparación.',dest||'&manage=1',jsonb_build_object('baptism_person',subject));
  end loop;
 elsif new.action='save_baptism' then
  perform tnt_actions.community_notify(subject,key||':'||new.id,'baptisms','Novedades de tu preparación','El equipo actualizó los próximos pasos de tu bautismo.',dest,jsonb_build_object('baptism_person',subject));
 end if;
 return new;
end $function$;

alter policy efe_meetings_read on public.tnt_efe_meetings using(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_has_access('efe',g.code,'view')));
alter policy efe_meetings_manage on public.tnt_efe_meetings using(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_can_action('efe','manage_meetings',g.code))) with check(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_can_action('efe','manage_meetings',g.code)));

-- Personal data contains references and preferences, never licensed Bible text.
CREATE OR REPLACE FUNCTION public.tnt_mark_attendance(p_mode text, p_person uuid, p_date date, p_status text, p_group uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid:=public.tnt_current_person_id();
  v_actor_name text;
  v_scope text;
  v_old text;
  v_id uuid;
begin
  if v_actor is null then raise exception 'Iniciá sesión.' using errcode='42501'; end if;
  if p_status not in ('present','absent','pending') then raise exception 'Estado inválido.' using errcode='22023'; end if;
  if not exists(select 1 from public.tnt_people where id=p_person and active) then
    raise exception 'La persona ya no está activa.' using errcode='22023';
  end if;
  select full_name into v_actor_name from public.tnt_people where id=v_actor;

  if p_mode='efe' then
    select code into v_scope from public.tnt_efe_groups where id=p_group;
    if v_scope is null or not (public.tnt_can_action('efe','attendance',v_scope)) then
      raise exception 'No tenés permiso para pasar lista en este EFE.' using errcode='42501';
    end if;
    if not exists(select 1 from public.tnt_efe_meetings where group_id=p_group and meeting_date=p_date and active) then
      raise exception 'Este miércoles no está activo. Elegí otro encuentro.' using errcode='22023';
    end if;
    if not exists(select 1 from public.tnt_efe_memberships where person_id=p_person and group_id=p_group and active) then
      raise exception 'Esta persona no pertenece a este EFE.' using errcode='22023';
    end if;
    select status into v_old from public.tnt_efe_wednesday_attendance
      where person_id=p_person and group_id=p_group and wednesday_date=p_date;
    insert into public.tnt_efe_wednesday_attendance(person_id,group_id,wednesday_date,status,taken_by,updated_at)
    values(p_person,p_group,p_date,p_status,v_actor_name,now())
    on conflict(person_id,group_id,wednesday_date) do update
      set status=excluded.status,taken_by=excluded.taken_by,updated_at=now()
    returning id into v_id;
  elsif p_mode='sabados' then
    if not (public.tnt_is_admin() or public.tnt_can_action('lista-sabados','attendance','*')) then
      raise exception 'No tenés permiso para pasar la lista del sábado.' using errcode='42501';
    end if;
    if not exists(select 1 from public.tnt_saturday_members where person_id=p_person and active) then
      raise exception 'Esta persona no pertenece a la lista de Sábados.' using errcode='22023';
    end if;
    select status into v_old from public.tnt_saturday_attendance
      where person_id=p_person and saturday_date=p_date;
    insert into public.tnt_saturday_attendance(person_id,saturday_date,status,taken_by,updated_at)
    values(p_person,p_date,p_status,v_actor_name,now())
    on conflict(person_id,saturday_date) do update
      set status=excluded.status,taken_by=excluded.taken_by,updated_at=now()
    returning id into v_id;
  else
    raise exception 'Submódulo inválido.' using errcode='22023';
  end if;

  if v_old is distinct from p_status then
    insert into public.tnt_attendance_audit(mode,person_id,group_id,attendance_date,from_status,to_status,actor_person_id)
    values(p_mode,p_person,case when p_mode='efe' then p_group else null end,p_date,v_old,p_status,v_actor);
  end if;
  return jsonb_build_object('id',v_id,'status',p_status,'taken_by',v_actor_name,'updated_at',now());
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_reset_efe_attendance(p_group uuid, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope text;
  v_count integer;
begin
  select code into v_scope from public.tnt_efe_groups where id=p_group;
  if v_scope is null then raise exception 'EFE no encontrado.' using errcode='22023'; end if;
  if not (public.tnt_can_action('efe','attendance',v_scope)) then
    raise exception 'No tenés permiso para resetear esta lista.' using errcode='42501';
  end if;

  select count(*) into v_count
  from public.tnt_efe_wednesday_attendance
  where group_id=p_group and wednesday_date=p_date;

  delete from public.tnt_efe_wednesday_attendance
  where group_id=p_group and wednesday_date=p_date;
  delete from public.tnt_efe_followups
  where group_id=p_group and wednesday_date=p_date;
  delete from public.tnt_attendance_audit
  where mode='efe' and group_id=p_group and attendance_date=p_date;

  return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.tnt_set_efe_membership(p_person uuid, p_group uuid, p_active boolean DEFAULT true, p_leader text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope text;
begin
  select code into v_scope from public.tnt_efe_groups where id=p_group;
  if v_scope is null or not (public.tnt_can_action('efe','edit_people',v_scope)) then
    raise exception 'No tenés permiso para editar integrantes de este EFE.' using errcode='42501';
  end if;
  if not exists(select 1 from public.tnt_people where id=p_person and active) then
    raise exception 'Elegí una persona activa de Perfiles.' using errcode='22023';
  end if;
  insert into public.tnt_efe_memberships(person_id,group_id,leader_name,active)
  values(p_person,p_group,nullif(trim(p_leader),''),p_active)
  on conflict(person_id,group_id) do update
    set leader_name=excluded.leader_name,active=excluded.active;
end $function$;

create table public.tnt_personal_preferences(
 person_id uuid primary key references public.tnt_people(id) on delete cascade,
 favorite_version integer not null default 128 check(favorite_version>0),
 extra_versions integer[] not null default '{}' check(cardinality(extra_versions)<=12),
 shortcuts text[] not null default '{}' check(cardinality(shortcuts)<=4 and shortcuts<@array['saturday','efe','schedule','bible','birthdays']::text[]),
 updated_at timestamptz not null default now()
);
create table public.tnt_reader_marks(
 person_id uuid not null references public.tnt_people(id) on delete cascade,
 book text not null check(book~'^[1-3]?[A-Z]{2,3}$'),
 chapter integer not null check(chapter between 1 and 150),
 verse integer not null check(verse between 1 and 200),
 color text not null check(color in('lime','lilac','peach','blue','pink','underline')),
 updated_at timestamptz not null default now(),
 primary key(person_id,book,chapter,verse)
);
create table public.tnt_reader_days(
 person_id uuid not null references public.tnt_people(id) on delete cascade,
 day date not null,
 primary key(person_id,day)
);
alter table public.tnt_personal_preferences enable row level security;
alter table public.tnt_reader_marks enable row level security;
alter table public.tnt_reader_days enable row level security;
create policy personal_preferences_own on public.tnt_personal_preferences for select to authenticated using(person_id=(select public.tnt_current_person_id()) and tnt_actions.community_active_person(person_id));
create policy reader_marks_own on public.tnt_reader_marks for select to authenticated using(person_id=(select public.tnt_current_person_id()) and tnt_actions.community_active_person(person_id));
create policy reader_days_own on public.tnt_reader_days for select to authenticated using(person_id=(select public.tnt_current_person_id()) and tnt_actions.community_active_person(person_id));
revoke all on public.tnt_personal_preferences,public.tnt_reader_marks,public.tnt_reader_days from public,anon,authenticated;
grant select on public.tnt_personal_preferences,public.tnt_reader_marks,public.tnt_reader_days to authenticated;

create or replace function tnt_actions.personal_context(p_book text default null,p_chapter integer default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();today date:=tnt_actions.community_today();current_streak integer;best_streak integer;
begin
 if auth.uid() is null or not tnt_actions.community_active_person(pid) then raise exception 'Iniciá sesión con tu perfil completo.' using errcode='42501';end if;
 with numbered as(select day,day-(row_number() over(order by day))::integer as island from public.tnt_reader_days where person_id=pid),
 runs as(select count(*)::integer n,max(day) last_day from numbered group by island)
 select coalesce(max(n) filter(where last_day>=today-1),0),coalesce(max(n),0) into current_streak,best_streak from runs;
 return jsonb_build_object(
 'preferences',coalesce((select to_jsonb(p)-'person_id' from public.tnt_personal_preferences p where person_id=pid),jsonb_build_object('favorite_version',128,'extra_versions','[]'::jsonb,'shortcuts','[]'::jsonb)),
 'marks_book',p_book,'marks_chapter',p_chapter,
 'marks',(select coalesce(jsonb_agg(jsonb_build_object('book',book,'chapter',chapter,'verse',verse,'color',color) order by verse),'[]') from public.tnt_reader_marks where person_id=pid and book=p_book and chapter=p_chapter),
 'days',(select coalesce(jsonb_agg(day order by day),'[]') from public.tnt_reader_days where person_id=pid and day>=today-366),
 'today',today,'streak',current_streak,'best_streak',best_streak,'read_today',exists(select 1 from public.tnt_reader_days where person_id=pid and day=today));
end $$;

create or replace function tnt_actions.personal_action(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();b text:=p_data->>'book';c integer;verses integer[];v_shortcuts text[];v_extras integer[];
begin
 if auth.uid() is null or not tnt_actions.community_active_person(pid) then raise exception 'Iniciá sesión con tu perfil completo.' using errcode='42501';end if;
 if p_action='preferences' then
  if p_data ? 'shortcuts' then
   if jsonb_typeof(p_data->'shortcuts')<>'array' then raise exception 'Revisá los atajos.';end if;
   select coalesce(array_agg(value order by position),'{}') into v_shortcuts from(select value,min(position) position from jsonb_array_elements_text(p_data->'shortcuts') with ordinality a(value,position) group by value)x;
   if cardinality(v_shortcuts)>4 or array_position(v_shortcuts,null) is not null or not v_shortcuts<@array['saturday','efe','schedule','bible','birthdays']::text[] then raise exception 'Elegí hasta cuatro atajos válidos.';end if;
  end if;
  if p_data ? 'extra_versions' then
   if jsonb_typeof(p_data->'extra_versions')<>'array' then raise exception 'Revisá las traducciones.';end if;
   select coalesce(array_agg(distinct value::integer),'{}') into v_extras from jsonb_array_elements_text(p_data->'extra_versions') a(value);
   if cardinality(v_extras)>12 or exists(select 1 from unnest(v_extras) e where e is null or e<1) then raise exception 'Elegí hasta doce traducciones adicionales.';end if;
  end if;
  insert into public.tnt_personal_preferences(person_id) values(pid) on conflict do nothing;
  update public.tnt_personal_preferences set favorite_version=coalesce((p_data->>'favorite_version')::integer,favorite_version),extra_versions=coalesce(v_extras,extra_versions),shortcuts=coalesce(v_shortcuts,tnt_personal_preferences.shortcuts),updated_at=now() where person_id=pid;
 elsif p_action in('mark','unmark') then
  c:=(p_data->>'chapter')::integer;
  if b is null or b!~'^[1-3]?[A-Z]{2,3}$' or c is null or not exists(select 1 from(values('GEN',50),('EXO',40),('LEV',27),('NUM',36),('DEU',34),('JOS',24),('JDG',21),('RUT',4),('1SA',31),('2SA',24),('1KI',22),('2KI',25),('1CH',29),('2CH',36),('EZR',10),('NEH',13),('EST',10),('JOB',42),('PSA',150),('PRO',31),('ECC',12),('SNG',8),('ISA',66),('JER',52),('LAM',5),('EZK',48),('DAN',12),('HOS',14),('JOL',3),('AMO',9),('OBA',1),('JON',4),('MIC',7),('NAM',3),('HAB',3),('ZEP',3),('HAG',2),('ZEC',14),('MAL',4),('MAT',28),('MRK',16),('LUK',24),('JHN',21),('ACT',28),('ROM',16),('1CO',16),('2CO',13),('GAL',6),('EPH',6),('PHP',4),('COL',4),('1TH',5),('2TH',3),('1TI',6),('2TI',4),('TIT',3),('PHM',1),('HEB',13),('JAS',5),('1PE',5),('2PE',3),('1JN',5),('2JN',1),('3JN',1),('JUD',1),('REV',22)) valid(book,chapters) where valid.book=b and c between 1 and valid.chapters) or coalesce(jsonb_typeof(p_data->'verses'),'')<>'array' or jsonb_array_length(p_data->'verses') not between 1 and 200 then raise exception 'Elegí versículos válidos.';end if;
  select array_agg(distinct value::integer) into verses from jsonb_array_elements_text(p_data->'verses') a(value);
  if exists(select 1 from unnest(verses) verse where verse is null or verse not between 1 and 200) then raise exception 'Elegí versículos válidos.';end if;
  if p_action='unmark' then delete from public.tnt_reader_marks where person_id=pid and book=b and chapter=c and verse=any(verses);
  else
   if coalesce(p_data->>'color','') not in('lime','lilac','peach','blue','pink','underline') then raise exception 'Elegí un color válido.';end if;
   insert into public.tnt_reader_marks(person_id,book,chapter,verse,color) select pid,b,c,verse,p_data->>'color' from unnest(verses) verse
   on conflict(person_id,book,chapter,verse) do update set color=excluded.color,updated_at=now();
  end if;
 elsif p_action='read' then
  insert into public.tnt_reader_days(person_id,day) values(pid,tnt_actions.community_today()) on conflict do nothing;
 else raise exception 'Acción no disponible.' using errcode='22023';end if;
 return tnt_actions.personal_context(b,c);
end $$;
create or replace function public.tnt_personal_context(p_book text default null,p_chapter integer default null) returns jsonb language sql security invoker set search_path='' as $$select tnt_actions.personal_context(p_book,p_chapter)$$;
create or replace function public.tnt_personal_action(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select tnt_actions.personal_action(p_action,p_data)$$;
revoke all on function tnt_actions.personal_context(text,integer),tnt_actions.personal_action(text,jsonb),public.tnt_personal_context(text,integer),public.tnt_personal_action(text,jsonb) from public,anon;
grant execute on function tnt_actions.personal_context(text,integer),tnt_actions.personal_action(text,jsonb),public.tnt_personal_context(text,integer),public.tnt_personal_action(text,jsonb) to authenticated;

-- Profile consolidation also preserves the new personal data and its audit snapshot.
create or replace function tnt_actions.merge_personal_state(p_source uuid,p_target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
 snapshot:=jsonb_build_array(jsonb_build_object('table','personal_reader','source',p_source,
 'preferences',(select to_jsonb(p) from public.tnt_personal_preferences p where person_id=p_source),
 'marks',(select jsonb_agg(to_jsonb(m)) from public.tnt_reader_marks m where person_id=p_source),
 'days',(select jsonb_agg(day) from public.tnt_reader_days where person_id=p_source)));
 insert into public.tnt_personal_preferences(person_id,favorite_version,extra_versions,shortcuts) select p_target,favorite_version,extra_versions,shortcuts from public.tnt_personal_preferences where person_id=p_source on conflict do nothing;
 insert into public.tnt_reader_marks(person_id,book,chapter,verse,color,updated_at) select p_target,book,chapter,verse,color,updated_at from public.tnt_reader_marks where person_id=p_source on conflict do nothing;
 insert into public.tnt_reader_days(person_id,day) select p_target,day from public.tnt_reader_days where person_id=p_source on conflict do nothing;
 delete from public.tnt_reader_days where person_id=p_source;
 delete from public.tnt_reader_marks where person_id=p_source;
 delete from public.tnt_personal_preferences where person_id=p_source;
 return snapshot;
end $$;
revoke all on function tnt_actions.merge_personal_state(uuid,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tnt_review_profile_link(p_request uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.tnt_profile_link_requests%rowtype; src public.tnt_people%rowtype; dst public.tnt_people%rowtype;
 actor uuid:=public.tnt_current_person_id(); ref record; camp record; child record; rows_before jsonb; history jsonb:='[]'; dn_src text; dn_dst text; keep_destination boolean:=false;
begin
 if actor is null or not tnt_actions.can_link_request(p_request) then raise exception 'Solo administradores pueden vincular perfiles' using errcode='42501';end if;
 if p_approve is null then raise exception 'Elegí una respuesta';end if;
 select * into r from public.tnt_profile_link_requests where id=p_request for update;
 if not found or r.status<>'pending' then raise exception 'La solicitud ya fue resuelta';end if;
 if not p_approve then
  update public.tnt_profile_link_requests set status='rejected',reviewed_at=now(),reviewed_by=actor where id=r.id;
  insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details) values(actor,'profile',r.person_id,'profile_link_rejected',jsonb_build_object('request_id',r.id,'target_person_id',r.target_person_id));
  return;
 end if;
 -- Stable lock order prevents simultaneous reviews of the same people.
 perform id from public.tnt_people where id in(r.person_id,r.target_person_id) order by id for update;
 select * into src from public.tnt_people where id=r.person_id;
 select * into dst from public.tnt_people where id=r.target_person_id;
 if src.id=dst.id or not src.active or not dst.active then raise exception 'Revisá que sean dos perfiles activos de la misma persona.';end if;

 perform person_id from public.tnt_accounts where person_id in(src.id,dst.id) order by person_id for update;
 keep_destination:=exists(select 1 from public.tnt_accounts where person_id=dst.id and auth_user_id is not null);
 if keep_destination and not public.tnt_is_admin() then raise exception 'La unión de dos cuentas Google requiere revisión administrativa.' using errcode='42501';end if;
 if keep_destination then
  if exists(select 1 from public.tnt_accounts where person_id=src.id and system_role='admin') and not exists(select 1 from public.tnt_accounts where person_id=dst.id and system_role='admin') then raise exception 'Conservá la cuenta administradora como principal e invertí el vínculo.';end if;
  if not exists(select 1 from public.tnt_accounts where person_id=dst.id and enabled) then raise exception 'La cuenta principal no está habilitada.';end if;
  insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
  values(actor,'profile',dst.id,'duplicate_google_account_replaced',jsonb_build_object('source_account',(select to_jsonb(a) from public.tnt_accounts a where person_id=src.id),'primary_account',(select to_jsonb(a) from public.tnt_accounts a where person_id=dst.id)));
  update public.tnt_accounts set enabled=false where person_id=src.id;
 end if;
 if not keep_destination and exists(select 1 from public.tnt_accounts where person_id=dst.id) then
  -- Preserve pending/historical role requests before removing an unclaimed stub.
  -- The verified Google account retains its original permissions.
  insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
  values(actor,'profile',dst.id,'unclaimed_account_replaced',jsonb_build_object('account',(select to_jsonb(a) from public.tnt_accounts a where person_id=dst.id),'role_requests',(select jsonb_agg(to_jsonb(q)) from public.tnt_role_requests q where person_id=dst.id)));
  update public.tnt_role_requests set status='cancelled' where person_id=dst.id and status='pending';
  update public.tnt_role_requests set person_id=src.id where person_id=dst.id;
  delete from public.tnt_accounts where person_id=dst.id and auth_user_id is null;
 end if;
 if not exists(select 1 from public.tnt_accounts where person_id=src.id and (enabled or keep_destination)) then raise exception 'La cuenta de origen no está habilitada.';end if;
 -- Keep full rows before transferring references, including consolidated memberships.
 for ref in select distinct ns.nspname as schema_name,t.relname as table_name,a.attname as column_name
  from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.contype='f' and c.confrelid in('public.tnt_people'::regclass,'public.tnt_accounts'::regclass)
   and ns.nspname='public' and t.relname not in('tnt_profile_link_requests','tnt_profile_archive_state') order by 1,2,3
 loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I t where %I=$1',ref.schema_name,ref.table_name,ref.column_name) into rows_before using src.id;
  if rows_before<>'[]'::jsonb then history:=history||jsonb_build_array(jsonb_build_object('table',ref.table_name,'column',ref.column_name,'rows',rows_before));end if;
 end loop;
 select dni into dn_src from public.tnt_profile_private_fields where person_id=src.id;
 select dni into dn_dst from public.tnt_profile_private_fields where person_id=dst.id;
 if coalesce(dn_src,'')<>'' and coalesce(dn_dst,'')<>'' and dn_src<>dn_dst then raise exception 'Los DNI no coinciden. Revisá los datos antes de vincular.';end if;
 if dn_src is not null and dn_dst is not null then
  update public.tnt_profile_private_fields set dni=coalesce(nullif(dn_dst,''),dn_src) where person_id=dst.id;
  delete from public.tnt_profile_private_fields where person_id=src.id;
 end if;
 insert into public.tnt_profile_answers(person_id,answers,completed_at)
 select dst.id,answers,completed_at from public.tnt_profile_answers where person_id=src.id
 on conflict(person_id) do update set answers=excluded.answers||public.tnt_profile_answers.answers,
 completed_at=coalesce(public.tnt_profile_answers.completed_at,excluded.completed_at),updated_at=now();
 delete from public.tnt_profile_answers where person_id=src.id;
 -- Preserve the historical EFE when transferring the new account's memberships.
 update public.tnt_efe_memberships set active=false where person_id=src.id and active
 and (exists(select 1 from public.tnt_efe_memberships where person_id=dst.id and active) or exists(select 1 from public.tnt_profile_answers where person_id=dst.id and answers->>'efe_group'='none'));
 delete from public.tnt_saturday_members s where s.person_id=src.id and exists(select 1 from public.tnt_saturday_members where person_id=dst.id);
 update public.tnt_efe_memberships d set leader_name=coalesce(nullif(d.leader_name,''),s.leader_name) from public.tnt_efe_memberships s where d.person_id=dst.id and s.person_id=src.id and d.group_id=s.group_id;
 delete from public.tnt_efe_memberships s where s.person_id=src.id and exists(select 1 from public.tnt_efe_memberships where person_id=dst.id and group_id=s.group_id);
 history:=history||tnt_actions.merge_personal_state(src.id,dst.id)||tnt_actions.merge_profile_relations(src.id,dst.id)||tnt_actions.merge_profile_camps(src.id,dst.id);
 -- Pending personal edits contain the old snapshot and must be re-submitted after linking.
 update public.tnt_profile_change_requests set status='cancelled' where person_id=src.id and status='pending';
 set constraints public.tnt_role_requests_person_id_fkey deferred;
 for ref in select distinct ns.nspname as schema_name,t.relname as table_name,a.attname as column_name
  from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.contype='f' and c.confrelid in('public.tnt_people'::regclass,'public.tnt_accounts'::regclass)
   and ns.nspname='public' and t.relname not in('tnt_profile_link_requests','tnt_profile_archive_state') and not (keep_destination and t.relname='tnt_accounts' and a.attname='person_id') and not (a.attname='person_id' and t.relname in('tnt_access_grants','tnt_person_permission_overrides','tnt_module_access')) order by 1,2,3
 loop
  execute format('update %I.%I set %I=$1 where %I=$2',ref.schema_name,ref.table_name,ref.column_name,ref.column_name) using dst.id,src.id;
 end loop;
 set constraints public.tnt_role_requests_person_id_fkey immediate;
 -- Existing central data has precedence; only fill its missing contact fields.
 update public.tnt_people set phone=coalesce(nullif(phone,''),src.phone),instagram=coalesce(nullif(instagram,''),src.instagram),sex=case when sex='U' and src.sex in('M','F') then src.sex else sex end,first_name=coalesce(nullif(first_name,''),split_part(full_name,' ',1)),last_name=coalesce(nullif(last_name,''),trim(substr(full_name,length(split_part(full_name,' ',1))+1))),profile_consent=profile_consent or src.profile_consent,updated_at=now() where id=dst.id;
 update public.tnt_people set active=false,data_notes=coalesce(data_notes,'{}')||jsonb_build_object('linked_to',dst.id,'linked_at',now()),updated_at=now() where id=src.id;
 update public.tnt_profile_link_requests set status=case when id=r.id then 'approved' else 'cancelled' end,reviewed_at=now(),reviewed_by=actor where person_id=src.id and status='pending';
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details) values(actor,'profile',dst.id,'profile_link_approved',jsonb_build_object('request_id',r.id,'source',to_jsonb(src),'destination',to_jsonb(dst),'references_before',history));
 insert into public.tnt_notifications(person_id,title,body,href) values(dst.id,'Tu perfil quedó vinculado','Tu cuenta Google ahora usa tu perfil de TNT y su historial. Revisá tus datos desde Mi perfil.','/?profile=1');
exception when unique_violation then
 raise exception 'No pudimos consolidar un registro compartido. Tus datos y tu historial se conservaron; podés reintentar.';
end $function$;

notify pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.tnt_startup_context(p_sync boolean DEFAULT false, p_continue boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  'reading',coalesce((select reading from public.tnt_community_preferences where person_id=a.person_id),'{}'::jsonb),
  'personal',coalesce((select to_jsonb(s)-'person_id' from public.tnt_personal_preferences s where person_id=a.person_id),jsonb_build_object('favorite_version',128,'shortcuts','[]'::jsonb,'extra_versions','[]'::jsonb)));
end $function$;

-- Identify older accompaniment requests on read, without sending the old notices again.
CREATE OR REPLACE FUNCTION public.tnt_my_notifications(p_include_dismissed boolean DEFAULT false)
 RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
declare pid uuid:=public.tnt_current_person_id();
begin
 if pid is null or not public.tnt_profile_is_complete() then raise exception 'Completá tu perfil para continuar.' using errcode='42501';end if;
 return query select to_jsonb(n)||jsonb_build_object('read_at',coalesce(s.read_at,n.read_at),'dismissed_at',s.dismissed_at,'resolved',public.tnt_notification_resolved(n))
 ||case when n.title='Una persona pidió acompañamiento' and n.data ? 'welcome_person' then jsonb_build_object(
  'title',coalesce(p.full_name,'Una persona de TNT')||' pidió acompañamiento',
  'href','/comunidad?module=welcome&manage=1&person='||(n.data->>'welcome_person'),
  'data',n.data||jsonb_build_object('sender_id',p.id,'sender_name',p.full_name,'sender_avatar',a.avatar_url)) else '{}'::jsonb end
 from public.tnt_notifications n left join public.tnt_notification_state s on s.notification_id=n.id and s.person_id=pid
 left join public.tnt_people p on p.id=case when n.data->>'welcome_person'~'^[0-9a-f-]{36}$' then (n.data->>'welcome_person')::uuid end
 left join public.tnt_accounts a on a.person_id=p.id
 where public.tnt_notification_visible_for(n,pid) and s.purged_at is null
 and (p_include_dismissed or (s.dismissed_at is null and not public.tnt_notification_resolved(n)))
 order by n.created_at desc limit 200;
end $function$;
