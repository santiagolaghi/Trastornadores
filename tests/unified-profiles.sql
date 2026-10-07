-- All identities and writes in this integration test are synthetic and rolled back.
begin;
select set_config('tnt.test_admin',gen_random_uuid()::text,true);
select set_config('tnt.test_invitee',gen_random_uuid()::text,true);
select set_config('tnt.test_other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,aud,role)
select current_setting(k)::uuid,'tnt-test-'||current_setting(k)||'@example.invalid',
 jsonb_build_object('full_name','Prueba TNT Temporal'),'authenticated','authenticated'
from unnest(array['tnt.test_admin','tnt.test_invitee','tnt.test_other']) k;
select public.tnt_ensure_account_for_user(current_setting(k)::uuid)
from unnest(array['tnt.test_admin','tnt.test_invitee','tnt.test_other']) k;
select set_config('tnt.test_target',(select person_id::text from public.tnt_accounts where auth_user_id=current_setting('tnt.test_invitee')::uuid),true);
do $$ declare k text;
begin
 foreach k in array array['tnt.test_admin','tnt.test_invitee','tnt.test_other'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting(k),'role','authenticated')::text,true);
  perform public.tnt_finish_onboarding('{"first_name":"Prueba","last_name":"TNT Temporal","birthday":"2000-01-01","sex":"M","phone":"1112345678","instagram":"No tengo","dni":"12345678","interests":["Música"],"studies":"Trabajo","dreams":"Aprender","health":"Ninguna","efe_group":"none"}',false,null);
 end loop;
 perform set_config('request.jwt.claims','{}',true);
end $$;
update public.tnt_accounts set system_role='admin',staff_status='approved' where auth_user_id=current_setting('tnt.test_admin')::uuid;
update public.tnt_accounts set staff_status='approved',ministry_role='Colaborador' where auth_user_id=current_setting('tnt.test_other')::uuid;
insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled)
select person_id,'perfiles','*','edit',true from public.tnt_accounts where auth_user_id=current_setting('tnt.test_other')::uuid;
insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed)
select person_id,'perfiles','*',action,true from public.tnt_accounts
 cross join unnest(array['view','edit']) action where auth_user_id=current_setting('tnt.test_other')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare invite uuid;
begin
 invite:=public.tnt_invite_staff(current_setting('tnt.test_target')::uuid,'Líder');
 perform set_config('tnt.test_invitation',invite::text,true);
 begin
  perform public.tnt_invite_staff(current_setting('tnt.test_target')::uuid,'Líder');
  raise exception 'Se duplicó una invitación pendiente';
 exception when raise_exception then if sqlerrm='Se duplicó una invitación pendiente' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare details jsonb;
begin
 if exists(select 1 from public.tnt_my_staff_invitations()) then raise exception 'Se filtró una invitación ajena';end if;
 begin
  perform public.tnt_respond_staff_invitation(current_setting('tnt.test_invitation')::uuid,true);
  raise exception 'Se aceptó una invitación ajena';
 exception when raise_exception then if sqlerrm='Se aceptó una invitación ajena' then raise;end if;end;
 details:=public.tnt_profile_detail(current_setting('tnt.test_target')::uuid);
 if details->'values' ? 'health' then raise exception 'Se expusieron datos de salud ajenos';end if;
 if public.tnt_profile_fields() ? 'health' then
  begin
   perform public.tnt_save_central_profile(current_setting('tnt.test_target')::uuid,'{"health":"Cambio ajeno prohibido"}');
   raise exception 'Un editor cambió datos de salud ajenos';
  exception when insufficient_privilege then null;end;
 end if;
 perform public.tnt_save_central_profile(current_setting('tnt.test_target')::uuid,'{"dreams":"Crecer en comunidad"}');
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_invitee'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare note_id uuid; own uuid:=public.tnt_current_person_id();
begin
 if public.tnt_is_staff() then raise exception 'La invitación aprobó staff antes de aceptarla';end if;
 if (select count(*) from public.tnt_my_staff_invitations())<>1 then raise exception 'No se encontró la invitación propia';end if;
 perform public.tnt_respond_staff_invitation(current_setting('tnt.test_invitation')::uuid,true);
 if not public.tnt_is_staff() then raise exception 'La aceptación no habilitó staff';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=own and ministry_role='Líder') then raise exception 'No se asignó el rol invitado';end if;
 begin
  update public.tnt_accounts set ministry_role='Pastor/a' where person_id=own;
  raise exception 'La aceptación permitió cambiarse de rol';
 exception when insufficient_privilege then null;end;
 begin
  update public.tnt_accounts set system_role='admin' where person_id=own;
  raise exception 'La aceptación permitió autoasignarse administrador';
 exception when insufficient_privilege then null;end;
 select (n->>'id')::uuid into note_id from public.tnt_my_notifications(true) n where n->'data'->>'staff_invitation_id'=current_setting('tnt.test_invitation');
 if note_id is null then raise exception 'Falta la notificación de invitación';end if;
 if not exists(select 1 from public.tnt_my_notifications(true) n where n->>'id'=note_id::text and (n->>'resolved')::boolean) then raise exception 'La invitación respondida sigue pendiente';end if;
 perform public.tnt_notification_action(array[note_id],'dismiss');
 perform public.tnt_notification_action(array[note_id],'purge');
 if exists(select 1 from public.tnt_my_notifications(true) n where n->>'id'=note_id::text) then raise exception 'Reapareció una notificación vaciada';end if;
 if not exists(select 1 from public.tnt_notifications where id=note_id) then raise exception 'Se eliminó el aviso compartido';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
do $$ declare f jsonb:=public.tnt_profile_fields();target uuid:=current_setting('tnt.test_target')::uuid;other uuid;
begin
 if f ? 'health' then
  if (select answers->>'health' from public.tnt_profile_answers where person_id=target)<>'Ninguna' then raise exception 'La edición de sueños borró salud';end if;
  begin
   perform public.tnt_apply_profile_answers(target,'{"leadership_strengths":{"Enseñar":150}}');
   raise exception 'Se guardó un porcentaje inválido';
  exception when raise_exception then if sqlerrm='Se guardó un porcentaje inválido' then raise;end if;end;
  update public.tnt_settings set value=jsonb_set(value,'{leadership_strengths,required}','true') where key='profile_fields';
  if not (public.tnt_profile_missing_values(public.tnt_profile_values(target)) @> '[{"key":"leadership_strengths"}]') then raise exception 'Una fortaleza obligatoria no bloqueó al líder';end if;
  select person_id into other from public.tnt_accounts where auth_user_id=current_setting('tnt.test_other')::uuid;
  if public.tnt_profile_missing_values(public.tnt_profile_values(other)) @> '[{"key":"leadership_strengths"}]' then raise exception 'La fortaleza bloqueó un rol al que no corresponde';end if;
  perform public.tnt_apply_profile_answers(target,'{"leadership_strengths":{"Enseñar":75,"Escuchar":90}}');
  if jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(target)))<>0 then raise exception 'Dos fortalezas válidas no completaron el perfil';end if;
 end if;
end $$;
rollback;
select 'PASS: consentimiento de staff sin autoaprobación, aislamiento por cuenta, avisos resueltos y vaciados, salud privada y porcentajes por rol. Datos de prueba revertidos.' as verification;
