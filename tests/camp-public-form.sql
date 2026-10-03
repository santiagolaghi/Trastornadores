-- Synthetic registrations and notifications remain inside this rolled-back transaction.
begin;
select set_config('tnt.test_camp',gen_random_uuid()::text,true);
select set_config('tnt.test_other_camp',gen_random_uuid()::text,true);
select set_config('tnt.test_person',gen_random_uuid()::text,true);
select set_config('tnt.test_plan',gen_random_uuid()::text,true);
select set_config('tnt.test_name','Prueba campamento '||current_setting('tnt.test_person'),true);
insert into public.tnt_camp_editions(id,name,start_date,end_date,capacity,status,public_slug)
values(current_setting('tnt.test_camp')::uuid,'Prueba temporal de inscripción','2099-01-01','2099-01-03',10,'open',current_setting('tnt.test_camp')),
(current_setting('tnt.test_other_camp')::uuid,'Otra edición temporal','2099-02-01','2099-02-03',10,'open',current_setting('tnt.test_other_camp'));
insert into public.tnt_camp_settings(camp_id,form_open) values(current_setting('tnt.test_camp')::uuid,true)
on conflict(camp_id) do update set form_open=true;
insert into public.tnt_camp_payment_plans(id,camp_id,name,total_amount,active)
values(current_setting('tnt.test_plan')::uuid,current_setting('tnt.test_camp')::uuid,'Plan temporal',100,true);
insert into public.tnt_camp_form_fields(camp_id,field_key,label,field_type,required,options)
values(current_setting('tnt.test_camp')::uuid,'autorizacion_extra','Confirmación extra','checkbox',true,'[]'),
(current_setting('tnt.test_camp')::uuid,'talle_prueba','Talle','select',true,'["Pequeño","Grande"]');
insert into public.tnt_people(id,full_name,normalized_name,birthday,phone,sex,source,active)
values(current_setting('tnt.test_person')::uuid,current_setting('tnt.test_name'),lower(current_setting('tnt.test_name')),'2000-01-01','111111','M','manual',true);
select set_config('tnt.test_payload',jsonb_build_object('full_name',current_setting('tnt.test_name'),'birthday','2000-01-01','phone','999999','sex','M',
 'email','camp-form-'||current_setting('tnt.test_person')||'@example.invalid','church_id',(select id from public.tnt_camp_churches where active limit 1),
 'plan_id',current_setting('tnt.test_plan'),'consent',true,'answers',jsonb_build_object('autorizacion_extra',true,'talle_prueba','Grande'))::text,true);
set local role anon;
do $$ declare payload jsonb:=current_setting('tnt.test_payload')::jsonb; invalid jsonb; item jsonb; begin
 for invalid in select value from jsonb_array_elements(jsonb_build_array(
  payload-'consent',payload||'{"birthday":"2099-01-01"}',payload||'{"phone":"12"}',payload||'{"church_id":null}',payload||'{"plan_id":null}',
  payload||'{"answers":{"autorizacion_extra":false,"talle_prueba":"Grande"}}',payload||'{"answers":{"autorizacion_extra":true,"talle_prueba":"Inexistente"}}')) loop
  begin
   perform public.tnt_camp_public_register(current_setting('tnt.test_camp'),invalid);
   raise exception 'El formulario aceptó datos inválidos';
  exception when invalid_parameter_value then null; end;
 end loop;
 item:=public.tnt_camp_public_register(current_setting('tnt.test_camp'),payload);
 perform set_config('tnt.test_registration',item->>'registration_id',true);
 if item->>'token' is null then raise exception 'La inscripción no devolvió acceso a su estado'; end if;
 begin
  perform public.tnt_camp_public_register(current_setting('tnt.test_camp'),payload);
  raise exception 'Se duplicó una inscripción pública';
 exception when unique_violation then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.tnt_camp_registrations where camp_id=current_setting('tnt.test_camp')::uuid)<>1 then raise exception 'Las validaciones crearon fichas'; end if;
 if (select phone from public.tnt_people where id=current_setting('tnt.test_person')::uuid)<>'111111' then raise exception 'El formulario público sobrescribió un perfil existente'; end if;
 if (select person_id from public.tnt_camp_registrations where id=current_setting('tnt.test_registration')::uuid)<>current_setting('tnt.test_person')::uuid then raise exception 'Se duplicó el perfil'; end if;
end $$;
select set_config('tnt.test_other_registration',gen_random_uuid()::text,true);
insert into public.tnt_camp_registrations(id,camp_id,person_id,email,status,fee,public_token)
values(current_setting('tnt.test_other_registration')::uuid,current_setting('tnt.test_other_camp')::uuid,current_setting('tnt.test_person')::uuid,'other@example.invalid','pending',0,gen_random_uuid());
select set_config('tnt.test_sponsor',gen_random_uuid()::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select auth_user_id::text from public.tnt_accounts where system_role='admin' and enabled limit 1),'role','authenticated')::text,true);
set local role authenticated;
insert into public.tnt_camp_sponsors(id,camp_id,name,budget)
values(current_setting('tnt.test_sponsor')::uuid,current_setting('tnt.test_camp')::uuid,'Padrino temporal',100);
insert into public.tnt_camp_sponsorships(sponsor_id,registration_id,amount)
values(current_setting('tnt.test_sponsor')::uuid,current_setting('tnt.test_registration')::uuid,60);
do $$ begin
 begin
  insert into public.tnt_camp_sponsorships(sponsor_id,registration_id,amount)
  values(current_setting('tnt.test_sponsor')::uuid,current_setting('tnt.test_registration')::uuid,50);
  raise exception 'Se superó el presupuesto del padrino';
 exception when invalid_parameter_value then null; end;
 begin
  insert into public.tnt_camp_sponsorships(sponsor_id,registration_id,amount)
  values(current_setting('tnt.test_sponsor')::uuid,current_setting('tnt.test_other_registration')::uuid,10);
  raise exception 'Se asignó ayuda a otra edición';
 exception when invalid_parameter_value then null; end;
 begin
  update public.tnt_camp_sponsors set budget=59 where id=current_setting('tnt.test_sponsor')::uuid;
  raise exception 'Se redujo el aporte por debajo de lo asignado';
 exception when invalid_parameter_value then null; end;
 if (select sum(amount) from public.tnt_camp_sponsorships where sponsor_id=current_setting('tnt.test_sponsor')::uuid)<>60 then raise exception 'Un fallo alteró las ayudas'; end if;
end $$;
delete from public.tnt_camp_sponsorships where sponsor_id=current_setting('tnt.test_sponsor')::uuid;
insert into public.tnt_camp_sponsorships(sponsor_id,registration_id,amount)
values(current_setting('tnt.test_sponsor')::uuid,current_setting('tnt.test_registration')::uuid,100);
reset role;
update public.tnt_camp_settings set form_open=false where camp_id=current_setting('tnt.test_camp')::uuid;
set local role anon;
do $$ begin
 begin
  perform public.tnt_camp_public_register(current_setting('tnt.test_camp'),current_setting('tnt.test_payload')::jsonb);
  raise exception 'Se admitió una inscripción con el formulario cerrado';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
rollback;
select 'Campamento: formulario público, consentimiento, preguntas, duplicados, perfil conservado y presupuesto de padrinos comprobados. Pruebas revertidas.' as resultado;
