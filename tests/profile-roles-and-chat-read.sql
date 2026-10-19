-- Synthetic identities only. All records and notification jobs roll back.
begin;
do $$declare u uuid;p uuid;v_ids uuid[]:='{}';v_auths uuid[]:='{}';v_thread uuid:=gen_random_uuid();i integer;
begin
 for i in 1..2 loop
  u:=gen_random_uuid();
  insert into auth.users(id,email,raw_user_meta_data,aud,role) values(u,'tnt-experience-test-'||u||'@example.invalid',jsonb_build_object('full_name','TNT Prueba '||u),'authenticated','authenticated');
  perform public.tnt_ensure_account_for_user(u);
  select person_id into p from public.tnt_accounts where auth_user_id=u;
  update public.tnt_people set first_name='TNT',last_name='Prueba',full_name='TNT Prueba '||i,birthday='2000-01-01',phone='1112345678',sex='M',instagram='No tengo',profile_consent=true where id=p;
  update public.tnt_accounts set ministry_role='Colaborador',staff_status='approved',onboarding_completed_at=now(),system_role=case when i=1 then 'admin' else 'user' end where person_id=p;
  perform public.tnt_apply_profile_answers(p,'{"studies":"Trabajo","dreams":"Aprender","health":"Ninguna","interests":["Música"],"efe_group":"none","leadership_strengths":{"Acompañar jóvenes":50,"Acompañar adolescentes":50,"Enseñar":50,"Escuchar":50,"Organizar equipos":50,"Comunicar":50}}');
  insert into public.tnt_profile_private_fields(person_id,dni) values(p,'12345678') on conflict(person_id) do update set dni=excluded.dni;
  v_ids:=array_append(v_ids,p);v_auths:=array_append(v_auths,u);
 end loop;
 perform set_config('tnt.test.admin',v_auths[1]::text,true);perform set_config('tnt.test.member',v_auths[2]::text,true);
 perform set_config('tnt.test.sender',v_ids[1]::text,true);perform set_config('tnt.test.recipient',v_ids[2]::text,true);perform set_config('tnt.test.thread',v_thread::text,true);
 update public.tnt_experience set config=jsonb_set(config,'{modules,chat,enabled}','true') where id;
 insert into public.tnt_person_permission_overrides(person_id,module,scope,action,allowed) values(v_ids[2],'buffet','*','view',false);
 insert into public.tnt_chat_threads(id,thread_type,title,created_by) values(v_thread,'direct','Prueba de avisos',v_ids[1]);
 insert into public.tnt_chat_members(thread_id,person_id) values(v_thread,v_ids[1]),(v_thread,v_ids[2]) on conflict do nothing;
 insert into public.tnt_push_subscriptions(person_id,endpoint,subscription) values(v_ids[2],'https://push.example.invalid/'||v_thread,jsonb_build_object('endpoint','https://push.example.invalid/'||v_thread,'keys',jsonb_build_object('auth','fixture','p256dh','fixture')));
end $$;
-- A central profile can receive a role before its first Google sign-in.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.admin'),'role','authenticated')::text,true);
do $$declare p uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();begin
 insert into public.tnt_people(id,full_name,normalized_name,first_name,last_name,active) values(p,'Prueba Sin Cuenta','prueba sin cuenta','Prueba','Sin Cuenta',true);
 perform set_config('tnt.test.unlinked',p::text,true);
 insert into public.tnt_chat_messages(id,thread_id,person_id,body,created_at) values(m,current_setting('tnt.test.thread')::uuid,current_setting('tnt.test.sender')::uuid,'Lectura inicial',now());
 perform set_config('tnt.test.message',m::text,true);
end $$;
set local role authenticated;
select public.tnt_review_staff(current_setting('tnt.test.unlinked')::uuid,'Líder');
do $$begin
 if not exists(select 1 from public.tnt_accounts where person_id=current_setting('tnt.test.unlinked')::uuid and auth_user_id is null and ministry_role='Líder' and staff_status='approved' and system_role='user') then raise exception 'Unlinked profile role was not saved safely';end if;
 begin perform public.tnt_review_staff(current_setting('tnt.test.unlinked')::uuid,'Admin');raise exception 'Invalid role accepted';exception when raise_exception then if sqlerrm<>'Elegí un rol válido' then raise;end if;end;
end $$;
select public.tnt_review_staff(current_setting('tnt.test.sender')::uuid,'Timoteo');
do $$begin
 if not exists(select 1 from public.tnt_accounts where person_id=current_setting('tnt.test.sender')::uuid and system_role='admin') then raise exception 'Admin permission changed';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.member'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare receipt timestamptz; unread bigint;begin
 begin perform public.tnt_review_staff(current_setting('tnt.test.unlinked')::uuid,null);raise exception 'Nonadmin changed a role';exception when insufficient_privilege then null;end;
 select unread_count into unread from public.tnt_chat_overview() where thread_id=current_setting('tnt.test.thread')::uuid;
 if unread<>1 then raise exception 'Initial message is not unread: %',unread;end if;
 receipt:=public.tnt_mark_chat_read(current_setting('tnt.test.thread')::uuid,current_setting('tnt.test.message')::uuid);
 select unread_count into unread from public.tnt_chat_overview() where thread_id=current_setting('tnt.test.thread')::uuid;
 if unread<>0 then raise exception 'Read message remains unread';end if;
 if receipt<>(select created_at from public.tnt_chat_messages where id=current_setting('tnt.test.message')::uuid) then raise exception 'Receipt used the device clock';end if;
end $$;
reset role;
do $$declare m uuid:=gen_random_uuid();begin
 insert into public.tnt_chat_messages(id,thread_id,person_id,body,created_at) values(m,current_setting('tnt.test.thread')::uuid,current_setting('tnt.test.sender')::uuid,'Mensaje nuevo después del visto',now()+interval '1 second');
 perform set_config('tnt.test.newmessage',m::text,true);
end $$;
set local role authenticated;
do $$declare unread bigint;begin
 perform public.tnt_mark_chat_read(current_setting('tnt.test.thread')::uuid,current_setting('tnt.test.message')::uuid);
 select unread_count into unread from public.tnt_chat_overview() where thread_id=current_setting('tnt.test.thread')::uuid;
 if unread<>1 then raise exception 'An older receipt swallowed a new message';end if;
 perform public.tnt_mark_chat_read(current_setting('tnt.test.thread')::uuid,current_setting('tnt.test.newmessage')::uuid);
 perform public.tnt_mark_chat_read(current_setting('tnt.test.thread')::uuid,current_setting('tnt.test.message')::uuid);
 select unread_count into unread from public.tnt_chat_overview() where thread_id=current_setting('tnt.test.thread')::uuid;
 if unread<>0 then raise exception 'Read cursor went backwards';end if;
 begin perform public.tnt_mark_chat_read(gen_random_uuid(),current_setting('tnt.test.newmessage')::uuid);raise exception 'Unrelated thread accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.admin'),'role','authenticated')::text,true);
delete from public.tnt_chat_members where thread_id=current_setting('tnt.test.thread')::uuid and person_id=current_setting('tnt.test.sender')::uuid;
set local role authenticated;
select public.tnt_mark_chat_read(current_setting('tnt.test.thread')::uuid,current_setting('tnt.test.newmessage')::uuid);
do $$begin
 if exists(select 1 from public.tnt_chat_members where thread_id=current_setting('tnt.test.thread')::uuid and person_id=current_setting('tnt.test.sender')::uuid) then raise exception 'Admin was joined without asking';end if;
end $$;
reset role;
rollback;
select 'roles on unlinked profiles, admin authorization, server read receipts, new unread messages and monotonic cursors passed' as verification;
