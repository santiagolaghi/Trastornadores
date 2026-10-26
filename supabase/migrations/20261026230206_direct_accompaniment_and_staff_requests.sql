-- Administrative assignment is effective immediately. Keep earlier records and followups.
create or replace function tnt_actions.community_welcome_member(p_person uuid) returns boolean
language sql stable security invoker set search_path='' as $fn$
 select tnt_actions.community_active_person(p_person) and exists(select 1 from public.tnt_accounts a
  where a.person_id=p_person and a.staff_status is distinct from 'approved' and a.system_role is distinct from 'admin')
$fn$;
revoke all on function tnt_actions.community_welcome_member(uuid) from public,anon,authenticated;
alter table public.tnt_community_accompaniment drop constraint tnt_community_accompaniment_status_check;
alter table public.tnt_community_accompaniment add constraint tnt_community_accompaniment_status_check check(status in('unassigned','pending','accepted','declined','closed'));
create or replace function tnt_actions.community_action_care(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare pid uuid:=public.tnt_current_person_id();mod text:=p_data->>'module';item uuid:=nullif(p_data->>'id','')::uuid;target uuid:=nullif(p_data->>'person_id','')::uuid;
 c public.tnt_community_content%rowtype;e public.tnt_community_enrollments%rowtype;q public.tnt_community_questions%rowtype;
 a public.tnt_community_accompaniment%rowtype;f public.tnt_community_family_links%rowtype;ph public.tnt_community_phrases%rowtype;
 old_data jsonb;st text;cfg jsonb;steps jsonb;chosen integer;ver integer;result jsonb:='{}';new_id uuid;ref uuid;is_admin boolean:=public.tnt_is_admin();d date;dt date;vlevel integer;
begin
 if auth.uid() is null or not tnt_actions.community_active_person(pid) then raise exception 'Completá tu perfil e iniciá sesión para continuar.' using errcode='42501';end if;
 if p_action='ask' then
  mod='questions';if not exists(select 1 from public.tnt_community_modules where id=mod and enabled) then raise exception 'Este espacio está en pausa.';end if;
  insert into public.tnt_community_questions(person_id,question,visibility) values(pid,trim(p_data->>'question'),coalesce(p_data->>'visibility','private')) returning id into item;result=jsonb_build_object('id',item);
 elsif p_action='answer' then
  mod='questions';if not tnt_actions.community_can_for(pid,mod,2) then raise exception 'No tenés permiso para responder y publicar.' using errcode='42501';end if;
  select * into q from public.tnt_community_questions where id=item for update;if not found then raise exception 'No encontramos esa consulta.';end if;
  old_data=to_jsonb(q);st=coalesce(p_data->>'status','answered');if st='published' and q.visibility<>'community' then raise exception 'Esta consulta es privada. Su autor debe elegir compartirla.';end if;
  if st in('answered','published') and length(trim(coalesce(p_data->>'answer','')))=0 then raise exception 'Escribí una respuesta.';end if;
  update public.tnt_community_questions set answer=coalesce(p_data->>'answer',''),reference=coalesce(p_data->>'reference',''),status=st,answered_by=pid,updated_at=now() where id=item;
 elsif p_action='request_welcome' then
  if exists(select 1 from public.tnt_accounts x where x.person_id=pid and (x.staff_status='approved' or x.system_role='admin')) then raise exception 'Esta solicitud es para personas de Comunidad. El equipo participa como referente.' using errcode='42501';end if;
  target:=pid;item:=null;
  mod='welcome';if not exists(select 1 from public.tnt_community_modules where id=mod and enabled) then raise exception 'Este espacio está en pausa.';end if;insert into public.tnt_community_accompaniment(person_id) values(pid) on conflict(person_id) do update set status='unassigned',referent_id=null,assigned_by=null,assigned_at=null,responded_at=null where tnt_community_accompaniment.status='closed';
 elsif p_action='assign_referent' then
  mod='welcome';if not is_admin then raise exception 'El referente lo elige Administración.' using errcode='42501';end if;
  ref=nullif(p_data->>'referent_id','')::uuid;
 if ref is not null and not tnt_actions.community_welcome_member(target) then raise exception 'El acompañamiento se asigna a personas de Comunidad, no al equipo.' using errcode='42501';end if;
  if target is null or not tnt_actions.community_active_person(target) then raise exception 'Elegí una persona habilitada.';end if;
  if ref is not null and not exists(select 1 from public.tnt_accounts x join public.tnt_people p on p.id=x.person_id where x.person_id=ref and x.enabled and p.active and (x.staff_status='approved' or x.system_role='admin')) then raise exception 'Elegí un referente habilitado del equipo.';end if;
  select to_jsonb(x) into old_data from public.tnt_community_accompaniment x where person_id=target for update;
  insert into public.tnt_community_accompaniment(person_id,referent_id,status,assigned_by,assigned_at) values(target,ref,case when ref is not null then 'accepted' when tnt_actions.community_welcome_member(target) then 'unassigned' else 'closed' end,pid,now())
  on conflict(person_id) do update set referent_id=excluded.referent_id,status=excluded.status,assigned_by=pid,assigned_at=now(),responded_at=null;
 elsif p_action='respond_referent' then
 raise exception 'La asignación la define Administración. Consultá al equipo si necesitás un cambio.' using errcode='42501';
 elsif p_action='followup' then
  mod='welcome';if not is_admin and not exists(select 1 from public.tnt_community_accompaniment where person_id=target and referent_id=pid and status='accepted') then raise exception 'Solo el referente confirmado o Administración puede registrar el seguimiento.' using errcode='42501';end if;
  insert into public.tnt_community_followups(person_id,author_id,contact_on,note,shared) values(target,pid,coalesce(nullif(p_data->>'contact_on','')::date,tnt_actions.community_today()),trim(p_data->>'note'),coalesce((p_data->>'shared')::boolean,false)) returning id into item;
 elsif p_action='request_family' then
  mod='families';if not exists(select 1 from public.tnt_community_modules where id=mod and enabled) then raise exception 'Este espacio está en pausa.';end if;if exists(select 1 from public.tnt_community_family_links where caregiver_id=pid and lower(trim(requested_name))=lower(trim(p_data->>'name')) and status in('pending','verified')) then raise exception 'Ya tenés una vinculación o solicitud para esta persona.';end if;
  insert into public.tnt_community_family_links(caregiver_id,requested_name,relationship) values(pid,trim(p_data->>'name'),trim(p_data->>'relationship')) returning id into item;
 elsif p_action='review_family' then
  mod='families';if not tnt_actions.community_can_for(pid,mod,3) then raise exception 'Necesitás permiso para verificar familias.' using errcode='42501';end if;
  select * into f from public.tnt_community_family_links where id=item for update;if not found then raise exception 'No encontramos esa solicitud.';end if;old_data=to_jsonb(f);
  st=case when (p_data->>'accept')::boolean then 'verified' else 'rejected' end;
  if st='verified' and not exists(select 1 from public.tnt_people where id=target and active) then raise exception 'Elegí el perfil correspondiente.';end if;
  update public.tnt_community_family_links set member_id=case when st='verified' then target else null end,status=st,reviewed_by=pid,reviewed_at=now() where id=item;
 elsif p_action='request_baptism' then
  mod='baptisms';if not exists(select 1 from public.tnt_community_modules where id=mod and enabled) then raise exception 'Este espacio está en pausa.';end if;insert into public.tnt_community_baptisms(person_id) values(pid) on conflict do nothing;
 elsif p_action='save_baptism' then
  mod='baptisms';if not tnt_actions.community_can_for(pid,mod,3) then raise exception 'Necesitás permiso para coordinar bautismos.' using errcode='42501';end if;
  select to_jsonb(b) into old_data from public.tnt_community_baptisms b where person_id=target for update;
  st=p_data->>'status';dt=case when st='completed' then nullif(p_data->>'completed_on','')::date else null end;
  if st='completed' and (dt is null or dt>tnt_actions.community_today() or not coalesce((p_data->>'confirmed')::boolean,false)) then raise exception 'Confirmá la realización e indicá una fecha válida.';end if;
  insert into public.tnt_community_baptisms(person_id,status,completed_on,updated_by) values(target,st,dt,pid) on conflict(person_id) do update set status=excluded.status,completed_on=excluded.completed_on,updated_by=pid,updated_at=now();
 else raise exception 'Acción no disponible.' using errcode='22023';end if;
 insert into public.tnt_community_history(module,action,actor,subject_id,details) values(coalesce(mod,'daily'),p_action,pid,coalesce(item::text,target::text,pid::text),jsonb_build_object('before',old_data,'notify',coalesce((p_data->>'notify')::boolean,false))||case when p_action='assign_referent' then jsonb_build_object('assignment_mode','direct') else '{}'::jsonb end);
 return result;
end;
$fn$;
create or replace function tnt_actions.community_bootstrap() returns jsonb
language plpgsql security definer set search_path='' as $fn$
DECLARE
  pid uuid:=public.tnt_current_person_id();
  result jsonb;
  manage boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT tnt_actions.community_active_person(pid) THEN
    RAISE EXCEPTION 'Iniciá sesión con tu perfil completo.'
      USING errcode='42501';
  END IF;

  PERFORM tnt_actions.community_ensure_day();

  SELECT EXISTS (
    SELECT 1 FROM public.tnt_community_modules m
    WHERE tnt_actions.community_can_for(pid,m.id,1)
  ) INTO manage;

  result=jsonb_build_object(
    'community_size',(
      SELECT count(DISTINCT a.auth_user_id)
      FROM public.tnt_accounts a
      JOIN public.tnt_people p ON p.id=a.person_id
      WHERE a.enabled AND p.active AND a.auth_user_id IS NOT NULL
    ),
    'modules',(
      SELECT coalesce(jsonb_agg(
        to_jsonb(m)||jsonb_build_object(
          'permission',CASE
            WHEN tnt_actions.community_can_for(pid,m.id,3) THEN 3
            WHEN tnt_actions.community_can_for(pid,m.id,2) THEN 2
            WHEN tnt_actions.community_can_for(pid,m.id,1) THEN 1
            ELSE 0
          END
        ) ORDER BY m.id
      ),'[]')
      FROM public.tnt_community_modules m
      WHERE m.enabled OR tnt_actions.community_can_for(pid,m.id,1)
    ),
    'content',(
      SELECT coalesce(jsonb_agg(
        to_jsonb(c)||jsonb_build_object(
          'people',CASE
            WHEN tnt_actions.community_can_for(pid,c.module,1)
            THEN coalesce((
              SELECT jsonb_agg(person_id)
              FROM public.tnt_community_audience x
              WHERE x.content_id=c.id
            ),'[]')
            ELSE '[]'::jsonb
          END
        ) ORDER BY c.created_at DESC
      ),'[]')
      FROM public.tnt_community_content c
      WHERE tnt_actions.community_content_visible(c.id,pid)
    ),
    'enrollments',(
      SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]')
      FROM public.tnt_community_enrollments e
      JOIN public.tnt_community_content c ON c.id=e.content_id
      WHERE (
        e.person_id=pid OR tnt_actions.community_can_for(pid,c.module,3)
      ) AND tnt_actions.community_content_visible(c.id,pid)
    ),
    'polls',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,
        'mine',(
          SELECT option_index FROM public.tnt_community_votes
          WHERE content_id=c.id AND person_id=pid
        ),
        'counts',CASE
          WHEN coalesce(c.config->>'results','after_vote')='after_close'
            AND (c.ends_at IS NULL OR c.ends_at>now())
            AND NOT tnt_actions.community_can_for(pid,'polls',3)
          OR coalesce(c.config->>'results','after_vote')='after_vote'
            AND NOT EXISTS (
              SELECT 1 FROM public.tnt_community_votes
              WHERE content_id=c.id AND person_id=pid
            )
            AND NOT tnt_actions.community_can_for(pid,'polls',3)
          THEN NULL
          ELSE (
            SELECT jsonb_agg((
              SELECT count(*) FROM public.tnt_community_votes
              WHERE content_id=c.id AND option_index=i
            ))
            FROM generate_series(1,jsonb_array_length(c.config->'options')) i
          )
        END
      )),'[]')
      FROM public.tnt_community_content c
      WHERE c.module='polls'
        AND tnt_actions.community_content_visible(c.id,pid)
    ),
    'questions',(
      SELECT coalesce(jsonb_agg(
        to_jsonb(q)||jsonb_build_object(
          'name',CASE
            WHEN q.person_id=pid
              OR tnt_actions.community_can_for(pid,'questions',1)
            THEN (SELECT full_name FROM public.tnt_people WHERE id=q.person_id)
            ELSE NULL
          END
        ) ORDER BY q.created_at DESC
      ),'[]')
      FROM public.tnt_community_questions q
      WHERE q.person_id=pid
        OR tnt_actions.community_can_for(pid,'questions',1)
        OR q.status='published' AND q.visibility='community'
    ),
    'welcome_people',case when public.tnt_is_admin() then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'avatar_url',a.avatar_url,'staff',false) order by p.full_name) from public.tnt_people p join public.tnt_accounts a on a.person_id=p.id where tnt_actions.community_welcome_member(p.id)),'[]'::jsonb) else '[]'::jsonb end,
 'accompaniment',(
      SELECT coalesce(jsonb_agg(
        to_jsonb(a)||jsonb_build_object(
          'name',(SELECT full_name FROM public.tnt_people WHERE id=a.person_id),
          'referent_name',(select full_name from public.tnt_people where id=a.referent_id),'member_eligible',tnt_actions.community_welcome_member(a.person_id)
        )
      ),'[]')
      from public.tnt_community_accompaniment a where a.status<>'closed' and (a.status='accepted' or tnt_actions.community_welcome_member(a.person_id)) and (a.person_id=pid or a.referent_id=pid or public.tnt_is_admin())
    ),
    'followups',(
      SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.contact_on DESC),'[]')
      FROM public.tnt_community_followups f
      WHERE public.tnt_is_admin()
        OR f.person_id=pid AND f.shared
        OR EXISTS (
          SELECT 1 FROM public.tnt_community_accompaniment a
          WHERE a.person_id=f.person_id
            AND a.referent_id=pid
            AND a.status='accepted'
        )
    ),
    'families',(
      SELECT coalesce(jsonb_agg(
        to_jsonb(f)||jsonb_build_object(
          'caregiver_name',(SELECT full_name FROM public.tnt_people WHERE id=f.caregiver_id),
          'member_name',(SELECT full_name FROM public.tnt_people WHERE id=f.member_id)
        ) ORDER BY f.created_at DESC
      ),'[]')
      FROM public.tnt_community_family_links f
      WHERE f.caregiver_id=pid OR f.member_id=pid
        OR tnt_actions.community_can_for(pid,'families',3)
    ),
    'consents',(
      SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]')
      FROM public.tnt_community_consents x
      JOIN public.tnt_community_family_links f ON f.id=x.link_id
      WHERE tnt_actions.community_can_for(pid,'families',3)
        OR f.caregiver_id=pid AND f.status='verified'
    ),
    'baptisms',(
      SELECT coalesce(jsonb_agg(
        to_jsonb(b)||jsonb_build_object(
          'name',(SELECT full_name FROM public.tnt_people WHERE id=b.person_id)
        )
      ),'[]')
      FROM public.tnt_community_baptisms b
      WHERE b.person_id=pid
        OR tnt_actions.community_can_for(pid,'baptisms',3)
    ),
    'preferences',coalesce((
      SELECT to_jsonb(p)
      FROM public.tnt_community_preferences p WHERE p.person_id=pid
    ),jsonb_build_object(
      'birthday_public',false,'daily_push',false,
      'reminders',true,'reading','{}'::jsonb
    )),
    'daily',(
      SELECT to_jsonb(d) FROM public.tnt_community_days d
      WHERE day=tnt_actions.community_today()
    ),
    'days',CASE
      WHEN tnt_actions.community_can_for(pid,'daily',1) THEN coalesce((
        SELECT jsonb_agg(d ORDER BY d.day)
        FROM public.tnt_community_days d
        WHERE day>=tnt_actions.community_today()
      ),'[]')
      ELSE '[]'::jsonb
    END,
    'phrases',CASE
      WHEN tnt_actions.community_can_for(pid,'daily',1) THEN coalesce((
        SELECT jsonb_agg(p ORDER BY p.updated_at DESC)
        FROM public.tnt_community_phrases p
      ),'[]')
      ELSE '[]'::jsonb
    END,
    'games',(
      SELECT coalesce(jsonb_agg(x),'[]')
      FROM (
        SELECT kind,difficulty,max(score) best,
          count(*) plays,count(*) FILTER(WHERE won) wins
        FROM public.tnt_community_game_runs
        WHERE person_id=pid
        GROUP BY kind,difficulty
      ) x
    ),
    'birthdays',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'person_id',p.id,'name',p.full_name,
        'month',extract(month FROM p.birthday),
        'day',extract(day FROM p.birthday),
        'year',extract(year FROM p.birthday),
        'avatar_url',a.avatar_url
      ) ORDER BY to_char(p.birthday,'MMDD')),'[]')
      FROM public.tnt_people p
      JOIN public.tnt_accounts a ON a.person_id=p.id
      WHERE a.auth_user_id IS NOT NULL AND a.enabled
        AND p.active AND p.birthday IS NOT NULL
    ),
    'people',CASE
      WHEN manage OR EXISTS (
        SELECT 1 FROM public.tnt_community_accompaniment a
        WHERE a.referent_id=pid AND a.status IN('pending','accepted')
      ) THEN coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id',p.id,'name',p.full_name,'avatar_url',a.avatar_url,
          'staff',a.staff_status='approved' or a.system_role='admin','enabled',coalesce(a.enabled,false),'welcome_eligible',tnt_actions.community_welcome_member(p.id)
        ))
        FROM public.tnt_people p
        LEFT JOIN public.tnt_accounts a ON a.person_id=p.id
        WHERE p.active AND (
          manage OR EXISTS (
            SELECT 1 FROM public.tnt_community_accompaniment x
            WHERE x.person_id=p.id AND x.referent_id=pid
              AND x.status IN('pending','accepted')
          )
        )
      ),'[]')
      ELSE '[]'::jsonb
    END,
    'grants',CASE
      WHEN public.tnt_is_admin() THEN coalesce((
        SELECT jsonb_agg(g) FROM public.tnt_community_grants g
      ),'[]')
      ELSE '[]'::jsonb
    END,
    'history',(
      SELECT coalesce(jsonb_agg(x),'[]')
      FROM (
        SELECT h.*
        FROM public.tnt_community_history h
        WHERE tnt_actions.community_can_for(pid,h.module,3)
        ORDER BY created_at DESC LIMIT 60
      ) x
    )
  );

  RETURN result;
END;
$fn$;
create or replace function tnt_actions.community_history_notice() returns trigger
language plpgsql security definer set search_path='' as $fn$
DECLARE
  c public.tnt_community_content%rowtype;
  q public.tnt_community_questions%rowtype;
  f public.tnt_community_family_links%rowtype;
  a public.tnt_community_accompaniment%rowtype;
  target uuid;
  person uuid;
  subject uuid;
  dest text;
  label text;
  extra jsonb;
  key text;
BEGIN
  key='community:'||new.action||':'||new.subject_id;

  subject=CASE
    WHEN new.subject_id~'^[0-9a-f-]{36}$'
    THEN new.subject_id::uuid
    ELSE NULL
  END;

  dest='/comunidad?module='||new.module;

  IF new.action='save_content' THEN
    SELECT * INTO c FROM public.tnt_community_content WHERE id=subject;

    IF c.status NOT IN('published','scheduled') OR c.starts_at>now() THEN
      RETURN new;
    END IF;

    IF coalesce(new.details#>>'{before,status}','') IN('published','scheduled')
       AND NOT coalesce((new.details->>'notify')::boolean,false)
       AND (new.details#>>'{before,starts_at}')::timestamptz
         IS NOT DISTINCT FROM c.starts_at THEN
      RETURN new;
    END IF;

    extra=jsonb_build_object('content_id',c.id);
    key='community:publish:'||c.id||':'||c.version;

    FOR target IN
      SELECT x.person_id FROM public.tnt_accounts x
      WHERE x.person_id<>new.actor
        AND tnt_actions.community_content_recipient(c.id,x.person_id)
    LOOP
      PERFORM tnt_actions.community_notify(
        target,key,c.module,c.title,
        CASE
          WHEN c.module='polls'
            THEN 'Tu opinión cuenta. Hay una encuesta para vos.'
          WHEN c.module='bible'
            THEN 'Un nuevo plan para leer y compartir.'
          ELSE 'Hay una novedad para vos en TNT.'
        END,
        dest||'&item='||c.id,extra
      );
    END LOOP;

  ELSIF new.action='ask' THEN
    SELECT * INTO q FROM public.tnt_community_questions WHERE id=subject;
    extra=jsonb_build_object('question_id',q.id);

    FOR target IN
      SELECT person_id FROM public.tnt_accounts
      WHERE person_id<>new.actor
        AND tnt_actions.community_can_for(person_id,'questions',2)
    LOOP
      PERFORM tnt_actions.community_notify(
        target,key,'questions','Nueva pregunta de fe',
        'Hay una consulta para acompañar.',
        '/comunidad?module=questions&manage=1&question='||q.id,extra
      );
    END LOOP;

  ELSIF new.action='answer' THEN
    SELECT * INTO q FROM public.tnt_community_questions WHERE id=subject;

    IF q.status IN('answered','published') THEN
      PERFORM tnt_actions.community_notify(
        q.person_id,key||':'||q.updated_at,'questions',
        'Tu pregunta tiene respuesta',
        'El equipo respondió tu consulta.',
        dest||'&question='||q.id,jsonb_build_object('question_id',q.id)
      );
    END IF;

  ELSIF new.action='request_welcome' THEN
    subject:=new.actor;
    key:='community:request_welcome:'||subject;

    SELECT full_name INTO label FROM public.tnt_people WHERE id=subject;

    extra=jsonb_build_object(
      'welcome_person',subject,'sender_id',subject,'sender_name',label,
      'sender_avatar',(
        SELECT avatar_url FROM public.tnt_accounts WHERE person_id=subject
      )
    );

    FOR target IN
      SELECT person_id FROM public.tnt_accounts
      WHERE system_role='admin' AND person_id<>new.actor
    LOOP
      PERFORM tnt_actions.community_notify(
        target,key,'welcome',
        coalesce(label,'Una persona de TNT')||' pidió acompañamiento',
        'Podés asignar directamente un referente.',
        '/comunidad?module=welcome&manage=1&person='||subject,extra
      );
    END LOOP;

  elsif new.action='assign_referent' then
 select * into a from public.tnt_community_accompaniment where person_id=subject;
 if a.referent_id is not null and a.status='accepted' then
  extra:=jsonb_build_object('welcome_person',a.person_id,'welcome_action','assigned','assigned_ref',a.referent_id,'assigned_at',a.assigned_at);
  perform tnt_actions.community_notify(a.referent_id,key||':'||a.assigned_at,'welcome','Acompañás a '||coalesce((select full_name from public.tnt_people where id=a.person_id),'una persona de TNT'),'Administración te asignó como referente. Ya podés registrar encuentros.',dest,extra);
  perform tnt_actions.community_notify(a.person_id,key||':'||a.assigned_at,'welcome','Tu referente es '||coalesce((select full_name from public.tnt_people where id=a.referent_id),'una persona del equipo'),'Administración ya dejó asignado tu acompañamiento en TNT.',dest,extra);
 end if;
 ELSIF new.action='followup' THEN
    SELECT person_id INTO person
    FROM public.tnt_community_followups WHERE id=subject AND shared;

    IF person IS NOT NULL THEN
      PERFORM tnt_actions.community_notify(
        person,key,'welcome','Tu acompañamiento tiene una novedad',
        'Tu referente compartió un registro con vos.',
        dest,jsonb_build_object('welcome_person',person)
      );
    END IF;

  ELSIF new.action='request_family' THEN
    extra=jsonb_build_object('family_link_id',subject);

    FOR target IN
      SELECT person_id FROM public.tnt_accounts
      WHERE tnt_actions.community_can_for(person_id,'families',3)
    LOOP
      PERFORM tnt_actions.community_notify(
        target,key,'families','Nueva solicitud de una familia',
        'Hay una vinculación familiar para revisar.',
        dest||'&manage=1',extra
      );
    END LOOP;

  ELSIF new.action='review_family' THEN
    SELECT * INTO f FROM public.tnt_community_family_links WHERE id=subject;

    PERFORM tnt_actions.community_notify(
      f.caregiver_id,key||':'||f.reviewed_at,'families',
      'Tu solicitud familiar tiene respuesta',
      CASE
        WHEN f.status='verified'
          THEN 'Ya podés ver los avisos y autorizaciones de Familias TNT.'
        ELSE 'Acercate al equipo para revisar la vinculación solicitada.'
      END,
      dest,jsonb_build_object('family_link_id',f.id)
    );

  ELSIF new.action='request_baptism' THEN
    FOR target IN
      SELECT person_id FROM public.tnt_accounts
      WHERE tnt_actions.community_can_for(person_id,'baptisms',3)
    LOOP
      PERFORM tnt_actions.community_notify(
        target,key,'baptisms','Una persona se interesa por el bautismo',
        'Podés acompañar su preparación.',
        dest||'&manage=1',jsonb_build_object('baptism_person',subject)
      );
    END LOOP;

  ELSIF new.action='save_baptism' THEN
    PERFORM tnt_actions.community_notify(
      subject,key||':'||new.id,'baptisms','Novedades de tu preparación',
      'El equipo actualizó los próximos pasos de tu bautismo.',
      dest,jsonb_build_object('baptism_person',subject)
    );
  END IF;

  RETURN new;
END;
$fn$;
create or replace function public.tnt_notification_resolved(p_note public.tnt_notifications) returns boolean
language plpgsql security definer set search_path='' as $fn$
declare tab text:=p_note.data->>'request_table'; req uuid; st text;
begin
 if coalesce(p_note.data->>'welcome_person','')~'^[0-9a-f-]{36}$' then
  req:=(p_note.data->>'welcome_person')::uuid;
  if p_note.title like '%pidió acompañamiento' or p_note.data->>'welcome_action'='requested' then
   return not tnt_actions.community_welcome_member(req) or not exists(select 1 from public.tnt_community_accompaniment where person_id=req and status='unassigned');
  end if;
  if p_note.title like '¿Podés acompañar%' or p_note.body like 'Administración te invitó como referente.%' then return true;end if;
  if p_note.data->>'welcome_action'='assigned' then
   return not exists(select 1 from public.tnt_community_accompaniment where person_id=req and status='accepted' and referent_id::text=p_note.data->>'assigned_ref' and assigned_at=(p_note.data->>'assigned_at')::timestamptz);
  end if;
 end if;
 if p_note.data->>'kind'='chat_message' then
  return exists(select 1 from public.tnt_chat_messages msg join public.tnt_chat_members m on m.thread_id=msg.thread_id and m.person_id=p_note.person_id where msg.id::text=p_note.data->>'message_id' and m.last_read_at>=msg.created_at);
 end if;
 if p_note.data ? 'staff_invitation_id' then
  return not exists(select 1 from public.tnt_staff_invitations i
   where i.id=(p_note.data->>'staff_invitation_id')::uuid and i.status='pending');
 end if;
 if p_note.event_id is not null and not exists(select 1 from public.tnt_events where id=p_note.event_id and status<>'cancelled') then return true;end if;
 if p_note.task_id is not null and not exists(select 1 from public.tnt_tasks where id=p_note.task_id and archived_at is null and status not in('completed')) then return true;end if;
 if p_note.title='🔔 No confirmaste tu asignación' then return true;end if;
 if (p_note.title='Nueva asignación' or p_note.data->>'kind'='assignment') and p_note.task_id is not null then return not exists(select 1 from public.tnt_task_assignees where task_id=p_note.task_id and person_id=p_note.person_id and assignment_status<>'declined');end if;
 if p_note.title='Necesita reemplazo' and p_note.task_id is not null then return not exists(select 1 from public.tnt_tasks where id=p_note.task_id and status='replacement');end if;
 if p_note.title='Actividad lista' and p_note.task_id is not null then return not exists(select 1 from public.tnt_tasks where id=p_note.task_id and status='ready');end if;
 if tab in('tnt_profile_change_requests','tnt_profile_link_requests','tnt_role_requests','tnt_access_requests','tnt_profile_public_requests') and coalesce(p_note.data->>'request_id','')~'^[0-9a-f-]{36}$' then
  req:=(p_note.data->>'request_id')::uuid;
  execute format('select status from public.%I where id=$1',tab) into st using req;
  return st is distinct from 'pending';
 end if;
 return false;
end;
$fn$;

-- A role change closes old requests without erasing their history or accepted accompaniment.
create or replace function tnt_actions.close_staff_welcome_request() returns trigger
language plpgsql security definer set search_path='' as $fn$
declare previous public.tnt_community_accompaniment%rowtype;
begin
 if new.staff_status='approved' or new.system_role='admin' then
  select * into previous from public.tnt_community_accompaniment where person_id=new.person_id and status in('unassigned','pending','declined') for update;
  if found then
   update public.tnt_community_accompaniment set status='closed' where person_id=new.person_id;
   insert into public.tnt_community_history(module,action,actor,subject_id,details)
   values('welcome','close_staff_welcome_request',public.tnt_current_person_id(),new.person_id::text,jsonb_build_object('before',to_jsonb(previous),'reason','staff_role'));
  end if;
 end if;
 return new;
end $fn$;
revoke all on function tnt_actions.close_staff_welcome_request() from public,anon,authenticated;
create trigger close_staff_welcome_request after insert or update of staff_status,system_role on public.tnt_accounts
 for each row execute function tnt_actions.close_staff_welcome_request();

do $cleanup$
declare previous public.tnt_community_accompaniment%rowtype;
begin
 for previous in select a.* from public.tnt_community_accompaniment a join public.tnt_accounts x on x.person_id=a.person_id
  where (x.staff_status='approved' or x.system_role='admin') and a.status in('unassigned','pending','declined') for update of a loop
  update public.tnt_community_accompaniment set status='closed' where person_id=previous.person_id;
  insert into public.tnt_community_history(module,action,actor,subject_id,details)
  values('welcome','close_staff_welcome_request',null,previous.person_id::text,jsonb_build_object('before',to_jsonb(previous),'reason','staff_role'));
 end loop;
 for previous in select a.* from public.tnt_community_accompaniment a join public.tnt_accounts r on r.person_id=a.referent_id
  join public.tnt_people p on p.id=r.person_id
  where a.status='pending' and tnt_actions.community_welcome_member(a.person_id) and r.enabled and p.active and (r.staff_status='approved' or r.system_role='admin') for update of a loop
  update public.tnt_community_accompaniment set status='accepted' where person_id=previous.person_id;
  insert into public.tnt_community_history(module,action,actor,subject_id,details)
  values('welcome','direct_referent_activated',previous.assigned_by,previous.person_id::text,jsonb_build_object('before',to_jsonb(previous),'assignment_mode','direct'));
 end loop;
end $cleanup$;
notify pgrst,'reload schema';
