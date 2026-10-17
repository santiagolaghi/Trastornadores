CREATE OR REPLACE FUNCTION public.tnt_profile_link_preview(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.tnt_profile_link_requests%rowtype;s jsonb;t jsonb;
begin
 if public.tnt_current_person_id() is null or not tnt_actions.can_link_request(p_request) then raise exception 'Solo administradores pueden revisar vínculos' using errcode='42501';end if;
 select * into r from public.tnt_profile_link_requests where id=p_request and status='pending';
 if not found then raise exception 'La solicitud ya fue atendida';end if;
 select (to_jsonb(p)-'data_notes')||public.tnt_profile_values(p.id) into s from public.tnt_people p where p.id=r.person_id;
 select (to_jsonb(p)-'data_notes')||public.tnt_profile_values(p.id) into t from public.tnt_people p where p.id=r.target_person_id;
 return jsonb_build_object('source',s,'target',t,'fields',public.tnt_profile_fields(),'revision',md5(s::text||t::text),'history',jsonb_build_object(
 'saturdays',(select count(*) from public.tnt_saturday_attendance where person_id in(r.person_id,r.target_person_id)),
 'efe',(select count(*) from public.tnt_efe_wednesday_attendance where person_id in(r.person_id,r.target_person_id)),
 'camps',(select count(*) from public.tnt_camp_registrations where person_id in(r.person_id,r.target_person_id)),
 'messages',(select count(*) from public.tnt_chat_messages where person_id in(r.person_id,r.target_person_id))));
end $function$
;

CREATE OR REPLACE FUNCTION public.tnt_resolve_profile_link(p_request uuid, p_approve boolean, p_choices jsonb DEFAULT '{}'::jsonb, p_revision text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.tnt_profile_link_requests%rowtype;preview jsonb;s jsonb;t jsonb;merged jsonb;
begin
 if public.tnt_current_person_id() is null or not tnt_actions.can_link_request(p_request) then raise exception 'Solo administradores pueden vincular perfiles' using errcode='42501';end if;
 if not p_approve then perform public.tnt_review_profile_link(p_request,false);return;end if;
 select * into r from public.tnt_profile_link_requests where id=p_request and status='pending' for update;
 if not found then raise exception 'La solicitud ya fue atendida';end if;
 perform id from public.tnt_people where id in(r.person_id,r.target_person_id) order by id for update;
 preview:=public.tnt_profile_link_preview(p_request);
 if p_revision<>'' and preview->>'revision'<>p_revision then raise exception 'Los datos cambiaron. Volvé a abrir la revisión.';end if;
 s:=preview->'source';t:=preview->'target';
 merged:=public.tnt_merge_profile_values(s,t,p_choices);
 -- Account permissions come from the signed-in source, never from the old directory entry.
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
 values(public.tnt_current_person_id(),'profile',r.target_person_id,'profile_merge_choices',
 jsonb_build_object('request_id',r.id,'source_values',s,'target_values',t,'resolution','google_account_priority',
 'old_grants',(select jsonb_agg(to_jsonb(g)) from public.tnt_access_grants g where person_id=r.target_person_id),
 'old_overrides',(select jsonb_agg(to_jsonb(g)) from public.tnt_person_permission_overrides g where person_id=r.target_person_id)));
 perform public.tnt_copy_link_permissions(r.person_id,r.target_person_id);
 update public.tnt_people set first_name=coalesce(merged->>'first_name',first_name),last_name=coalesce(merged->>'last_name',last_name),
 full_name=trim(coalesce(merged->>'first_name',first_name)||' '||coalesce(merged->>'last_name',last_name)),
 normalized_name=lower(trim(coalesce(merged->>'first_name',first_name)||' '||coalesce(merged->>'last_name',last_name))),
 birthday=coalesce(nullif(merged->>'birthday','')::date,birthday),sex=coalesce(nullif(merged->>'sex',''),sex),
 phone=coalesce(merged->>'phone',phone),instagram=coalesce(merged->>'instagram',instagram) where id=r.target_person_id;
 if merged ? 'dni' then
  insert into public.tnt_profile_private_fields(person_id,dni) values(r.target_person_id,coalesce(merged->>'dni',''))
   on conflict(person_id) do update set dni=excluded.dni;
  update public.tnt_profile_private_fields set dni=coalesce(merged->>'dni','') where person_id=r.person_id;
 end if;
 perform public.tnt_apply_profile_answers(r.target_person_id,merged);
 perform public.tnt_review_profile_link(p_request,true);
 perform public.tnt_apply_profile_answers(r.target_person_id,merged);
end $function$
;


notify pgrst,'reload schema';
