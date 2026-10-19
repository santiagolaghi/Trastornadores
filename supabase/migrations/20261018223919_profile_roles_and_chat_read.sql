-- Admin role changes also support central profiles that have not signed in yet.
-- This does not link an auth identity or alter system administrator permissions.
create or replace function public.tnt_review_staff(p_person uuid, p_role text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.tnt_is_admin() then raise exception 'Solo un administrador puede revisar roles' using errcode='42501'; end if;
 if p_role is not null and p_role not in ('Pastor/a','Líder','Timoteo','Colaborador') then raise exception 'Elegí un rol válido'; end if;
 perform 1 from public.tnt_people where id=p_person and active and coalesce(data_notes->>'deleted_at','')='' for update;
 if not found then raise exception 'Primero restaurá el perfil para cambiar su rol'; end if;
 insert into public.tnt_accounts(person_id) values(p_person) on conflict(person_id) do nothing;
 update public.tnt_accounts set ministry_role=p_role,staff_status=case when p_role is null then 'community' else 'approved' end,
  staff_reviewed_by=public.tnt_current_person_id(),staff_reviewed_at=now(),onboarding_completed_at=coalesce(onboarding_completed_at,now()) where person_id=p_person;
 update public.tnt_role_requests set status=case when p_role is null then 'rejected' else 'approved' end,
  approved_role=p_role,reviewed_by=public.tnt_current_person_id(),reviewed_at=now() where person_id=p_person and status='pending';
 if p_role is not null then
  insert into public.tnt_access_grants(person_id,module,scope,access_level,enabled,granted_by)
  values(p_person,'organizacion','*','view',true,public.tnt_current_person_id()) on conflict(person_id,module,scope) do nothing;
 end if;
 update public.tnt_staff_invitations set status='accepted',responded_at=now() where person_id=p_person and status='pending';
end $$;

-- A trigger must be able to evaluate its private role guard without exposing
-- the private schema to browser roles. Its identity/role restrictions remain intact.
alter function private.tnt_protect_chat_membership() security definer;

-- An invoker operation: RLS still governs both the received message and receipt.
-- Use the last fetched message's server timestamp, never the phone's clock.
create or replace function public.tnt_mark_chat_read(p_thread uuid, p_message uuid)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare cutoff timestamptz; receipt timestamptz;
begin
 if not public.tnt_can_read_thread(p_thread) or not public.tnt_profile_is_complete() or not public.tnt_module_available('chat') then
  raise exception 'No tenés acceso a esta conversación' using errcode='42501';
 end if;
 select created_at into cutoff from public.tnt_chat_messages where id=p_message and thread_id=p_thread;
 if cutoff is null then raise exception 'El mensaje ya no está disponible'; end if;
 update public.tnt_chat_members set last_read_at=greatest(coalesce(last_read_at,'-infinity'::timestamptz),cutoff)
 where thread_id=p_thread and person_id=public.tnt_current_person_id() returning last_read_at into receipt;
 if receipt is null and not public.tnt_is_admin() then raise exception 'No se pudo guardar el visto' using errcode='42501'; end if;
 return coalesce(receipt,cutoff);
end $$;
revoke all on function public.tnt_mark_chat_read(uuid,uuid) from public,anon;
grant execute on function public.tnt_mark_chat_read(uuid,uuid) to authenticated;

-- Keep the existing dispatcher credentials/queue and cut the maximum polling wait.
select cron.alter_job(job_id:=jobid,schedule:='5 seconds')
from cron.job where jobname='tnt-camp-notifications-every-2-min';
