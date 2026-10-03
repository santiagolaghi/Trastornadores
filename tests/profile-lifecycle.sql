begin;
select set_config('tnt.test_admin',(select auth_user_id::text from public.tnt_accounts where system_role='admin' and enabled limit 1),true);
select set_config('tnt.test_uid',gen_random_uuid()::text,true);
select set_config('tnt.test_last','Conexión '||substr(current_setting('tnt.test_uid'),1,8),true);
set local role anon;
select set_config('tnt.test_target',public.tnt_create_public_profile('Prueba',current_setting('tnt.test_last'),'2000-02-10','@Prueba','1112345678','Varón',true)::text,true);
-- Resubmission with changed data must wait for an administrator.
select set_config('tnt.test_public',public.tnt_create_public_profile('Prueba',current_setting('tnt.test_last'),'2000-02-10','@Cambiada','1199999999','Varón',true)::text,true);
reset role;
do $$ begin
 if (select phone from public.tnt_people where id=current_setting('tnt.test_target')::uuid)<>'1112345678' then raise exception 'El formulario público sobrescribió datos';end if;
 if has_function_privilege('anon','public.tnt_ensure_account_for_user(uuid)','execute') or has_function_privilege('authenticated','public.tnt_ensure_account_for_user(uuid)','execute') then raise exception 'La API expone el alta para cuentas ajenas';end if;
 if has_table_privilege('anon','public.tnt_profile_public_requests','select') then raise exception 'El público puede leer solicitudes privadas';end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data,aud,role) values(current_setting('tnt.test_uid')::uuid,'link-'||current_setting('tnt.test_uid')||'@example.invalid',jsonb_build_object('full_name','Prueba '||current_setting('tnt.test_last')),'authenticated','authenticated');
select public.tnt_ensure_account_for_user(current_setting('tnt.test_uid')::uuid);
select set_config('tnt.test_source',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.test_uid')::uuid),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin update public.tnt_accounts set onboarding_completed_at=now() where person_id=public.tnt_current_person_id();raise exception 'Se omitió el alta obligatoria';exception when insufficient_privilege then null;end;
 begin update public.tnt_accounts set email='otra-persona@example.invalid' where person_id=public.tnt_current_person_id();raise exception 'Se permitió cambiar el correo Google';exception when insufficient_privilege then null;end;
 perform public.tnt_finish_onboarding(jsonb_build_object('first_name','Prueba','last_name',current_setting('tnt.test_last'),'birthday','2000-02-10','sex','M','phone','1122222222','instagram','@Prueba','dni','12345678'),true,'Pastor/a');
 if (select staff_status from public.tnt_accounts where person_id=public.tnt_current_person_id())<>'pending' then raise exception 'El rol se aprobó solo';end if;
 if public.tnt_has_access('chat','*','view') then raise exception 'El rol pendiente obtuvo acceso al chat';end if;
 if exists(select 1 from public.tnt_people where id=current_setting('tnt.test_target')::uuid) then raise exception 'La cuenta nueva lee el perfil de otra persona';end if;
 perform set_config('tnt.test_link',(select id::text from public.tnt_profile_link_requests where person_id=public.tnt_current_person_id() and status='pending'),true);
 if current_setting('tnt.test_link') is null then raise exception 'No se detectó la coincidencia de perfil';end if;
 begin perform public.tnt_review_profile_link(current_setting('tnt.test_link')::uuid,true);raise exception 'Se permitió auto-vincular perfiles';exception when insufficient_privilege then null;end;
 begin perform public.tnt_profile_link_preview(current_setting('tnt.test_link')::uuid);raise exception 'La vista previa expuso contactos ajenos';exception when insufficient_privilege then null;end;
 begin perform public.tnt_set_profile_active(public.tnt_current_person_id(),false);raise exception 'Se permitió archivar sin permiso';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into public.tnt_saturday_members(person_id,active) values(current_setting('tnt.test_target')::uuid,true),(current_setting('tnt.test_source')::uuid,true);
insert into public.tnt_saturday_attendance(person_id,saturday_date,status) values(current_setting('tnt.test_target')::uuid,'2020-01-04','present'),(current_setting('tnt.test_source')::uuid,'2020-01-11','absent');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_review_profile_link(current_setting('tnt.test_link')::uuid,true);
do $$ begin
 if (select person_id from public.tnt_accounts where auth_user_id=current_setting('tnt.test_uid')::uuid)<>current_setting('tnt.test_target')::uuid then raise exception 'La cuenta no usa el perfil existente';end if;
 if not exists(select 1 from public.tnt_role_requests where person_id=current_setting('tnt.test_target')::uuid and status='pending' and requested_role='Pastor/a') then raise exception 'Se perdió la solicitud de rol';end if;
 if (select count(*) from public.tnt_saturday_attendance where person_id=current_setting('tnt.test_target')::uuid)<>2 then raise exception 'Se perdió historial de asistencia';end if;
 if (select phone from public.tnt_people where id=current_setting('tnt.test_target')::uuid)<>'1112345678' then raise exception 'Se sobrescribió el contacto original';end if;
 if not exists(select 1 from public.tnt_audit_log where entity_id=current_setting('tnt.test_target')::uuid and action='profile_link_approved' and details ? 'references_before') then raise exception 'Falta la auditoría del vínculo';end if;
end $$;
select public.tnt_review_public_profile(current_setting('tnt.test_public')::uuid,true);
select public.tnt_set_profile_active(current_setting('tnt.test_target')::uuid,false);
reset role;
do $$ begin
 if (select active from public.tnt_people where id=current_setting('tnt.test_target')::uuid) then raise exception 'El perfil no se archivó';end if;
 if (select enabled from public.tnt_accounts where person_id=current_setting('tnt.test_target')::uuid) then raise exception 'La cuenta archivada sigue habilitada';end if;
 if exists(select 1 from public.tnt_efe_memberships where person_id=current_setting('tnt.test_target')::uuid and active) then raise exception 'El perfil archivado sigue en la lista de EFE';end if;
 if (select count(*) from public.tnt_saturday_attendance where person_id=current_setting('tnt.test_target')::uuid)<>2 then raise exception 'Archivar borró las asistencias';end if;
end $$;
set local role authenticated;
select public.tnt_set_profile_active(current_setting('tnt.test_target')::uuid,true);
reset role;
do $$ begin
 if not exists(select 1 from public.tnt_saturday_members where person_id=current_setting('tnt.test_target')::uuid and active) then raise exception 'No se restauró la pertenencia a sábados';end if;
 if not exists(select 1 from public.tnt_efe_memberships where person_id=current_setting('tnt.test_target')::uuid and active) then raise exception 'No se restauró la pertenencia a EFE';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.tnt_ensure_account()<>current_setting('tnt.test_target')::uuid then raise exception 'Google volvió a crear un clon';end if;
 if (select count(*) from public.tnt_my_attendance())<>2 then raise exception 'La persona no recuperó sus asistencias';end if;
end $$;
reset role;
rollback;
select 'PASS: alta completa, Google sin autoaprobación, vínculo supervisado, historial conservado y restauración' as result;
