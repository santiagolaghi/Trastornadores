-- Internal transfer callable only by the verified continuation function.
create function tnt_actions.link_verified_profile(p_source uuid,p_target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
 if p_source is distinct from public.tnt_current_person_id() or auth.uid() is null then raise exception 'Ingresá con tu cuenta Google' using errcode='42501';end if;
 -- Proof comes from server-held data; client metadata cannot authorize a claim.
 insert into tnt_actions.profile_claims values(auth.uid(),p_source,p_target,txid_current())
  on conflict(auth_user_id,source_person,target_person) do update set transaction_id=excluded.transaction_id;
 select id into request_id from public.tnt_profile_link_requests where person_id=p_source and target_person_id=p_target and status='pending' for update;
 if request_id is null then
  insert into public.tnt_profile_link_requests(person_id,target_person_id) values(p_source,p_target) returning id into request_id;
 end if;
 perform public.tnt_resolve_profile_link(request_id,true,'{}','');
 -- Retain the verification record for diagnostics, but revoke its transaction capability.
 update tnt_actions.profile_claims set transaction_id=0 where auth_user_id=auth.uid() and source_person=p_source;

end $$;
revoke all on function tnt_actions.link_verified_profile(uuid,uuid) from public,anon,authenticated;
