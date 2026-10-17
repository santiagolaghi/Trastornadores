create function tnt_actions.continue_profile(p_target uuid,p_values jsonb,p_confirm boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare own uuid:=public.tnt_current_person_id();a public.tnt_accounts%rowtype;src public.tnt_people%rowtype;
 dst public.tnt_people%rowtype;v jsonb;matches jsonb;candidate jsonb;birthday date;verified boolean:=false;
begin
 if own is null or auth.uid() is null then raise exception 'Ingresá con Google para continuar' using errcode='42501';end if;
 select * into a from public.tnt_accounts where person_id=own and auth_user_id=auth.uid() and enabled for update;
 if not found then raise exception 'Esta cuenta no está habilitada' using errcode='42501';end if;
 select * into src from public.tnt_people where id=own and active;
 if not found then raise exception 'Tu perfil no está disponible';end if;
 v:=public.tnt_profile_values(own);
 matches:=public.tnt_match_profile_names(src.full_name,null);
 if p_target is null then
  if jsonb_array_length(matches)<>1 then return jsonb_build_object('linked',false);end if;
  candidate:=matches->0;p_target:=(candidate->>'id')::uuid;
 else
  if not exists(select 1 from jsonb_array_elements(matches) m where m->>'id'=p_target::text) then
   raise exception 'El perfil ya está vinculado o no coincide con tu identidad';end if;
 end if;
 -- Serialize claims to the same directory person and recheck the account under the lock.
 perform id from public.tnt_people where id in(own,p_target) order by id for update;
 select * into dst from public.tnt_people where id=p_target and active;
 if not found or exists(select 1 from public.tnt_accounts where person_id=p_target) then
  raise exception 'Este perfil ya tiene una cuenta Google';end if;
 begin birthday:=nullif(case when p_confirm then p_values->>'birthday' else v->>'birthday' end,'')::date;
 exception when invalid_datetime_format or datetime_field_overflow then birthday:=null;end;
 verified:=tnt_actions.profile_claim_matches(p_target,birthday,case when p_confirm then p_values->>'phone' else v->>'phone' end,case when p_confirm then p_values->>'dni' else v->>'dni' end);
 if p_confirm then
  insert into tnt_actions.profile_claim_attempts(auth_user_id,attempts) values(auth.uid(),1)
   on conflict(auth_user_id) do update set attempts=case when tnt_actions.profile_claim_attempts.window_start<now()-interval '15 minutes' then 1 else tnt_actions.profile_claim_attempts.attempts+1 end,
    window_start=case when tnt_actions.profile_claim_attempts.window_start<now()-interval '15 minutes' then now() else tnt_actions.profile_claim_attempts.window_start end;
  if exists(select 1 from tnt_actions.profile_claim_attempts where auth_user_id=auth.uid() and attempts>8) then return jsonb_build_object('linked',false,'error','Esperá unos minutos antes de volver a confirmar tu perfil.');end if;
 end if;
 if not coalesce(verified,false) then
  if p_confirm then return jsonb_build_object('linked',false,'error','No coinciden la fecha de nacimiento y el WhatsApp o DNI del perfil. Revisá los datos.');end if;
  return jsonb_build_object('linked',false,'candidate',jsonb_build_object('id',dst.id,'full_name',dst.full_name));
 end if;
 perform tnt_actions.link_verified_profile(own,p_target);
 return jsonb_build_object('linked',true,'person_id',p_target);
end $$;
create function public.tnt_continue_profile(p_target uuid default null,p_values jsonb default '{}',p_confirm boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select tnt_actions.continue_profile(p_target,p_values,p_confirm)$$;
revoke all on function public.tnt_continue_profile(uuid,jsonb,boolean),tnt_actions.continue_profile(uuid,jsonb,boolean) from public,anon;
grant execute on function public.tnt_continue_profile(uuid,jsonb,boolean),tnt_actions.continue_profile(uuid,jsonb,boolean) to authenticated;


notify pgrst,'reload schema';
