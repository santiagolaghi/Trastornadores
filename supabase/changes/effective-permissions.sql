-- One eligibility and view rule for role templates, personal exceptions and grants.
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
  v_pid:=public.tnt_current_person_id();
  if v_pid is null then return false; end if;

  select ministry_role,staff_status,system_role
  into v_role,v_staff,v_system
  from public.tnt_accounts
  where person_id=v_pid and enabled
  limit 1;

  if v_system is null or (v_system<>'admin' and v_staff is distinct from 'approved') then return false; end if;
  if v_system='admin' and p_module<>'efe' then return true; end if;

    select o.allowed into v_override
    from public.tnt_person_permission_overrides o
    where o.person_id=v_pid
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

CREATE OR REPLACE FUNCTION public.tnt_review_access_request(p_request uuid, p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
declare
 req public.tnt_access_requests%rowtype;
 reviewer uuid;
 target public.tnt_accounts%rowtype;
begin
 reviewer:=public.tnt_current_person_id();
 if reviewer is null or not public.tnt_is_admin() then raise exception 'Solo un administrador puede revisar solicitudes' using errcode='42501'; end if;
 select * into req from public.tnt_access_requests where id=p_request for update;
 if req.id is null then raise exception 'Solicitud no encontrada'; end if;
 if req.status<>'pending' then raise exception 'Esta solicitud ya fue resuelta'; end if;
 if p_approve then
  select * into target from public.tnt_accounts where person_id=req.person_id for update;
  if target.person_id is null or not target.enabled then raise exception 'La cuenta está deshabilitada. Revisá su estado antes de autorizar un módulo.'; end if;
  if target.system_role<>'admin' and target.staff_status is distinct from 'approved' then
   raise exception 'Primero revisá y aprobá su participación en el staff. El acceso al módulo no aprueba su rol.';
  end if;
  insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled,valid_from,valid_until,granted_by)
  values(req.person_id,req.module,req.scope,req.requested_level,true,null,null,reviewer)
  on conflict(person_id,module,scope) do update set access_level=excluded.access_level,enabled=true,valid_from=null,valid_until=null,granted_by=reviewer;
  -- Explicit approval is an exception to the role template. A read-only request
  -- changes only view; an edit request changes editing actions, never management.
  insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed,updated_by,updated_at)
  select req.person_id,req.module,req.scope,actions.action,true,reviewer,now()
  from (
   select 'view'::text as action
   union
   select distinct r.action from public.tnt_role_permission_presets r
    where r.module=req.module and r.action<>'view'
    and (req.requested_level='manage' or (req.requested_level='edit' and r.action=any(array[
     'edit','attendance','send_message','update_own_activity','create_activity','edit_activity','assign_people','edit_people',
     'sell','edit_stock','registrations','payments','logistics','checkin'
    ]::text[])))
  ) actions
  on conflict(person_id,module,scope,action) do update set allowed=true,updated_by=reviewer,updated_at=now();
 end if;
 update public.tnt_access_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=reviewer,reviewed_at=now() where id=p_request;
end $$;

revoke all on function public.tnt_has_access(text,text,text),public.tnt_review_access_request(uuid,boolean) from public,anon;
grant execute on function public.tnt_has_access(text,text,text),public.tnt_review_access_request(uuid,boolean) to authenticated;
