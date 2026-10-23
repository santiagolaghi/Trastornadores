create or replace function tnt_actions.community_active_person(p_person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id where a.person_id=p_person and a.enabled and p.active and a.onboarding_completed_at is not null and jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(p_person)))=0)
$$;
create or replace function tnt_actions.community_can_for(p_person uuid,p_module text,p_level integer default 1) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id
 where a.person_id=p_person and tnt_actions.community_active_person(p_person) and (a.system_role='admin' or a.staff_status='approved' and exists(
 select 1 from public.tnt_community_grants g where g.person_id=p_person and g.module=p_module and g.level>=p_level)))
$$;
create or replace function public.tnt_community_can(p_module text,p_level integer default 1) returns boolean language sql stable security invoker set search_path='' as $$
 select tnt_actions.community_can_for(public.tnt_current_person_id(),p_module,p_level)
$$;
create or replace function tnt_actions.community_content_visible(p_id uuid,p_person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select tnt_actions.community_active_person(p_person) and exists(select 1 from public.tnt_community_content c join public.tnt_community_modules m on m.id=c.module
 where c.id=p_id and (tnt_actions.community_can_for(p_person,c.module,1) or m.enabled and c.status in('published','scheduled') and (c.starts_at is null or c.starts_at<=now())
 and (c.audience='all' or c.audience='staff' and exists(select 1 from public.tnt_accounts a where a.person_id=p_person and (a.staff_status='approved' or a.system_role='admin'))
 or c.audience='selected' and exists(select 1 from public.tnt_community_audience x where x.content_id=c.id and x.person_id=p_person)
 or c.audience='families' and exists(select 1 from public.tnt_community_family_links f where f.caregiver_id=p_person and f.status='verified'))
 and (c.module<>'families' or exists(select 1 from public.tnt_community_family_links f where f.caregiver_id=p_person and f.status='verified'))))
$$;
create or replace function tnt_actions.community_today() returns date language sql stable set search_path='' as $$select (now() at time zone 'America/Argentina/Buenos_Aires')::date$$;
create or replace function tnt_actions.community_ensure_day() returns void language plpgsql security definer set search_path='' as $$
declare d date:=tnt_actions.community_today();ph public.tnt_community_phrases%rowtype;refs text[]:=array['PSA.23.1','PRO.3.5-6','MAT.5.14-16','PHP.4.6-7','JHN.15.12','ROM.12.12','ISA.41.10','PSA.46.1','JAS.1.5','MIC.6.8','MAT.11.28','GAL.6.9','1TH.5.16-18','HEB.10.24'];
begin
 if exists(select 1 from public.tnt_community_days where day=d) then return;end if;
 select * into ph from public.tnt_community_phrases p where active and not exists(select 1 from public.tnt_community_days x where x.day>=d-7 and x.phrase=p.text) order by md5(d::text||p.id::text) limit 1;
 if ph.id is null then select * into ph from public.tnt_community_phrases where active order by md5(d::text||id::text) limit 1;end if;
 insert into public.tnt_community_days(day,reference,phrase,author) values(d,refs[1+mod(extract(doy from d)::integer-1,array_length(refs,1))],coalesce(ph.text,'Hoy podés dar un pequeño paso de amor y esperanza.'),coalesce(ph.author,'')) on conflict(day) do nothing;
end $$;

-- RLS also protects direct Data API reads; clients have no direct mutation grants.
do $$declare t text;begin
 foreach t in array array['modules','grants','content','audience','enrollments','votes','questions','accompaniment','followups','family_links','consents','baptisms','preferences','phrases','days','game_runs','history','notice_keys'] loop
  execute format('alter table public.tnt_community_%I enable row level security',t);
  execute format('revoke all on public.tnt_community_%I from anon,authenticated',t);
  execute format('grant select on public.tnt_community_%I to authenticated',t);
 end loop;
end $$;
create policy community_modules_read on public.tnt_community_modules for select to authenticated using((select tnt_actions.community_active_person(public.tnt_current_person_id())) and (enabled or public.tnt_community_can(id,1)));
create policy community_grants_read on public.tnt_community_grants for select to authenticated using(person_id=(select public.tnt_current_person_id()) or (select public.tnt_is_admin()));
create policy community_content_read on public.tnt_community_content for select to authenticated using(tnt_actions.community_content_visible(id,(select public.tnt_current_person_id())));
create policy community_audience_read on public.tnt_community_audience for select to authenticated using(person_id=(select public.tnt_current_person_id()) or exists(select 1 from public.tnt_community_content c where c.id=content_id and public.tnt_community_can(c.module,1)));
create policy community_enrollments_read on public.tnt_community_enrollments for select to authenticated using(person_id=(select public.tnt_current_person_id()) or exists(select 1 from public.tnt_community_content c where c.id=content_id and public.tnt_community_can(c.module,3)));
create policy community_votes_read on public.tnt_community_votes for select to authenticated using(person_id=(select public.tnt_current_person_id()));
create policy community_questions_read on public.tnt_community_questions for select to authenticated using((select tnt_actions.community_active_person(public.tnt_current_person_id())) and (person_id=(select public.tnt_current_person_id()) or public.tnt_community_can('questions',1) or status='published' and visibility='community'));
create policy community_accompaniment_read on public.tnt_community_accompaniment for select to authenticated using(person_id=(select public.tnt_current_person_id()) or referent_id=(select public.tnt_current_person_id()) or (select public.tnt_is_admin()));
create policy community_followups_read on public.tnt_community_followups for select to authenticated using((person_id=(select public.tnt_current_person_id()) and shared) or (select public.tnt_is_admin()) or exists(select 1 from public.tnt_community_accompaniment a where a.person_id=tnt_community_followups.person_id and a.referent_id=(select public.tnt_current_person_id()) and a.status='accepted'));
create policy community_family_read on public.tnt_community_family_links for select to authenticated using(caregiver_id=(select public.tnt_current_person_id()) or member_id=(select public.tnt_current_person_id()) or public.tnt_community_can('families',3));
create policy community_consents_read on public.tnt_community_consents for select to authenticated using(public.tnt_community_can('families',3) or exists(select 1 from public.tnt_community_family_links f where f.id=link_id and f.caregiver_id=(select public.tnt_current_person_id()) and f.status='verified'));
create policy community_baptisms_read on public.tnt_community_baptisms for select to authenticated using(person_id=(select public.tnt_current_person_id()) or public.tnt_community_can('baptisms',3));
create policy community_preferences_read on public.tnt_community_preferences for select to authenticated using(person_id=(select public.tnt_current_person_id()));
create policy community_phrases_read on public.tnt_community_phrases for select to authenticated using(public.tnt_community_can('daily',1));
create policy community_days_read on public.tnt_community_days for select to authenticated using((select tnt_actions.community_active_person(public.tnt_current_person_id())) and (day<=(select tnt_actions.community_today()) or public.tnt_community_can('daily',1)));
create policy community_games_read on public.tnt_community_game_runs for select to authenticated using(person_id=(select public.tnt_current_person_id()));
create policy community_history_read on public.tnt_community_history for select to authenticated using(public.tnt_community_can(module,3));
create policy community_notice_keys_read on public.tnt_community_notice_keys for select to authenticated using(person_id=(select public.tnt_current_person_id()));


revoke all on function tnt_actions.community_ensure_day(),tnt_actions.community_active_person(uuid),tnt_actions.community_can_for(uuid,text,integer),tnt_actions.community_content_visible(uuid,uuid),tnt_actions.community_today() from public,anon;
grant execute on function tnt_actions.community_active_person(uuid),tnt_actions.community_can_for(uuid,text,integer),tnt_actions.community_content_visible(uuid,uuid),tnt_actions.community_today() to authenticated;
revoke all on function public.tnt_community_can(text,integer) from public,anon;
grant execute on function public.tnt_community_can(text,integer) to authenticated;
