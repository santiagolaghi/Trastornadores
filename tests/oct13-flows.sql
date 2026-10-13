-- Synthetic records only. All writes are rolled back, including auth/account triggers.
begin;
select set_config('request.jwt.claims','{}',true);
select set_config('tnt.ux_admin_auth',gen_random_uuid()::text,true),set_config('tnt.ux_staff_auth',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,aud,role) values
 (current_setting('tnt.ux_admin_auth')::uuid,'ux-admin-'||current_setting('tnt.ux_admin_auth')||'@example.invalid','{"full_name":"Admin UX Prueba"}','authenticated','authenticated'),
 (current_setting('tnt.ux_staff_auth')::uuid,'ux-staff-'||current_setting('tnt.ux_staff_auth')||'@example.invalid','{"full_name":"Staff UX Prueba"}','authenticated','authenticated');
select public.tnt_ensure_account_for_user(current_setting('tnt.ux_admin_auth')::uuid),public.tnt_ensure_account_for_user(current_setting('tnt.ux_staff_auth')::uuid);
select set_config('tnt.ux_admin',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.ux_admin_auth')::uuid),true),
 set_config('tnt.ux_staff',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.ux_staff_auth')::uuid),true);
update public.tnt_accounts set system_role='admin' where person_id=current_setting('tnt.ux_admin')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.ux_admin_auth'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding('{"first_name":"Admin","last_name":"UX Prueba","birthday":"2000-02-02","sex":"M","phone":"1199999999","instagram":"No tengo","dni":"87654321","interests":["Música"],"studies":"Prueba","dreams":"Prueba","health":"Ninguna","efe_group":"none"}',false,null);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.ux_staff_auth'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding('{"first_name":"Staff","last_name":"UX Prueba","birthday":"2000-02-02","sex":"M","phone":"1111111111","instagram":"No tengo","dni":"12345678","interests":["Música"],"studies":"Prueba","dreams":"Prueba","health":"Ninguna","efe_group":"none","leadership_strengths":{"Acompañar jóvenes":50,"Acompañar adolescentes":50,"Enseñar":50,"Escuchar":50,"Organizar equipos":50,"Comunicar":50}}',false,null);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.ux_admin_auth'),'role','authenticated')::text,true);
update public.tnt_accounts set staff_status='approved',ministry_role='Líder' where person_id=current_setting('tnt.ux_staff')::uuid;
insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed) values
 (current_setting('tnt.ux_staff')::uuid,'efe','*','view',false),(current_setting('tnt.ux_staff')::uuid,'efe','*','attendance',false),
 (current_setting('tnt.ux_staff')::uuid,'organizacion','*','templates',false);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.ux_staff_auth'),'role','authenticated')::text,true);
insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled) values(current_setting('tnt.ux_staff')::uuid,'organizacion','*','edit',true);
insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed) values(current_setting('tnt.ux_staff')::uuid,'organizacion','*','view',true);
update public.tnt_experience set config=jsonb_set(config, '{modules,glosario}', '{"enabled":false}',true) where id=true;
set local role authenticated;
insert into public.tnt_library_items(title,url,item_type,module,folder,uploaded_by) values('Recurso UX Prueba','https://example.invalid/ux','link','organizacion','General',current_setting('tnt.ux_staff')::uuid);
do $$ begin if not exists(select 1 from public.tnt_library_items where uploaded_by=current_setting('tnt.ux_staff')::uuid and title='Recurso UX Prueba') then raise exception 'Organization resource did not save';end if;end $$;
select public.tnt_save_my_profile('{"efe_group":"varones","efe_service_role":"Soy líder de este EFE"}','{}');
do $$ begin
 if public.tnt_can_action('efe','view','varones') or public.tnt_can_action('efe','attendance','varones') then raise exception 'EFE declaration escalated access';end if;
 begin perform public.tnt_save_org_template(null,'{"name":"No autorizada","kind":"event"}','[]');raise exception 'Template permission bypass';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.ux_admin_auth'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('tnt.ux_template',public.tnt_save_org_template(null,'{"name":"UX Programa","kind":"event"}',
 '[{"title":"Bienvenida","task_type":"simple","duration_minutes":5},{"title":"Merch","task_type":"logistics","duration_minutes":15,"materials":"Carteles","checklist":["Contar stock","Preparar mesa"],"budget_estimated":15000,"reference_url":"https://example.invalid/merch"}]')::text,true);
select set_config('tnt.ux_version',(select version::text from public.tnt_templates where id=current_setting('tnt.ux_template')::uuid),true);
do $$ declare tid uuid:=current_setting('tnt.ux_template')::uuid; ver integer:=current_setting('tnt.ux_version')::integer; before_rows jsonb;
begin
 select jsonb_agg(to_jsonb(i) order by i.sort_order) into before_rows from public.tnt_template_items i where i.template_id=tid;
 begin
  perform public.tnt_save_org_template(tid,'{"name":"Cambio inválido","kind":"event"}','[{"title":"Cambió","task_type":"simple","duration_minutes":8},{"title":"","task_type":"simple","duration_minutes":1}]',ver);
  raise exception 'Invalid item did not abort';
 exception when others then if sqlerrm='Invalid item did not abort' then raise;end if;end;
 if (select jsonb_agg(to_jsonb(i) order by i.sort_order) from public.tnt_template_items i where i.template_id=tid) is distinct from before_rows then raise exception 'Partial template write';end if;
 if (select version from public.tnt_templates where id=tid)<>ver or (select name from public.tnt_templates where id=tid)<>'UX Programa' then raise exception 'Template header changed on failure';end if;
 begin perform public.tnt_save_org_template(tid,'{"name":"Conflicto","kind":"event"}','[]',ver+100);raise exception 'Stale version accepted';exception when others then if sqlerrm='Stale version accepted' then raise;end if;end;
 perform public.tnt_archive_org_template(tid,false);
 if not exists(select 1 from public.tnt_templates where id=tid and archived_at is not null) then raise exception 'Template not archived';end if;
 perform public.tnt_archive_org_template(tid,true);
 if not exists(select 1 from public.tnt_template_items where template_id=tid and title='Merch' and budget_estimated=15000 and jsonb_array_length(checklist)=2) then raise exception 'Template history lost';end if;
end $$;
select set_config('tnt.ux_other_template',public.tnt_save_org_template(null,'{"name":"Otro programa","kind":"event"}','[{"title":"Otra","task_type":"simple","duration_minutes":5}]')::text,true);
do $$ declare stolen uuid;
begin
 select id into stolen from public.tnt_template_items where template_id=current_setting('tnt.ux_other_template')::uuid;
 begin
  perform public.tnt_save_org_template(current_setting('tnt.ux_template')::uuid,'{"name":"Robar actividad","kind":"event"}',jsonb_build_array(jsonb_build_object('id',stolen,'title','Otra','task_type','simple','duration_minutes',5)));
  raise exception 'Cross-template item accepted';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('tnt.ux_event',public.tnt_create_event('{"name":"Encuentro UX Prueba","kind":"event","start_date":"2040-10-13","end_date":"2040-10-13"}')::text,true);
select set_config('tnt.ux_task',public.tnt_save_task(null,current_setting('tnt.ux_event')::uuid,'{"title":"Actividad UX Prueba","task_type":"simple","duration_minutes":5}',array[current_setting('tnt.ux_staff')::uuid])::text,true);
reset role;
do $$ declare note public.tnt_notifications;
begin
 if not exists(select 1 from public.tnt_task_assignees where task_id=current_setting('tnt.ux_task')::uuid and person_id=current_setting('tnt.ux_staff')::uuid and assignment_status='accepted') then raise exception 'Assignment was not direct';end if;
 select * into note from public.tnt_notifications where task_id=current_setting('tnt.ux_task')::uuid and person_id=current_setting('tnt.ux_staff')::uuid and title='Nueva asignación' order by created_at desc limit 1;
 if note.id is null or public.tnt_notification_resolved(note) then raise exception 'Direct assignment notification disappeared';end if;
 update public.tnt_task_assignees set assignment_status='declined' where task_id=current_setting('tnt.ux_task')::uuid and person_id=current_setting('tnt.ux_staff')::uuid;
 if not public.tnt_notification_resolved(note) then raise exception 'Removed assignment notification still active';end if;
end $$;
select 'UX backend checks passed; transaction rolled back' as result;
rollback;
