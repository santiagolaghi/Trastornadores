-- Worker-only routines are not part of the signed-in API.
revoke all on function public.tnt_claim_push(integer),public.tnt_notification_resolved(public.tnt_notifications),public.tnt_enqueue_push() from public,anon,authenticated;
grant execute on function public.tnt_claim_push(integer),public.tnt_notification_resolved(public.tnt_notifications),public.tnt_enqueue_push() to service_role;

CREATE OR REPLACE FUNCTION public.tnt_camp_public_register(p_slug text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.tnt_camp_editions; s public.tnt_camp_settings; ch public.tnt_camp_churches; plan public.tnt_camp_payment_plans; pid uuid; rid uuid; nm text; norm text; bd date; ph text; em text; answers jsonb; token uuid;begin
 if not public.tnt_module_enabled('campamento') then raise exception 'Este espacio está en pausa por el momento.' using errcode='42501';end if;
 select * into c from public.tnt_camp_editions where public_slug=p_slug;
 if c.id is null then raise exception 'Formulario no encontrado.' using errcode='22023'; end if;
 select * into s from public.tnt_camp_settings where camp_id=c.id;
 if not coalesce(s.form_open,false) or c.status in ('closed','archived') or (s.registration_deadline is not null and current_date>s.registration_deadline) then raise exception 'Las inscripciones están cerradas.' using errcode='22023'; end if;
 if (select count(*) from public.tnt_camp_registrations r where r.camp_id=c.id and r.deleted_at is null and r.status<>'cancelled')>=c.capacity then raise exception 'El cupo está completo.' using errcode='22023'; end if;
 nm:=nullif(trim(p_payload->>'full_name'),''); em:=lower(nullif(trim(p_payload->>'email'),'')); ph:=nullif(trim(p_payload->>'phone'),''); bd:=nullif(p_payload->>'birthday','')::date; answers:=coalesce(p_payload->'answers','{}'::jsonb);
 if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(answers) is distinct from 'object'
    or coalesce((p_payload->>'consent')::boolean,false) is not true then
  raise exception 'Confirmá la autorización y revisá los datos del formulario.' using errcode='22023';
 end if;
 if length(coalesce(nm,''))<2 or length(nm)>150 or bd is null or bd>current_date
    or length(regexp_replace(coalesce(ph,''),'[^0-9]','','g'))<6
    or coalesce(p_payload->>'sex','') not in ('F','M') then
  raise exception 'Completá nombre, nacimiento, WhatsApp y género.' using errcode='22023';
 end if;
 if nullif(p_payload->>'church_id','') is null
    or not exists(select 1 from public.tnt_camp_churches where id=(p_payload->>'church_id')::uuid and active) then
  raise exception 'Elegí una iglesia disponible.' using errcode='22023';
 end if;
 if exists(select 1 from public.tnt_camp_payment_plans where camp_id=c.id and active)
    and not exists(select 1 from public.tnt_camp_payment_plans where id=nullif(p_payload->>'plan_id','')::uuid and camp_id=c.id and active) then
  raise exception 'Elegí un plan de pago disponible.' using errcode='22023';
 end if;
 if exists(select 1 from public.tnt_camp_form_fields f where f.camp_id=c.id and f.active and f.required
    and (answers->f.field_key is null or answers->f.field_key='null'::jsonb
         or nullif(trim(answers->>f.field_key),'') is null
         or f.field_type='checkbox' and answers->f.field_key is distinct from 'true'::jsonb)) then
  raise exception 'Completá las preguntas obligatorias del formulario.' using errcode='22023';
 end if;
 if exists(select 1 from public.tnt_camp_form_fields f where f.camp_id=c.id and f.active and f.field_type='select'
    and nullif(answers->>f.field_key,'') is not null
    and not exists(select 1 from jsonb_array_elements_text(f.options) opt where opt=answers->>f.field_key)) then
  raise exception 'Elegí una opción disponible en las preguntas del formulario.' using errcode='22023';
 end if;

 if nm is null or em is null or position('@' in em)<2 then raise exception 'Revisá nombre y email.' using errcode='22023'; end if;
 norm:=lower(trim(regexp_replace(nm,'[[:space:]]+',' ','g')));
 if nullif(p_payload->>'church_id','') is not null then select * into ch from public.tnt_camp_churches where id=(p_payload->>'church_id')::uuid and active; end if;
 if nullif(p_payload->>'plan_id','') is not null then select * into plan from public.tnt_camp_payment_plans where id=(p_payload->>'plan_id')::uuid and camp_id=c.id and active; end if;
 if exists(select 1 from public.tnt_camp_registrations r where r.camp_id=c.id and r.deleted_at is null and lower(r.email)=em) then raise exception 'Ya existe una inscripción con ese email para este campamento.' using errcode='23505'; end if;
 select id into pid from public.tnt_people where active and birthday is not distinct from bd and lower(trim(regexp_replace(full_name,'[[:space:]]+',' ','g')))=norm limit 1;
 if pid is null then
   pid:=gen_random_uuid();
   insert into public.tnt_people(id,full_name,normalized_name,birthday,phone,sex,source,active)
   values(pid,nm,norm,bd,ph,coalesce(nullif(p_payload->>'sex',''),'U'),'campamento',true);

 end if;
 rid:=gen_random_uuid(); token:=gen_random_uuid();
 insert into public.tnt_camp_registrations(id,camp_id,person_id,email,church_id,payment_plan_id,public_token,form_submitted_at,congregation,fee,status,"authorization",notes,answers,document_no)
 values(rid,c.id,pid,em,ch.id,plan.id,token,now(),coalesce(ch.name,''),coalesce(plan.total_amount,c.fee),'pending',false,coalesce(p_payload->>'notes',''),answers,coalesce(p_payload->>'document_no',''));
 perform public.tnt_camp_queue_reg_notification(rid,'registration_received',null,'form');
 insert into public.tnt_notifications(person_id,title,body,href,data)
 select a.person_id,'Nueva inscripción · '||c.name,nm||' completó el formulario.','/campamento/',jsonb_build_object('camp_id',c.id,'registration_id',rid)
 from public.tnt_accounts a where a.system_role='admin' and a.enabled
 on conflict do nothing;
 return jsonb_build_object('registration_id',rid,'token',token,'camp',c.name,'name',nm,'balance',public.tnt_camp_current_balance(rid));
end $function$;
CREATE OR REPLACE FUNCTION public.tnt_save_event_members(p_event uuid, p_members jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_count int;
  v_organizers int;
begin
  v_actor:=public.tnt_current_person_id();
  if v_actor is null or not public.tnt_event_can_action(p_event,'manage_people') then
    raise exception 'No tenés permiso para gestionar las personas de este encuentro.' using errcode='42501';
  end if;
  if not exists(select 1 from public.tnt_events where id=p_event) then
    raise exception 'El encuentro ya no existe.' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_members,'[]'::jsonb))<>'array' then
    raise exception 'La lista de personas no es válida.' using errcode='22023';
  end if;

  with incoming as (
    select
      nullif(x->>'person_id','')::uuid person_id,
      case when x->>'event_role'='organizer' then 'organizer' else 'participant' end event_role,
      coalesce((x->>'include_in_groups')::boolean,false) include_in_groups
    from jsonb_array_elements(coalesce(p_members,'[]'::jsonb)) x
  )
  select count(*),count(*) filter(where event_role='organizer')
  into v_count,v_organizers
  from incoming
  where person_id is not null;

  if v_count=0 then
    raise exception 'El encuentro necesita al menos una persona incluida.' using errcode='22023';
  end if;
  if v_organizers=0 then
    raise exception 'Elegí al menos una persona que coordine el encuentro.' using errcode='22023';
  end if;

  delete from public.tnt_event_members em
  where em.event_id=p_event
    and not exists(
      select 1
      from jsonb_array_elements(coalesce(p_members,'[]'::jsonb)) x
      where nullif(x->>'person_id','')::uuid=em.person_id
    );

  insert into public.tnt_event_members(event_id,person_id,event_role,include_in_groups)
  select
    p_event,
    nullif(x->>'person_id','')::uuid,
    case when x->>'event_role'='organizer' then 'organizer' else 'participant' end,
    coalesce((x->>'include_in_groups')::boolean,false)
  from jsonb_array_elements(coalesce(p_members,'[]'::jsonb)) x
  where nullif(x->>'person_id','') is not null
    and exists(select 1 from public.tnt_people p where p.id=nullif(x->>'person_id','')::uuid)
  on conflict(event_id,person_id) do update
  set event_role=excluded.event_role,
      include_in_groups=excluded.include_in_groups;
end $function$;
CREATE OR REPLACE FUNCTION public.tnt_submit_public_profile(p_values jsonb, p_consent boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb:=p_values; norm text; fullname text; bday date; p public.tnt_people%rowtype; rid uuid; matches integer; previous jsonb;
begin
 if not public.tnt_module_enabled('perfiles') then raise exception 'Este espacio está en pausa por el momento.' using errcode='42501';end if;
 if p_consent is distinct from true then raise exception 'Necesitamos tu autorización para guardar el perfil';end if;
 perform public.tnt_validate_profile_values(v);
 bday:=nullif(v->>'birthday','')::date;
 fullname:=trim(coalesce(v->>'first_name','')||' '||coalesce(v->>'last_name',''));
 norm:=regexp_replace(translate(lower(fullname),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(norm||':'||coalesce(bday::text,''),0));
 if bday is not null and fullname<>'' then
  select count(*) into matches from public.tnt_people where birthday=bday and not (coalesce(data_notes,'{}') ? 'linked_to')
  and regexp_replace(translate(lower(full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')=norm;
 else matches:=0;end if;
 if matches>1 then raise exception 'Un administrador necesita revisar perfiles que coinciden con estos datos';end if;
 if matches=0 then
  insert into public.tnt_people(full_name,normalized_name,birthday,sex,phone,source,active,first_name,last_name,instagram,profile_consent,profile_created_at,profile_updated_at)
  values(coalesce(nullif(fullname,''),'Perfil TNT'),norm,bday,coalesce(nullif(v->>'sex',''),'U'),nullif(trim(v->>'phone'),''),'profiles',true,trim(v->>'first_name'),trim(v->>'last_name'),nullif(trim(v->>'instagram'),''),true,now(),now()) returning id into rid;
  insert into public.tnt_profile_private_fields(person_id,dni) values(rid,coalesce(v->>'dni',''));
  perform public.tnt_apply_profile_answers(rid,v);
  return rid;
 end if;
 select * into p from public.tnt_people where birthday=bday and not (coalesce(data_notes,'{}') ? 'linked_to')
 and regexp_replace(translate(lower(full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')=norm for update;
 previous:=jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),
 'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),
 'birthday',p.birthday::text,'sex',p.sex,'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''));
 -- An anonymous match never exposes or overwrites the existing record.
 insert into public.tnt_profile_public_requests(person_id,before_values,proposed_values) values(p.id,previous,v)
 on conflict(person_id) where status='pending' do nothing returning id into rid;
 if rid is null then select id into rid from public.tnt_profile_public_requests where person_id=p.id and status='pending';end if;
 return rid;
end $function$;
create or replace function public.tnt_notification_resolved(p_note public.tnt_notifications) returns boolean language plpgsql stable security definer set search_path='' as $$
declare tab text:=p_note.data->>'request_table'; req uuid; st text;target uuid;begin
 if (p_note.event_id is not null or p_note.task_id is not null) and not public.tnt_module_enabled('organizacion') then return true;end if;
 target:=coalesce(p_note.task_id,substring(p_note.href from '[?&]task=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})')::uuid);
 if target is not null and not exists(select 1 from public.tnt_tasks where id=target and archived_at is null and status<>'completed') then return true;end if;
 target:=coalesce(p_note.event_id,substring(p_note.href from '[?&]event=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})')::uuid);
 if target is not null and not exists(select 1 from public.tnt_events where id=target and status not in('cancelled','completed')) then return true;end if;
 if p_note.event_id is not null and not exists(select 1 from public.tnt_events where id=p_note.event_id and status<>'cancelled') then return true;end if;
 if p_note.task_id is not null and not exists(select 1 from public.tnt_tasks where id=p_note.task_id and archived_at is null and status not in('completed')) then return true;end if;
 if (p_note.title in('Nueva asignación','🔔 No confirmaste tu asignación') or p_note.data->>'kind'='assignment') and p_note.task_id is not null then return not exists(select 1 from public.tnt_task_assignees where task_id=p_note.task_id and person_id=p_note.person_id and assignment_status in('assigned','read'));end if;
 if p_note.title='Necesita reemplazo' and p_note.task_id is not null then return not exists(select 1 from public.tnt_tasks where id=p_note.task_id and status='replacement');end if;
 if p_note.title='Actividad lista' and p_note.task_id is not null then return not exists(select 1 from public.tnt_tasks where id=p_note.task_id and status='ready');end if;
 if tab in('tnt_profile_change_requests','tnt_profile_link_requests','tnt_role_requests','tnt_access_requests','tnt_profile_public_requests') and coalesce(p_note.data->>'request_id','')~'^[0-9a-f-]{36}$' then
  req:=(p_note.data->>'request_id')::uuid;execute format('select status from public.%I where id=$1',tab) into st using req;return st is distinct from 'pending';
 end if;
 return false;
end $$;

create policy tnt_push_outbox_service on public.tnt_push_outbox for all to service_role using(true) with check(true);
create index tnt_experience_versions_publisher on public.tnt_experience_versions(published_by);
create index tnt_tasks_archive_batch on public.tnt_tasks(archive_batch) where archive_batch is not null;
do $$declare t text;begin
 foreach t in array array['tnt_profile_answers','tnt_camp_editions','tnt_camp_registrations','tnt_camp_payments','tnt_camp_settings','tnt_camp_resources','tnt_camp_assignments','tnt_camp_form_fields','tnt_camp_messages','tnt_camp_payment_plans','tnt_camp_plan_installments','tnt_camp_payment_exceptions','tnt_camp_sponsorships','tnt_efe_groups','tnt_efe_memberships','tnt_efe_meetings','tnt_efe_wednesday_attendance','tnt_saturday_members','tnt_saturday_attendance','sermons','topics','sermon_files','tnt_products','tnt_shifts','tnt_sales','tnt_orders','tnt_menu_items'] loop
 if to_regclass('public.'||t) is not null and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;
 foreach t in array array['sermons','topics','sermon_files'] loop
 if to_regclass('public.'||t) is not null then execute format('create policy tnt_module_required on public.%I as restrictive for all to authenticated using((select public.tnt_module_available(''glosario''))) with check((select public.tnt_module_available(''glosario'')))',t);end if;
 end loop;
end $$;
