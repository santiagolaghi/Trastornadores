-- One Google identity continues an existing directory profile. No admin queue for verified claims.
create schema if not exists tnt_actions;
revoke all on schema tnt_actions from public,anon;
grant usage on schema tnt_actions to authenticated;
create table tnt_actions.profile_claims(
 auth_user_id uuid not null,source_person uuid not null,target_person uuid not null,
 transaction_id bigint not null,primary key(auth_user_id,source_person,target_person)
);
create table tnt_actions.profile_claim_attempts(auth_user_id uuid primary key,window_start timestamptz not null default now(),attempts integer not null default 0);
alter table tnt_actions.profile_claim_attempts enable row level security;
revoke all on tnt_actions.profile_claim_attempts from public,anon,authenticated;
alter table tnt_actions.profile_claims enable row level security;
revoke all on tnt_actions.profile_claims from public,anon,authenticated;

create function tnt_actions.can_link_request(p_request uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.tnt_is_admin() or exists(
  select 1 from public.tnt_profile_link_requests r join tnt_actions.profile_claims c
   on c.source_person=r.person_id and c.target_person=r.target_person_id
  where r.id=p_request and r.status='pending' and c.auth_user_id=auth.uid()
   and c.source_person=public.tnt_current_person_id() and c.transaction_id=txid_current());
$$;
revoke all on function tnt_actions.can_link_request(uuid) from public,anon,authenticated;

create function tnt_actions.profile_name(p_name text) returns text
language sql immutable set search_path='' as $$
 select trim(regexp_replace(lower(translate(coalesce(p_name,''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN')),'[^a-z0-9]+',' ','g'));
$$;
revoke all on function tnt_actions.profile_name(text) from public,anon,authenticated;

-- A match reveals only its public directory name, never contact data or profile answers.
create or replace function public.tnt_match_profile_names(p_name text,p_birthday date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare own uuid:=public.tnt_current_person_id();n text:=tnt_actions.profile_name(p_name);
begin
 if own is null or length(n)<7 or array_length(string_to_array(n,' '),1)<2 then return '[]';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'full_name',full_name)),'[]') from (
  select p.id,p.full_name from public.tnt_people p where p.active and p.id<>own
   and not exists(select 1 from public.tnt_accounts a where a.person_id=p.id)
   and (string_to_array(n,' ')<@string_to_array(tnt_actions.profile_name(p.full_name),' ')
    or string_to_array(tnt_actions.profile_name(p.full_name),' ')<@string_to_array(n,' '))
   and (p_birthday is null or p.birthday=p_birthday) order by p.full_name,p.id limit 3) matches);
end $$;


notify pgrst,'reload schema';
