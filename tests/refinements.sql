-- Synthetic people only. The whole transaction is rolled back.
begin;
select set_config('tnt.test_source_auth',gen_random_uuid()::text,true);
select set_config('tnt.test_admin_auth',gen_random_uuid()::text,true);
select set_config('tnt.test_last','Revisión '||substr(gen_random_uuid()::text,1,8),true);
insert into auth.users(id,email,raw_user_meta_data,aud,role) values
 (current_setting('tnt.test_source_auth')::uuid,'polish-source-'||current_setting('tnt.test_source_auth')||'@example.invalid',jsonb_build_object('full_name','Prueba '||current_setting('tnt.test_last')),'authenticated','authenticated'),
 (current_setting('tnt.test_admin_auth')::uuid,'polish-admin-'||current_setting('tnt.test_admin_auth')||'@example.invalid','{"full_name":"Admin Prueba TNT"}','authenticated','authenticated');
select public.tnt_ensure_account_for_user(current_setting('tnt.test_source_auth')::uuid);
select public.tnt_ensure_account_for_user(current_setting('tnt.test_admin_auth')::uuid);
select set_config('tnt.test_source',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.test_source_auth')::uuid),true);
select set_config('tnt.test_admin',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.test_admin_auth')::uuid),true);
select set_config('tnt.test_target',gen_random_uuid()::text,true);
insert into public.tnt_people(id,full_name,normalized_name,first_name,last_name,birthday,sex,phone,instagram,active)
 values(current_setting('tnt.test_target')::uuid,'Prueba '||current_setting('tnt.test_last'),lower('Prueba '||current_setting('tnt.test_last')),'Prueba',current_setting('tnt.test_last'),'2000-01-01','M','1122222222','@Original',true);
insert into public.tnt_profile_answers(person_id,answers) values
 (current_setting('tnt.test_target')::uuid,'{"dreams":"Sueño del perfil existente"}');
insert into public.tnt_saturday_attendance(person_id,saturday_date,status)
 values(current_setting('tnt.test_target')::uuid,'2020-01-04','present');
update public.tnt_accounts set system_role='admin' where person_id=current_setting('tnt.test_admin')::uuid;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin_auth'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding('{"first_name":"Admin","last_name":"Prueba TNT","birthday":"2000-02-02","sex":"M","phone":"1199999999","instagram":"No tengo","dni":"87654321","interests":["Música"],"studies":"Prueba","dreams":"Prueba","health":"Ninguna","efe_group":"none"}',false,null);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_source_auth'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding(jsonb_build_object('first_name','Prueba','last_name',current_setting('tnt.test_last'),
 'birthday','2000-01-01','sex','M','phone','1111111111','instagram','@Nueva','dni','12345678','interests',jsonb_build_array('Música'),
 'studies','Estudio de prueba','dreams','Sueño de la cuenta','health','Ninguna','efe_group','none',
 'leadership_strengths',jsonb_build_object('Acompañar jóvenes',50,'Acompañar adolescentes',50,'Enseñar',50,'Escuchar',50,'Organizar equipos',50,'Comunicar',50)),false,null);
reset role;
select set_config('request.jwt.claims','{}',true);
update public.tnt_accounts set staff_status='approved',ministry_role='Líder' where person_id=current_setting('tnt.test_source')::uuid;
insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled)
 values(current_setting('tnt.test_target')::uuid,'buffet','*','manage',true),
 (current_setting('tnt.test_target')::uuid,'buffet','old','manage',true),
 (current_setting('tnt.test_source')::uuid,'buffet','*','view',true);
insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed) values
 (current_setting('tnt.test_target')::uuid,'buffet','*','history',true);
insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed) values
 (current_setting('tnt.test_source')::uuid,'buffet','*','view',true),
 (current_setting('tnt.test_source')::uuid,'buffet','*','sell',true),
 (current_setting('tnt.test_source')::uuid,'buffet','*','edit_stock',false),
 (current_setting('tnt.test_source')::uuid,'buffet','*','reports',false),
 (current_setting('tnt.test_source')::uuid,'perfiles','*','view',false);
select set_config('tnt.test_link',(select id::text from public.tnt_profile_link_requests where person_id=current_setting('tnt.test_source')::uuid and status='pending' limit 1),true);
do $$ begin if nullif(current_setting('tnt.test_link'),'') is null then raise exception 'No se creó la revisión del vínculo';end if;end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_source_auth'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare ctx jsonb; begin
 if not public.tnt_can_action('buffet','sell') or not public.tnt_has_access('buffet','*','sell') then raise exception 'Vender sigue interpretándose como nivel genérico';end if;
 if public.tnt_has_access('buffet','*','edit_stock') or public.tnt_has_access('buffet','*','reports') then raise exception 'Vender habilitó stock o reportes';end if;
 ctx:=public.tnt_profile_detail(public.tnt_current_person_id());
 if ctx->'values'->>'dni'<>'12345678' then raise exception 'Mi perfil perdió los datos privados propios';end if;
 begin perform public.tnt_profile_detail(current_setting('tnt.test_target')::uuid);raise exception 'Mi perfil permitió leer otra persona';exception when insufficient_privilege then null;end;
 begin perform public.tnt_save_news('[]','[]');raise exception 'Staff publicó novedades sin ser admin';exception when insufficient_privilege then null;end;
 ctx:=public.tnt_save_my_profile('{"studies":"Estudio actualizado"}','{"nickname":"Mi apodo","bio":"Presentación de prueba"}');
 if ctx->>'identity_pending'<>'false' then raise exception 'Una respuesta extra pidió revisión de identidad';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=public.tnt_current_person_id() and nickname='Mi apodo') then raise exception 'No se guardó la presentación';end if;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin_auth'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare preview jsonb;choices jsonb;key text;field_config jsonb;values jsonb; begin
 preview:=public.tnt_profile_link_preview(current_setting('tnt.test_link')::uuid);
 begin perform public.tnt_resolve_profile_link(current_setting('tnt.test_link')::uuid,true,'{}',preview->>'revision');raise exception 'Se aceptaron conflictos sin elección';exception when raise_exception then if sqlerrm not like 'Elegí con qué%' then raise;end if;end;
 select jsonb_object_agg(k,'source') into choices from jsonb_object_keys(public.tnt_profile_fields()) k;
 choices:=choices||jsonb_build_object('instagram','target','dreams','target');
 perform public.tnt_resolve_profile_link(current_setting('tnt.test_link')::uuid,true,choices,preview->>'revision');
 field_config:=public.tnt_profile_fields();
 field_config:=jsonb_set(field_config,'{leadership_strengths}',field_config->'leadership_strengths'||'{"visible":true,"required":true,"roles":["Líder","Pastor/a"],"default":50}');
 perform public.tnt_save_profile_fields(field_config);
 values:=public.tnt_profile_detail(current_setting('tnt.test_target')::uuid)->'values';
 perform set_config('tnt.test_values',values::text,true);
 if not public.tnt_profile_field_applies(field_config->'leadership_strengths','{"_ministry_role":"Pastor/a"}') then raise exception 'Pastores no reciben habilidades';end if;
 if public.tnt_profile_field_applies(field_config->'leadership_strengths','{"_ministry_role":"Colaborador"}') then raise exception 'Se aplicaron habilidades a un rol excluido';end if;

 if not public.tnt_profile_field_applies('{"roles":[]}',values) then raise exception 'Todos los roles excluye a todos';end if;
end $$;
reset role;
do $$ declare v jsonb:=current_setting('tnt.test_values')::jsonb; begin
 if jsonb_array_length(public.tnt_profile_missing_values(v))<>0 then raise exception 'El perfil vinculado quedó incompleto';end if;
 if jsonb_array_length(public.tnt_profile_missing_values(v-'leadership_strengths'))=0 then raise exception 'Una persona existente pudo omitir habilidades obligatorias';end if;
 if not exists(select 1 from public.tnt_accounts where auth_user_id=current_setting('tnt.test_source_auth')::uuid and person_id=current_setting('tnt.test_target')::uuid and staff_status='approved' and ministry_role='Líder') then raise exception 'Se perdió la cuenta o el rol';end if;
 if exists(select 1 from public.tnt_access_grants where person_id=current_setting('tnt.test_target')::uuid and access_level='manage' and enabled) then raise exception 'Se heredaron permisos de la ficha vieja';end if;
 if not exists(select 1 from public.tnt_access_grants where person_id=current_setting('tnt.test_target')::uuid and not enabled) then raise exception 'No se conservó el permiso previo deshabilitado';end if;
 if not exists(select 1 from public.tnt_person_permission_overrides where person_id=current_setting('tnt.test_target')::uuid and action='history' and archived_at is not null) then raise exception 'No se conservó la excepción previa archivada';end if;
 if not exists(select 1 from public.tnt_people where id=current_setting('tnt.test_target')::uuid and phone='1111111111' and instagram='@Original') then raise exception 'No se respetó la elección por campo';end if;
 if not exists(select 1 from public.tnt_profile_answers where person_id=current_setting('tnt.test_target')::uuid and answers->>'dreams'='Sueño del perfil existente' and answers->>'studies'='Estudio actualizado') then raise exception 'Faltan respuestas fusionadas';end if;
 if not exists(select 1 from public.tnt_saturday_attendance where person_id=current_setting('tnt.test_target')::uuid and saturday_date='2020-01-04') then raise exception 'Se perdió historial';end if;
 if not exists(select 1 from public.tnt_people where id=current_setting('tnt.test_source')::uuid and not active and data_notes->>'linked_to'=current_setting('tnt.test_target')) then raise exception 'Quedó visible el duplicado';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_source_auth'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.tnt_can_action('buffet','history') then raise exception 'Se aplicó una excepción archivada';end if;
 if not public.tnt_can_action('buffet','sell') or public.tnt_can_action('buffet','edit_stock') then raise exception 'Cambió el permiso de la cuenta al vincular';end if;
end $$;
reset role;
rollback;
select 'PASS: perfiles propios, habilidades por rol, vínculo de staff con elecciones e historial y permisos independientes de Buffet' as result;
