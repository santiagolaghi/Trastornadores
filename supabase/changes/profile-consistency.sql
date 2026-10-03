-- Contact edits must not re-enroll someone who was removed from an EFE list.
create or replace function public.tnt_sync_efe_membership() returns trigger
language plpgsql set search_path='' as $$
declare gid uuid; years integer;
begin
 if not new.active then return new;end if;
 if tg_op='UPDATE' and new.sex is not distinct from old.sex and new.birthday is not distinct from old.birthday then return new;end if;
 if new.sex='M' then
  select id into gid from public.tnt_efe_groups where code='varones';
 elsif new.sex='F' and new.birthday is not null then
  years:=extract(year from age(current_date,new.birthday));
  select id into gid from public.tnt_efe_groups where code=case when years>=18 then 'mujeres18' when years between 12 and 14 then 'mujeres12_14' when years between 15 and 17 then 'mujeres15_17' end;
 end if;
 update public.tnt_efe_memberships set active=false where person_id=new.id and active and group_id is distinct from gid;
 if gid is not null then
  insert into public.tnt_efe_memberships(person_id,group_id,active) values(new.id,gid,true) on conflict(person_id,group_id) do update set active=true;
 end if;
 return new;
end $$;
revoke all on function public.tnt_sync_efe_membership() from public,anon,authenticated;

create or replace function public.tnt_save_central_profile(p_person uuid,p_values jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.tnt_people%rowtype; v_first text; v_last text; v_full text; v_birthday date; v_sex text; v_phone text; v_instagram text;
begin
 if public.tnt_current_person_id() is null or not (public.tnt_is_admin() or public.tnt_can_action('perfiles','edit','*')) then raise exception 'No tenés permiso para editar Perfiles.' using errcode='42501';end if;
 select * into p from public.tnt_people where id=p_person for update;
 if not found then raise exception 'Perfil no encontrado.';end if;
 v_first:=coalesce(nullif(trim(p_values->>'first_name'),''),nullif(p.first_name,''),split_part(p.full_name,' ',1));
 v_last:=coalesce(nullif(trim(p_values->>'last_name'),''),nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1)));
 v_full:=coalesce(nullif(trim(p_values->>'full_name'),''),trim(v_first||' '||v_last));
 v_birthday:=case when p_values ? 'birthday' then nullif(p_values->>'birthday','')::date else p.birthday end;
 v_sex:=coalesce(nullif(p_values->>'sex',''),p.sex);
 v_phone:=case when p_values ? 'phone' then nullif(trim(p_values->>'phone'),'') else p.phone end;
 v_instagram:=case when p_values ? 'instagram' then nullif(trim(p_values->>'instagram'),'') else p.instagram end;
 if length(v_full) not between 2 and 201 or length(v_first)>100 or length(v_last)>100 then raise exception 'Revisá el nombre.';end if;
 if v_birthday is not null and (v_birthday>current_date or v_birthday<date '1900-01-01') then raise exception 'Revisá la fecha de nacimiento.';end if;
 if coalesce(v_sex,'') not in('M','F','U') then raise exception 'Revisá el sexo.';end if;
 if v_phone is not null and (length(regexp_replace(v_phone,'[^0-9]','','g')) not between 6 and 20 or length(v_phone)>30) then raise exception 'Revisá el WhatsApp.';end if;
 if length(coalesce(v_instagram,''))>100 then raise exception 'Revisá Instagram.';end if;
 update public.tnt_people set first_name=v_first,last_name=v_last,full_name=v_full,
  normalized_name=lower(trim(regexp_replace(v_full,'[[:space:]]+',' ','g'))),birthday=v_birthday,phone=v_phone,instagram=v_instagram,sex=v_sex,profile_updated_at=now(),updated_at=now() where id=p_person;
 return p_person;
end $$;
revoke all on function public.tnt_save_central_profile(uuid,jsonb) from public,anon;
grant execute on function public.tnt_save_central_profile(uuid,jsonb) to authenticated;

create or replace function public.tnt_audit_profile_update() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb; proposed jsonb;
begin
 previous:=jsonb_build_object('full_name',old.full_name,'first_name',old.first_name,'last_name',old.last_name,'birthday',old.birthday,'sex',old.sex,'phone',old.phone,'instagram',old.instagram,'active',old.active);
 proposed:=jsonb_build_object('full_name',new.full_name,'first_name',new.first_name,'last_name',new.last_name,'birthday',new.birthday,'sex',new.sex,'phone',new.phone,'instagram',new.instagram,'active',new.active);
 if previous is distinct from proposed then
  insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details) values(public.tnt_current_person_id(),'profile',new.id,'UPDATE',jsonb_build_object('old',previous,'new',proposed));
 end if;
 return new;
end $$;
revoke all on function public.tnt_audit_profile_update() from public,anon,authenticated;
create trigger profile_update_audit after update on public.tnt_people for each row execute function public.tnt_audit_profile_update();
