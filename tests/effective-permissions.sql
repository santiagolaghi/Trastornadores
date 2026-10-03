-- Every identity, role template edit and notification is rolled back.
begin;
select set_config('tnt.test_admin',(select auth_user_id::text from public.tnt_accounts where system_role='admin' and enabled limit 1),true);
select set_config('tnt.test_user',gen_random_uuid()::text,true);
select set_config('tnt.test_community',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,aud,role)
values(current_setting('tnt.test_user')::uuid,'permissions-'||current_setting('tnt.test_user')||'@example.invalid','{"full_name":"Prueba Permisos"}','authenticated','authenticated'),
(current_setting('tnt.test_community')::uuid,'permissions-community-'||current_setting('tnt.test_community')||'@example.invalid','{"full_name":"Prueba Comunidad"}','authenticated','authenticated');
select set_config('tnt.test_person',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.test_user')::uuid),true);
select set_config('tnt.test_community_person',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.test_community')::uuid),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
update public.tnt_accounts set staff_status='approved',ministry_role='Timoteo' where person_id=current_setting('tnt.test_person')::uuid;
insert into public.tnt_role_permission_presets(role,module,scope,action,allowed)
values('Timoteo','buffet','*','view',false),('Timoteo','buffet','*','sell',false),('Timoteo','buffet','*','reports',false)
on conflict(role,module,scope,action) do update set allowed=false;
insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed)
values(current_setting('tnt.test_community_person')::uuid,'buffet','*','view',true),(current_setting('tnt.test_community_person')::uuid,'buffet','*','sell',true);
insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled)
values(current_setting('tnt.test_person')::uuid,'buffet','*','edit',true),
(current_setting('tnt.test_person')::uuid,'efe','*','edit',true),(current_setting('tnt.test_person')::uuid,'efe','mujeres18','view',false);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_community'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.tnt_has_access('buffet') or public.tnt_can_action('buffet','sell') then raise exception 'Una excepción personal saltó la aprobación de staff';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.tnt_has_access('buffet') or public.tnt_has_access('buffet','*','edit') or public.tnt_can_action('buffet','sell') then raise exception 'Un permiso antiguo saltó el bloqueo de la plantilla';end if;
 if public.tnt_has_access('efe','mujeres18') or not public.tnt_has_access('efe','varones') then raise exception 'La exclusión EFE dejó de aplicarse';end if;
end $$;
reset role;
insert into public.tnt_access_requests(person_id,module,scope,requested_level,note)
values(current_setting('tnt.test_person')::uuid,'buffet','*','edit','Prueba revertida'),
(current_setting('tnt.test_community_person')::uuid,'buffet','*','view','Prueba revertida');
select set_config('tnt.test_request',(select id::text from public.tnt_access_requests where person_id=current_setting('tnt.test_person')::uuid and status='pending'),true);
select set_config('tnt.test_community_request',(select id::text from public.tnt_access_requests where person_id=current_setting('tnt.test_community_person')::uuid and status='pending'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_review_access_request(current_setting('tnt.test_request')::uuid,true);
do $$ begin
 begin
  perform public.tnt_review_access_request(current_setting('tnt.test_community_request')::uuid,true);
  raise exception 'Se aprobó un módulo para comunidad';
 exception when raise_exception then if SQLERRM not like 'Primero revisá%' then raise;end if;end;
 if not exists(select 1 from public.tnt_access_requests where id=current_setting('tnt.test_community_request')::uuid and status='pending') then raise exception 'Una aprobación fallida resolvió la solicitud';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if not public.tnt_has_access('buffet') or not public.tnt_can_action('buffet','sell') then raise exception 'La aprobación quedó bloqueada por la plantilla';end if;
 if public.tnt_can_action('buffet','reports') then raise exception 'Una aprobación para editar habilitó administración';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
update public.tnt_person_permission_overrides set allowed=false where person_id=current_setting('tnt.test_person')::uuid and module='buffet' and action='view';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.tnt_has_access('buffet') or public.tnt_has_access('buffet','*','edit') or public.tnt_can_action('buffet','sell') then raise exception 'Bloquear la entrada permitió seguir editando';end if;
end $$;
reset role;
rollback;
select 'PASS: comunidad sin acceso por excepciones, plantilla bloquea permisos antiguos, exclusión EFE, solicitud aprobada efectiva sin privilegios de administración y bloqueo de entrada aplicado a escritura. Todo revertido.' as verification;
