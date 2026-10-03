create or replace function public.tnt_profile_fields() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select value from public.tnt_settings where key='profile_fields'),'{"instagram":{"visible":true,"required":false},"dni":{"visible":true,"required":false}}'::jsonb);
$$;
revoke all on function public.tnt_profile_fields() from public,anon;
grant execute on function public.tnt_profile_fields() to authenticated;
create or replace function public.tnt_request_profile_change(p_values jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.tnt_current_person_id(); p public.tnt_people%rowtype; proposed jsonb; previous jsonb; rid uuid; fields jsonb;
begin
 if pid is null then raise exception 'Iniciá sesión' using errcode='42501'; end if;
 select * into p from public.tnt_people where id=pid for update;
 if not p.active or not exists(select 1 from public.tnt_accounts where person_id=pid and enabled) then raise exception 'La cuenta no está habilitada' using errcode='42501';end if;
 if nullif(trim(p_values->>'first_name'),'') is null or nullif(trim(p_values->>'last_name'),'') is null then raise exception 'Completá nombre y apellido'; end if;
 if coalesce(p_values->>'sex','') not in ('M','F') then raise exception 'Elegí Mujer o Varón';end if;
 if nullif(p_values->>'birthday','') is null or (p_values->>'birthday')::date>current_date or (p_values->>'birthday')::date<date '1900-01-01' then raise exception 'Revisá la fecha de nacimiento';end if;
 if length(regexp_replace(coalesce(p_values->>'phone',''),'[^0-9]','','g'))<6 then raise exception 'Revisá el WhatsApp';end if;
 if coalesce(p_values->>'dni','')<>'' and (p_values->>'dni') !~ '^[0-9]{6,10}$' then raise exception 'Revisá el DNI';end if;
 fields:=public.tnt_profile_fields();
 if fields->'instagram'->>'visible' is distinct from 'false' and fields->'instagram'->>'required'='true' and nullif(trim(p_values->>'instagram'),'') is null then raise exception 'Completá Instagram';end if;
 if fields->'dni'->>'visible' is distinct from 'false' and fields->'dni'->>'required'='true' and nullif(trim(p_values->>'dni'),'') is null then raise exception 'Completá DNI';end if;
 proposed:=jsonb_build_object('first_name',initcap(trim(p_values->>'first_name')),'last_name',initcap(trim(p_values->>'last_name')),'birthday',p_values->>'birthday','sex',p_values->>'sex','phone',trim(p_values->>'phone'),'instagram',coalesce(trim(p_values->>'instagram'),''),'dni',coalesce(p_values->>'dni',''));
 previous:=jsonb_build_object('first_name',coalesce(nullif(p.first_name,''),split_part(p.full_name,' ',1)),'last_name',coalesce(nullif(p.last_name,''),trim(substr(p.full_name,length(split_part(p.full_name,' ',1))+1))),'birthday',coalesce(p.birthday::text,''),'sex',p.sex,'phone',coalesce(p.phone,''),'instagram',coalesce(p.instagram,''),'dni',coalesce(p.data_notes->>'dni',''));
 if proposed=previous then raise exception 'No cambiaste tus datos personales';end if;
 update public.tnt_profile_change_requests set status='cancelled' where person_id=pid and status='pending';
 insert into public.tnt_profile_change_requests(person_id,before_values,proposed_values) values(pid,previous,proposed) returning id into rid;
 return rid;
end $$;
revoke all on function public.tnt_request_profile_change(jsonb) from public,anon;
grant execute on function public.tnt_request_profile_change(jsonb) to authenticated;
