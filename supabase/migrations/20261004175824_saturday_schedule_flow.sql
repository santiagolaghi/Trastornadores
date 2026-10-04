-- A task-backed program row must disappear with its activity. Standalone rows
-- (task_id is NULL) remain independent and continue to belong to their day.
alter table public.tnt_schedule_items drop constraint tnt_schedule_items_task_id_fkey;
alter table public.tnt_schedule_items add constraint tnt_schedule_items_task_id_fkey
 foreign key(task_id) references public.tnt_tasks(id) on delete cascade;

create table public.tnt_quick_schedule_requests(
 created_by uuid not null references public.tnt_people(id) on delete cascade,
 request_id uuid not null,
 event_id uuid not null references public.tnt_events(id) on delete cascade,
 payload jsonb not null,
 task_ids uuid[] not null,
 created_at timestamptz not null default now(),
 primary key(created_by,request_id)
);
create index tnt_quick_schedule_requests_event_idx on public.tnt_quick_schedule_requests(event_id);
alter table public.tnt_quick_schedule_requests enable row level security;
revoke all on public.tnt_quick_schedule_requests from anon,authenticated;
create policy quick_schedule_owner on public.tnt_quick_schedule_requests for select to authenticated
 using(created_by=(select public.tnt_current_person_id()) and (select public.tnt_profile_is_complete()));

create or replace function public.tnt_save_quick_schedule(p_event uuid,p_date date,p_rows jsonb,p_request uuid)
returns uuid[] language plpgsql security definer set search_path=''
as $$
declare
 actor uuid:=public.tnt_current_person_id();e public.tnt_events;receipt public.tnt_quick_schedule_requests;
 payload jsonb:=jsonb_build_object('event',p_event,'date',p_date,'rows',p_rows);
 row_value jsonb;ids uuid[]:='{}';people uuid[];task uuid;v_position integer;title text;clock text;
begin
 if actor is null or not public.tnt_profile_is_complete() then
  raise exception 'Completá tu perfil para armar el cronograma.' using errcode='42501';
 end if;
 select * into e from public.tnt_events where id=p_event for update;
 if e.id is null or e.status='cancelled' then raise exception 'Este encuentro ya no está disponible.';end if;
 if not (public.tnt_can_manage_event(p_event) or public.tnt_can_action('organizacion','create_activity','*')) then
  raise exception 'No tenés permiso para crear actividades.' using errcode='42501';
 end if;
 if p_request is null or p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Revisá las filas del cronograma.';end if;
 if jsonb_array_length(p_rows) not between 1 and 20 then raise exception 'Agregá entre una y veinte actividades.';end if;
 if p_date is null or p_date<e.start_date or p_date>e.end_date or (e.kind='saturday' and p_date<>e.start_date) then
  raise exception 'La fecha debe pertenecer a este encuentro.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request::text,0));
 select * into receipt from public.tnt_quick_schedule_requests where created_by=actor and request_id=p_request;
 if receipt.request_id is not null then
  if receipt.payload is distinct from payload then raise exception 'Este cronograma ya se guardó. Actualizá la vista antes de cambiarlo.';end if;
  return receipt.task_ids;
 end if;
 select coalesce(max(sort_order),-1)+1 into v_position from public.tnt_tasks where event_id=p_event;
 for row_value in select value from jsonb_array_elements(p_rows) loop
  title:=nullif(trim(row_value->>'title'),'');clock:=row_value->>'time';
  if jsonb_typeof(row_value)<>'object' or title is null or length(title)>200 or clock is null or clock!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then
   raise exception 'Cada actividad necesita un nombre y una hora válida.';
  end if;
  people:=case when nullif(row_value->>'person_id','') is null then '{}'::uuid[] else array[(row_value->>'person_id')::uuid] end;
  if cardinality(people)>0 and not exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
   where a.person_id=people[1] and a.enabled and a.staff_status='approved' and p.active) then
   raise exception 'Elegí un responsable activo del staff o dejá la actividad sin asignar.';
  end if;
  task:=public.tnt_save_task(null,p_event,jsonb_build_object('title',title,'task_type','simple','priority','medium',
   'assignee_mode','single','planned_start',(p_date+clock::time) at time zone 'America/Argentina/Buenos_Aires','sort_order',v_position),people);
  ids:=array_append(ids,task);v_position:=v_position+1;
 end loop;
 insert into public.tnt_quick_schedule_requests(created_by,request_id,event_id,payload,task_ids) values(actor,p_request,p_event,payload,ids);
 return ids;
end $$;
revoke all on function public.tnt_save_quick_schedule(uuid,date,jsonb,uuid) from public,anon;
grant execute on function public.tnt_save_quick_schedule(uuid,date,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
