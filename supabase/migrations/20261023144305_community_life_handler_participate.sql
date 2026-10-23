create or replace function tnt_actions.community_action_participate(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();mod text:=p_data->>'module';item uuid:=nullif(p_data->>'id','')::uuid;target uuid:=nullif(p_data->>'person_id','')::uuid;
 c public.tnt_community_content%rowtype;e public.tnt_community_enrollments%rowtype;q public.tnt_community_questions%rowtype;
 a public.tnt_community_accompaniment%rowtype;f public.tnt_community_family_links%rowtype;ph public.tnt_community_phrases%rowtype;
 old_data jsonb;st text;cfg jsonb;steps jsonb;chosen integer;ver integer;result jsonb:='{}';new_id uuid;ref uuid;is_admin boolean:=public.tnt_is_admin();d date;dt date;vlevel integer;
begin
 if auth.uid() is null or not tnt_actions.community_active_person(pid) then raise exception 'Completá tu perfil e iniciá sesión para continuar.' using errcode='42501';end if;
 if p_action in('join_content','progress_content','leave_content','vote','consent') then
  select * into c from public.tnt_community_content where id=item for update;
  if not found or not tnt_actions.community_content_visible(item,pid) or c.status not in('published','scheduled') or c.starts_at>now() then raise exception 'Este contenido no está disponible para tu cuenta.' using errcode='42501';end if;mod=c.module;
  if not exists(select 1 from public.tnt_community_modules where id=mod and enabled) then raise exception 'Este espacio está en pausa.';end if;
  if p_action='vote' then
   if mod<>'polls' or c.ends_at<=now() then raise exception 'La votación está cerrada.';end if;chosen=(p_data->>'option_index')::integer;
   if chosen is null or chosen<1 or chosen>jsonb_array_length(c.config->'options') then raise exception 'Elegí una opción válida.';end if;
   insert into public.tnt_community_votes(content_id,person_id,option_index) values(item,pid,chosen) on conflict(content_id,person_id) do update set option_index=excluded.option_index;
  elsif p_action='consent' then
   if mod<>'families' or not coalesce((c.config->>'consent')::boolean,false) or c.ends_at<=now() then raise exception 'Esta autorización no está abierta.';end if;
   select * into f from public.tnt_community_family_links where id=(p_data->>'link_id')::uuid and caregiver_id=pid and status='verified';if not found then raise exception 'Necesitás una vinculación familiar verificada.' using errcode='42501';end if;
   if (p_data->>'version')::integer is distinct from c.version then raise exception 'El texto se actualizó. Recargá y revisalo antes de responder.' using errcode='40001';end if;
   select to_jsonb(x) into old_data from public.tnt_community_consents x where content_id=item and link_id=f.id;
   insert into public.tnt_community_consents(content_id,link_id,accepted,body_snapshot) values(item,f.id,(p_data->>'accepted')::boolean,c.body) on conflict(content_id,link_id) do update set accepted=excluded.accepted,body_snapshot=excluded.body_snapshot,answered_at=now();
  else
   if mod not in('bible','challenges','baptisms','games') then raise exception 'Este contenido no admite inscripciones.';end if;
   if p_action='join_content' then
    if c.ends_at<=now() then raise exception 'La inscripción está cerrada.';end if;
    insert into public.tnt_community_enrollments(content_id,person_id,content_version,snapshot_steps) values(item,pid,c.version,coalesce(c.config->'steps','[]')) on conflict(content_id,person_id) do update set status=case when public.tnt_community_enrollments.status='left' then 'active' else public.tnt_community_enrollments.status end,updated_at=now();
   elsif p_action='leave_content' then update public.tnt_community_enrollments set status='left',updated_at=now() where content_id=item and person_id=pid;
   else
    select * into e from public.tnt_community_enrollments where content_id=item and person_id=pid and status<>'left' for update;
    chosen=(p_data->>'step')::integer;if not found or chosen is null or chosen<1 or chosen>jsonb_array_length(e.snapshot_steps) then raise exception 'Elegí un paso válido de tu plan.';end if;
    update public.tnt_community_enrollments set completed_steps=case when coalesce((p_data->>'checked')::boolean,true) then array(select distinct x from unnest(completed_steps||chosen) x order by x) else array_remove(completed_steps,chosen) end,updated_at=now() where content_id=item and person_id=pid;
    update public.tnt_community_enrollments set status=case when cardinality(completed_steps)=jsonb_array_length(snapshot_steps) then 'completed' else 'active' end where content_id=item and person_id=pid;
   end if;
  end if;
 else raise exception 'Acción no disponible.' using errcode='22023';end if;
 insert into public.tnt_community_history(module,action,actor,subject_id,details) values(coalesce(mod,'daily'),p_action,pid,coalesce(item::text,target::text,pid::text),jsonb_build_object('before',old_data,'notify',coalesce((p_data->>'notify')::boolean,false)));
 return result;
end $$;

revoke all on function tnt_actions.community_action_participate(text,jsonb) from public,anon,authenticated;
