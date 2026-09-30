-- All synthetic identities, permissions and conversations are rolled back.
begin;
select set_config('tnt.test_admin',(select auth_user_id::text from public.tnt_accounts where system_role='admin' and enabled limit 1),true);
select set_config('tnt.test_user',gen_random_uuid()::text,true);
select set_config('tnt.test_other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,aud,role)
values(current_setting('tnt.test_user')::uuid,'staff-regression-'||current_setting('tnt.test_user')||'@example.invalid','{"full_name":"Prueba Staff Temporal"}','authenticated','authenticated'),
(current_setting('tnt.test_other')::uuid,'community-regression-'||current_setting('tnt.test_other')||'@example.invalid','{"full_name":"Prueba Comunidad Temporal"}','authenticated','authenticated');
select public.tnt_ensure_account_for_user(current_setting('tnt.test_user')::uuid);
select public.tnt_ensure_account_for_user(current_setting('tnt.test_other')::uuid);
select set_config('tnt.test_person',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.test_user')::uuid),true);
select set_config('tnt.test_other_person',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.test_other')::uuid),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.tnt_is_staff() or public.tnt_has_access('chat') or public.tnt_has_access('organizacion') then raise exception 'Una cuenta nueva obtuvo acceso de staff'; end if;
 if (select count(*) from public.tnt_accounts)<>1 then raise exception 'La comunidad puede leer cuentas ajenas'; end if;
 perform public.tnt_complete_onboarding(true,'Pastor/a','2005-04-12','F');
 if public.tnt_is_staff() or public.tnt_is_pastor_or_admin() then raise exception 'Pedir ser pastor otorgó privilegios'; end if;
 if not exists(select 1 from public.tnt_role_requests where person_id=public.tnt_current_person_id() and status='pending' and requested_role='Pastor/a') then raise exception 'Falta la solicitud'; end if;
 begin update public.tnt_accounts set staff_status='approved' where person_id=public.tnt_current_person_id();raise exception 'Se permitió autoaprobarse';exception when insufficient_privilege then null;end;
 begin update public.tnt_accounts set system_role='admin' where person_id=public.tnt_current_person_id();raise exception 'Se permitió autoasignar Admin';exception when insufficient_privilege then null;end;
 begin perform public.tnt_review_staff(public.tnt_current_person_id(),'Pastor/a');raise exception 'Se permitió revisar el rol propio';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare v_event uuid;v_chat uuid;v_person uuid:=current_setting('tnt.test_person')::uuid;v_other uuid:=current_setting('tnt.test_other_person')::uuid;
begin
 perform public.tnt_review_staff(v_person,'Timoteo');
 if not exists(select 1 from public.tnt_accounts where person_id=v_person and staff_status='approved' and ministry_role='Timoteo') then raise exception 'La corrección del administrador no se guardó'; end if;
 if not exists(select 1 from public.tnt_role_requests where person_id=v_person and approved_role='Timoteo' and requested_role='Pastor/a' and status='approved') then raise exception 'No hay registro de la revisión'; end if;
 insert into public.tnt_events(name,kind,start_date,end_date,created_by) values('Evento temporal de pruebas','event',current_date+1,current_date+1,public.tnt_current_person_id()) returning id into v_event;
 v_chat:=public.tnt_create_chat('Chat temporal de pruebas',v_event,null,false,false,'{}'::uuid[]);
 perform set_config('tnt.test_chat',v_chat::text,true);
 if exists(select 1 from public.tnt_chat_members where thread_id=v_chat) then raise exception 'Un administrador se hizo visible automáticamente'; end if;
 begin insert into public.tnt_chat_members(thread_id,person_id) values(v_chat,v_other);raise exception 'Se permitió invitar comunidad al chat del staff';exception when check_violation then null;end;
 insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled) values(v_person,'efe','*','edit',true),(v_person,'efe','mujeres18','view',false);
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if not public.tnt_is_staff() or not public.tnt_has_access('organizacion') or not public.tnt_has_access('chat') then raise exception 'La aprobación no habilitó el staff'; end if;
 if public.tnt_has_access('efe','mujeres18') or not public.tnt_has_access('efe','varones') then raise exception 'No se respetó la exclusión de un grupo EFE'; end if;
 if public.tnt_can_read_thread(current_setting('tnt.test_chat')::uuid) then raise exception 'Un staff lee un chat al que no pertenece'; end if;
 begin insert into public.tnt_chat_members(thread_id,person_id) values(current_setting('tnt.test_chat')::uuid,public.tnt_current_person_id());raise exception 'Un usuario pudo unirse por su cuenta';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
set local role authenticated;
insert into public.tnt_chat_members(thread_id,person_id) values(current_setting('tnt.test_chat')::uuid,current_setting('tnt.test_person')::uuid);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if not public.tnt_can_read_thread(current_setting('tnt.test_chat')::uuid) then raise exception 'El integrante invitado no puede leer su chat'; end if;
 begin update public.tnt_chat_members set member_role='moderator' where thread_id=current_setting('tnt.test_chat')::uuid and person_id=public.tnt_current_person_id();raise exception 'Se permitió autoasignar moderación';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: alta comunidad, solicitud sin privilegios, bloqueo de autoaprobación, revisión corregida, aislamiento del directorio, exclusión EFE y chat por membresía. Datos temporales revertidos.' as verification;
