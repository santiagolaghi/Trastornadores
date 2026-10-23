create or replace function tnt_actions.community_action_personal(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();mod text:=p_data->>'module';item uuid:=nullif(p_data->>'id','')::uuid;target uuid:=nullif(p_data->>'person_id','')::uuid;
 c public.tnt_community_content%rowtype;e public.tnt_community_enrollments%rowtype;q public.tnt_community_questions%rowtype;
 a public.tnt_community_accompaniment%rowtype;f public.tnt_community_family_links%rowtype;ph public.tnt_community_phrases%rowtype;
 old_data jsonb;st text;cfg jsonb;steps jsonb;chosen integer;ver integer;result jsonb:='{}';new_id uuid;ref uuid;is_admin boolean:=public.tnt_is_admin();d date;dt date;vlevel integer;
begin
 if auth.uid() is null or not tnt_actions.community_active_person(pid) then raise exception 'Completá tu perfil e iniciá sesión para continuar.' using errcode='42501';end if;
 if p_action='preferences' then
  mod='daily';insert into public.tnt_community_preferences(person_id) values(pid) on conflict do nothing;
  update public.tnt_community_preferences set birthday_public=coalesce((p_data->>'birthday_public')::boolean,birthday_public),daily_push=coalesce((p_data->>'daily_push')::boolean,daily_push),reminders=coalesce((p_data->>'reminders')::boolean,reminders),reading=case when p_data ? 'reading' and octet_length((p_data->'reading')::text)<2000 then p_data->'reading' else reading end,updated_at=now() where person_id=pid;
 elsif p_action='save_phrase' then
  mod='daily';if not tnt_actions.community_can_for(pid,mod,2) then raise exception 'Necesitás permiso para publicar frases.' using errcode='42501';end if;
  item=coalesce(item,gen_random_uuid());select to_jsonb(x) into old_data from public.tnt_community_phrases x where id=item;
  insert into public.tnt_community_phrases(id,text,author,active,created_by) values(item,trim(p_data->>'text'),coalesce(p_data->>'author',''),coalesce((p_data->>'active')::boolean,true),pid)
  on conflict(id) do update set text=excluded.text,author=excluded.author,active=excluded.active,updated_at=now();result=jsonb_build_object('id',item);
 elsif p_action='save_day' then
  mod='daily';if not tnt_actions.community_can_for(pid,mod,2) then raise exception 'Necesitás permiso para programar el contenido diario.' using errcode='42501';end if;
  d=(p_data->>'day')::date;if d<tnt_actions.community_today() then raise exception 'El contenido de días anteriores queda en el historial.';end if;
  select to_jsonb(x) into old_data from public.tnt_community_days x where day=d;
  insert into public.tnt_community_days(day,reference,version,phrase,author,manual,updated_by) values(d,p_data->>'reference',coalesce((p_data->>'bible_version')::integer,128),trim(p_data->>'phrase'),coalesce(p_data->>'author',''),true,pid)
  on conflict(day) do update set reference=excluded.reference,version=excluded.version,phrase=excluded.phrase,author=excluded.author,manual=true,updated_by=pid;
 elsif p_action='save_game' then
  mod='games';insert into public.tnt_community_game_runs(id,person_id,kind,difficulty,score,won,lives,duration) values(item,pid,p_data->>'kind',p_data->>'difficulty',(p_data->>'score')::integer,(p_data->>'won')::boolean,(p_data->>'lives')::integer,(p_data->>'duration')::integer) on conflict(id) do nothing;
 elsif p_action='poll_report' then
  select * into c from public.tnt_community_content where id=item;mod='polls';
  if c.module is distinct from mod or not tnt_actions.community_can_for(pid,mod,3) then raise exception 'No tenés permiso para consultar participantes.' using errcode='42501';end if;
  if coalesce((c.config->>'anonymous')::boolean,true) then raise exception 'Esta encuesta es anónima y muestra solo resultados agrupados.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('person_id',v.person_id,'name',p.full_name,'option_index',v.option_index)),'[]') into result from public.tnt_community_votes v join public.tnt_people p on p.id=v.person_id where content_id=item;return result;
 else raise exception 'Acción no disponible.' using errcode='22023';end if;
 insert into public.tnt_community_history(module,action,actor,subject_id,details) values(coalesce(mod,'daily'),p_action,pid,coalesce(item::text,target::text,pid::text),jsonb_build_object('before',old_data,'notify',coalesce((p_data->>'notify')::boolean,false)));
 return result;
end $$;

revoke all on function tnt_actions.community_action_personal(text,jsonb) from public,anon,authenticated;
