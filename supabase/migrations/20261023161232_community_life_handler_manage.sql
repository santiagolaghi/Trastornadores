create or replace function tnt_actions.community_action_manage(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();mod text:=p_data->>'module';item uuid:=nullif(p_data->>'id','')::uuid;target uuid:=nullif(p_data->>'person_id','')::uuid;
 c public.tnt_community_content%rowtype;e public.tnt_community_enrollments%rowtype;q public.tnt_community_questions%rowtype;
 a public.tnt_community_accompaniment%rowtype;f public.tnt_community_family_links%rowtype;ph public.tnt_community_phrases%rowtype;
 old_data jsonb;st text;cfg jsonb;steps jsonb;chosen integer;ver integer;result jsonb:='{}';new_id uuid;ref uuid;is_admin boolean:=public.tnt_is_admin();d date;dt date;vlevel integer;
begin
 if auth.uid() is null or not tnt_actions.community_active_person(pid) then raise exception 'Completá tu perfil e iniciá sesión para continuar.' using errcode='42501';end if;
 if p_action='save_module' then
  if not tnt_actions.community_can_for(pid,mod,2) then raise exception 'No tenés permiso para publicar en este espacio.' using errcode='42501';end if;
  select to_jsonb(m) into old_data from public.tnt_community_modules m where id=mod for update;
  if old_data is null or (old_data->>'version')::integer is distinct from (p_data->>'version')::integer then raise exception 'La configuración cambió. Recargá antes de guardar.' using errcode='40001';end if;
  if p_data ? 'enabled' and (p_data->>'enabled')::boolean is distinct from (old_data->>'enabled')::boolean and not tnt_actions.community_can_for(pid,mod,3) then raise exception 'Solo quien administra puede pausar este espacio.' using errcode='42501';end if;
  cfg=coalesce(p_data->'config',old_data->'config');
  if jsonb_typeof(cfg)<>'object' or octet_length(cfg::text)>50000 then raise exception 'Revisá la información de este espacio.';end if;
  if mod='daily' and coalesce((cfg->>'notification_hour')::integer,9) not between 0 and 23 then raise exception 'Elegí un horario entre 0 y 23.';end if;
  if mod='games' and (coalesce((cfg->>'lives')::integer,3) not between 1 and 3 or coalesce((cfg->>'easy_seconds')::integer,150) not between 30 and 600 or coalesce((cfg->>'normal_seconds')::integer,120) not between 30 and 600 or coalesce((cfg->>'hard_seconds')::integer,90) not between 30 and 600) then raise exception 'Revisá las vidas y los tiempos de los juegos.';end if;
  update public.tnt_community_modules set title=left(coalesce(nullif(trim(p_data->>'title'),''),title),150),description=left(coalesce(p_data->>'description',description),2000),config=coalesce(p_data->'config',config),enabled=coalesce((p_data->>'enabled')::boolean,enabled),version=version+1,updated_at=now() where id=mod returning to_jsonb(tnt_community_modules.*) into result;
 elsif p_action='save_grant' then
  if not is_admin then raise exception 'Solo Administración puede delegar permisos.' using errcode='42501';end if;
  if not exists(select 1 from public.tnt_accounts where person_id=target and enabled and (staff_status='approved' or system_role='admin')) then raise exception 'Elegí una persona habilitada del equipo.';end if;
  vlevel=coalesce((p_data->>'level')::integer,0);
  if vlevel=0 then delete from public.tnt_community_grants where person_id=target and module=mod;
  else insert into public.tnt_community_grants(person_id,module,level) values(target,mod,vlevel) on conflict(person_id,module) do update set level=excluded.level;end if;
 elsif p_action='save_content' then
  if not tnt_actions.community_can_for(pid,mod,1) then raise exception 'No tenés permiso para editar este espacio.' using errcode='42501';end if;
  if item is not null then select * into c from public.tnt_community_content where id=item and module=mod for update;if not found then raise exception 'No encontramos ese contenido.';end if;
   old_data=to_jsonb(c);if c.version is distinct from (p_data->>'version')::integer then raise exception 'Otra persona actualizó este contenido. Recargá para conservar sus cambios.' using errcode='40001';end if;
  end if;
  if mod not in('welcome','birthdays','bible','challenges','families','baptisms','polls','games') then raise exception 'Usá la gestión correspondiente a este espacio.';end if;
  st=coalesce(p_data->>'status','draft');cfg=coalesce(p_data->'config','{}');
  if st='scheduled' and nullif(p_data->>'starts_at','') is null then raise exception 'Indicá cuándo se publicará el contenido programado.';end if;
  if jsonb_typeof(cfg)<>'object' then raise exception 'Revisá el contenido.';end if;
  if st in('published','scheduled') or c.status in('published','scheduled') then
   if not tnt_actions.community_can_for(pid,mod,2) then raise exception 'Necesitás permiso de publicación.' using errcode='42501';end if;
  end if;
  if length(trim(coalesce(p_data->>'title','')))=0 then raise exception 'Escribí un título.';end if;
  if mod in('bible','challenges') and (jsonb_typeof(cfg->'steps') is distinct from 'array' or jsonb_array_length(cfg->'steps') not between 1 and 366) then raise exception 'Agregá al menos un paso o lectura.';end if;
  if mod in('bible','challenges') and exists(select 1 from jsonb_array_elements(cfg->'steps') v where length(trim(coalesce(v->>'title','')))=0 or length(v->>'title')>150 or length(coalesce(v->>'reflection',''))>5000 or mod='bible' and coalesce(v->>'reference','') !~ '^[1-3]?[A-Z]{2,3}\.[1-9][0-9]{0,2}(\.[1-9][0-9]{0,2}(-[1-9][0-9]{0,2})?)?$') then raise exception 'Cada paso necesita un título y los planes también una referencia bíblica válida.';end if;
  if mod='games' and cfg->>'kind'='quiz' then
   if jsonb_typeof(cfg->'questions') is distinct from 'array' or jsonb_array_length(cfg->'questions') not between 1 and 100 then raise exception 'El juego necesita entre una y cien preguntas.';end if;
   if exists(select 1 from jsonb_array_elements(cfg->'questions') q where length(trim(coalesce(q->>'question','')))=0 or length(trim(coalesce(q->>'answer','')))=0 or jsonb_typeof(q->'wrong') is distinct from 'array' or jsonb_array_length(q->'wrong')<>3 or (select count(distinct lower(trim(x))) from jsonb_array_elements_text(jsonb_build_array(q->>'answer')||(q->'wrong')) x)<>4) then raise exception 'Cada pregunta necesita una respuesta y tres alternativas diferentes.';end if;
  end if;
  if mod='polls' then
   if jsonb_typeof(cfg->'options') is distinct from 'array' or jsonb_array_length(cfg->'options') not between 2 and 12 then raise exception 'La encuesta necesita entre dos y doce opciones.';end if;
   if exists(select 1 from jsonb_array_elements_text(cfg->'options') x where length(trim(x))=0 or length(x)>500) then raise exception 'Completá todas las opciones.';end if;
   if exists(select 1 from jsonb_array_elements_text(cfg->'options') x group by lower(trim(x)) having count(*)>1) then raise exception 'Las opciones deben ser diferentes.';end if;
   if item is not null and exists(select 1 from public.tnt_community_votes where content_id=item) and (c.title is distinct from p_data->>'title' or c.body is distinct from coalesce(p_data->>'body','') or c.config->'options' is distinct from cfg->'options' or c.config->'anonymous' is distinct from cfg->'anonymous') then raise exception 'Esta encuesta ya recibió votos. Creá una nueva para cambiar la pregunta o las opciones.';end if;
  end if;
  new_id=coalesce(item,gen_random_uuid());
  insert into public.tnt_community_content(id,module,title,description,body,status,audience,starts_at,ends_at,config,created_by,updated_by)
  values(new_id,mod,trim(p_data->>'title'),coalesce(p_data->>'description',''),coalesce(p_data->>'body',''),st,coalesce(p_data->>'audience','all'),nullif(p_data->>'starts_at','')::timestamptz,nullif(p_data->>'ends_at','')::timestamptz,cfg,pid,pid)
  on conflict(id) do update set title=excluded.title,description=excluded.description,body=excluded.body,status=excluded.status,audience=excluded.audience,starts_at=excluded.starts_at,ends_at=excluded.ends_at,config=excluded.config,updated_by=pid,updated_at=now(),version=public.tnt_community_content.version+1;
  delete from public.tnt_community_audience where content_id=new_id;
  insert into public.tnt_community_audience(content_id,person_id) select new_id,value::uuid from jsonb_array_elements_text(coalesce(p_data->'people','[]')) on conflict do nothing;
  result=jsonb_build_object('id',new_id);item=new_id;
 else raise exception 'Acción no disponible.' using errcode='22023';end if;
 insert into public.tnt_community_history(module,action,actor,subject_id,details) values(coalesce(mod,'daily'),p_action,pid,coalesce(item::text,target::text,pid::text),jsonb_build_object('before',old_data,'notify',coalesce((p_data->>'notify')::boolean,false)));
 return result;
end $$;

revoke all on function tnt_actions.community_action_manage(text,jsonb) from public,anon,authenticated;
