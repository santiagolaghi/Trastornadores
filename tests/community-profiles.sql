-- Synthetic accounts and all writes are rolled back. No real profile is changed.
begin;
select set_config('tnt.test_profile_uid',gen_random_uuid()::text,true);
select set_config('tnt.test_profile_admin',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,aud,role)
values(current_setting('tnt.test_profile_uid')::uuid,'profile-'||current_setting('tnt.test_profile_uid')||'@example.invalid','{"full_name":"Prueba Perfil Temporal"}','authenticated','authenticated'),
(current_setting('tnt.test_profile_admin')::uuid,'admin-profile-'||current_setting('tnt.test_profile_admin')||'@example.invalid','{"full_name":"Admin Perfil Temporal"}','authenticated','authenticated');
select public.tnt_ensure_account_for_user(current_setting('tnt.test_profile_uid')::uuid);
select public.tnt_ensure_account_for_user(current_setting('tnt.test_profile_admin')::uuid);
update public.tnt_accounts set staff_status='approved',ministry_role='Colaborador' where auth_user_id=current_setting('tnt.test_profile_uid')::uuid;
update public.tnt_accounts set system_role='admin' where auth_user_id=current_setting('tnt.test_profile_admin')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_profile_uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare v jsonb; pid uuid:=public.tnt_current_person_id();
begin
 if public.tnt_profile_is_complete() or public.tnt_has_access('chat') or public.tnt_is_staff() then raise exception 'Un perfil incompleto recibió acceso';end if;
 if (select count(*) from public.tnt_people)>1 then raise exception 'El perfil incompleto puede ver otras personas';end if;
 begin perform public.tnt_community_home();raise exception 'Se abrió la comunidad sin completar datos';exception when insufficient_privilege then null;end;
 v:='{"first_name":"Prueba","last_name":"Perfil Temporal","birthday":"2005-04-12","sex":"M","phone":"1112345678","instagram":"No tengo","dni":"12345678","interests":["Dibujar","Cantar"],"studies":"Secundario","dreams":"Aprender a crear","efe_group":"mujeres18"}';
 begin perform public.tnt_finish_onboarding(v-'dreams',true,'Colaborador');raise exception 'Se aceptó un sueño vacío';exception when raise_exception then if sqlerrm='Se aceptó un sueño vacío' then raise;end if;end;
 perform public.tnt_finish_onboarding(v,true,'Colaborador');
 if not public.tnt_profile_is_complete() or not public.tnt_has_access('chat') then raise exception 'El perfil completo no habilitó el acceso correspondiente';end if;
 if public.tnt_is_admin() or public.tnt_has_access('efe','mujeres18') then raise exception 'Elegir EFE otorgó privilegios';end if;
 begin update public.tnt_accounts set system_role='admin' where person_id=pid;raise exception 'Se permitió autoasignarse administrador';exception when insufficient_privilege then null;end;
 if public.tnt_profile_context()->'values'->>'efe_group'<>'mujeres18' then raise exception 'No se respetó la elección de EFE';end if;
 if public.tnt_profile_context()->'values'->'interests'<>'["Dibujar","Cantar"]'::jsonb then raise exception 'Faltan intereses';end if;
 begin perform public.tnt_complete_profile('{"phone":"1199999999"}');raise exception 'Se reemplazó identidad aprobada';exception when raise_exception then if sqlerrm='Se reemplazó identidad aprobada' then raise;end if;end;
end $$;
reset role;
update public.tnt_people set sex='F',birthday='2010-04-12' where id=(select person_id from public.tnt_accounts where auth_user_id=current_setting('tnt.test_profile_uid')::uuid);
set local role authenticated;
do $$ begin
 if public.tnt_profile_context()->'values'->>'efe_group'<>'mujeres18' then raise exception 'Edad o sexo reemplazaron el EFE elegido';end if;
 perform public.tnt_save_my_interests('{"efe_group":"none"}');
 if public.tnt_profile_context()->'values'->>'efe_group'<>'none' then raise exception 'No se guardó la opción sin EFE';end if;
 if exists(select 1 from public.tnt_efe_memberships where person_id=public.tnt_current_person_id() and active) then raise exception 'Quedó una membresía activa';end if;
 perform public.tnt_request_profile_change('{"phone":"1199999999"}');
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_profile_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare f jsonb; v jsonb;
begin
 if public.tnt_is_admin() then raise exception 'Un administrador incompleto entró a módulos';end if;
 perform public.tnt_finish_onboarding('{"first_name":"Admin","last_name":"Perfil Temporal","birthday":"2000-01-01","sex":"F","phone":"1112345678","instagram":"No tengo","dni":"87654321","interests":["Música"],"studies":"Trabajo","dreams":"Acompañar","efe_group":"none"}',false,null);
 if not public.tnt_is_admin() then raise exception 'El administrador completo sigue bloqueado';end if;
 perform public.tnt_review_profile_change((select id from public.tnt_profile_change_requests where person_id=(select person_id from public.tnt_accounts where auth_user_id=current_setting('tnt.test_profile_uid')::uuid) and status='pending'),true);
 if (select phone from public.tnt_people where id=(select person_id from public.tnt_accounts where auth_user_id=current_setting('tnt.test_profile_uid')::uuid))<>'1199999999' then raise exception 'La revisión no guardó el cambio';end if;
 f:=public.tnt_profile_fields();f:=jsonb_set(f,'{dni,required}','false');
 perform public.tnt_save_profile_fields(f);
 if public.tnt_profile_fields()->'dni'->>'required'<>'false' then raise exception 'No se guardó el campo opcional';end if;
 f:=f||'{"question_test":{"label":"Una pregunta nueva","type":"text","visible":true,"required":true}}';
 perform public.tnt_save_profile_fields(f);
 if public.tnt_is_admin() or public.tnt_has_access('organizacion') then raise exception 'La pregunta nueva no bloqueó al administrador';end if;
 perform public.tnt_complete_profile('{"question_test":"Respuesta"}');
 if not public.tnt_is_admin() then raise exception 'Completar la pregunta no devolvió acceso';end if;
 perform public.tnt_save_profile_fields(f-'question_test');
end $$;
reset role;
set local role anon;
do $$ declare id uuid; ignored uuid;
begin
 if has_table_privilege('anon','public.tnt_profile_answers','select') then raise exception 'Intereses privados son públicos';end if;
 if has_function_privilege('authenticated','public.tnt_profile_values(uuid)','execute') then raise exception 'Se expuso la consulta de perfiles ajenos';end if;
 if has_function_privilege('anon','public.tnt_create_public_profile(text,text,date,text,text,text,boolean)','execute') then raise exception 'Sigue abierto el endpoint que omite requisitos';end if;
 id:=public.tnt_submit_public_profile(jsonb_build_object('first_name','Público','last_name',current_setting('tnt.test_profile_uid'),'birthday','2000-03-01','sex','M','phone','1112345678','instagram','No tengo','dni','11223344','interests',jsonb_build_array('Bailar'),'studies','Trabajo','dreams','Crecer','efe_group','none'),true);
 perform set_config('tnt.test_public_profile',id::text,true);
 ignored:=public.tnt_submit_public_profile(jsonb_build_object('first_name','Público','last_name',current_setting('tnt.test_profile_uid'),'birthday','2000-03-01','sex','M','phone','1199999999','instagram','No tengo','dni','11223344','interests',jsonb_build_array('Dibujar'),'studies','Trabajo','dreams','Crecer','efe_group','varones'),true);
end $$;
reset role;
do $$ begin
 if (select phone from public.tnt_people where id=current_setting('tnt.test_public_profile')::uuid)<>'1112345678' then raise exception 'El formulario público sobrescribió la identidad';end if;
 if exists(select 1 from public.tnt_efe_memberships where person_id=current_setting('tnt.test_public_profile')::uuid and active) then raise exception 'El envío público reemplazó la membresía sin revisión';end if;
 if not exists(select 1 from public.tnt_profile_public_requests where person_id=current_setting('tnt.test_public_profile')::uuid and status='pending') then raise exception 'No se generó la revisión de un perfil existente';end if;
end $$;
select set_config('tnt.test_profile_link_uid',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,aud,role) values(current_setting('tnt.test_profile_link_uid')::uuid,'profile-link-'||current_setting('tnt.test_profile_link_uid')||'@example.invalid',jsonb_build_object('full_name','Público '||current_setting('tnt.test_profile_uid')),'authenticated','authenticated');
select public.tnt_ensure_account_for_user(current_setting('tnt.test_profile_link_uid')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_profile_link_uid'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding(jsonb_build_object('first_name','Público','last_name',current_setting('tnt.test_profile_uid'),'birthday','2000-03-01','sex','M','phone','1112345678','instagram','No tengo','dni','11223344','interests',jsonb_build_array('Cantar'),'studies','Trabajo','dreams','Conectar','efe_group','varones'),false,null);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_profile_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare r uuid;
begin
 select id into r from public.tnt_profile_link_requests where person_id=(select person_id from public.tnt_accounts where auth_user_id=current_setting('tnt.test_profile_link_uid')::uuid) and target_person_id=current_setting('tnt.test_public_profile')::uuid and status='pending';
 if r is null then raise exception 'No se reconoció el perfil existente para revisión';end if;
 perform public.tnt_review_profile_link(r,true);
 if (select person_id from public.tnt_accounts where auth_user_id=current_setting('tnt.test_profile_link_uid')::uuid)<>current_setting('tnt.test_public_profile')::uuid then raise exception 'No se consolidó la identidad revisada';end if;
 if exists(select 1 from public.tnt_efe_memberships where person_id=current_setting('tnt.test_public_profile')::uuid and active) then raise exception 'La vinculación reemplazó la opción EFE existente';end if;
 if (select answers->'interests' from public.tnt_profile_answers where person_id=current_setting('tnt.test_public_profile')::uuid)<>'["Bailar"]'::jsonb then raise exception 'La vinculación perdió los intereses existentes';end if;
end $$;
reset role;
rollback;
