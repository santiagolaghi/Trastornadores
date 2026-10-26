-- Synthetic accounts and notices only; everything rolls back.
begin;
set local lock_timeout='4s';
set local statement_timeout='20s';
do $$declare u uuid;pid uuid;n integer;begin
 for n in 1..3 loop
  u:=gen_random_uuid();insert into auth.users(id,email,raw_user_meta_data,aud,role) values(u,'welcome-role-'||u||'@example.invalid',jsonb_build_object('full_name','Prueba Responsive '||n),'authenticated','authenticated');
  perform public.tnt_ensure_account_for_user(u);select person_id into pid from public.tnt_accounts where auth_user_id=u;
  update public.tnt_people set first_name='Prueba',last_name='Responsive '||n,full_name='Prueba Responsive '||n,birthday='2000-01-02',phone='1112345678',sex='M',instagram='No tengo',profile_consent=true where id=pid;
  update public.tnt_accounts set system_role=case when n=1 then 'admin' else 'user' end,staff_status=case when n<3 then 'approved' else 'community' end,ministry_role=case when n<3 then 'Líder' else null end,onboarding_completed_at=now() where person_id=pid;
  insert into public.tnt_profile_private_fields(person_id,dni) values(pid,(10000000+floor(random()*89999999))::integer::text) on conflict(person_id) do update set dni=excluded.dni;
  perform public.tnt_apply_profile_answers(pid,'{"studies":"Trabajo","dreams":"Aprender","health":"Ninguna","interests":["Música"],"efe_group":"none","leadership_strengths":{"Acompañar jóvenes":50,"Acompañar adolescentes":50,"Enseñar":50,"Escuchar":50,"Organizar equipos":50,"Comunicar":50}}');
  perform set_config('tnt.welcome.uid'||n,u::text,true);perform set_config('tnt.welcome.pid'||n,pid::text,true);
 end loop;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.welcome.uid1'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin if not public.tnt_profile_is_complete() then raise exception 'Synthetic profile is incomplete';end if;begin perform public.tnt_community_action('request_welcome','{"staff_status":"community"}');raise exception 'Staff requested accompaniment';exception when insufficient_privilege then null;end;end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.welcome.uid2'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin if not public.tnt_profile_is_complete() then raise exception 'Synthetic profile is incomplete';end if;begin perform public.tnt_community_action('request_welcome','{"staff_status":"community"}');raise exception 'Staff requested accompaniment';exception when insufficient_privilege then null;end;end $$;
reset role;
do $$begin
 if exists(select 1 from public.tnt_community_accompaniment where person_id in(current_setting('tnt.welcome.pid1')::uuid,current_setting('tnt.welcome.pid2')::uuid)) then raise exception 'Staff request was persisted';end if;
 if exists(select 1 from public.tnt_community_history where actor in(current_setting('tnt.welcome.pid1')::uuid,current_setting('tnt.welcome.pid2')::uuid) and action='request_welcome') then raise exception 'Denied request created history/notices';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.welcome.uid3'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_community_action('request_welcome',jsonb_build_object('person_id',current_setting('tnt.welcome.pid2')));
reset role;
do $$begin
 if not exists(select 1 from public.tnt_community_accompaniment where person_id=current_setting('tnt.welcome.pid3')::uuid) then raise exception 'Community cannot request accompaniment';end if;
 if not exists(select 1 from public.tnt_community_history where actor=current_setting('tnt.welcome.pid3')::uuid and action='request_welcome' and subject_id=current_setting('tnt.welcome.pid3')) then raise exception 'Request history used a forged target';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.welcome.uid1'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_community_action('assign_referent',jsonb_build_object('person_id',current_setting('tnt.welcome.pid3'),'referent_id',current_setting('tnt.welcome.pid2')));
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.welcome.uid2'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin begin perform public.tnt_community_action('respond_referent',jsonb_build_object('person_id',current_setting('tnt.welcome.pid3'),'accept',false));raise exception 'The referent could decline an administrative assignment';exception when insufficient_privilege then null;end;end $$;
select public.tnt_community_action('followup',jsonb_build_object('person_id',current_setting('tnt.welcome.pid3'),'note','Seguimiento sintético revertido','shared',true));
reset role;
do $$begin
 if not exists(select 1 from public.tnt_community_accompaniment where person_id=current_setting('tnt.welcome.pid3')::uuid and status='accepted' and responded_at is null) then raise exception 'Assignment is not immediately active';end if;
 -- Simulate a request left over before this person became a leader.
 insert into public.tnt_community_accompaniment(person_id,status) values(current_setting('tnt.welcome.pid2')::uuid,'unassigned');
 update public.tnt_accounts set staff_status='approved' where person_id=current_setting('tnt.welcome.pid2')::uuid;
 if not exists(select 1 from public.tnt_community_accompaniment where person_id=current_setting('tnt.welcome.pid2')::uuid and status='closed') then raise exception 'Existing staff request remains active';end if;
 if not exists(select 1 from public.tnt_community_history where subject_id=current_setting('tnt.welcome.pid2') and action='close_staff_welcome_request' and details->'before'->>'status'='unassigned') then raise exception 'Closing the request lost its history';end if;
end $$;
rollback;
select 'PASS: leaders/admin denied, Community can request only for self, admin assignment immediate, no referent acceptance, staff requests closed and followup preserved; everything rolled back' verification;
