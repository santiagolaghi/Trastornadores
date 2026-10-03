create table public.tnt_profile_archive_state (
 person_id uuid primary key references public.tnt_people(id),
 account_enabled boolean,
 saturday_active boolean not null default false,
 efe_members uuid[] not null default '{}',
 archived_at timestamptz not null default now()
);
alter table public.tnt_profile_archive_state enable row level security;
revoke all on public.tnt_profile_archive_state from anon,authenticated;
grant select on public.tnt_profile_archive_state to authenticated;
create policy profile_archive_read on public.tnt_profile_archive_state for select to authenticated using(public.tnt_is_admin());

create or replace function public.tnt_set_profile_active(p_person uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare p public.tnt_people%rowtype; s public.tnt_profile_archive_state%rowtype; actor uuid:=public.tnt_current_person_id();
begin
 if actor is null or not (public.tnt_is_admin() or public.tnt_can_action('perfiles','delete','*')) then
  raise exception 'No tenés permiso para archivar o restaurar perfiles.' using errcode='42501';
 end if;
 if p_active is null then raise exception 'Elegí el estado del perfil';end if;
 select * into p from public.tnt_people where id=p_person for update;
 if not found then raise exception 'Perfil no encontrado';end if;
 if p_person=actor and not p_active then raise exception 'No podés archivar tu propio perfil desde acá.';end if;
 if not public.tnt_is_admin() and exists(select 1 from public.tnt_accounts where person_id=p_person) then raise exception 'Los perfiles con cuenta Google los archiva o restaura un administrador TNT.' using errcode='42501';end if;
 if p.data_notes ? 'linked_to' then raise exception 'Este registro ya está vinculado a otro perfil.';end if;
 if p.active=p_active then return;end if;
 if not p_active then
  insert into public.tnt_profile_archive_state(person_id,account_enabled,saturday_active,efe_members)
   values(p_person,(select enabled from public.tnt_accounts where person_id=p_person),
    coalesce((select active from public.tnt_saturday_members where person_id=p_person),false),
    array(select id from public.tnt_efe_memberships where person_id=p_person and active))
   on conflict(person_id) do update set account_enabled=excluded.account_enabled,saturday_active=excluded.saturday_active,efe_members=excluded.efe_members,archived_at=now();
  update public.tnt_accounts set enabled=false where person_id=p_person;
  update public.tnt_saturday_members set active=false where person_id=p_person;
  update public.tnt_efe_memberships set active=false where person_id=p_person;
 else
  select * into s from public.tnt_profile_archive_state where person_id=p_person;
  if found then
   update public.tnt_accounts set enabled=s.account_enabled where person_id=p_person and s.account_enabled is not null;
   update public.tnt_saturday_members set active=s.saturday_active where person_id=p_person;
   update public.tnt_efe_memberships set active=true where person_id=p_person and id=any(s.efe_members);
   delete from public.tnt_profile_archive_state where person_id=p_person;
  end if;
 end if;
 update public.tnt_people set active=p_active,updated_at=now() where id=p_person;
 insert into public.tnt_audit_log(person_id,entity_type,entity_id,action,details)
  values(actor,'profile',p_person,case when p_active then 'profile_restored' else 'profile_archived' end,jsonb_build_object('name',p.full_name,'history_preserved',true));
end $$;
revoke all on function public.tnt_set_profile_active(uuid,boolean) from public,anon;
grant execute on function public.tnt_set_profile_active(uuid,boolean) to authenticated;
