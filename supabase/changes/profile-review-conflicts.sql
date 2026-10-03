create or replace function public.tnt_review_profile_change(p_request uuid,p_approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r public.tnt_profile_change_requests%rowtype; v jsonb; current_values jsonb; p public.tnt_people%rowtype; pid uuid:=public.tnt_current_person_id();
begin
 if pid is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden revisar perfiles' using errcode='42501';end if;
 select * into r from public.tnt_profile_change_requests where id=p_request for update;
 if not found or r.status<>'pending' then raise exception 'La solicitud ya fue resuelta o no existe';end if;
 if p_approve then
  select * into p from public.tnt_people where id=r.person_id for update;
  current_values:=jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),'birthday',coalesce(p.birthday::text,''),'sex',p.sex,'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''),'dni',coalesce(p.data_notes->>'dni',''));
  if current_values is distinct from r.before_values then raise exception 'El perfil cambió después de esta solicitud. Pedile a la persona que revise y reenvíe sus datos.';end if;
  v:=r.proposed_values;
  perform public.tnt_save_central_profile(r.person_id,v);
  update public.tnt_people set data_notes=coalesce(data_notes,'{}'::jsonb)||jsonb_build_object('dni',v->>'dni'),profile_consent=true where id=r.person_id;
 end if;
 update public.tnt_profile_change_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=pid where id=r.id;
 insert into public.tnt_notifications(person_id,title,body,href) values(r.person_id,'Cambio de perfil revisado',case when p_approve then 'Se aprobaron tus nuevos datos.' else 'No se aprobaron los cambios. Consultá con un administrador.' end,'/?profile=1');
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details) values(pid,'profile',r.person_id,case when p_approve then 'profile_change_approved' else 'profile_change_rejected' end,jsonb_build_object('request_id',r.id,'before',r.before_values,'proposed',r.proposed_values));
end $$;
revoke all on function public.tnt_review_profile_change(uuid,boolean) from public,anon;
grant execute on function public.tnt_review_profile_change(uuid,boolean) to authenticated;
