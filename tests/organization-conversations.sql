-- Real Supabase integration, with synthetic identities and rollback of every row.
-- Queued pushes remain uncommitted and cannot be claimed by the phone dispatcher.
begin;
do $$declare u uuid;p uuid;n integer;ev uuid:=gen_random_uuid();day uuid:=gen_random_uuid();
begin
 for n in 1..3 loop
  u:=gen_random_uuid();
  insert into auth.users(id,email,raw_user_meta_data,aud,role)
   values(u,'tnt-org-test-'||u||'@example.invalid',jsonb_build_object('full_name','TNT Organización '||left(u::text,8)),'authenticated','authenticated');
  perform public.tnt_ensure_account_for_user(u);
  select person_id into p from public.tnt_accounts where auth_user_id=u;
  update public.tnt_people set first_name='TNT',last_name='Org '||left(u::text,8),full_name='TNT Org '||left(u::text,8),birthday='2000-01-01',phone='1112345678',sex='M',instagram='No tengo',profile_consent=true where id=p;
  update public.tnt_accounts set enabled=true,ministry_role='Colaborador',staff_status='approved',onboarding_completed_at=now(),
   system_role=case when n=1 then 'admin' else 'user' end,avatar_url='https://example.invalid/tnt-org-author-'||n||'.jpg' where person_id=p;
  perform public.tnt_apply_profile_answers(p,'{"studies":"Trabajo","dreams":"Aprender","health":"Ninguna","interests":["Música"],"efe_group":"none","leadership_strengths":{"Acompañar jóvenes":50,"Acompañar adolescentes":50,"Enseñar":50,"Escuchar":50,"Organizar equipos":50,"Comunicar":50}}');
  insert into public.tnt_profile_private_fields(person_id,dni) values(p,'12345678') on conflict(person_id) do update set dni=excluded.dni;
  insert into public.tnt_person_permission_overrides(person_id,module,action,scope,allowed)
   values(p,'organizacion','view','*',true),(p,'chat','view','*',true) on conflict(person_id,module,action,scope) do update set allowed=true;
  perform set_config('tnt.orgtest.user'||n,u::text,true);perform set_config('tnt.orgtest.person'||n,p::text,true);
  insert into public.tnt_push_subscriptions(person_id,endpoint,subscription) values(p,'https://example.invalid/tnt-org-test-'||u,jsonb_build_object('endpoint','https://example.invalid/tnt-org-test-'||u,'keys',jsonb_build_object('p256dh','synthetic','auth','synthetic')));
 end loop;
 insert into public.tnt_events(id,name,kind,start_date,end_date,created_by) values(ev,'TNT organización sintética','saturday','2027-01-30','2027-01-30',current_setting('tnt.orgtest.person1')::uuid);
 insert into public.tnt_schedule_days(id,event_id,label,date) values(day,ev,'Sábado','2027-01-30');
 insert into public.tnt_event_members(event_id,person_id,event_role) values(ev,current_setting('tnt.orgtest.person1')::uuid,'organizer'),(ev,current_setting('tnt.orgtest.person2')::uuid,'participant'),(ev,current_setting('tnt.orgtest.person3')::uuid,'participant');
 -- A generic edit permission still does not make an ordinary member a coordinator.
 insert into public.tnt_person_permission_overrides(person_id,module,action,scope,allowed) values(current_setting('tnt.orgtest.person2')::uuid,'organizacion','edit_activity','*',true)
  on conflict(person_id,module,action,scope) do update set allowed=true;
 perform set_config('tnt.orgtest.event',ev::text,true);perform set_config('tnt.orgtest.day',day::text,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.orgtest.user1'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare ev uuid:=current_setting('tnt.orgtest.event')::uuid;day uuid:=current_setting('tnt.orgtest.day')::uuid;a uuid;b uuid;c uuid;area uuid;ids uuid[];before jsonb;after_order jsonb;times jsonb;after_times jsonb;
begin
 if not public.tnt_profile_is_complete() then raise exception 'Synthetic coordinator profile is incomplete';end if;
 a:=public.tnt_save_activity(null,ev,'{"title":"Bienvenida sintética","task_type":"complex","planned_start":"2027-01-30T19:15:00-03:00","duration_minutes":5}',array[current_setting('tnt.orgtest.person2')::uuid]);
 b:=public.tnt_save_activity(null,ev,'{"title":"Palabra sintética","task_type":"complex","planned_start":"2027-01-30T19:20:00-03:00","duration_minutes":15}','{}'::uuid[]);
 c:=public.tnt_save_activity(null,ev,'{"title":"Oración flexible sintética","task_type":"simple","planned_start":null}','{}'::uuid[]);
 area:=public.tnt_save_activity(null,ev,'{"title":"Limpieza sintética","task_type":"logistics","logistics_phase":"after","planned_start":null}','{}'::uuid[]);
 if not exists(select 1 from public.tnt_schedule_items where task_id=c and starts_at is null and day_id=day) then raise exception 'Flexible activity has no day';end if;
 if exists(select 1 from public.tnt_schedule_items where task_id=area) or (select logistics_phase from public.tnt_tasks where id=area)<>'after' then raise exception 'Logistics phase or program separation failed';end if;
 ids:=array[(select id from public.tnt_schedule_items where task_id=a),(select id from public.tnt_schedule_items where task_id=c),(select id from public.tnt_schedule_items where task_id=b)];
 select jsonb_agg(jsonb_build_object('id',id,'starts_at',starts_at,'duration_minutes',duration_minutes,'sort_order',sort_order,'task_id',task_id)) into before from public.tnt_schedule_items where day_id=day;
 select jsonb_agg(jsonb_build_array(id,planned_start,duration_minutes) order by id) into times from public.tnt_tasks where event_id=ev;
 perform public.tnt_reorder_program(day,ids,before);
 select jsonb_agg(jsonb_build_array(id,planned_start,duration_minutes) order by id) into after_times from public.tnt_tasks where event_id=ev;
 if times is distinct from after_times then raise exception 'Reordering rewrote task times or durations';end if;
 if (select starts_at from public.tnt_schedule_items where id=ids[1])<>'19:15'::time or (select starts_at from public.tnt_schedule_items where id=ids[2]) is not null or (select starts_at from public.tnt_schedule_items where id=ids[3])<>'19:20'::time then raise exception 'Reordering rewrote a schedule time';end if;
 begin perform public.tnt_reorder_program(day,ids,before);raise exception 'Stale snapshot accepted';exception when raise_exception then if sqlerrm not like 'Otra persona cambió%' then raise;end if;end;
 select jsonb_agg(jsonb_build_object('id',id,'starts_at',starts_at,'duration_minutes',duration_minutes,'sort_order',sort_order,'task_id',task_id)) into after_order from public.tnt_schedule_items where day_id=day;
 begin perform public.tnt_reorder_program(day,array[ids[3],ids[2],ids[1]],after_order);raise exception 'Inverted times accepted';exception when raise_exception then if sqlerrm not like 'No podés ubicar%' then raise;end if;end;
 if not exists(select 1 from public.tnt_event_changes where event_id=ev and kind='program_order') then raise exception 'Order change was not recorded';end if;
 perform set_config('tnt.orgtest.task',a::text,true);perform set_config('tnt.orgtest.other_task',b::text,true);
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.orgtest.user3'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare q uuid;
begin
 insert into public.tnt_task_comments(task_id,person_id,body,kind) values(current_setting('tnt.orgtest.task')::uuid,public.tnt_current_person_id(),'¿Qué llevamos? Consulta sintética.','question') returning id into q;
 perform set_config('tnt.orgtest.question',q::text,true);
end $$;
reset role;
-- Inspect queue contents as the owner, without dispatching or committing them.
do $$declare q uuid:=current_setting('tnt.orgtest.question')::uuid;n public.tnt_notifications%rowtype;
begin
 select * into n from public.tnt_notifications where person_id=current_setting('tnt.orgtest.person2')::uuid and data->>'comment_id'=q::text;
 if n.id is null or n.data->>'sender_id'<>current_setting('tnt.orgtest.person3') or n.data->>'sender_avatar'<>'https://example.invalid/tnt-org-author-3.jpg' or n.data->>'event_date'<>'2027-01-30' or n.href not like '%&tab=team&comment='||q then raise exception 'Specific question notification lost author/photo/context/link';end if;
 if not exists(select 1 from public.tnt_push_outbox where person_id=current_setting('tnt.orgtest.person2')::uuid and payload->>'comment_id'=q::text and payload->>'sender_avatar'='https://example.invalid/tnt-org-author-3.jpg') then raise exception 'Question push lost its portrait';end if;
 if exists(select 1 from public.tnt_notifications where person_id=current_setting('tnt.orgtest.person3')::uuid and data->>'comment_id'=q::text) then raise exception 'Sender received their own question';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.orgtest.user1'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare answer uuid;instruction uuid;thread uuid:=gen_random_uuid();msg uuid:=gen_random_uuid();
begin
 insert into public.tnt_task_comments(task_id,person_id,body,kind,reply_to) values(current_setting('tnt.orgtest.task')::uuid,public.tnt_current_person_id(),'Llevamos los carteles. Respuesta sintética.','question',current_setting('tnt.orgtest.question')::uuid) returning id into answer;
 insert into public.tnt_task_comments(task_id,person_id,body,kind,is_pinned) values(current_setting('tnt.orgtest.task')::uuid,public.tnt_current_person_id(),'Indicación sintética fijada.','note',true) returning id into instruction;
 if not exists(select 1 from public.tnt_notifications where person_id=current_setting('tnt.orgtest.person3')::uuid and data->>'comment_id'=answer::text) then raise exception 'Unassigned asker did not receive their reply';end if;
 insert into public.tnt_chat_threads(id,title,thread_type,event_id,created_by) values(thread,'Chat sintético del sábado','event',current_setting('tnt.orgtest.event')::uuid,public.tnt_current_person_id());
 insert into public.tnt_chat_members(thread_id,person_id) values(thread,current_setting('tnt.orgtest.person1')::uuid),(thread,current_setting('tnt.orgtest.person2')::uuid),(thread,current_setting('tnt.orgtest.person3')::uuid) on conflict do nothing;
 insert into public.tnt_chat_messages(id,thread_id,person_id,body,audience_person_ids) values(msg,thread,public.tnt_current_person_id(),'Mensaje privado sintético.',array[current_setting('tnt.orgtest.person2')::uuid]);
 perform set_config('tnt.orgtest.message',msg::text,true);perform set_config('tnt.orgtest.thread',thread::text,true);perform set_config('tnt.orgtest.instruction',instruction::text,true);
end $$;
reset role;
do $$declare msg uuid:=current_setting('tnt.orgtest.message')::uuid;n public.tnt_notifications%rowtype;
begin
 select * into n from public.tnt_notifications where person_id=current_setting('tnt.orgtest.person2')::uuid and data->>'message_id'=msg::text;
 if n.id is null or n.data->>'sender_avatar'<>'https://example.invalid/tnt-org-author-1.jpg' or n.data->>'event_date'<>'2027-01-30' then raise exception 'Chat notice lost photo/Saturday';end if;
 if not exists(select 1 from public.tnt_push_outbox where payload->>'message_id'=msg::text and payload->>'sender_avatar'='https://example.invalid/tnt-org-author-1.jpg') then raise exception 'Chat push lost message identity/portrait';end if;
 if exists(select 1 from public.tnt_notifications where person_id=current_setting('tnt.orgtest.person3')::uuid and data->>'message_id'=msg::text) then raise exception 'Private audience leaked';end if;
 delete from public.tnt_chat_members where thread_id=current_setting('tnt.orgtest.thread')::uuid and person_id=current_setting('tnt.orgtest.person2')::uuid;
 if public.tnt_notification_visible_for(n,current_setting('tnt.orgtest.person2')::uuid) then raise exception 'Revoked member can still see chat notice';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tnt.orgtest.user2'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare t public.tnt_tasks%rowtype;
begin
 select * into t from public.tnt_tasks where id=current_setting('tnt.orgtest.task')::uuid;
 begin perform public.tnt_save_activity(t.id,t.event_id,to_jsonb(t),array[public.tnt_current_person_id()]);raise exception 'Ordinary member edited activity';exception when insufficient_privilege then null;end;
 begin insert into public.tnt_task_comments(task_id,person_id,body,kind,is_pinned) values(t.id,public.tnt_current_person_id(),'Indicación sin permiso.','note',true);raise exception 'Ordinary member pinned an instruction';exception when insufficient_privilege then null;end;
 begin insert into public.tnt_task_comments(task_id,person_id,body,kind,reply_to) values(current_setting('tnt.orgtest.other_task')::uuid,public.tnt_current_person_id(),'Respuesta en otra actividad.','question',current_setting('tnt.orgtest.question')::uuid);raise exception 'Cross-activity reply accepted';exception when raise_exception then if sqlerrm not like 'La respuesta debe pertenecer%' then raise;end if;end;
 begin update public.tnt_event_changes set summary='Cambio no autorizado' where event_id=t.event_id;raise exception 'Member overwrote change history';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform public.tnt_save_activity(null,null,'{}','{}'::uuid[]);raise exception 'Anonymous save allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'organization conversations, portraits, audience, fixed schedule order, logistics, permissions and rollback passed' as verification;
