-- Community spaces share the central identity. Writes go through checked, versioned actions.
create table public.tnt_community_modules (
 id text primary key check(id in('welcome','birthdays','bible','challenges','questions','families','baptisms','polls','games','daily')),
 title text not null,description text not null default '',enabled boolean not null default true,
 config jsonb not null default '{}',version integer not null default 1,updated_at timestamptz not null default now()
);
create table public.tnt_community_grants (
 person_id uuid references public.tnt_people(id) on delete cascade,module text references public.tnt_community_modules(id),
 level integer not null check(level between 1 and 3),primary key(person_id,module)
);
create table public.tnt_community_content (
 id uuid primary key default gen_random_uuid(),module text not null references public.tnt_community_modules(id),
 title text not null check(length(title) between 1 and 150),description text not null default '' check(length(description)<=2000),
 body text not null default '' check(length(body)<=20000),status text not null default 'draft' check(status in('draft','scheduled','published','archived')),
 audience text not null default 'all' check(audience in('all','staff','selected','families')),
 starts_at timestamptz,ends_at timestamptz,config jsonb not null default '{}' check(octet_length(config::text)<1000000),
 version integer not null default 1,created_by uuid references public.tnt_people(id),updated_by uuid references public.tnt_people(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create index tnt_community_content_module_status on public.tnt_community_content(module,status,starts_at);
create table public.tnt_community_audience (
 content_id uuid references public.tnt_community_content(id) on delete cascade,person_id uuid references public.tnt_people(id) on delete cascade,
 primary key(content_id,person_id)
);
create index tnt_community_audience_person on public.tnt_community_audience(person_id,content_id);
create table public.tnt_community_enrollments (
 content_id uuid references public.tnt_community_content(id) on delete cascade,person_id uuid references public.tnt_people(id) on delete cascade,
 status text not null default 'active' check(status in('active','completed','left')),completed_steps integer[] not null default '{}',
 snapshot_steps jsonb not null default '[]',content_version integer not null,joined_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(content_id,person_id)
);
create index tnt_community_enrollments_person on public.tnt_community_enrollments(person_id,content_id);
create table public.tnt_community_votes (
 content_id uuid references public.tnt_community_content(id) on delete cascade,person_id uuid references public.tnt_people(id) on delete cascade,
 option_index integer not null check(option_index between 1 and 12),created_at timestamptz not null default now(),primary key(content_id,person_id)
);
create table public.tnt_community_questions (
 id uuid primary key default gen_random_uuid(),person_id uuid not null references public.tnt_people(id) on delete cascade,
 question text not null check(length(question) between 5 and 5000),visibility text not null default 'private' check(visibility in('private','community')),
 status text not null default 'open' check(status in('open','answered','published','archived')),answer text not null default '' check(length(answer)<=20000),
 reference text not null default '',answered_by uuid references public.tnt_people(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index tnt_community_questions_person on public.tnt_community_questions(person_id,created_at desc);
create table public.tnt_community_accompaniment (
 person_id uuid primary key references public.tnt_people(id) on delete cascade,referent_id uuid references public.tnt_people(id),
 status text not null default 'unassigned' check(status in('unassigned','pending','accepted','declined')),
 assigned_by uuid references public.tnt_people(id),assigned_at timestamptz,responded_at timestamptz,
 check(person_id is distinct from referent_id)
);
create index tnt_community_accompaniment_referent on public.tnt_community_accompaniment(referent_id,status);
create table public.tnt_community_followups (
 id uuid primary key default gen_random_uuid(),person_id uuid references public.tnt_people(id) on delete cascade,
 author_id uuid not null references public.tnt_people(id),contact_on date not null default current_date,
 note text not null check(length(note) between 1 and 5000),shared boolean not null default false,created_at timestamptz not null default now()
);
create index tnt_community_followups_person on public.tnt_community_followups(person_id,created_at desc);
create table public.tnt_community_family_links (
 id uuid primary key default gen_random_uuid(),caregiver_id uuid not null references public.tnt_people(id) on delete cascade,
 requested_name text not null check(length(requested_name) between 2 and 150),relationship text not null check(length(relationship) between 2 and 80),
 member_id uuid references public.tnt_people(id),status text not null default 'pending' check(status in('pending','verified','rejected')),
 reviewed_by uuid references public.tnt_people(id),created_at timestamptz not null default now(),reviewed_at timestamptz,
 check(status<>'verified' or member_id is not null),check(caregiver_id is distinct from member_id)
);
create index tnt_community_family_links_caregiver on public.tnt_community_family_links(caregiver_id,status);
create index tnt_community_family_links_member on public.tnt_community_family_links(member_id,status);
create table public.tnt_community_consents (
 content_id uuid references public.tnt_community_content(id) on delete cascade,link_id uuid references public.tnt_community_family_links(id) on delete cascade,
 accepted boolean not null,body_snapshot text not null,answered_at timestamptz not null default now(),primary key(content_id,link_id)
);
create table public.tnt_community_baptisms (
 person_id uuid primary key references public.tnt_people(id) on delete cascade,
 status text not null default 'interested' check(status in('interested','preparing','ready','completed')),
 requested_at timestamptz not null default now(),completed_on date,updated_by uuid references public.tnt_people(id),updated_at timestamptz not null default now(),
 check((status='completed')=(completed_on is not null))
);
create table public.tnt_community_preferences (
 person_id uuid primary key references public.tnt_people(id) on delete cascade,birthday_public boolean not null default false,
 daily_push boolean not null default false,reminders boolean not null default true,reading jsonb not null default '{}',updated_at timestamptz not null default now()
);
create table public.tnt_community_phrases (
 id uuid primary key default gen_random_uuid(),text text not null check(length(text) between 5 and 500),author text not null default '' check(length(author)<=120),
 active boolean not null default true,created_by uuid references public.tnt_people(id),updated_at timestamptz not null default now()
);
create table public.tnt_community_days (
 day date primary key,reference text not null check(reference ~ '^[1-3]?[A-Z]{2,3}\.[1-9][0-9]{0,2}(\.[1-9][0-9]{0,2}(-[1-9][0-9]{0,2})?)?$'),
 version integer not null default 128 check(version in(128,2664,149,1782,127)),phrase text not null,author text not null default '',
 manual boolean not null default false,updated_by uuid references public.tnt_people(id),created_at timestamptz not null default now()
);
create table public.tnt_community_game_runs (
 id uuid primary key,person_id uuid not null references public.tnt_people(id) on delete cascade,kind text not null check(kind in('order','characters','testament','pairs','timeline','quiz')),
 difficulty text not null check(difficulty in('easy','normal','hard')),score integer not null check(score between 0 and 100000),
 won boolean not null,lives integer not null check(lives between 0 and 3),duration integer not null check(duration between 0 and 3600),created_at timestamptz not null default now()
);
create index tnt_community_game_runs_person on public.tnt_community_game_runs(person_id,created_at desc);
create table public.tnt_community_history (
 id bigint generated always as identity primary key,module text not null,action text not null,actor uuid references public.tnt_people(id),
 subject_id text,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create index tnt_community_history_module on public.tnt_community_history(module,created_at desc);
create table public.tnt_community_notice_keys (
 source_key text not null,person_id uuid references public.tnt_people(id) on delete cascade,created_at timestamptz not null default now(),primary key(source_key,person_id)
);

insert into public.tnt_community_modules(id,title,description,config) values
 ('welcome','Bienvenida y acompañamiento','Hay un lugar para vos. Conocé a quienes te acompañan.', '{"intro":"Nos alegra que estés acá. Podés pedir acompañamiento y compartir cómo venís viviendo tu camino en TNT."}'),
 ('birthdays','Cumpleaños y fechas especiales','Celebramos la vida y lo que compartimos.','{}'),
 ('bible','Biblia y planes','Lecturas para descubrir y vivir la Palabra.','{}'),
 ('challenges','Desafíos semanales','Pequeños pasos que se vuelven parte de la vida.','{}'),
 ('questions','Preguntas de fe','Un espacio para preguntar, escuchar y aprender.','{}'),
 ('families','Familias TNT','Información, encuentros y contacto para las familias.','{"intro":"Un espacio para padres y familiares. Solicitá la vinculación con la persona que acompañás; el equipo revisará la solicitud.","contact":"Contactá al equipo de TNT para consultas sobre encuentros y autorizaciones."}'),
 ('baptisms','Bautismos','Conocé este paso de fe y acercate a la preparación.','{"intro":"El bautismo es un paso público de fe y de pertenencia a la comunidad de Jesús. Acercate al equipo para conversar sobre su significado y la preparación en TNT.","references":"Mateo 28:19–20 · Romanos 6:3–4","faq":"¿Cómo empiezo? Podés expresar tu interés desde acá y el equipo te acompañará con los próximos encuentros."}'),
 ('polls','Encuestas y votaciones','Tu voz ayuda a construir comunidad.','{}'),
 ('games','Dinámicas y juegos','Aprendemos y compartimos jugando.','{}'),
 ('daily','Para hoy','Una lectura y una frase para acompañar tu día.','{"notification_hour":9,"timezone":"America/Argentina/Buenos_Aires"}');
insert into public.tnt_community_phrases(text) values
 ('Un pequeño gesto de amor puede hacer una gran diferencia en el día de alguien.'),
 ('Hoy también podés escuchar con atención, acompañar y empezar de nuevo.'),
 ('No hace falta tener todas las respuestas para dar el próximo paso con fe.'),
 ('La gratitud nos ayuda a reconocer el bien que ya está creciendo a nuestro alrededor.'),
 ('Hacer lugar para otra persona también transforma nuestro propio corazón.'),
 ('La esperanza se cuida con pequeños pasos, un día a la vez.'),
 ('Compartí lo que tenés: tu tiempo, tu escucha y tus ganas de hacer el bien.'),
 ('Date un momento para orar, respirar y mirar con amor lo que tenés por delante.'),
 ('El camino se hace más liviano cuando aprendemos a acompañarnos.'),
 ('Un comienzo sencillo también puede ser el inicio de algo valioso.'),
 ('Hoy puede ser un buen día para agradecer y acercarte a alguien.'),
 ('Crecer también es aprender a pedir ayuda y recibirla.');


-- New tables are closed to Data API access until the checked workflow functions exist.
do $$declare t text;begin
 foreach t in array array['modules','grants','content','audience','enrollments','votes','questions','accompaniment','followups','family_links','consents','baptisms','preferences','phrases','days','game_runs','history','notice_keys'] loop
  execute format('alter table public.tnt_community_%I enable row level security',t);
  execute format('revoke all on public.tnt_community_%I from anon,authenticated',t);
 end loop;
end $$;
-- Cover references used in account lifecycle checks and staff reporting.
create index tnt_community_grants_module on public.tnt_community_grants(module);
create index tnt_community_content_creator on public.tnt_community_content(created_by);
create index tnt_community_content_editor on public.tnt_community_content(updated_by);
create index tnt_community_votes_person on public.tnt_community_votes(person_id);
create index tnt_community_questions_responder on public.tnt_community_questions(answered_by);
create index tnt_community_accompaniment_assigner on public.tnt_community_accompaniment(assigned_by);
create index tnt_community_followups_author on public.tnt_community_followups(author_id);
create index tnt_community_family_reviewer on public.tnt_community_family_links(reviewed_by);
create index tnt_community_consents_link on public.tnt_community_consents(link_id);
create index tnt_community_baptisms_editor on public.tnt_community_baptisms(updated_by);
create index tnt_community_phrases_creator on public.tnt_community_phrases(created_by);
create index tnt_community_days_editor on public.tnt_community_days(updated_by);
create index tnt_community_history_actor on public.tnt_community_history(actor);
create index tnt_community_notice_keys_person on public.tnt_community_notice_keys(person_id);
