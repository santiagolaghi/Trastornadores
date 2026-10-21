-- Run against the linked TNT database. All successful writes are rolled back.
begin;
do $$
declare a public.tnt_accounts%rowtype;
begin
 select * into a from public.tnt_accounts x where x.enabled and x.system_role<>'admin'
  and x.staff_status='community' and x.onboarding_completed_at is not null and x.auth_user_id is not null
  and jsonb_array_length(public.tnt_profile_missing_values(public.tnt_profile_values(x.person_id)))=0 limit 1;
 if not found then raise exception 'No completed Community account is available for this check';end if;
 perform set_config('request.jwt.claim.sub',a.auth_user_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
end $$;
set local role authenticated;
do $$
declare blocked boolean;pid uuid:=public.tnt_current_person_id();
begin
 blocked:=false;
 begin perform public.tnt_request_membership(true,'Líder');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Legacy membership RPC accepted a Community request';end if;
 blocked:=false;
 begin update public.tnt_accounts set staff_status='pending' where person_id=pid;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Account update accepted a Community request';end if;
 blocked:=false;
 begin insert into public.tnt_access_requests(person_id,module) values(pid,'organizacion');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Module request accepted a Community account';end if;
 if public.tnt_profile_context()->'values'->>'_ministry_role'<>'Comunidad' then raise exception 'Stale profile role';end if;
end $$;
reset role;
rollback;
select 'Community: legacy RPC, account transition and module requests rejected; profile role current; transaction rolled back' as verification;
