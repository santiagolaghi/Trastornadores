-- Synthetic identities and real RPCs/triggers. Every row and push job rolls back.
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
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.member'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 begin perform public.tnt_copy_role_permissions('Líder','Timoteo');raise exception 'Member copied role permissions';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.test.admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.tnt_copy_role_permissions('Líder','Timoteo');
select public.tnt_review_staff(current_setting('tnt.test.recipient')::uuid,'Timoteo');
do $$declare c jsonb;r bigint;begin
 select config,revision into c,r from public.tnt_experience where id;
 begin perform public.tnt_publish_experience(jsonb_set(c,'{appearance}','{"style":"unknown"}'),r);raise exception 'Invalid appearance accepted';exception when raise_exception then if sqlerrm<>'Elegí un estilo de TNT válido.' then raise;end if;end;
 perform public.tnt_publish_experience(jsonb_set(c,'{appearance}','{"style":"studio"}'),r);
end $$;
reset role;
do $$declare v_message uuid:=gen_random_uuid();v_note public.tnt_notifications;v_recipient uuid:=current_setting('tnt.test.recipient')::uuid;begin
 if not exists(select 1 from public.tnt_accounts where person_id=v_recipient and ministry_role='Timoteo' and staff_status='approved') then raise exception 'Role needs acceptance';end if;
 if exists((select module,scope,action,allowed from public.tnt_role_permission_presets where role='Líder') except (select module,scope,action,allowed from public.tnt_role_permission_presets where role='Timoteo')) then raise exception 'Role permissions differ';end if;
 if not exists(select 1 from public.tnt_person_permission_overrides where person_id=v_recipient and module='buffet' and not allowed) then raise exception 'Individual permission was overwritten';end if;
 insert into public.tnt_chat_messages(id,thread_id,person_id,body) values(v_message,current_setting('tnt.test.thread')::uuid,current_setting('tnt.test.sender')::uuid,'Mensaje de prueba con vista previa');
 select * into v_note from public.tnt_notifications where person_id=v_recipient and data->>'message_id'=v_message::text;
 if v_note.id is null or v_note.title<>'TNT Prueba 1' or v_note.body<>'Mensaje de prueba con vista previa' then raise exception 'Sender or preview is missing';end if;
 if (select count(*) from public.tnt_push_outbox where source_key='notification:'||v_note.id)<>1 then raise exception 'Push missing or duplicated';end if;
 if exists(select 1 from public.tnt_notifications where person_id=current_setting('tnt.test.sender')::uuid and data->>'message_id'=v_message::text) then raise exception 'Self-notification created';end if;
 if not public.tnt_notification_visible_for(v_note,v_recipient) then raise exception 'Recipient cannot see the message notice';end if;
 update public.tnt_chat_members set last_read_at=now()+interval '1 second' where person_id=v_recipient and thread_id=current_setting('tnt.test.thread')::uuid;
 if not public.tnt_notification_resolved(v_note) then raise exception 'Read chat notice is unresolved';end if;
 update public.tnt_chat_messages set deleted_at=now() where id=v_message;
 if public.tnt_notification_visible_for(v_note,v_recipient) then raise exception 'Deleted message preview is still visible';end if;
end $$;
rollback;
select 'direct roles, permission copying, appearance, chat previews and single push delivery passed' as verification;
