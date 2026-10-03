begin;
select set_config('tnt.test_admin',(select auth_user_id::text from public.tnt_accounts where system_role='admin' and enabled limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('tnt.test_camp',(select id::text from public.tnt_camp_editions limit 1),true);
select set_config('tnt.test_plan',public.tnt_camp_save_payment_plan(current_setting('tnt.test_camp')::uuid,
  '{"name":"Prueba transaccional","total_amount":100,"active":true}',
  '[{"label":"Reserva","amount":60,"due_date":"2026-11-01","grace_days":2},{"label":"Saldo","amount":40,"due_date":"2026-12-01","grace_days":2}]')::text,true);
do $$ begin
 if (select count(*) from public.tnt_camp_plan_installments where plan_id=current_setting('tnt.test_plan')::uuid)<>2 then raise exception 'No se guardaron las cuotas'; end if;
 begin
  perform public.tnt_camp_save_payment_plan(current_setting('tnt.test_camp')::uuid,'{"name":"Cambio inválido","total_amount":200}',
    '[{"label":"Error","amount":200,"due_date":"2026-11-01","grace_days":-1}]',current_setting('tnt.test_plan')::uuid);
  raise exception 'Se aceptó una cuota inválida';
 exception when invalid_parameter_value then null; end;
 if (select name from public.tnt_camp_payment_plans where id=current_setting('tnt.test_plan')::uuid)<>'Prueba transaccional' then raise exception 'Se alteró el plan tras un fallo'; end if;
 if (select sum(amount) from public.tnt_camp_plan_installments where plan_id=current_setting('tnt.test_plan')::uuid)<>100 then raise exception 'Se perdieron las cuotas tras un fallo'; end if;
 perform public.tnt_camp_save_payment_plan(current_setting('tnt.test_camp')::uuid,'{"name":"Plan corregido","total_amount":120}',
    '[{"label":"Única","amount":120,"due_date":"2026-11-01","grace_days":0}]',current_setting('tnt.test_plan')::uuid);
 if (select count(*) from public.tnt_camp_plan_installments where plan_id=current_setting('tnt.test_plan')::uuid)<>1 then raise exception 'No se reemplazaron las cuotas'; end if;
end $$;
reset role;
select set_config('tnt.test_uid',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values(current_setting('tnt.test_uid')::uuid,'camp-test-'||current_setting('tnt.test_uid')||'@example.invalid','authenticated','authenticated');
select public.tnt_ensure_account_for_user(current_setting('tnt.test_uid')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin
  perform public.tnt_camp_save_payment_plan(current_setting('tnt.test_camp')::uuid,'{"name":"Sin permiso","total_amount":0}','[]');
  raise exception 'Una cuenta de comunidad pudo crear planes';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_admin'),'role','authenticated')::text,true);
update public.tnt_accounts set staff_status='approved',ministry_role='Colaborador' where auth_user_id=current_setting('tnt.test_uid')::uuid;
insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed)
select person_id,'campamento','*',action,allowed from public.tnt_accounts cross join (values ('view',true),('payments',true),('manage_editions',false)) as permissions(action,allowed)
where auth_user_id=current_setting('tnt.test_uid')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test_uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.tnt_can_action('campamento','manage_editions') then raise exception 'El encargado de pagos obtuvo acceso para gestionar ediciones'; end if;
 perform public.tnt_camp_save_payment_plan(current_setting('tnt.test_camp')::uuid,'{"name":"Solo encargado de pagos","total_amount":10}',
  '[{"label":"Única","amount":10,"due_date":"2026-12-01","grace_days":0}]');
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.tnt_camp_save_payment_plan(uuid,jsonb,jsonb,uuid)','execute') then raise exception 'El plan expone escritura pública'; end if;
end $$;
rollback;
select 'Campamento: plan y cuotas atómicos, fallo conservado y permisos comprobados' as resultado;
