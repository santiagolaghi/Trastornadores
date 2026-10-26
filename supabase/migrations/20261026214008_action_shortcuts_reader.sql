-- Add action contexts without changing ownership, existing preferences or reader marks.
create or replace function tnt_actions.valid_shortcut_context(value jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare entry record;field text;date_value date;
begin
 if value is null or jsonb_typeof(value)<>'object' or octet_length(value::text)>4096 then return false;end if;
 for entry in select * from jsonb_each(value) loop
  if entry.key not in ('saturday','efe','schedule','prepare') or jsonb_typeof(entry.value)<>'object' then return false;end if;
  for field in select jsonb_object_keys(entry.value) loop
   if field not in ('group','when','date') or jsonb_typeof(entry.value->field)<>'string' then return false;end if;
  end loop;
  if entry.value ? 'group' and (entry.key<>'efe' or entry.value->>'group' not in ('varones','mujeres18','mujeres12_14','mujeres15_17')) then return false;end if;
  if entry.value ? 'when' and (entry.value->>'when' not in ('next','latest','date') or (entry.key in ('schedule','prepare') and entry.value->>'when'='latest')) then return false;end if;
  if entry.value->>'when'='date' and not entry.value ? 'date' then return false;end if;
  if entry.value ? 'date' then
   if entry.value->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then return false;end if;
   begin date_value:=(entry.value->>'date')::date;exception when others then return false;end;
   if entry.key<>'efe' and extract(isodow from date_value)<>6 then return false;end if;
  end if;
 end loop;
 return true;
end $$;
revoke all on function tnt_actions.valid_shortcut_context(jsonb) from public,anon;
grant execute on function tnt_actions.valid_shortcut_context(jsonb) to authenticated;
alter table public.tnt_personal_preferences add column shortcut_context jsonb not null default '{}'::jsonb;
alter table public.tnt_personal_preferences add constraint personal_shortcut_context_valid check(tnt_actions.valid_shortcut_context(shortcut_context));
alter table public.tnt_personal_preferences drop constraint tnt_personal_preferences_shortcuts_check;
alter table public.tnt_personal_preferences add constraint tnt_personal_preferences_shortcuts_check check(cardinality(shortcuts)<=4 and shortcuts<@array['saturday','efe','schedule','prepare','activities','chat','bible','birthdays','community','profile']::text[]);

create or replace function tnt_actions.personal_action(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id();b text:=p_data->>'book';c integer;verses integer[];v_shortcuts text[];v_extras integer[];
begin
 if auth.uid() is null or not tnt_actions.community_active_person(pid) then raise exception 'Iniciá sesión con tu perfil completo.' using errcode='42501';end if;
 if p_action='preferences' then
  if p_data ? 'shortcuts' then
   if jsonb_typeof(p_data->'shortcuts')<>'array' then raise exception 'Revisá los atajos.';end if;
   select coalesce(array_agg(value order by position),'{}') into v_shortcuts from(select value,min(position) position from jsonb_array_elements_text(p_data->'shortcuts') with ordinality a(value,position) group by value)x;
   if cardinality(v_shortcuts)>4 or array_position(v_shortcuts,null) is not null or not v_shortcuts<@array['saturday','efe','schedule','prepare','activities','chat','bible','birthdays','community','profile']::text[] then raise exception 'Elegí hasta cuatro atajos válidos.';end if;
  end if;
  if p_data ? 'extra_versions' then
   if jsonb_typeof(p_data->'extra_versions')<>'array' then raise exception 'Revisá las traducciones.';end if;
   select coalesce(array_agg(distinct value::integer),'{}') into v_extras from jsonb_array_elements_text(p_data->'extra_versions') a(value);
   if cardinality(v_extras)>12 or exists(select 1 from unnest(v_extras) e where e is null or e<1) then raise exception 'Elegí hasta doce traducciones adicionales.';end if;
  end if;
  if p_data ? 'shortcut_context' and not tnt_actions.valid_shortcut_context(p_data->'shortcut_context') then raise exception 'Revisá el grupo y la fecha de tus atajos.';end if;
  insert into public.tnt_personal_preferences(person_id) values(pid) on conflict do nothing;
  update public.tnt_personal_preferences set favorite_version=coalesce((p_data->>'favorite_version')::integer,favorite_version),extra_versions=coalesce(v_extras,extra_versions),shortcuts=coalesce(v_shortcuts,tnt_personal_preferences.shortcuts),shortcut_context=case when p_data ? 'shortcut_context' then p_data->'shortcut_context' else shortcut_context end,updated_at=now() where person_id=pid;
 elsif p_action in('mark','unmark') then
  c:=(p_data->>'chapter')::integer;
  if b is null or b!~'^[1-3]?[A-Z]{2,3}$' or c is null or not exists(select 1 from(values('GEN',50),('EXO',40),('LEV',27),('NUM',36),('DEU',34),('JOS',24),('JDG',21),('RUT',4),('1SA',31),('2SA',24),('1KI',22),('2KI',25),('1CH',29),('2CH',36),('EZR',10),('NEH',13),('EST',10),('JOB',42),('PSA',150),('PRO',31),('ECC',12),('SNG',8),('ISA',66),('JER',52),('LAM',5),('EZK',48),('DAN',12),('HOS',14),('JOL',3),('AMO',9),('OBA',1),('JON',4),('MIC',7),('NAM',3),('HAB',3),('ZEP',3),('HAG',2),('ZEC',14),('MAL',4),('MAT',28),('MRK',16),('LUK',24),('JHN',21),('ACT',28),('ROM',16),('1CO',16),('2CO',13),('GAL',6),('EPH',6),('PHP',4),('COL',4),('1TH',5),('2TH',3),('1TI',6),('2TI',4),('TIT',3),('PHM',1),('HEB',13),('JAS',5),('1PE',5),('2PE',3),('1JN',5),('2JN',1),('3JN',1),('JUD',1),('REV',22)) valid(book,chapters) where valid.book=b and c between 1 and valid.chapters) or coalesce(jsonb_typeof(p_data->'verses'),'')<>'array' or jsonb_array_length(p_data->'verses') not between 1 and 200 then raise exception 'Elegí versículos válidos.';end if;
  select array_agg(distinct value::integer) into verses from jsonb_array_elements_text(p_data->'verses') a(value);
  if exists(select 1 from unnest(verses) verse where verse is null or verse not between 1 and 200) then raise exception 'Elegí versículos válidos.';end if;
  if p_action='unmark' then delete from public.tnt_reader_marks where person_id=pid and book=b and chapter=c and verse=any(verses);
  else
   if coalesce(p_data->>'color','') not in('lime','lilac','peach','blue','pink','underline') then raise exception 'Elegí un color válido.';end if;
   insert into public.tnt_reader_marks(person_id,book,chapter,verse,color) select pid,b,c,verse,p_data->>'color' from unnest(verses) verse
   on conflict(person_id,book,chapter,verse) do update set color=excluded.color,updated_at=now();
  end if;
 elsif p_action='read' then
  insert into public.tnt_reader_days(person_id,day) values(pid,tnt_actions.community_today()) on conflict do nothing;
 else raise exception 'Acción no disponible.' using errcode='22023';end if;
 return tnt_actions.personal_context(b,c);
end $$;

create or replace function tnt_actions.merge_personal_state(p_source uuid,p_target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
 snapshot:=jsonb_build_array(jsonb_build_object('table','personal_reader','source',p_source,
 'preferences',(select to_jsonb(p) from public.tnt_personal_preferences p where person_id=p_source),
 'marks',(select jsonb_agg(to_jsonb(m)) from public.tnt_reader_marks m where person_id=p_source),
 'days',(select jsonb_agg(day) from public.tnt_reader_days where person_id=p_source)));
 insert into public.tnt_personal_preferences(person_id,favorite_version,extra_versions,shortcuts,shortcut_context) select p_target,favorite_version,extra_versions,shortcuts,shortcut_context from public.tnt_personal_preferences where person_id=p_source on conflict do nothing;
 insert into public.tnt_reader_marks(person_id,book,chapter,verse,color,updated_at) select p_target,book,chapter,verse,color,updated_at from public.tnt_reader_marks where person_id=p_source on conflict do nothing;
 insert into public.tnt_reader_days(person_id,day) select p_target,day from public.tnt_reader_days where person_id=p_source on conflict do nothing;
 delete from public.tnt_reader_days where person_id=p_source;
 delete from public.tnt_reader_marks where person_id=p_source;
 delete from public.tnt_personal_preferences where person_id=p_source;
 return snapshot;
end $$;
revoke all on function tnt_actions.merge_personal_state(uuid,uuid) from public,anon,authenticated;
