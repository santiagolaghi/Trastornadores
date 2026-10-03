begin;
select set_config('tnt.test_admin',(select auth_user_id::text from public.tnt_accounts where system_role='admin' and enabled limit 1),true);
select set_config('tnt.test_uid',gen_random_uuid()::text,true);
select set_config('tnt.test_last','Historial '||substr(current_setting('tnt.test_uid'),1,8),true);
set local role anon;
select set_config('tnt.test_target',public.tnt_create_public_profile('Conflicto',current_setting('tnt.test_last'),'2000-02-10',null,'1112345678','Varón',true)::text,true);
-- A shared family phone and birthday do not prove that two names are one person.
select set_config('tnt.test_family',public.tnt_create_public_profile('Familia',current_setting('tnt.test_last'),'2000-02-10',null,'1112345678','Varón',true)::text,true);
reset role;
do $$ begin if current_setting('tnt.test_family')=current_setting('tnt.test_target') then raise exception 'Se unificaron personas por teléfono compartido';end if;end $$;
insert into auth.users(id,email,raw_user_meta_data,aud,role) values(current_setting('tnt.test_uid')::uuid,'conflict-'||current_setting('tnt.test_uid')||'@example.invalid',jsonb_build_object('full_name','Conflicto '||current_setting('tnt.test_last')),'authenticated','authenticated');
select public.tnt_ensure_account_for_user(current_setting('tnt.test_uid')::uuid);
select set_config('tnt.test_source',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.test_uid')::uuid),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_uid'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding(jsonb_build_object('first_name','Conflicto','last_name',current_setting('tnt.test_last'),'birthday','2000-02-10','sex','M','phone','1112345678','instagram','@Prueba','dni','12345678'),false,null);
select set_config('tnt.test_link',(select id::text from public.tnt_profile_link_requests where person_id=public.tnt_current_person_id() and status='pending'),true);
reset role;
insert into public.tnt_saturday_attendance(person_id,saturday_date,status) values(current_setting('tnt.test_source')::uuid,'2020-01-04','absent'),(current_setting('tnt.test_target')::uuid,'2020-01-04','present');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.tnt_review_profile_link(current_setting('tnt.test_link')::uuid,true);raise exception 'Se descartó historial en conflicto';exception when raise_exception then if sqlerrm not like 'Los dos registros tienen historial superpuesto%' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if (select person_id from public.tnt_accounts where auth_user_id=current_setting('tnt.test_uid')::uuid)<>current_setting('tnt.test_source')::uuid then raise exception 'La cuenta se movió a pesar del conflicto';end if;
 if (select count(*) from public.tnt_people where id in(current_setting('tnt.test_source')::uuid,current_setting('tnt.test_target')::uuid) and active)<>2 then raise exception 'Se archivó un registro sin resolver el conflicto';end if;
 if (select count(*) from public.tnt_saturday_attendance where person_id in(current_setting('tnt.test_source')::uuid,current_setting('tnt.test_target')::uuid))<>2 then raise exception 'Se perdió historial en conflicto';end if;
 if not exists(select 1 from public.tnt_profile_link_requests where id=current_setting('tnt.test_link')::uuid and status='pending') then raise exception 'La solicitud dejó de estar pendiente';end if;
 if (select count(*) from public.tnt_efe_memberships where person_id in(current_setting('tnt.test_source')::uuid,current_setting('tnt.test_target')::uuid) and active)<>2 then raise exception 'La revisión fallida alteró pertenencias EFE';end if;
end $$;
set local role authenticated;
select public.tnt_review_profile_link(current_setting('tnt.test_link')::uuid,false);
reset role;
rollback;
select 'PASS: teléfono compartido no unifica y conflictos conservan cuentas, asistencias y pertenencias' as result;
