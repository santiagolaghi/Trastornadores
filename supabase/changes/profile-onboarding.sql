CREATE OR REPLACE FUNCTION public.tnt_complete_onboarding(p_staff boolean, p_role text DEFAULT NULL::text, p_birthday date DEFAULT NULL::date, p_sex text DEFAULT 'U'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_person uuid:=public.tnt_current_person_id(); v_account public.tnt_accounts%rowtype;
begin
 if v_person is null then raise exception 'Iniciá sesión nuevamente' using errcode='42501'; end if;
 select * into v_account from public.tnt_accounts where person_id=v_person for update;
 if p_birthday is null or p_birthday>current_date or p_birthday<date '1900-01-01' then raise exception 'Revisá tu fecha de nacimiento'; end if;
 if p_sex is null or p_sex not in ('M','F') then raise exception 'Elegí una opción válida'; end if;
 if p_staff and coalesce(p_role,'') not in ('Pastor/a','Líder','Timoteo','Colaborador') then raise exception 'Elegí tu función en el equipo'; end if;
 update public.tnt_people set birthday=coalesce(p_birthday,birthday),sex=p_sex where id=v_person;
 update public.tnt_role_requests set status='cancelled' where person_id=v_person and status='pending';
 if p_staff and (v_account.staff_status<>'approved' or p_role is distinct from v_account.ministry_role) then
  insert into public.tnt_role_requests(person_id,requested_role) values(v_person,p_role);
 end if;
 update public.tnt_accounts set requested_ministry_role=case when p_staff then p_role else null end,
  staff_status=case when staff_status='approved' then staff_status when p_staff then 'pending' else 'community' end,
  onboarding_completed_at=now() where person_id=v_person;
end $function$
