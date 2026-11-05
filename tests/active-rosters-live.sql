-- Only a unique synthetic account is written. Everything is rolled back.
begin;
select set_config('tnt.roster_target',gen_random_uuid()::text,true);
select set_config('tnt.roster_actor',(select a.auth_user_id::text from public.tnt_accounts a join public.tnt_people p on p.id=a.person_id where a.system_role='admin' and a.enabled and p.active and a.onboarding_completed_at is not null limit 1),true);
insert into auth.users(id,email,raw_user_meta_data,aud,role)
values(current_setting('tnt.roster_target')::uuid,'roster-'||current_setting('tnt.roster_target')||'@example.invalid',jsonb_build_object('full_name','Prueba temporal de roster '||current_setting('tnt.roster_target')),'authenticated','authenticated');
select public.tnt_ensure_account_for_user(current_setting('tnt.roster_target')::uuid);
select set_config('tnt.roster_person',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.roster_target')::uuid),true);
update public.tnt_accounts set enabled=true where auth_user_id=current_setting('tnt.roster_target')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.roster_actor'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('tnt.roster_actor'),true);
set local role authenticated;
do $$ declare target uuid:=current_setting('tnt.roster_person')::uuid;gid uuid;meeting date;begin
 if exists(select 1 from public.tnt_saturday_members where person_id=target) or exists(select 1 from public.tnt_efe_memberships where person_id=target) then raise exception 'La prueba debe empezar sin membresías';end if;
 perform public.tnt_mark_attendance('sabados',target,(date_trunc('week',current_date)::date+5),'present');
 select g.id,m.meeting_date into gid,meeting from public.tnt_efe_groups g join public.tnt_efe_meetings m on m.group_id=g.id where g.code='varones' and m.active order by m.meeting_date desc limit 1;
 if gid is null then raise exception 'Falta un encuentro EFE activo para verificar';end if;
 perform public.tnt_mark_attendance('efe',target,meeting,'absent',gid);
 if not exists(select 1 from public.tnt_saturday_attendance where person_id=target and status='present') then raise exception 'No se guardó Sábado';end if;
 if not exists(select 1 from public.tnt_efe_wednesday_attendance where person_id=target and group_id=gid and status='absent') then raise exception 'No se guardó EFE';end if;
end $$;
reset role;
rollback;
select 'PASS: asistencia real en EFE y Sábados sin membresías manuales; todos los datos temporales revertidos' as result;
