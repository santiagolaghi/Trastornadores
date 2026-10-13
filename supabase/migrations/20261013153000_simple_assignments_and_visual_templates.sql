-- Recoverable template edits and direct assignments chosen by coordinators.
alter table public.tnt_templates add column if not exists archived_at timestamptz;
alter table public.tnt_template_items add column if not exists archived_at timestamptz;

create or replace function public.tnt_save_org_template(p_id uuid,p_values jsonb,p_items jsonb,p_version integer default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid:=coalesce(p_id,gen_random_uuid()); item jsonb; iid uuid; ord integer:=0; existing_version integer;
begin
 if not public.tnt_can_action('organizacion','templates','*') then raise exception 'No tenés permiso para gestionar plantillas' using errcode='42501';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 or
    length(trim(coalesce(p_values->>'name',''))) not between 1 and 160 or
    coalesce(p_values->>'kind','') not in('saturday','event','camp') then raise exception 'Revisá el nombre y el tipo de la plantilla';end if;
 if p_id is not null then
  select version into existing_version from public.tnt_templates where id=tid and archived_at is null for update;
  if not found then raise exception 'Esta plantilla ya no está disponible';end if;
  if p_version is not null and existing_version<>p_version then raise exception 'Otra persona cambió la plantilla. Volvé a abrirla antes de guardar.';end if;
  update public.tnt_templates set name=trim(p_values->>'name'),kind=p_values->>'kind',description=p_values->>'description',version=version+1,updated_at=now() where id=tid;
 else
  insert into public.tnt_templates(id,name,kind,description,created_by) values(tid,trim(p_values->>'name'),p_values->>'kind',p_values->>'description',public.tnt_current_person_id());
 end if;
 update public.tnt_template_items set archived_at=now() where template_id=tid and archived_at is null;
 for item in select value from jsonb_array_elements(p_items) loop
  iid:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
  if length(trim(coalesce(item->>'title',''))) not between 1 and 160 or coalesce(item->>'task_type','') not in('simple','complex','logistics')
   or coalesce(nullif(item->>'duration_minutes','')::integer,5) not between 1 and 1440 then raise exception 'Revisá las actividades de la plantilla';end if;
  if coalesce(item->>'reference_url','')<>'' and item->>'reference_url' !~ '^https?://' then raise exception 'Revisá el enlace de referencia';end if;
  if exists(select 1 from public.tnt_template_items where id=iid and template_id<>tid) then raise exception 'La actividad pertenece a otra plantilla' using errcode='42501';end if;
  insert into public.tnt_template_items(id,template_id,title,icon,task_type,description,sort_order,duration_minutes,materials,checklist,reference_url,budget_estimated,archived_at)
   values(iid,tid,trim(item->>'title'),coalesce(item->>'icon','✓'),item->>'task_type',item->>'description',ord,
    coalesce(nullif(item->>'duration_minutes','')::integer,5),item->>'materials',coalesce(item->'checklist','[]'),nullif(item->>'reference_url',''),nullif(item->>'budget_estimated','')::numeric,null)
   on conflict(id) do update set title=excluded.title,icon=excluded.icon,task_type=excluded.task_type,description=excluded.description,sort_order=excluded.sort_order,
    duration_minutes=excluded.duration_minutes,materials=excluded.materials,checklist=excluded.checklist,reference_url=excluded.reference_url,budget_estimated=excluded.budget_estimated,archived_at=null
    where public.tnt_template_items.template_id=tid;
  ord:=ord+1;
 end loop;
 return tid;
end $$;
revoke all on function public.tnt_save_org_template(uuid,jsonb,jsonb,integer) from public,anon;
grant execute on function public.tnt_save_org_template(uuid,jsonb,jsonb,integer) to authenticated;

create or replace function public.tnt_archive_org_template(p_template uuid,p_restore boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.tnt_can_action('organizacion','templates','*') then raise exception 'No tenés permiso para gestionar plantillas' using errcode='42501';end if;
 update public.tnt_templates set archived_at=case when p_restore then null else now() end,updated_at=now(),version=version+1 where id=p_template;
 if not found then raise exception 'Plantilla no encontrada';end if;
end $$;
revoke all on function public.tnt_archive_org_template(uuid,boolean) from public,anon;
grant execute on function public.tnt_archive_org_template(uuid,boolean) to authenticated;

create or replace function public.tnt_direct_activity_assignment() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.assignment_status in('assigned','read') then new.assignment_status:='accepted';new.responded_at:=coalesce(new.responded_at,now());end if;
 return new;
end $$;
create or replace trigger tnt_direct_assignment_before_write
before insert or update on public.tnt_task_assignees
for each row execute function public.tnt_direct_activity_assignment();
alter table public.tnt_task_assignees alter column assignment_status set default 'accepted';
update public.tnt_task_assignees set assignment_status='accepted',responded_at=coalesce(responded_at,now()) where assignment_status in('assigned','read');

-- This records how staff participates in an EFE; it grants no module permissions.
update public.tnt_settings set value=value||jsonb_build_object('efe_service_role',jsonb_build_object(
 'label','Mi lugar en este EFE','type','select','visible',true,'required',false,
 'roles',jsonb_build_array('Admin','Pastor/a','Líder','Timoteo','Colaborador'),
 'options',jsonb_build_array('Participo','Soy líder de este EFE','Soy Timoteo de este EFE')))
where key='profile_fields' and not (value ? 'efe_service_role');
