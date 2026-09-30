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
reset role;
select set_config('tnt.test_profile',gen_random_uuid()::text,true);
insert into public.perfiles_registros(id,nombre,apellido,fecha_nacimiento,genero,telefono,consentimiento)
values(current_setting('tnt.test_profile')::uuid,'Prueba','Temporal','2005-04-12','Mujer','1112345678',true);
insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled) values(current_setting('tnt.test_person')::uuid,'perfiles','*','view',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare n integer; begin
 if not exists(select 1 from public.perfiles_registros where id=current_setting('tnt.test_profile')::uuid) then raise exception 'El permiso de lectura no permite consultar Perfiles'; end if;
 update public.perfiles_registros set nombre='Cambio prohibido' where id=current_setting('tnt.test_profile')::uuid;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'El permiso de lectura permite editar Perfiles'; end if;
 begin perform public.tnt_create_sale(gen_random_uuid(),'Prueba','cash',1000,'','Prueba','[]'::jsonb);raise exception 'Sin permiso de Buffet se pudo vender';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.tnt_access_grants set access_level='edit' where person_id=current_setting('tnt.test_person')::uuid and module='perfiles';
set local role authenticated;
do $$ declare n integer; begin
 update public.perfiles_registros set nombre='Prueba editada' where id=current_setting('tnt.test_profile')::uuid;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'El permiso de edición no permite editar Perfiles'; end if;
end $$;
reset role;
insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled) values(current_setting('tnt.test_person')::uuid,'buffet','*','edit',true);
set local role authenticated;
do $$ declare shift_id uuid;product_id uuid;menu_id uuid;result jsonb;sale_id uuid;qty integer; begin
 insert into public.tnt_shifts(shift_date,status) values('2099-01-01','open') returning id into shift_id;
 insert into public.tnt_products(name,requires_prep) values('Producto temporal de pruebas',false) returning id into product_id;
 insert into public.tnt_menu_items(shift_id,product_id,price,cost,initial_qty,remaining_qty) values(shift_id,product_id,10,3,5,5) returning id into menu_id;
 result:=public.tnt_create_sale(shift_id,'Prueba','cash',25,'','Prueba',jsonb_build_array(jsonb_build_object('menu_item_id',menu_id,'qty',2)));
 sale_id:=(result->'sale'->>'id')::uuid;
 if (result->'sale'->>'total')::numeric<>20 or (result->'sale'->>'change_amount')::numeric<>5 then raise exception 'La venta calculó mal el total o vuelto'; end if;
 select remaining_qty into qty from public.tnt_menu_items where id=menu_id;
 if qty<>3 then raise exception 'La venta no descontó el stock'; end if;
 begin
  perform public.tnt_create_sale(shift_id,'Prueba','cash',100,'','Prueba',jsonb_build_array(jsonb_build_object('menu_item_id',menu_id,'qty',4)));
  raise exception 'Se vendió más stock del disponible';
 exception when raise_exception then if SQLERRM not like 'Stock insuficiente%' then raise;end if;end;
 select remaining_qty into qty from public.tnt_menu_items where id=menu_id;
 if qty<>3 then raise exception 'La venta fallida modificó el stock'; end if;
 perform public.tnt_delete_sale(sale_id,'Prueba');
 select remaining_qty into qty from public.tnt_menu_items where id=menu_id;
 if qty<>5 or exists(select 1 from public.tnt_sales where id=sale_id) then raise exception 'La anulación no restauró stock y venta'; end if;
end $$;
rollback;
select 'PASS: alta comunidad, solicitud sin privilegios, bloqueo de autoaprobación, revisión corregida, aislamiento del directorio, exclusión EFE y chat por membresía. Perfiles con lectura y edición separadas, y Buffet sin permiso bloqueado, venta y vuelto correctos, stock protegido y anulación coherente. Datos temporales revertidos.' as verification;
