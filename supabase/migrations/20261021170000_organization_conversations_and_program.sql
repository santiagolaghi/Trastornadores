-- Activity conversations, specific notices and an order that never rewrites times.
alter table public.tnt_tasks add column if not exists logistics_phase text not null default 'before'
 check(logistics_phase in ('before','during','after'));
alter table public.tnt_task_comments add column if not exists reply_to uuid references public.tnt_task_comments(id) on delete set null;
alter table public.tnt_task_comments add column if not exists is_pinned boolean not null default false;
create index if not exists tnt_activity_replies_idx on public.tnt_task_comments(task_id,reply_to,created_at);
update public.tnt_task_comments set is_pinned=true where kind='note' and reply_to is null;

create table public.tnt_event_changes (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.tnt_events(id) on delete cascade,
 task_id uuid references public.tnt_tasks(id) on delete set null,
 actor_person_id uuid references public.tnt_people(id) on delete set null,
 actor_name text not null,actor_avatar text,kind text not null,summary text not null,
 before_values jsonb not null default '{}',after_values jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index tnt_event_changes_recent_idx on public.tnt_event_changes(event_id,created_at desc);
alter table public.tnt_event_changes enable row level security;
revoke all on public.tnt_event_changes from public,anon,authenticated;
grant select on public.tnt_event_changes to authenticated;
grant all on public.tnt_event_changes to service_role;
create policy tnt_event_changes_read on public.tnt_event_changes for select to authenticated
 using(public.tnt_profile_is_complete() and public.tnt_can_action('organizacion','view','*'));

create or replace function tnt_actions.guard_activity_comment() returns trigger
language plpgsql security definer set search_path='' as $$
declare ev uuid;parent public.tnt_task_comments%rowtype;
begin
 if tg_op='UPDATE' and new.reply_to is null and old.reply_to is not null
  and not exists(select 1 from public.tnt_task_comments where id=old.reply_to) then return new;end if;
 select event_id into ev from public.tnt_tasks where id=new.task_id and archived_at is null;
 if ev is null then raise exception 'La actividad ya no está disponible';end if;
 if tg_op='UPDATE' and (new.task_id is distinct from old.task_id or new.person_id is distinct from old.person_id
  or new.created_at is distinct from old.created_at) then raise exception 'No se puede cambiar el autor ni la actividad del mensaje';end if;
 if length(trim(new.body)) not between 1 and 6000 then raise exception 'Escribí un mensaje de hasta 6000 caracteres';end if;
 if new.reply_to is not null then
  select * into parent from public.tnt_task_comments where id=new.reply_to;
  if parent.id is null or parent.task_id<>new.task_id or parent.reply_to is not null or parent.id=new.id then
   raise exception 'La respuesta debe pertenecer a una consulta o indicación de esta actividad';end if;
  if new.kind<>'question' or new.is_pinned then raise exception 'Las respuestas se agrupan debajo del mensaje original';end if;
 end if;
 if new.is_pinned and (new.kind<>'note' or new.reply_to is not null) then raise exception 'Solo se pueden fijar indicaciones';end if;
 if (new.kind='note' and tg_op='INSERT' or new.is_pinned and tg_op='INSERT'
   or tg_op='UPDATE' and (new.is_pinned is distinct from old.is_pinned or new.kind is distinct from old.kind))
   and not public.tnt_can_manage_event(ev) then raise exception 'Solo coordinación puede publicar o fijar indicaciones' using errcode='42501';end if;
 return new;
end $$;
revoke all on function tnt_actions.guard_activity_comment() from public,anon,authenticated;
create trigger tnt_activity_comment_guard before insert or update on public.tnt_task_comments
 for each row execute function tnt_actions.guard_activity_comment();

-- These helpers contain only the public author, activity and encounter context.
create or replace function tnt_actions.notice_actor(p_person uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('sender_id',p_person,'sender_name',coalesce(nullif(a.nickname,''),p.full_name,'Equipo TNT'),'sender_avatar',a.avatar_url)
 from public.tnt_people p left join public.tnt_accounts a on a.person_id=p.id where p.id=p_person;
$$;
create or replace function tnt_actions.notice_context(p_task uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('task_id',t.id,'task_title',t.title,'event_id',e.id,'event_name',e.name,
  'event_date',coalesce((t.planned_start at time zone 'America/Argentina/Buenos_Aires')::date,
   (select d.date from public.tnt_schedule_items i join public.tnt_schedule_days d on d.id=i.day_id where i.task_id=t.id and i.archived_at is null order by i.id limit 1),e.start_date))
 from public.tnt_tasks t join public.tnt_events e on e.id=t.event_id where t.id=p_task;
$$;
create or replace function tnt_actions.record_event_change(p_event uuid,p_task uuid,p_actor uuid,p_kind text,p_summary text,p_before jsonb default '{}',p_after jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare who jsonb:=coalesce(tnt_actions.notice_actor(p_actor),'{}');
begin
 insert into public.tnt_event_changes(event_id,task_id,actor_person_id,actor_name,actor_avatar,kind,summary,before_values,after_values)
 values(p_event,p_task,p_actor,coalesce(who->>'sender_name','Equipo TNT'),who->>'sender_avatar',p_kind,p_summary,coalesce(p_before,'{}'),coalesce(p_after,'{}'));
end $$;
create or replace function tnt_actions.notify_activity(p_task uuid,p_actor uuid,p_kind text,p_action text,p_body text,p_extra jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare context jsonb:=tnt_actions.notice_context(p_task);who jsonb:=coalesce(tnt_actions.notice_actor(p_actor),'{}');ev uuid;target text;root uuid;
begin
 if context is null then return;end if;ev:=(context->>'event_id')::uuid;
 if exists(select 1 from public.tnt_tasks where id=p_task and archived_at is not null) then return;end if;
 if exists(select 1 from public.tnt_events where id=ev and status='cancelled') then return;end if;
 target:='/organizacion/?task='||p_task;
 if p_extra ? 'comment_id' then target:=target||'&tab=team&comment='||(p_extra->>'comment_id');end if;
 root:=coalesce(nullif(p_extra->>'reply_to','')::uuid,nullif(p_extra->>'comment_id','')::uuid);
 insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href,data)
 select q.person_id,'team',ev,p_task,coalesce(who->>'sender_name','Equipo TNT')||' '||p_action||' · '||(context->>'task_title'),
  left(coalesce(p_body,''),600),target,context||who||jsonb_build_object('kind',p_kind)||p_extra
 from (
  select person_id from public.tnt_task_assignees where task_id=p_task and assignment_status<>'declined'
  union select person_id from public.tnt_event_members where event_id=ev and event_role='organizer'
  union select person_id from public.tnt_task_comments where task_id=p_task and root is not null and (id=root or reply_to=root)
 ) q
 where q.person_id is distinct from p_actor and public.tnt_recipient_has_module(q.person_id,'organizacion');
end $$;
revoke all on function tnt_actions.notice_actor(uuid),tnt_actions.notice_context(uuid),
 tnt_actions.record_event_change(uuid,uuid,uuid,text,text,jsonb,jsonb),tnt_actions.notify_activity(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.tnt_notify_task_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.tnt_current_person_id();kind text;action text;preview text;extra jsonb:='{}';
begin
 if tg_table_name='tnt_task_comments' then
  if tg_op='INSERT' then
   actor:=new.person_id;
   kind:=case when new.reply_to is not null then 'activity_reply' when new.kind='note' then 'activity_instruction' else 'activity_question' end;
   action:=case when new.reply_to is not null then 'respondió' when new.kind='note' then 'dejó una indicación' else 'hizo una consulta' end;
  elsif new.resolved_at is distinct from old.resolved_at then kind:='activity_question_state';action:=case when new.resolved_at is null then 'reabrió una consulta' else 'resolvió una consulta' end;
  elsif new.is_pinned is distinct from old.is_pinned and new.is_pinned then kind:='activity_instruction';action:='fijó una indicación';
  else return new;end if;
  preview:=new.body;extra:=jsonb_build_object('comment_id',new.id,'reply_to',new.reply_to);
 elsif tg_table_name='tnt_task_files' then
  actor:=coalesce(new.uploaded_by,actor);kind:='activity_file';action:='compartió un archivo';preview:=new.file_name;
 elsif tg_table_name='tnt_task_checklist' then
  if tg_op='UPDATE' and new.done is not distinct from old.done then return new;end if;
  kind:='activity_checklist';action:=case when tg_op='INSERT' then 'agregó un punto' when new.done then 'completó un punto' else 'reabrió un punto' end;preview:=new.text;
 else kind:='activity_reference';action:='compartió una referencia';preview:=coalesce(nullif(new.label,''),new.url);end if;
 perform tnt_actions.notify_activity(new.task_id,actor,kind,action,preview,extra);
 return new;
end $$;
create trigger tnt_comment_state_notify after update of is_pinned,resolved_at on public.tnt_task_comments
 for each row execute function public.tnt_notify_task_activity();
create trigger tnt_checklist_notify after insert or update of done on public.tnt_task_checklist
 for each row execute function public.tnt_notify_task_activity();

-- Untimed activities receive a real day, so they can be placed between timed cards.
create or replace function public.tnt_save_activity(p_id uuid,p_event uuid,p_values jsonb,p_people uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_task_id uuid;v_day_id uuid;ev public.tnt_events%rowtype;t public.tnt_tasks%rowtype;phase text;area boolean;
begin
 if auth.uid() is null or not public.tnt_event_can_action(p_event,case when p_id is null then 'create_activity' else 'edit_activity' end) then
  raise exception 'No tenés permiso para guardar esta actividad' using errcode='42501';end if;
 select * into ev from public.tnt_events where id=p_event for update;
 if ev.id is null or ev.status='cancelled' then raise exception 'El encuentro ya no está disponible';end if;
 phase:=coalesce(nullif(p_values->>'logistics_phase',''),(select logistics_phase from public.tnt_tasks where id=p_id),'before');
 if phase not in ('before','during','after') then raise exception 'Elegí antes, durante o después del encuentro';end if;
 v_day_id:=nullif(p_values->>'program_day_id','')::uuid;
 if v_day_id is not null and not exists(select 1 from public.tnt_schedule_days d where d.id=v_day_id and d.event_id=p_event and d.date between ev.start_date and ev.end_date) then
  raise exception 'El día no pertenece a este encuentro';end if;
 v_task_id:=public.tnt_save_task(p_id,p_event,p_values,p_people);
 update public.tnt_tasks set logistics_phase=phase where id=v_task_id;
 select * into t from public.tnt_tasks where id=v_task_id;
 select exists(with recursive parents as(select id,parent_task_id,task_type from public.tnt_tasks where id=v_task_id
  union all select p.id,p.parent_task_id,p.task_type from public.tnt_tasks p join parents c on c.parent_task_id=p.id)
  select 1 from parents where task_type='logistics') into area;
 if t.planned_start is null and (not area or exists(select 1 from public.tnt_schedule_items i where i.task_id=t.id and i.archived_at is null)) then
  if ev.kind='saturday' then
   select id into v_day_id from public.tnt_schedule_days where event_id=p_event and date=ev.start_date order by sort_order,id limit 1;
   if v_day_id is null then insert into public.tnt_schedule_days(event_id,label,date,sort_order) values(p_event,'Sábado',ev.start_date,0) returning id into v_day_id;end if;
  end if;
  if v_day_id is not null then
   if not exists(select 1 from public.tnt_schedule_items i where i.task_id=t.id and i.archived_at is null) then
    insert into public.tnt_schedule_items(day_id,task_id,title,item_type,description,materials,duration_minutes,sort_order)
    values(v_day_id,t.id,t.title,case when t.task_type='complex' then 'game' else 'activity' end,t.description,t.materials,t.duration_minutes,
     coalesce((select max(i.sort_order)+1 from public.tnt_schedule_items i where i.day_id=v_day_id and i.archived_at is null),0));
   else update public.tnt_schedule_items i set day_id=v_day_id where i.task_id=t.id and i.archived_at is null;end if;
  end if;
 end if;
 insert into public.tnt_schedule_responsibles(item_id,person_id)
 select i.id,p from public.tnt_schedule_items i cross join unnest(coalesce(p_people,'{}'::uuid[])) p
 where i.task_id=t.id and i.archived_at is null on conflict do nothing;
 return t.id;
end $$;
revoke all on function public.tnt_save_activity(uuid,uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.tnt_save_activity(uuid,uuid,jsonb,uuid[]) to authenticated;

-- Materialize existing flexible Saturday activities without inventing a time.
insert into public.tnt_schedule_days(event_id,label,date,sort_order)
select e.id,'Sábado',e.start_date,0 from public.tnt_events e where e.kind='saturday' and e.status not in('cancelled','completed')
 and exists(select 1 from public.tnt_tasks t where t.event_id=e.id and t.archived_at is null and t.parent_task_id is null and t.task_type<>'logistics')
 and not exists(select 1 from public.tnt_schedule_days d where d.event_id=e.id and d.date=e.start_date);
insert into public.tnt_schedule_items(day_id,task_id,title,item_type,description,materials,starts_at,duration_minutes,sort_order)
select d.id,t.id,t.title,case when t.task_type='complex' then 'game' else 'activity' end,t.description,t.materials,
 (t.planned_start at time zone 'America/Argentina/Buenos_Aires')::time,t.duration_minutes,
 coalesce((select max(i.sort_order)+1 from public.tnt_schedule_items i where i.day_id=d.id),0)+row_number() over(partition by d.id order by t.sort_order,t.id)::int
from public.tnt_tasks t join public.tnt_events e on e.id=t.event_id
join lateral(select sd.id from public.tnt_schedule_days sd where sd.event_id=e.id and sd.date=e.start_date order by sd.sort_order,sd.id limit 1) d on true
where e.kind='saturday' and e.status not in('cancelled','completed') and t.archived_at is null and t.parent_task_id is null and t.task_type<>'logistics'
 and not exists(select 1 from public.tnt_schedule_items i where i.task_id=t.id);
insert into public.tnt_schedule_responsibles(item_id,person_id)
select i.id,a.person_id from public.tnt_schedule_items i join public.tnt_task_assignees a on a.task_id=i.task_id
where i.archived_at is null and a.assignment_status<>'declined' on conflict do nothing;

-- Canonicalize the old order once; this UPDATE changes no time or duration.
with positions as(select id,row_number() over(partition by day_id order by starts_at nulls last,sort_order,id)-1 as n
 from public.tnt_schedule_items where archived_at is null)
update public.tnt_schedule_items i set sort_order=p.n from positions p where p.id=i.id and i.sort_order is distinct from p.n;

create or replace function tnt_actions.normalize_program_day(p_day uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform id from public.tnt_schedule_days where id=p_day for update;
 with slots as(select id,starts_at,row_number() over(order by sort_order,id)-1 as position
  from public.tnt_schedule_items where day_id=p_day and archived_at is null),
 timed as(select id,row_number() over(order by starts_at,position) as n from slots where starts_at is not null),
 timed_slots as(select position,row_number() over(order by position) as n from slots where starts_at is not null),
 final as(select t.id,s.position from timed t join timed_slots s using(n) union all select id,position from slots where starts_at is null)
 update public.tnt_schedule_items i set sort_order=f.position from final f where i.id=f.id and i.sort_order is distinct from f.position;
end $$;
create or replace function tnt_actions.program_time_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.starts_at is distinct from old.starts_at or new.day_id is distinct from old.day_id then
  perform tnt_actions.normalize_program_day(new.day_id);
  if tg_op='UPDATE' and old.day_id<>new.day_id then perform tnt_actions.normalize_program_day(old.day_id);end if;
 end if;
 return new;
end $$;
revoke all on function tnt_actions.normalize_program_day(uuid),tnt_actions.program_time_changed() from public,anon,authenticated;
create trigger tnt_program_time_order after insert or update of starts_at,day_id on public.tnt_schedule_items
 for each row execute function tnt_actions.program_time_changed();

create or replace function tnt_actions.reorder_schedule(p_day uuid,p_ids uuid[],p_before jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.tnt_schedule_days%rowtype;current_rows jsonb;provided jsonb;item public.tnt_schedule_items%rowtype;
 all_ids uuid[];position integer:=0;previous_time time;task_event uuid;
begin
 if auth.uid() is null or public.tnt_current_person_id() is null or not public.tnt_profile_is_complete() then
  raise exception 'Completá tu perfil antes de ordenar el cronograma' using errcode='42501';end if;
 select * into d from public.tnt_schedule_days where id=p_day;
 if not found or not public.tnt_event_can_action(d.event_id,'edit_activity') then
  raise exception 'No tenés permiso para ordenar este encuentro' using errcode='42501';end if;
 perform id from public.tnt_events where id=d.event_id for update;
 if exists(select 1 from public.tnt_events where id=d.event_id and status='cancelled') then raise exception 'El encuentro está cancelado';end if;
 perform id from public.tnt_tasks where id in(select task_id from public.tnt_schedule_items where day_id=p_day and archived_at is null) order by id for update;
 perform id from public.tnt_schedule_days where id=p_day for update;
 perform id from public.tnt_schedule_items where day_id=p_day and archived_at is null order by id for update;
 select array_agg(i.id order by i.id),jsonb_agg(jsonb_build_object('id',i.id,'starts_at',i.starts_at,
  'duration_minutes',i.duration_minutes,'sort_order',coalesce(i.sort_order,0),'task_id',i.task_id) order by i.id)
 into all_ids,current_rows from public.tnt_schedule_items i left join public.tnt_tasks t on t.id=i.task_id
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
   if task_event is distinct from d.event_id then raise exception 'Una actividad pertenece a otro encuentro';end if;
  end if;
  if item.starts_at is not null then
   if previous_time is not null and item.starts_at<previous_time then
    raise exception 'No podés ubicar una actividad de % antes de otra de %. Los horarios deben conservar su orden',left(previous_time::text,5),left(item.starts_at::text,5);end if;
   previous_time:=item.starts_at;
  end if;
  -- Ordering touches only position. In particular, NULL remains NULL.
  update public.tnt_schedule_items set sort_order=position where id=item.id;
  if item.task_id is not null then update public.tnt_tasks set sort_order=position where id=item.task_id;end if;
  position:=position+1;
 end loop;
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
 values(public.tnt_current_person_id(),'event',d.event_id,'schedule_reordered',jsonb_build_object('day_id',p_day,'before',current_rows,'item_ids',to_jsonb(p_ids)));
 perform tnt_actions.record_event_change(d.event_id,null,public.tnt_current_person_id(),'program_order','Ordenó las actividades de '||d.label||' sin modificar sus horarios.','{}',jsonb_build_object('day_id',p_day,'item_ids',to_jsonb(p_ids)));
 return jsonb_build_object('day_id',p_day,'items',(select jsonb_agg(to_jsonb(i) order by sort_order) from public.tnt_schedule_items i where id=any(p_ids)));
end $$;
-- A separate RPC prevents a cached/new client from calling the old time-shifting implementation.
create function public.tnt_reorder_program(p_day uuid,p_ids uuid[],p_before jsonb) returns jsonb
language sql security invoker set search_path='' as $$select tnt_actions.reorder_schedule(p_day,p_ids,p_before)$$;
revoke all on function public.tnt_reorder_program(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.tnt_reorder_program(uuid,uuid[],jsonb) to authenticated;

create or replace function tnt_actions.task_change_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.tnt_current_person_id();summary text;action text:='actualizó la actividad';before_data jsonb:='{}';after_data jsonb;
begin
 if actor is null then return new;end if;
 after_data:=jsonb_build_object('title',new.title,'planned_start',new.planned_start,'duration_minutes',new.duration_minutes,'status',new.status,'logistics_phase',new.logistics_phase,'archived',new.archived_at is not null);
 if tg_op='INSERT' then summary:='Creó la actividad '||new.title||'.';action:='creó una actividad';
 else
  before_data:=jsonb_build_object('title',old.title,'planned_start',old.planned_start,'duration_minutes',old.duration_minutes,'status',old.status,'logistics_phase',old.logistics_phase,'archived',old.archived_at is not null);
  if after_data=before_data and new.description is not distinct from old.description and new.materials is not distinct from old.materials then return new;end if;
  summary:=concat_ws(E'\n',
   case when new.title is distinct from old.title then 'Cambió el nombre: '||old.title||' → '||new.title||'.' end,
   case when new.planned_start is distinct from old.planned_start then 'Cambió el horario de '||new.title||': '||coalesce(to_char(old.planned_start at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI'),'sin hora fija')||' → '||coalesce(to_char(new.planned_start at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI'),'sin hora fija')||'.' end,
   case when new.duration_minutes is distinct from old.duration_minutes then 'Cambió la duración de '||new.title||': '||coalesce(old.duration_minutes::text||' min','sin duración')||' → '||coalesce(new.duration_minutes::text||' min','sin duración')||'.' end,
   case when new.description is distinct from old.description then 'Actualizó las instrucciones de '||new.title||'.' end,
   case when new.materials is distinct from old.materials then 'Actualizó los materiales de '||new.title||'.' end,
   case when new.status is distinct from old.status then 'Actualizó el estado de '||new.title||': '||case new.status when 'completed' then 'terminada' when 'ready' then 'lista' when 'progress' then 'en curso' when 'replacement' then 'necesita reemplazo' else 'pendiente' end||'.' end,
   case when new.logistics_phase is distinct from old.logistics_phase then 'Movió '||new.title||' a '||case new.logistics_phase when 'before' then 'antes' when 'during' then 'durante' else 'después' end||' del encuentro.' end,
   case when new.archived_at is distinct from old.archived_at then case when new.archived_at is null then 'Restauró ' else 'Archivó ' end||new.title||'.' end);
  if new.planned_start is distinct from old.planned_start then action:='cambió el horario';end if;
 end if;
 perform tnt_actions.record_event_change(new.event_id,new.id,actor,'activity_changed',summary,before_data,after_data);
 perform tnt_actions.notify_activity(new.id,actor,'activity_changed',action,summary);
 return new;
end $$;
revoke all on function tnt_actions.task_change_notice() from public,anon,authenticated;
create trigger tnt_activity_change_notice after insert or update on public.tnt_tasks for each row execute function tnt_actions.task_change_notice();

create or replace function public.tnt_notify_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
declare tid uuid;recipient uuid;actor uuid:=public.tnt_current_person_id();context jsonb;who jsonb;name text;removed boolean:=tg_op='DELETE';summary text;
begin
 if removed then tid:=old.task_id;recipient:=old.person_id;else tid:=new.task_id;recipient:=new.person_id;end if;
 context:=tnt_actions.notice_context(tid);if context is null then return null;end if;
 if exists(select 1 from public.tnt_tasks where id=tid and archived_at is not null) then return null;end if;
 who:=coalesce(tnt_actions.notice_actor(actor),'{}');select coalesce(nullif(a.nickname,''),p.full_name) into name from public.tnt_people p left join public.tnt_accounts a on a.person_id=p.id where p.id=recipient;
 summary:=case when removed then 'Quitó a ' else 'Sumó a ' end||coalesce(name,'una persona')||' de '||(context->>'task_title')||'.';
 if actor is not null then perform tnt_actions.record_event_change((context->>'event_id')::uuid,tid,actor,'assignment_changed',summary,'{}',jsonb_build_object('person_id',recipient,'removed',removed));end if;
 if recipient is distinct from actor and public.tnt_recipient_has_module(recipient,'organizacion') then
  insert into public.tnt_notifications(person_id,scope,event_id,task_id,title,body,href,data)
  values(recipient,'personal',(context->>'event_id')::uuid,tid,coalesce(who->>'sender_name','Coordinación')||case when removed then ' cambió tu participación' else ' te asignó una actividad' end,
   (context->>'task_title')||case when removed then ': ya no estás entre sus responsables.' else ': sos parte del equipo.' end,
   '/organizacion/?task='||tid,context||who||jsonb_build_object('kind',case when removed then 'assignment_removed' else 'assignment' end));
 end if;
 return null;
end $$;
create trigger tnt_assignment_removed_notice after delete on public.tnt_task_assignees for each row execute function public.tnt_notify_assignment();

-- Linked schedule edits are announced by the task trigger, avoiding two alerts per edit.
create or replace function public.tnt_notify_schedule_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare ev uuid;actor uuid:=public.tnt_current_person_id();summary text;context jsonb;who jsonb;date date;
begin
 if actor is null then return new;end if;
 if new.task_id is not null then
  if new.day_id is distinct from old.day_id and exists(select 1 from public.tnt_tasks where id=new.task_id and planned_start is null) then
   select d.event_id,d.date into ev,date from public.tnt_schedule_days d where d.id=new.day_id;
   summary:='Movió '||new.title||' al '||to_char(date,'DD/MM')||'.';
   perform tnt_actions.record_event_change(ev,new.task_id,actor,'activity_day',summary,jsonb_build_object('day_id',old.day_id),jsonb_build_object('day_id',new.day_id));
   perform tnt_actions.notify_activity(new.task_id,actor,'activity_changed','cambió el día de la actividad',summary);
  end if;
  return new;
 end if;
 if new.starts_at is not distinct from old.starts_at and new.title is not distinct from old.title then return new;end if;
 select d.event_id,d.date into ev,date from public.tnt_schedule_days d where d.id=new.day_id;
 summary:='Cambió '||new.title||': '||coalesce(left(old.starts_at::text,5),'sin hora fija')||' → '||coalesce(left(new.starts_at::text,5),'sin hora fija')||'.';
 perform tnt_actions.record_event_change(ev,null,actor,'program_changed',summary,jsonb_build_object('title',old.title,'starts_at',old.starts_at),jsonb_build_object('title',new.title,'starts_at',new.starts_at));
 who:=coalesce(tnt_actions.notice_actor(actor),'{}');
 select jsonb_build_object('event_id',id,'event_name',name,'event_date',date) into context from public.tnt_events where id=ev;
 insert into public.tnt_notifications(person_id,scope,event_id,title,body,href,data)
 select m.person_id,'team',ev,coalesce(who->>'sender_name','Coordinación')||' cambió el cronograma',summary,'/organizacion/?view=schedule&event='||ev,context||who||jsonb_build_object('kind','program_changed')
 from public.tnt_event_members m where m.event_id=ev and m.person_id is distinct from actor and public.tnt_recipient_has_module(m.person_id,'organizacion');
 return new;
end $$;

create or replace function tnt_actions.event_change_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.tnt_current_person_id();summary text;before_data jsonb;after_data jsonb;who jsonb;
begin
 if actor is null then return new;end if;
 before_data:=jsonb_build_object('name',old.name,'start_date',old.start_date,'end_date',old.end_date,'location',old.location,'status',old.status);
 after_data:=jsonb_build_object('name',new.name,'start_date',new.start_date,'end_date',new.end_date,'location',new.location,'status',new.status);
 if before_data=after_data then return new;end if;
 summary:=concat_ws(E'\n',case when new.name is distinct from old.name then 'Nombre: '||old.name||' → '||new.name||'.' end,
  case when new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then 'Fechas: '||to_char(old.start_date,'DD/MM')||'–'||to_char(old.end_date,'DD/MM')||' → '||to_char(new.start_date,'DD/MM')||'–'||to_char(new.end_date,'DD/MM')||'.' end,
  case when new.location is distinct from old.location then 'Lugar: '||coalesce(old.location,'por confirmar')||' → '||coalesce(new.location,'por confirmar')||'.' end,
  case when new.status is distinct from old.status then case new.status when 'cancelled' then 'El encuentro fue cancelado.' when 'confirmed' then 'El encuentro está confirmado.' when 'completed' then 'El encuentro terminó.' when 'live' then 'El encuentro comenzó.' else 'El encuentro está en preparación.' end end);
 perform tnt_actions.record_event_change(new.id,null,actor,'event_changed',summary,before_data,after_data);who:=coalesce(tnt_actions.notice_actor(actor),'{}');
 insert into public.tnt_notifications(person_id,scope,event_id,title,body,href,data)
 select m.person_id,'team',case when new.status='cancelled' then null else new.id end,coalesce(who->>'sender_name','Coordinación')||' actualizó '||new.name,summary,
  '/organizacion/?view=schedule&event='||new.id,who||jsonb_build_object('kind','event_changed','event_id',new.id,'event_name',new.name,'event_date',new.start_date)
 from public.tnt_event_members m where m.event_id=new.id and m.person_id is distinct from actor and public.tnt_recipient_has_module(m.person_id,'organizacion');
 return new;
end $$;
revoke all on function tnt_actions.event_change_notice() from public,anon,authenticated;
create trigger tnt_event_change_notice after update on public.tnt_events for each row execute function tnt_actions.event_change_notice();

create or replace function public.tnt_notification_visible_for(p_note public.tnt_notifications,p_person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
  where a.person_id=p_person and a.enabled and p.active and a.onboarding_completed_at is not null
  and jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(p_person)))=0
  and (p_note.person_id=p_person or (p_note.person_id is null and (p_note.scope='general' or p_note.scope='team' and (a.staff_status='approved' or a.system_role='admin')))))
 and case
  when p_note.data->>'kind'='chat_message' then public.tnt_recipient_has_module(p_person,'chat')
   and exists(select 1 from public.tnt_chat_members m join public.tnt_chat_threads t on t.id=m.thread_id
    join public.tnt_chat_messages msg on msg.thread_id=t.id
    where m.person_id=p_person and not t.is_archived and msg.id::text=p_note.data->>'message_id' and msg.deleted_at is null
    and (msg.audience_person_ids is null or p_person=any(msg.audience_person_ids)))
  when p_note.href like '/organizacion/%' or p_note.event_id is not null or p_note.task_id is not null then public.tnt_recipient_has_module(p_person,'organizacion')
  when p_note.href like '/admin/%' then public.tnt_recipient_has_module(p_person,'admin')
  else true end
 and (not(p_note.data ? 'comment_id') or exists(select 1 from public.tnt_task_comments c where c.id::text=p_note.data->>'comment_id' and c.task_id=p_note.task_id));
$$;

create or replace function public.tnt_enqueue_push() returns trigger
language plpgsql security definer set search_path='' as $$
declare sender text;portrait text;preview text;context jsonb;push_body text;push_tag text;
begin
 if tg_table_name='tnt_notifications' then
  push_body:=concat_ws(' · ',nullif(left(new.body,300),''),nullif(new.data->>'event_name',''),
   case when new.data->>'event_date' ~ '^\d{4}-\d{2}-\d{2}$' then to_char((new.data->>'event_date')::date,'DD/MM') end);
  push_tag:=case when new.data->>'kind'='chat_message' then 'tnt-chat-'||(new.data->>'thread_id')
   when new.data ? 'comment_id' then 'tnt-activity-'||new.task_id||'-'||coalesce(new.data->>'reply_to',new.data->>'comment_id')
   else 'tnt-notification-'||new.id end;
  insert into public.tnt_push_outbox(source_key,person_id,endpoint,payload)
  select 'notification:'||new.id,s.person_id,s.endpoint,jsonb_strip_nulls(jsonb_build_object(
   'title',new.title,'body',push_body,'url',coalesce(new.href,'/'),'tag',push_tag,'notification_id',new.id,
   'kind',new.data->>'kind','message_id',new.data->>'message_id','thread_id',new.data->>'thread_id',
   'comment_id',new.data->>'comment_id','task_id',new.task_id,'sender_id',new.data->>'sender_id',
   'sender_name',new.data->>'sender_name','sender_avatar',new.data->>'sender_avatar',
   'event_name',new.data->>'event_name','event_date',new.data->>'event_date','task_title',new.data->>'task_title'))
  from public.tnt_push_subscriptions s join public.tnt_accounts a on a.person_id=s.person_id
  where a.enabled and a.auth_user_id is not null and public.tnt_notification_visible_for(new,s.person_id)
   and exists(select 1 from public.tnt_people where id=a.person_id and active);
 else
  if new.deleted_at is not null or not public.tnt_module_enabled('chat') then return new;end if;
  select coalesce(nullif(a.nickname,''),p.full_name),a.avatar_url into sender,portrait
  from public.tnt_people p left join public.tnt_accounts a on a.person_id=p.id where p.id=new.person_id;
  preview:=coalesce(nullif(left(new.body,300),''),case
   when exists(select 1 from jsonb_array_elements(coalesce(new.attachments,'[]')) f where f->>'type' like 'audio/%') then '🎙 Mensaje de voz'
   when exists(select 1 from jsonb_array_elements(coalesce(new.attachments,'[]')) f where f->>'type' like 'image/%') then '📷 Foto' else '📎 Archivo adjunto' end);
  select jsonb_strip_nulls(jsonb_build_object('thread_title',t.title,'event_id',e.id,'event_name',e.name,'event_date',e.start_date,
   'task_id',task.id,'task_title',task.title)) into context
  from public.tnt_chat_threads t left join public.tnt_tasks task on task.id=t.task_id
  left join public.tnt_events e on e.id=coalesce(t.event_id,task.event_id) where t.id=new.thread_id;
  insert into public.tnt_notifications(person_id,title,body,href,data)
  select m.person_id,coalesce(sender,'Equipo TNT')||case when t.thread_type='direct' then '' else ' · '||t.title end,preview,
   '/chat/?thread='||new.thread_id,coalesce(context,'{}')||jsonb_build_object('kind','chat_message','message_id',new.id,'thread_id',new.thread_id,
    'sender_id',new.person_id,'sender_name',sender,'sender_avatar',portrait)
  from public.tnt_chat_members m join public.tnt_chat_threads t on t.id=m.thread_id
  where m.thread_id=new.thread_id and m.person_id<>new.person_id and public.tnt_recipient_has_module(m.person_id,'chat')
   and not t.is_archived and (new.audience_person_ids is null or m.person_id=any(new.audience_person_ids));
 end if;
 return new;
end $$;
revoke all on function public.tnt_notify_task_activity(),public.tnt_notify_assignment(),public.tnt_notify_schedule_change(),public.tnt_enqueue_push() from public,anon,authenticated;

do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tnt_task_comments') then
   alter publication supabase_realtime add table public.tnt_task_comments;end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tnt_event_changes') then
   alter publication supabase_realtime add table public.tnt_event_changes;end if;
 end if;
end $$;
notify pgrst,'reload schema';
