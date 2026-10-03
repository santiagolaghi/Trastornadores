CREATE OR REPLACE FUNCTION public.tnt_camp_public_register(p_slug text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.tnt_camp_editions; s public.tnt_camp_settings; ch public.tnt_camp_churches; plan public.tnt_camp_payment_plans; pid uuid; rid uuid; nm text; norm text; bd date; ph text; em text; answers jsonb; token uuid;begin
 select * into c from public.tnt_camp_editions where public_slug=p_slug;
 if c.id is null then raise exception 'Formulario no encontrado.' using errcode='22023'; end if;
 select * into s from public.tnt_camp_settings where camp_id=c.id;
 if not coalesce(s.form_open,false) or c.status in ('closed','archived') or (s.registration_deadline is not null and current_date>s.registration_deadline) then raise exception 'Las inscripciones están cerradas.' using errcode='22023'; end if;
 if (select count(*) from public.tnt_camp_registrations r where r.camp_id=c.id and r.deleted_at is null and r.status<>'cancelled')>=c.capacity then raise exception 'El cupo está completo.' using errcode='22023'; end if;
 nm:=nullif(trim(p_payload->>'full_name'),''); em:=lower(nullif(trim(p_payload->>'email'),'')); ph:=nullif(trim(p_payload->>'phone'),''); bd:=nullif(p_payload->>'birthday','')::date; answers:=coalesce(p_payload->'answers','{}'::jsonb);
 if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(answers) is distinct from 'object'
    or coalesce((p_payload->>'consent')::boolean,false) is not true then
  raise exception 'Confirmá la autorización y revisá los datos del formulario.' using errcode='22023';
 end if;
 if length(coalesce(nm,''))<2 or length(nm)>150 or bd is null or bd>current_date
    or length(regexp_replace(coalesce(ph,''),'[^0-9]','','g'))<6
    or coalesce(p_payload->>'sex','') not in ('F','M') then
  raise exception 'Completá nombre, nacimiento, WhatsApp y género.' using errcode='22023';
 end if;
 if nullif(p_payload->>'church_id','') is null
    or not exists(select 1 from public.tnt_camp_churches where id=(p_payload->>'church_id')::uuid and active) then
  raise exception 'Elegí una iglesia disponible.' using errcode='22023';
 end if;
 if exists(select 1 from public.tnt_camp_payment_plans where camp_id=c.id and active)
    and not exists(select 1 from public.tnt_camp_payment_plans where id=nullif(p_payload->>'plan_id','')::uuid and camp_id=c.id and active) then
  raise exception 'Elegí un plan de pago disponible.' using errcode='22023';
 end if;
 if exists(select 1 from public.tnt_camp_form_fields f where f.camp_id=c.id and f.active and f.required
    and (answers->f.field_key is null or answers->f.field_key='null'::jsonb
         or nullif(trim(answers->>f.field_key),'') is null
         or f.field_type='checkbox' and answers->f.field_key is distinct from 'true'::jsonb)) then
  raise exception 'Completá las preguntas obligatorias del formulario.' using errcode='22023';
 end if;
 if exists(select 1 from public.tnt_camp_form_fields f where f.camp_id=c.id and f.active and f.field_type='select'
    and nullif(answers->>f.field_key,'') is not null
    and not exists(select 1 from jsonb_array_elements_text(f.options) opt where opt=answers->>f.field_key)) then
  raise exception 'Elegí una opción disponible en las preguntas del formulario.' using errcode='22023';
 end if;

 if nm is null or em is null or position('@' in em)<2 then raise exception 'Revisá nombre y email.' using errcode='22023'; end if;
 norm:=lower(trim(regexp_replace(nm,'[[:space:]]+',' ','g')));
 if nullif(p_payload->>'church_id','') is not null then select * into ch from public.tnt_camp_churches where id=(p_payload->>'church_id')::uuid and active; end if;
 if nullif(p_payload->>'plan_id','') is not null then select * into plan from public.tnt_camp_payment_plans where id=(p_payload->>'plan_id')::uuid and camp_id=c.id and active; end if;
 if exists(select 1 from public.tnt_camp_registrations r where r.camp_id=c.id and r.deleted_at is null and lower(r.email)=em) then raise exception 'Ya existe una inscripción con ese email para este campamento.' using errcode='23505'; end if;
 select id into pid from public.tnt_people where active and birthday is not distinct from bd and lower(trim(regexp_replace(full_name,'[[:space:]]+',' ','g')))=norm limit 1;
 if pid is null then
   pid:=gen_random_uuid();
   insert into public.tnt_people(id,full_name,normalized_name,birthday,phone,sex,source,active)
   values(pid,nm,norm,bd,ph,coalesce(nullif(p_payload->>'sex',''),'U'),'campamento',true);

 end if;
 rid:=gen_random_uuid(); token:=gen_random_uuid();
 insert into public.tnt_camp_registrations(id,camp_id,person_id,email,church_id,payment_plan_id,public_token,form_submitted_at,congregation,fee,status,"authorization",notes,answers,document_no)
 values(rid,c.id,pid,em,ch.id,plan.id,token,now(),coalesce(ch.name,''),coalesce(plan.total_amount,c.fee),'pending',false,coalesce(p_payload->>'notes',''),answers,coalesce(p_payload->>'document_no',''));
 perform public.tnt_camp_queue_reg_notification(rid,'registration_received',null,'form');
 insert into public.tnt_notifications(person_id,title,body,href,data)
 select a.person_id,'Nueva inscripción · '||c.name,nm||' completó el formulario.','/campamento/',jsonb_build_object('camp_id',c.id,'registration_id',rid)
 from public.tnt_accounts a where a.system_role='admin' and a.enabled
 on conflict do nothing;
 return jsonb_build_object('registration_id',rid,'token',token,'camp',c.name,'name',nm,'balance',public.tnt_camp_current_balance(rid));
end $function$;

revoke all on function public.tnt_camp_public_register(text,jsonb) from public;
grant execute on function public.tnt_camp_public_register(text,jsonb) to anon,authenticated;
