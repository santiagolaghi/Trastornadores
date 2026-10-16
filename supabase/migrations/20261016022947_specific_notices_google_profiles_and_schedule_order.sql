-- Every visible question is mandatory for the roles to whom it applies.
create or replace function public.tnt_profile_fields() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(f.key,f.value||jsonb_build_object('required',f.value->>'visible' is distinct from 'false')),'{}'::jsonb)
 from public.tnt_settings s cross join lateral jsonb_each(s.value) f where s.key='profile_fields';
$$;
create or replace function public.tnt_profile_missing_values(p_values jsonb) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'label',coalesce(value->>'label',key))),'[]'::jsonb)
 from jsonb_each(public.tnt_profile_fields()) f
 where value->>'visible' is distinct from 'false'
 and public.tnt_profile_field_applies(value,p_values)
 and (key<>'efe_service_role' or coalesce(p_values->>'efe_group','') not in('','none'))
 and (p_values->key is null or p_values->key in ('null'::jsonb,'[]'::jsonb,'{}'::jsonb)
 or trim(coalesce(p_values->>key,''))='' or (key='sex' and p_values->>key not in('M','F'))
 or (value->>'type'='leadership' and
   (jsonb_typeof(p_values->key) is distinct from 'object' or
    not coalesce(p_values->key ?& array['Acompañar jóvenes','Acompañar adolescentes','Enseñar','Escuchar','Organizar equipos','Comunicar'],false))));
$$;

CREATE OR REPLACE FUNCTION public.tnt_validate_profile_values(p_values jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare missing jsonb; f record; v text;
begin
 if p_values is null or jsonb_typeof(p_values)<>'object' then raise exception 'Revisá los datos del perfil';end if;
 missing:=public.tnt_profile_missing_values(p_values);
 if jsonb_array_length(missing)>0 then raise exception 'Completá: %',(select string_agg(x->>'label',', ') from jsonb_array_elements(missing) x);end if;
 for f in select * from jsonb_each(public.tnt_profile_fields()) loop
  if f.value->>'visible'='false' or not public.tnt_profile_field_applies(f.value,p_values) then continue;end if;
  if f.key='efe_service_role' and coalesce(p_values->>'efe_group','') in('','none') then continue;end if;
  v:=nullif(trim(p_values->>f.key),'');
  if v is null then continue;end if;
  if length(v)>2000 then raise exception 'La respuesta de % es demasiado larga',f.value->>'label';end if;
  if f.key in('first_name','last_name') and length(v)>100 then raise exception 'Revisá el nombre y apellido';end if;
  if f.value->>'type'='date' then perform v::date;end if;
  if f.key='birthday' and (v::date>current_date or v::date<date '1900-01-01') then raise exception 'Revisá tu fecha de nacimiento';end if;
  if f.key='sex' and v not in('M','F') then raise exception 'Elegí Mujer o Varón';end if;
  if f.key='phone' and (length(regexp_replace(v,'[^0-9]','','g')) not between 6 and 20 or length(v)>30) then raise exception 'Revisá el WhatsApp';end if;
  if f.key='dni' and v !~ '^[0-9]{6,10}$' then raise exception 'Revisá el DNI';end if;
  if f.key='efe_group' and v<>'none' and not exists(select 1 from public.tnt_efe_groups where code=v) then raise exception 'Elegí un EFE válido';end if;
  if f.value->>'type'='multiselect' and (jsonb_typeof(p_values->f.key)<>'array' or jsonb_array_length(p_values->f.key)>25) then raise exception 'Revisá tus intereses';end if;
  if f.value->>'type'='select' and f.key<>'sex' and not (coalesce(f.value->'options','[]') ? v) then raise exception 'Elegí una opción válida en %',f.value->>'label';end if;
 end loop;
end $function$;

-- Linking has one rule: use the account's completed value; fill only its blanks.
-- Omit absent answers entirely, especially leadership: JSON null is not a score.
create or replace function public.tnt_merge_profile_values(s jsonb,t jsonb,p_choices jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb:='{}';f record;v jsonb;
begin
 for f in select * from jsonb_each(public.tnt_profile_fields()) loop
  v:=s->f.key;
  if v is null or v in('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)
   or (jsonb_typeof(v)='string' and trim(v#>>'{}')='') then v:=t->f.key;end if;
  if v is null or v in('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)
   or (jsonb_typeof(v)='string' and trim(v#>>'{}')='') then continue;end if;
  result:=result||jsonb_build_object(f.key,v);
 end loop;
 return result;
end $$;
revoke all on function public.tnt_merge_profile_values(jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.tnt_resolve_profile_link(p_request uuid,p_approve boolean,p_choices jsonb default '{}',p_revision text default '') returns void
language plpgsql security definer set search_path='' as $$
declare r public.tnt_profile_link_requests%rowtype;preview jsonb;s jsonb;t jsonb;merged jsonb;
begin
 if public.tnt_current_person_id() is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden vincular perfiles' using errcode='42501';end if;
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
end $$;
revoke all on function public.tnt_resolve_profile_link(uuid,boolean,jsonb,text) from public,anon;
grant execute on function public.tnt_resolve_profile_link(uuid,boolean,jsonb,text) to authenticated;

-- Notices explain who did what; never include private answers in push text.
create schema if not exists tnt_actions;
revoke all on schema tnt_actions from public,anon;
grant usage on schema tnt_actions to authenticated;
create or replace function tnt_actions.notify_account_created() returns trigger
language plpgsql security definer set search_path='' as $$
declare who text;
begin
 if new.auth_user_id is null then return new;end if;
 select left(coalesce(nullif(trim(full_name),''),'Una persona'),120) into who from public.tnt_people where id=new.person_id;
 insert into public.tnt_notifications(person_id,title,body,href,data)
 select a.person_id,who||' creó su cuenta','Se registró con Google en TNT.','/admin/?tab=users',
  jsonb_build_object('kind','account_created','actor_person_id',new.person_id)
 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
 where a.system_role='admin' and a.enabled and p.active and a.person_id<>new.person_id;
 return new;
end $$;
revoke all on function tnt_actions.notify_account_created() from public,anon,authenticated;
create trigger tnt_account_created_notice after insert on public.tnt_accounts
 for each row execute function tnt_actions.notify_account_created();

create or replace function public.tnt_notify_review_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare who text;headline text;message text;row_data jsonb:=to_jsonb(new);area text;changes text;
begin
 if coalesce(row_data->>'status','pending')<>'pending' then return new;end if;
 select left(coalesce(nullif(trim(full_name),''),'Una persona'),120) into who from public.tnt_people where id=new.person_id;
 if tg_table_name='tnt_role_requests' then
  headline:=who||' solicitó ser '||coalesce(row_data->>'requested_role','parte del staff');
  message:='Revisá su función y sus permisos en Administración.';
 elsif tg_table_name='tnt_profile_change_requests' then
  select string_agg(coalesce(public.tnt_profile_fields()->x.key->>'label',x.key),', ' order by x.key) into changes
  from jsonb_each(coalesce(row_data->'proposed_values','{}')) x
  where x.value is distinct from row_data->'before_values'->x.key;
  headline:=who||' pidió actualizar su perfil';
  message:=case when changes is null then 'Revisá los datos propuestos en Administración.' else 'Datos a revisar: '||changes||'.' end;
 else
  area:=case row_data->>'module' when 'organizacion' then 'Organización' when 'campamento' then 'Campamento'
   when 'campamento-salud' then 'Salud de Campamento' when 'buffet' then 'Buffet' when 'chat' then 'Chat'
   when 'perfiles' then 'Perfiles' when 'glosario' then 'Prédicas y Glosario'
   when 'efe' then 'EFE' when 'lista-sabados' then 'Asistencia de Sábados' when 'asistencia' then 'Asistencia'
   else coalesce(row_data->>'module','un módulo') end;
  headline:=who||' pidió acceso a '||area;
  message:='Acceso solicitado: '||case row_data->>'requested_level' when 'view' then 'ver' when 'edit' then 'editar' when 'manage' then 'administrar' else coalesce(row_data->>'requested_level','ver') end||'. Revisá la solicitud en Administración.';
 end if;
 insert into public.tnt_notifications(person_id,title,body,href,data)
 select a.person_id,headline,message,'/admin/?tab=requests',
  jsonb_build_object('request_id',new.id,'request_table',tg_table_name,'actor_person_id',new.person_id)
 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
 where a.system_role='admin' and a.enabled and p.active;
 return new;
end $$;
revoke all on function public.tnt_notify_review_request() from public,anon,authenticated;

-- Reorder a complete day atomically; compare the captured schedule before saving.
create or replace function tnt_actions.reorder_schedule(p_day uuid,p_ids uuid[],p_before jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.tnt_schedule_days%rowtype;current_rows jsonb;provided jsonb;item public.tnt_schedule_items%rowtype;
 all_ids uuid[];position integer:=0;clock timestamp;span integer;task_event uuid;
begin
 if auth.uid() is null or public.tnt_current_person_id() is null or not public.tnt_profile_is_complete() then
  raise exception 'Completá tu perfil antes de ordenar el cronograma' using errcode='42501';end if;
 select * into d from public.tnt_schedule_days where id=p_day for update;
 if not found or not public.tnt_event_can_action(d.event_id,'edit_activity') then
  raise exception 'No tenés permiso para ordenar este encuentro' using errcode='42501';end if;
 if exists(select 1 from public.tnt_events where id=d.event_id and status='cancelled') then raise exception 'El encuentro está cancelado';end if;
 perform id from public.tnt_tasks where id in(select task_id from public.tnt_schedule_items where day_id=p_day and archived_at is null) order by id for update;
 perform id from public.tnt_schedule_items where day_id=p_day and archived_at is null order by id for update;
 select array_agg(i.id order by i.id),jsonb_agg(jsonb_build_object('id',i.id,'starts_at',i.starts_at,
  'duration_minutes',i.duration_minutes,'sort_order',coalesce(i.sort_order,0),'task_id',i.task_id) order by i.id),
  d.date+min(i.starts_at) into all_ids,current_rows,clock
 from public.tnt_schedule_items i left join public.tnt_tasks t on t.id=i.task_id
 where i.day_id=p_day and i.archived_at is null and (i.task_id is null or t.id is not null and t.archived_at is null);
 if cardinality(all_ids) is null or cardinality(all_ids)<2 or p_ids is null
  or cardinality(p_ids)<>cardinality(all_ids) or (select array_agg(x order by x) from unnest(p_ids) x) is distinct from all_ids
  or (select count(distinct x) from unnest(p_ids) x)<>cardinality(all_ids) then
  raise exception 'La lista cambió. Actualizá el cronograma antes de ordenar';end if;
 if p_before is null or jsonb_typeof(p_before)<>'array' then raise exception 'Falta la versión del cronograma';end if;
 select jsonb_agg(v order by v->>'id') into provided from jsonb_array_elements(p_before) v;
 if provided is distinct from current_rows then raise exception 'Otra persona cambió el cronograma. Actualizamos la lista para que vuelvas a ordenar';end if;
 for item in select i.* from unnest(p_ids) with ordinality o(id,n) join public.tnt_schedule_items i on i.id=o.id order by o.n loop
  if item.task_id is not null then
   select event_id into task_event from public.tnt_tasks where id=item.task_id;
   if task_event is distinct from d.event_id then raise exception 'Una actividad pertenece a otro encuentro. Revisá su vínculo antes de ordenar';end if;
  end if;
  span:=coalesce(item.duration_minutes,(select duration_minutes from public.tnt_tasks where id=item.task_id),5);
  if span not between 1 and 1440 then raise exception 'Revisá la duración de %',item.title;end if;
  if clock is not null and clock+make_interval(mins=>span)>d.date+interval '1 day' then
   raise exception 'El cronograma supera la medianoche. Ajustá las duraciones antes de ordenar';end if;
  update public.tnt_schedule_items set sort_order=position,starts_at=case when clock is null then starts_at else clock::time end,
   duration_minutes=case when clock is null then duration_minutes else span end where id=item.id;
  if item.task_id is not null then
   update public.tnt_tasks set sort_order=position,planned_start=case when clock is null then planned_start else clock at time zone 'America/Argentina/Buenos_Aires' end,
    duration_minutes=case when clock is null then duration_minutes else span end where id=item.task_id;
  end if;
  position:=position+1;clock:=clock+make_interval(mins=>span);
 end loop;
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
 values(public.tnt_current_person_id(),'event',d.event_id,'schedule_reordered',jsonb_build_object('day_id',p_day,'before',current_rows,'item_ids',to_jsonb(p_ids)));
 return jsonb_build_object('day_id',p_day,'items',(select jsonb_agg(to_jsonb(i) order by sort_order) from public.tnt_schedule_items i where id=any(p_ids)));
end $$;
create or replace function public.tnt_reorder_schedule(p_day uuid,p_ids uuid[],p_before jsonb) returns jsonb
language sql security invoker set search_path='' as $$select tnt_actions.reorder_schedule(p_day,p_ids,p_before)$$;
revoke all on function tnt_actions.reorder_schedule(uuid,uuid[],jsonb),public.tnt_reorder_schedule(uuid,uuid[],jsonb) from public,anon;
grant execute on function tnt_actions.reorder_schedule(uuid,uuid[],jsonb),public.tnt_reorder_schedule(uuid,uuid[],jsonb) to authenticated;

