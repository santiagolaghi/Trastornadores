-- Cosmetic preferences only. Membership, roles and permissions keep their existing guards.
alter table public.tnt_accounts
 add column if not exists avatar_source text not null default 'google' check (avatar_source in ('google','custom')),
 add column if not exists avatar_sync boolean not null default true,
 add column if not exists avatar_google_url text;

update public.tnt_accounts
 set avatar_source=case when nullif(avatar_url,'') is not null and avatar_url !~* '^https://[a-z0-9.-]+\.googleusercontent\.com/' then 'custom' else 'google' end,
     avatar_sync=avatar_url is null or avatar_url='' or avatar_url ~* '^https://[a-z0-9.-]+\.googleusercontent\.com/',
     avatar_google_url=case when avatar_url ~* '^https://[a-z0-9.-]+\.googleusercontent\.com/' then avatar_url else null end;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('tnt-profile-photos','tnt-profile-photos',true,2097152,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Public portraits are readable by URL. Storage writes remain private to the owner's folder.
create policy tnt_profile_photos_insert on storage.objects for insert to authenticated
 with check (bucket_id='tnt-profile-photos' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy tnt_profile_photos_select on storage.objects for select to authenticated
 using (bucket_id='tnt-profile-photos' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy tnt_profile_photos_delete on storage.objects for delete to authenticated
 using (bucket_id='tnt-profile-photos' and (storage.foldername(name))[1]=(select auth.uid()::text));

create or replace function public.tnt_set_profile_photo(p_source text,p_path text default null,p_sync boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.tnt_accounts%rowtype; photo text; cached_google text;
begin
 if auth.uid() is null then raise exception 'Iniciá sesión para cambiar tu foto.' using errcode='42501';end if;
 select * into a from public.tnt_accounts where auth_user_id=auth.uid() and enabled for update;
 if not found then raise exception 'Tu cuenta no está habilitada.' using errcode='42501';end if;
 if p_source not in ('google','custom') or p_source is null then raise exception 'Elegí el origen de tu foto.' using errcode='22023';end if;
 cached_google=coalesce(nullif(auth.jwt()->'user_metadata'->>'avatar_url',''),nullif(auth.jwt()->'user_metadata'->>'picture',''),a.avatar_google_url);
 if cached_google !~* '^https://[a-z0-9.-]+\.googleusercontent\.com/' then cached_google=null;end if;
 if p_source='google' then
  photo=cached_google;
  if photo is null then raise exception 'Volvé a iniciar sesión con Google para usar esa foto.' using errcode='22023';end if;
 elsif p_path is null and a.avatar_source='custom' and nullif(a.avatar_url,'') is not null then
  photo=a.avatar_url;
 else
  if p_path is null or p_path !~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}\.(webp|jpg|png)$')
    or not exists(select 1 from storage.objects where bucket_id='tnt-profile-photos' and name=p_path) then
   raise exception 'Elegí y subí tu propia foto antes de guardar.' using errcode='42501';
  end if;
  photo='https://oeodnnomgiddkblnlzay.supabase.co/storage/v1/object/public/tnt-profile-photos/'||p_path;
 end if;
 update public.tnt_accounts set avatar_url=photo,avatar_source=p_source,
  avatar_sync=p_source='google' and coalesce(p_sync,true),avatar_google_url=cached_google
 where person_id=a.person_id and auth_user_id=auth.uid();
 return jsonb_build_object('avatar_url',photo,'avatar_source',p_source,'avatar_sync',p_source='google' and coalesce(p_sync,true),'avatar_google_url',cached_google);
end $$;
revoke all on function public.tnt_set_profile_photo(text,text,boolean) from public,anon;
grant execute on function public.tnt_set_profile_photo(text,text,boolean) to authenticated;
