create table public.tnt_profile_public_requests (
 id uuid primary key default gen_random_uuid(),person_id uuid not null references public.tnt_people(id),
 before_values jsonb not null,proposed_values jsonb not null,
 status text not null default 'pending' check(status in('pending','approved','rejected','cancelled')),
 created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references public.tnt_people(id)
);
create unique index profile_public_pending on public.tnt_profile_public_requests(person_id) where status='pending';
alter table public.tnt_profile_public_requests enable row level security;
revoke all on public.tnt_profile_public_requests from anon,authenticated;
grant select on public.tnt_profile_public_requests to authenticated;
create policy profile_public_read on public.tnt_profile_public_requests for select to authenticated using(public.tnt_is_admin());
create or replace function public.tnt_notify_public_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.tnt_notifications(person_id,title,body,href,data)
 select person_id,'Datos recibidos desde Perfiles','El formulario público coincide con un perfil existente. Verificá quién envió los datos antes de aprobarlos.','/admin/?tab=requests',jsonb_build_object('request_id',new.id,'request_table','tnt_profile_public_requests') from public.tnt_accounts where system_role='admin' and enabled;
 return new;
end $$;
revoke all on function public.tnt_notify_public_profile() from public,anon,authenticated;
create trigger profile_public_notice after insert on public.tnt_profile_public_requests for each row execute function public.tnt_notify_public_profile();

create or replace function public.tnt_create_public_profile(p_first_name text,p_last_name text,p_birthday date,p_instagram text,p_phone text,p_gender text,p_consent boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare name text; norm text; proposed jsonb; previous jsonb; p public.tnt_people%rowtype; rid uuid; matches integer;
begin
 if p_consent is distinct from true then raise exception 'Necesitamos tu autorización.';end if;
 if length(trim(coalesce(p_first_name,''))) not between 2 and 100 or length(trim(coalesce(p_last_name,''))) not between 2 and 100 then raise exception 'Revisá nombre y apellido.';end if;
 if p_birthday is null or p_birthday<date '1900-01-01' or p_birthday>current_date then raise exception 'Revisá la fecha de nacimiento.';end if;
 if coalesce(p_gender,'') not in ('Mujer','Varón') then raise exception 'Elegí Mujer o Varón.';end if;
 if length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) not between 6 and 20 or length(p_phone)>30 then raise exception 'Revisá el WhatsApp.';end if;
 if length(coalesce(p_instagram,''))>100 then raise exception 'Revisá Instagram.';end if;
 name:=initcap(trim(regexp_replace(p_first_name,'[[:space:]]+',' ','g')))||' '||initcap(trim(regexp_replace(p_last_name,'[[:space:]]+',' ','g')));
 norm:=regexp_replace(translate(lower(name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(norm||':'||p_birthday::text,0));
 select count(*) into matches from public.tnt_people where birthday=p_birthday and not (coalesce(data_notes,'{}') ? 'linked_to') and regexp_replace(translate(lower(full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')=norm;
 if matches>1 then raise exception 'Hay más de un registro con esos datos. Un administrador debe revisar los perfiles antes de continuar.';end if;
 if matches=0 then
  insert into public.tnt_people(full_name,normalized_name,birthday,sex,phone,source,active,first_name,last_name,instagram,profile_consent,profile_created_at,profile_updated_at)
  values(name,norm,p_birthday,case p_gender when 'Mujer' then 'F' else 'M' end,trim(p_phone),'profiles',true,initcap(trim(p_first_name)),initcap(trim(p_last_name)),nullif(trim(p_instagram),''),true,now(),now()) returning id into rid;
  return rid;
 end if;
 select * into p from public.tnt_people where birthday=p_birthday and not (coalesce(data_notes,'{}') ? 'linked_to') and regexp_replace(translate(lower(full_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')=norm for update;
 previous:=jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),'birthday',p.birthday::text,'sex',p.sex,'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''));
 proposed:=jsonb_build_object('first_name',initcap(trim(p_first_name)),'last_name',initcap(trim(p_last_name)),'birthday',p_birthday::text,'sex',case p_gender when 'Mujer' then 'F' else 'M' end,'phone',trim(p_phone),'instagram',coalesce(trim(p_instagram),''));
 if proposed=previous then return gen_random_uuid();end if;
 -- A public form never edits a registered person's data or account.
 insert into public.tnt_profile_public_requests(person_id,before_values,proposed_values) values(p.id,previous,proposed)
  on conflict(person_id) where status='pending' do nothing returning id into rid;
 if rid is null then select id into rid from public.tnt_profile_public_requests where person_id=p.id and status='pending';end if;
 return rid;
end $$;
revoke all on function public.tnt_create_public_profile(text,text,date,text,text,text,boolean) from public;
grant execute on function public.tnt_create_public_profile(text,text,date,text,text,text,boolean) to anon,authenticated;

create or replace function public.tnt_review_public_profile(p_request uuid,p_approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r public.tnt_profile_public_requests%rowtype; p public.tnt_people%rowtype; current_values jsonb; actor uuid:=public.tnt_current_person_id();
begin
 if actor is null or not public.tnt_is_admin() then raise exception 'Solo administradores pueden revisar estos datos' using errcode='42501';end if;
 if p_approve is null then raise exception 'Elegí una respuesta';end if;
 select * into r from public.tnt_profile_public_requests where id=p_request for update;
 if not found or r.status<>'pending' then raise exception 'La solicitud ya fue resuelta';end if;
 if p_approve then
  select * into p from public.tnt_people where id=r.person_id for update;
  if not p.active then raise exception 'El perfil está archivado. Revisá si corresponde restaurarlo antes de aprobar datos.';end if;
  current_values:=jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),'birthday',p.birthday::text,'sex',p.sex,'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''));
  if current_values is distinct from r.before_values then raise exception 'El perfil cambió después del envío. Conservá los datos actuales y solicitá un nuevo envío.';end if;
  perform public.tnt_save_central_profile(r.person_id,r.proposed_values);
 end if;
 update public.tnt_profile_public_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=actor where id=r.id;
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details) values(actor,'profile',r.person_id,case when p_approve then 'public_profile_approved' else 'public_profile_rejected' end,jsonb_build_object('request_id',r.id,'before',r.before_values,'proposed',r.proposed_values));
end $$;
revoke all on function public.tnt_review_public_profile(uuid,boolean) from public,anon;
grant execute on function public.tnt_review_public_profile(uuid,boolean) to authenticated;
