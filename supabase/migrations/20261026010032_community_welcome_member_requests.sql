-- Requests belong to Community members. Existing records and staff referent actions remain intact.
create or replace function tnt_actions.community_action_care(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();mod text:=p_data->>'module';item uuid:=nullif(p_data->>'id','')::uuid;target uuid:=nullif(p_data->>'person_id','')::uuid;
 c public.tnt_community_content%rowtype;e public.tnt_community_enrollments%rowtype;q public.tnt_community_questions%rowtype;
 a public.tnt_community_accompaniment%rowtype;f public.tnt_community_family_links%rowtype;ph public.tnt_community_phrases%rowtype;
 old_data jsonb;st text;cfg jsonb;steps jsonb;chosen integer;ver integer;result jsonb:='{}';new_id uuid;ref uuid;is_admin boolean:=public.tnt_is_admin();d date;dt date;vlevel integer;
begin
 if auth.uid() is null or not tnt_actions.community_active_person(pid) then raise exception 'Completá tu perfil e iniciá sesión para continuar.' using errcode='42501';end if;
 if p_action='ask' then
  mod='questions';if not exists(select 1 from public.tnt_community_modules where id=mod and enabled) then raise exception 'Este espacio está en pausa.';end if;
  insert into public.tnt_community_questions(person_id,question,visibility) values(pid,trim(p_data->>'question'),coalesce(p_data->>'visibility','private')) returning id into item;result=jsonb_build_object('id',item);
 elsif p_action='answer' then
  mod='questions';if not tnt_actions.community_can_for(pid,mod,2) then raise exception 'No tenés permiso para responder y publicar.' using errcode='42501';end if;
  select * into q from public.tnt_community_questions where id=item for update;if not found then raise exception 'No encontramos esa consulta.';end if;
  old_data=to_jsonb(q);st=coalesce(p_data->>'status','answered');if st='published' and q.visibility<>'community' then raise exception 'Esta consulta es privada. Su autor debe elegir compartirla.';end if;
  if st in('answered','published') and length(trim(coalesce(p_data->>'answer','')))=0 then raise exception 'Escribí una respuesta.';end if;
  update public.tnt_community_questions set answer=coalesce(p_data->>'answer',''),reference=coalesce(p_data->>'reference',''),status=st,answered_by=pid,updated_at=now() where id=item;
 elsif p_action='request_welcome' then
  if exists(select 1 from public.tnt_accounts x where x.person_id=pid and (x.staff_status='approved' or x.system_role='admin')) then raise exception 'Esta solicitud es para personas de Comunidad. El equipo participa como referente.' using errcode='42501';end if;
  target:=pid;item:=null;
  mod='welcome';if not exists(select 1 from public.tnt_community_modules where id=mod and enabled) then raise exception 'Este espacio está en pausa.';end if;insert into public.tnt_community_accompaniment(person_id) values(pid) on conflict do nothing;
 elsif p_action='assign_referent' then
  mod='welcome';if not is_admin then raise exception 'El referente lo elige Administración.' using errcode='42501';end if;
  ref=nullif(p_data->>'referent_id','')::uuid;
  if target is null or not tnt_actions.community_active_person(target) then raise exception 'Elegí una persona habilitada.';end if;
  if ref is not null and not exists(select 1 from public.tnt_accounts x join public.tnt_people p on p.id=x.person_id where x.person_id=ref and x.enabled and p.active and (x.staff_status='approved' or x.system_role='admin')) then raise exception 'Elegí un referente habilitado del equipo.';end if;
  select to_jsonb(x) into old_data from public.tnt_community_accompaniment x where person_id=target for update;
  insert into public.tnt_community_accompaniment(person_id,referent_id,status,assigned_by,assigned_at) values(target,ref,case when ref is null then 'unassigned' else 'pending' end,pid,now())
  on conflict(person_id) do update set referent_id=excluded.referent_id,status=excluded.status,assigned_by=pid,assigned_at=now(),responded_at=null;
 elsif p_action='respond_referent' then
  mod='welcome';select * into a from public.tnt_community_accompaniment where person_id=target for update;
  if not found or a.referent_id is distinct from pid or a.status<>'pending' then raise exception 'Esta invitación no está pendiente para tu cuenta.' using errcode='42501';end if;
  update public.tnt_community_accompaniment set status=case when (p_data->>'accept')::boolean then 'accepted' else 'declined' end,responded_at=now() where person_id=target;
 elsif p_action='followup' then
  mod='welcome';if not is_admin and not exists(select 1 from public.tnt_community_accompaniment where person_id=target and referent_id=pid and status='accepted') then raise exception 'Solo el referente confirmado o Administración puede registrar el seguimiento.' using errcode='42501';end if;
  insert into public.tnt_community_followups(person_id,author_id,contact_on,note,shared) values(target,pid,coalesce(nullif(p_data->>'contact_on','')::date,tnt_actions.community_today()),trim(p_data->>'note'),coalesce((p_data->>'shared')::boolean,false)) returning id into item;
 elsif p_action='request_family' then
  mod='families';if not exists(select 1 from public.tnt_community_modules where id=mod and enabled) then raise exception 'Este espacio está en pausa.';end if;if exists(select 1 from public.tnt_community_family_links where caregiver_id=pid and lower(trim(requested_name))=lower(trim(p_data->>'name')) and status in('pending','verified')) then raise exception 'Ya tenés una vinculación o solicitud para esta persona.';end if;
  insert into public.tnt_community_family_links(caregiver_id,requested_name,relationship) values(pid,trim(p_data->>'name'),trim(p_data->>'relationship')) returning id into item;
 elsif p_action='review_family' then
  mod='families';if not tnt_actions.community_can_for(pid,mod,3) then raise exception 'Necesitás permiso para verificar familias.' using errcode='42501';end if;
  select * into f from public.tnt_community_family_links where id=item for update;if not found then raise exception 'No encontramos esa solicitud.';end if;old_data=to_jsonb(f);
  st=case when (p_data->>'accept')::boolean then 'verified' else 'rejected' end;
  if st='verified' and not exists(select 1 from public.tnt_people where id=target and active) then raise exception 'Elegí el perfil correspondiente.';end if;
  update public.tnt_community_family_links set member_id=case when st='verified' then target else null end,status=st,reviewed_by=pid,reviewed_at=now() where id=item;
 elsif p_action='request_baptism' then
  mod='baptisms';if not exists(select 1 from public.tnt_community_modules where id=mod and enabled) then raise exception 'Este espacio está en pausa.';end if;insert into public.tnt_community_baptisms(person_id) values(pid) on conflict do nothing;
 elsif p_action='save_baptism' then
  mod='baptisms';if not tnt_actions.community_can_for(pid,mod,3) then raise exception 'Necesitás permiso para coordinar bautismos.' using errcode='42501';end if;
  select to_jsonb(b) into old_data from public.tnt_community_baptisms b where person_id=target for update;
  st=p_data->>'status';dt=case when st='completed' then nullif(p_data->>'completed_on','')::date else null end;
  if st='completed' and (dt is null or dt>tnt_actions.community_today() or not coalesce((p_data->>'confirmed')::boolean,false)) then raise exception 'Confirmá la realización e indicá una fecha válida.';end if;
  insert into public.tnt_community_baptisms(person_id,status,completed_on,updated_by) values(target,st,dt,pid) on conflict(person_id) do update set status=excluded.status,completed_on=excluded.completed_on,updated_by=pid,updated_at=now();
 else raise exception 'Acción no disponible.' using errcode='22023';end if;
 insert into public.tnt_community_history(module,action,actor,subject_id,details) values(coalesce(mod,'daily'),p_action,pid,coalesce(item::text,target::text,pid::text),jsonb_build_object('before',old_data,'notify',coalesce((p_data->>'notify')::boolean,false)));
 return result;
end $$;

revoke all on function tnt_actions.community_action_care(text,jsonb) from public,anon,authenticated;

notify pgrst,'reload schema';
