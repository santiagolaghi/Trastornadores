-- Synthetic accounts and history only. Every write is rolled back.
begin;
select set_config('tnt.delete_admin',gen_random_uuid()::text,true);
select set_config('tnt.delete_editor',gen_random_uuid()::text,true);
select set_config('tnt.delete_target',gen_random_uuid()::text,true);
select set_config('tnt.delete_incomplete',gen_random_uuid()::text,true);
select set_config('tnt.delete_keep',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,aud,role)
select uid::uuid,'profile-delete-'||uid||'@example.invalid',jsonb_build_object('full_name','Perfil '||uid),'authenticated','authenticated'
from unnest(array[current_setting('tnt.delete_admin'),current_setting('tnt.delete_editor'),current_setting('tnt.delete_target'),current_setting('tnt.delete_incomplete')]) uid;
do $$ declare uid text;begin
 foreach uid in array array[current_setting('tnt.delete_admin'),current_setting('tnt.delete_editor'),current_setting('tnt.delete_target'),current_setting('tnt.delete_incomplete')] loop
  perform public.tnt_ensure_account_for_user(uid::uuid);
 end loop;
end $$;
update public.tnt_accounts set system_role='admin' where auth_user_id in(current_setting('tnt.delete_admin')::uuid,current_setting('tnt.delete_incomplete')::uuid);
update public.tnt_accounts set staff_status='approved',ministry_role='Colaborador' where auth_user_id in(current_setting('tnt.delete_admin')::uuid,current_setting('tnt.delete_editor')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.delete_admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding(jsonb_build_object('first_name','Perfil','last_name',current_setting('tnt.delete_admin'),'birthday','2000-01-01','sex','F','phone','1112345678','instagram','No tengo','dni','87654321','interests',jsonb_build_array('Música'),'studies','Trabajo','dreams','Compartir','efe_group','none'),true,'Colaborador');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.delete_editor'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding(jsonb_build_object('first_name','Perfil','last_name',current_setting('tnt.delete_editor'),'birthday','2000-01-01','sex','M','phone','1112345678','instagram','No tengo','dni','12345678','interests',jsonb_build_array('Dibujar'),'studies','Trabajo','dreams','Compartir','efe_group','none'),true,'Colaborador');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.delete_target'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_finish_onboarding(jsonb_build_object('first_name','Perfil','last_name',current_setting('tnt.delete_target'),'birthday','2000-01-01','sex','M','phone','1112345678','instagram','No tengo','dni','11223344','interests',jsonb_build_array('Cantar'),'studies','Trabajo','dreams','Compartir','efe_group','none'),false,null);
reset role;
select set_config('tnt.delete_target_pid',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.delete_target')::uuid),true);
select set_config('tnt.delete_editor_pid',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.delete_editor')::uuid),true);
insert into public.tnt_people(id,full_name,normalized_name,first_name,last_name,birthday,sex,data_notes)
select current_setting('tnt.delete_keep')::uuid,full_name,normalized_name,first_name,last_name,birthday,sex,'{"test_note":"preserve"}'::jsonb
from public.tnt_people where id=current_setting('tnt.delete_target_pid')::uuid;
update public.tnt_people set data_notes=data_notes||'{"test_note":"preserve"}'::jsonb where id=current_setting('tnt.delete_target_pid')::uuid;
insert into public.tnt_saturday_members(person_id,active) values(current_setting('tnt.delete_target_pid')::uuid,true);
insert into public.tnt_saturday_attendance(person_id,saturday_date,status) values(current_setting('tnt.delete_target_pid')::uuid,'2020-01-04','present');
insert into public.tnt_efe_memberships(person_id,group_id,active)
select current_setting('tnt.delete_target_pid')::uuid,id,code='varones' from public.tnt_efe_groups where code in('varones','mujeres18')
on conflict(person_id,group_id) do update set active=excluded.active;
insert into public.tnt_camp_editions(name,start_date,end_date) values('Papelera temporal','2100-01-01','2100-01-03');
select set_config('tnt.delete_camp',(select id::text from public.tnt_camp_editions where name='Papelera temporal' order by created_at desc limit 1),true);
insert into public.tnt_camp_registrations(camp_id,person_id,fee,public_token) values(current_setting('tnt.delete_camp')::uuid,current_setting('tnt.delete_target_pid')::uuid,100,gen_random_uuid());
select set_config('tnt.delete_registration',(select id::text from public.tnt_camp_registrations where camp_id=current_setting('tnt.delete_camp')::uuid and person_id=current_setting('tnt.delete_target_pid')::uuid),true);
insert into public.tnt_camp_payments(registration_id,amount,method) values(current_setting('tnt.delete_registration')::uuid,50,'cash');
insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled) values(current_setting('tnt.delete_editor_pid')::uuid,'perfiles','*','view',true);
insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed)
values(current_setting('tnt.delete_editor_pid')::uuid,'perfiles','*','view',true),(current_setting('tnt.delete_editor_pid')::uuid,'perfiles','*','delete',false);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.delete_incomplete'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.tnt_delete_profile(current_setting('tnt.delete_target_pid')::uuid);raise exception 'Un administrador incompleto eliminó un perfil';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.delete_editor'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.tnt_delete_profile(current_setting('tnt.delete_keep')::uuid);raise exception 'Un permiso de lectura eliminó un perfil';exception when insufficient_privilege then null;end;
 begin perform public.tnt_restore_deleted_profile(current_setting('tnt.delete_keep')::uuid);raise exception 'Un permiso de lectura restauró un perfil';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.delete_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.tnt_delete_profile(public.tnt_current_person_id());raise exception 'Se eliminó el perfil propio';exception when raise_exception then if sqlerrm<>'No podés eliminar tu propio perfil desde acá.' then raise;end if;end;
 perform public.tnt_delete_profile(current_setting('tnt.delete_target_pid')::uuid);
 perform public.tnt_delete_profile(current_setting('tnt.delete_target_pid')::uuid);
 begin perform public.tnt_set_profile_active(current_setting('tnt.delete_target_pid')::uuid,true);raise exception 'Se restauró por fuera de la Papelera';exception when raise_exception then if sqlerrm<>'Restaurá este perfil desde la Papelera antes de cambiar su estado.' then raise;end if;end;
end $$;
reset role;
do $$ declare pid uuid:=current_setting('tnt.delete_target_pid')::uuid;begin
 if not exists(select 1 from public.tnt_people where id=pid and not active and data_notes ? 'deleted_at' and data_notes->>'test_note'='preserve') then raise exception 'El perfil no quedó en la Papelera';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=pid and not enabled and auth_user_id=current_setting('tnt.delete_target')::uuid) then raise exception 'No se conservó y bloqueó la identidad de Google';end if;
 if exists(select 1 from public.tnt_efe_memberships where person_id=pid and active) or exists(select 1 from public.tnt_saturday_members where person_id=pid and active) then raise exception 'El perfil eliminado sigue en las listas activas';end if;
 if (select count(*) from public.tnt_audit_log where entity_id=pid and action='profile_deleted')<>1 then raise exception 'Un reintento duplicó la eliminación';end if;
 if not exists(select 1 from public.tnt_profile_archive_state where person_id=pid and account_enabled and saturday_active and cardinality(efe_members)=1) then raise exception 'Se perdió el estado anterior';end if;
 if not exists(select 1 from public.tnt_people where id=current_setting('tnt.delete_keep')::uuid and active and not(data_notes ? 'deleted_at')) then raise exception 'La eliminación afectó al duplicado conservado';end if;
 if not exists(select 1 from public.tnt_saturday_attendance where person_id=pid and saturday_date='2020-01-04' and status='present') then raise exception 'Se borró la asistencia';end if;
 if not exists(select 1 from public.tnt_camp_payments where registration_id=current_setting('tnt.delete_registration')::uuid and amount=50 and voided_at is null) then raise exception 'Se borró o anuló el pago';end if;
 if has_function_privilege('anon','public.tnt_delete_profile(uuid)','execute') or has_function_privilege('anon','public.tnt_restore_deleted_profile(uuid)','execute') then raise exception 'Se expuso la eliminación pública';end if;
end $$;
set local role authenticated;
select public.tnt_restore_deleted_profile(current_setting('tnt.delete_target_pid')::uuid);
reset role;
do $$ declare pid uuid:=current_setting('tnt.delete_target_pid')::uuid;begin
 if not exists(select 1 from public.tnt_people where id=pid and active and not(data_notes ? 'deleted_at') and data_notes->>'test_note'='preserve') then raise exception 'No se restauró el perfil';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=pid and enabled) or not exists(select 1 from public.tnt_saturday_members where person_id=pid and active) then raise exception 'No se restauraron el acceso y los sábados';end if;
 if not exists(select 1 from public.tnt_efe_memberships m join public.tnt_efe_groups g on g.id=m.group_id where m.person_id=pid and g.code='varones' and m.active) then raise exception 'No se restauró su EFE';end if;
 if exists(select 1 from public.tnt_efe_memberships m join public.tnt_efe_groups g on g.id=m.group_id where m.person_id=pid and g.code='mujeres18' and m.active) then raise exception 'Se activó un EFE que ya estaba inactivo';end if;
end $$;
set local role authenticated;
select public.tnt_set_profile_active(current_setting('tnt.delete_target_pid')::uuid,false);
select public.tnt_delete_profile(current_setting('tnt.delete_target_pid')::uuid);
select public.tnt_restore_deleted_profile(current_setting('tnt.delete_target_pid')::uuid);
reset role;
do $$ declare pid uuid:=current_setting('tnt.delete_target_pid')::uuid;begin
 if not exists(select 1 from public.tnt_people where id=pid and not active and not(data_notes ? 'deleted_at')) then raise exception 'Un perfil archivado volvió activo desde la Papelera';end if;
 if not exists(select 1 from public.tnt_profile_archive_state where person_id=pid and account_enabled) or exists(select 1 from public.tnt_accounts where person_id=pid and enabled) then raise exception 'La Papelera perdió el estado de archivo original';end if;
end $$;
set local role authenticated;
select public.tnt_set_profile_active(current_setting('tnt.delete_target_pid')::uuid,true);
reset role;
update public.tnt_person_permission_overrides set allowed=true where person_id=current_setting('tnt.delete_editor_pid')::uuid and module='perfiles' and action='delete';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.delete_editor'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.tnt_delete_profile(current_setting('tnt.delete_target_pid')::uuid);raise exception 'Un editor eliminó una cuenta de Google';exception when insufficient_privilege then null;end;
 begin perform public.tnt_restore_deleted_profile(current_setting('tnt.delete_target_pid')::uuid);raise exception 'Un editor restauró una cuenta de Google';exception when insufficient_privilege then null;end;
 perform public.tnt_delete_profile(current_setting('tnt.delete_keep')::uuid);
 perform public.tnt_restore_deleted_profile(current_setting('tnt.delete_keep')::uuid);
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.tnt_accounts where person_id=current_setting('tnt.delete_target_pid')::uuid and enabled) then raise exception 'No se recuperó la cuenta archivada';end if;
 if (select count(*) from public.tnt_saturday_attendance where person_id=current_setting('tnt.delete_target_pid')::uuid)<>1 then raise exception 'Cambió el historial';end if;
 if (select sum(amount) from public.tnt_camp_payments where registration_id=current_setting('tnt.delete_registration')::uuid)<>50 then raise exception 'Cambió el pago';end if;
 if not exists(select 1 from public.tnt_people where id=current_setting('tnt.delete_keep')::uuid and active and not(data_notes ? 'deleted_at')) then raise exception 'El editor no pudo restaurar el perfil sin cuenta';end if;
end $$;
rollback;
select 'PASS: eliminación recuperable, duplicado conservado, reintento único, permisos, Google, archivo previo, EFE, sábados y pagos sin pérdida. Todo revertido.' as result;
