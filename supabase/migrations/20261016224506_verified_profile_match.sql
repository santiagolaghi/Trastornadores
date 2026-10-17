-- Corroborating data is compared inside the database and never returned to a client.
create function tnt_actions.profile_claim_matches(p_target uuid,p_birthday date,p_phone text,p_dni text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tnt_people p left join public.tnt_profile_private_fields f on f.person_id=p.id
 where p.id=p_target and p.active and p.birthday=p_birthday
  and not exists(select 1 from public.tnt_accounts a where a.person_id=p.id)
  and (length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'))>=8 and regexp_replace(p_phone,'[^0-9]','','g')=regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')
   or length(regexp_replace(coalesce(p_dni,''),'[^0-9]','','g'))>=7 and regexp_replace(p_dni,'[^0-9]','','g')=regexp_replace(coalesce(f.dni,''),'[^0-9]','','g')));
$$;
revoke all on function tnt_actions.profile_claim_matches(uuid,date,text,text) from public,anon,authenticated;
