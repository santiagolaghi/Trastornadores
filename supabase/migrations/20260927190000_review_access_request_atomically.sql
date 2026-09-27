create or replace function public.tnt_review_access_request(p_request uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare
  req public.tnt_access_requests%rowtype;
  reviewer uuid;
begin
  reviewer:=public.tnt_current_person_id();
  if reviewer is null or not public.tnt_is_admin() then raise exception 'Solo un administrador puede revisar solicitudes'; end if;
  select * into req from public.tnt_access_requests where id=p_request for update;
  if req.id is null then raise exception 'Solicitud no encontrada'; end if;
  if req.status<>'pending' then raise exception 'Esta solicitud ya fue resuelta'; end if;
  if p_approve then
    insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled,valid_from,valid_until,granted_by)
    values(req.person_id,req.module,req.scope,req.requested_level,true,null,null,reviewer)
    on conflict(person_id,module,scope) do update set access_level=excluded.access_level,enabled=true,valid_from=null,valid_until=null,granted_by=reviewer;
  end if;
  update public.tnt_access_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=reviewer,reviewed_at=now() where id=p_request;
end $$;
revoke all on function public.tnt_review_access_request(uuid,boolean) from public, anon;
grant execute on function public.tnt_review_access_request(uuid,boolean) to authenticated;
