-- Only synthetic users, profiles and queued notifications. Everything rolls back.
begin;
do $$declare u uuid:=gen_random_uuid();src uuid;dst uuid:=gen_random_uuid();label text:='Reclamo Prueba '||replace(gen_random_uuid()::text,'-','');begin
 insert into auth.users(id,email,raw_user_meta_data,aud,role) values(u,'claim-'||u||'@example.invalid','{"full_name":"Alias de Google"}','authenticated','authenticated');
 perform public.tnt_ensure_account_for_user(u);select person_id into src from public.tnt_accounts where auth_user_id=u;
 insert into public.tnt_people(id,full_name,normalized_name,first_name,last_name,birthday,phone,sex) values(dst,label,lower(label),'Reclamo',substr(label,9),'2000-03-04','+54 9 11 1234-5678','F');
 insert into public.tnt_accounts(person_id,ministry_role,staff_status) values(dst,'Líder','approved');
 insert into public.tnt_role_requests(person_id,requested_role) values(dst,'Líder');
 insert into public.tnt_saturday_attendance(person_id,saturday_date,status) values(dst,'2020-01-04','present');
 perform set_config('tnt.claim.uid',u::text,true);perform set_config('tnt.claim.src',src::text,true);perform set_config('tnt.claim.dst',dst::text,true);perform set_config('tnt.claim.label',label,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.claim.uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare result jsonb;matches jsonb;begin
 matches:=public.tnt_match_profile_names(current_setting('tnt.claim.label'));
 if not exists(select 1 from jsonb_array_elements(matches) m where m->>'id'=current_setting('tnt.claim.dst')) then raise exception 'Unclaimed account stub was excluded';end if;
 result:=public.tnt_continue_profile(current_setting('tnt.claim.dst')::uuid,jsonb_build_object('first_name','Reclamo','last_name',substr(current_setting('tnt.claim.label'),9),'birthday','2000-03-04','phone','1199999999'),true);
 if result->>'linked'<>'false' then raise exception 'Wrong proof linked';end if;
 result:=public.tnt_continue_profile(current_setting('tnt.claim.dst')::uuid,jsonb_build_object('first_name','Reclamo','last_name',substr(current_setting('tnt.claim.label'),9),'birthday','2000-03-04','phone','1112345678'),true);
 if result->>'linked'<>'true' then raise exception 'Alias / +54 / unclaimed continuation failed: %',result;end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
do $$begin
 if exists(select 1 from public.tnt_people where id=current_setting('tnt.claim.src')::uuid and active) then raise exception 'Active duplicate remains';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=current_setting('tnt.claim.dst')::uuid and auth_user_id=current_setting('tnt.claim.uid')::uuid and system_role='user' and staff_status='community') then raise exception 'Identity was lost or staff permissions escalated';end if;
 if not exists(select 1 from public.tnt_role_requests where person_id=current_setting('tnt.claim.dst')::uuid) then raise exception 'Placeholder role history was lost';end if;
 if not exists(select 1 from public.tnt_saturday_attendance where person_id=current_setting('tnt.claim.dst')::uuid and status='present') then raise exception 'Attendance was lost';end if;
end $$;
-- Two real Google identities require an administrator; the destination remains primary.
do $$declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();src uuid;dst uuid;label text:='Dos Cuentas '||replace(gen_random_uuid()::text,'-','');begin
 insert into auth.users(id,email,raw_user_meta_data,aud,role) values(u,'claim-'||u||'@example.invalid',jsonb_build_object('full_name',label),'authenticated','authenticated'),(v,'claim-'||v||'@example.invalid',jsonb_build_object('full_name',label),'authenticated','authenticated');
 perform public.tnt_ensure_account_for_user(u);perform public.tnt_ensure_account_for_user(v);
 select person_id into src from public.tnt_accounts where auth_user_id=u;select person_id into dst from public.tnt_accounts where auth_user_id=v;
 update public.tnt_people set first_name='Dos',last_name=substr(label,5),full_name=label,birthday='2000-01-02',phone='1112345678',sex='M' where id in(src,dst);
 update public.tnt_people set instagram='No tengo',profile_consent=true where id=dst;
 update public.tnt_accounts set system_role='admin',staff_status='approved',onboarding_completed_at=now(),avatar_url='https://example.invalid/primary.jpg' where person_id=dst;
 insert into public.tnt_profile_private_fields(person_id,dni) values(dst,'12345679') on conflict(person_id) do update set dni=excluded.dni;
 perform public.tnt_apply_profile_answers(dst,'{"studies":"Trabajo","dreams":"Aprender","health":"Ninguna","interests":["Música"],"efe_group":"none","leadership_strengths":{"Acompañar jóvenes":50,"Acompañar adolescentes":50,"Enseñar":50,"Escuchar":50,"Organizar equipos":50,"Comunicar":50}}');
 insert into public.tnt_saturday_attendance(person_id,saturday_date,status) values(src,'2020-01-04','present'),(dst,'2020-01-04','absent'),(dst,'2020-01-11','present');
 perform set_config('tnt.claim.uid',u::text,true);perform set_config('tnt.claim.primary_uid',v::text,true);perform set_config('tnt.claim.src',src::text,true);perform set_config('tnt.claim.dst',dst::text,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.claim.uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare result jsonb;begin
 result:=public.tnt_continue_profile(current_setting('tnt.claim.dst')::uuid,'{"birthday":"2000-01-02","phone":"+54 9 11 12345678"}',true);
 if result->>'pending_review' is distinct from 'true' or result->>'linked' is distinct from 'false' then raise exception 'Two Google accounts bypassed administrative review: %',result;end if;
 perform set_config('tnt.claim.request',result->>'request_id',true);
 begin perform public.tnt_resolve_profile_link((result->>'request_id')::uuid,true);raise exception 'Self-service merge of Google accounts was allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.claim.primary_uid'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 if not public.tnt_is_admin() then raise exception 'Synthetic administrator profile is incomplete';end if;
 perform public.tnt_resolve_profile_link(current_setting('tnt.claim.request')::uuid,true);
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
do $$begin
 if exists(select 1 from public.tnt_people where id=current_setting('tnt.claim.src')::uuid and active) then raise exception 'Duplicate Google profile remains';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=current_setting('tnt.claim.src')::uuid and not enabled) then raise exception 'Secondary login remains enabled';end if;
 if not exists(select 1 from public.tnt_accounts where person_id=current_setting('tnt.claim.dst')::uuid and auth_user_id=current_setting('tnt.claim.primary_uid')::uuid and enabled and system_role='admin' and avatar_url='https://example.invalid/primary.jpg') then raise exception 'Primary account changed';end if;
 if (select count(*) from public.tnt_saturday_attendance where person_id=current_setting('tnt.claim.dst')::uuid)<>2 then raise exception 'Shared attendance was not consolidated';end if;
end $$;
rollback;
select 'claim retry, phone normalization, unclaimed accounts, history and two-Google review passed' as verification;
