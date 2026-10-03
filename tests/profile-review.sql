begin;
select set_config('tnt.test_admin',(select auth_user_id::text from public.tnt_accounts where system_role='admin' and enabled limit 1),true);
select set_config('tnt.test_uid',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,aud,role) values(current_setting('tnt.test_uid')::uuid,'profile-review-'||current_setting('tnt.test_uid')||'@example.invalid','{"full_name":"Prueba Perfil"}','authenticated','authenticated');
select public.tnt_ensure_account_for_user(current_setting('tnt.test_uid')::uuid);
select set_config('tnt.test_person',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.test_uid')::uuid),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare rid uuid; begin
 begin perform public.tnt_complete_onboarding(false,null,'2005-02-10','U');raise exception 'Se aceptó sexo indefinido';exception when raise_exception then if sqlerrm='Se aceptó sexo indefinido' then raise;end if;end;
 perform public.tnt_complete_onboarding(false,null,'2005-02-10','F');
 begin update public.tnt_people set phone='999999999' where id=public.tnt_current_person_id();raise exception 'Se permitió cambiar sin revisión';exception when insufficient_privilege then null;end;
 rid:=public.tnt_request_profile_change('{"first_name":"Prueba","last_name":"Corregida","birthday":"2005-02-10","sex":"F","phone":"1112345678","instagram":"@Prueba","dni":"12345678"}');
 perform set_config('tnt.test_request',rid::text,true);
 if (select full_name from public.tnt_people where id=public.tnt_current_person_id())<>'Prueba Perfil' then raise exception 'Cambió el perfil antes de aprobar';end if;
 begin perform public.tnt_review_profile_change(rid,true);raise exception 'Se permitió autoaprobar';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.tnt_my_attendance()) then raise exception 'La cuenta nueva ve asistencias ajenas';end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.tnt_notifications where data->>'request_id'=current_setting('tnt.test_request') and person_id in(select person_id from public.tnt_accounts where system_role='admin')) then raise exception 'El admin no recibió la solicitud';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_review_profile_change(current_setting('tnt.test_request')::uuid,true);
do $$ begin
 if not exists(select 1 from public.tnt_people where id=current_setting('tnt.test_person')::uuid and full_name='Prueba Corregida' and instagram='@Prueba' and exists(select 1 from public.tnt_profile_private_fields where person_id=current_setting('tnt.test_person')::uuid and dni='12345678')) then raise exception 'No se actualizaron los datos centrales';end if;
 if not exists(select 1 from public.tnt_audit_log where entity_id=current_setting('tnt.test_person')::uuid and action='profile_change_approved') then raise exception 'Falta auditoría';end if;
end $$;
reset role;
rollback;
select 'PASS: perfil sin autoaprobación, aviso admin, datos centrales y auditoría' result;
