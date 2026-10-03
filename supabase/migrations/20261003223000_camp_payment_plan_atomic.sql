-- One transaction preserves the old plan if any installment is invalid.
create or replace function public.tnt_camp_save_payment_plan(
  p_camp uuid, p_values jsonb, p_installments jsonb, p_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_total numeric;
  v_sum numeric;
  v_count integer;
begin
  if not (public.tnt_is_admin() or public.tnt_can_action('campamento','payments','*')) then
    raise exception 'No tenés permiso para configurar planes de pago.' using errcode='42501';
  end if;
  if jsonb_typeof(p_values) is distinct from 'object'
     or jsonb_typeof(p_installments) is distinct from 'array'
     or jsonb_array_length(p_installments)>100 then
    raise exception 'Revisá los datos del plan.' using errcode='22023';
  end if;
  if length(trim(coalesce(p_values->>'name','')))<1 then
    raise exception 'El plan necesita un nombre.' using errcode='22023';
  end if;
  v_total:=(p_values->>'total_amount')::numeric;
  if v_total is null or v_total<0 or v_total::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Revisá el importe total.' using errcode='22023';
  end if;
  perform 1 from public.tnt_camp_editions where id=p_camp;
  if not found then raise exception 'Edición no disponible.' using errcode='22023'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_installments) as x(amount numeric,due_date date,grace_days integer)
    where amount is null or amount<0 or amount::text in ('NaN','Infinity','-Infinity')
      or due_date is null or coalesce(grace_days,0)<0
  ) then raise exception 'Revisá los importes, fechas y días de gracia de las cuotas.' using errcode='22023'; end if;
  select count(*),sum(amount) into v_count,v_sum
    from jsonb_to_recordset(p_installments) as x(amount numeric);
  if v_count>0 and abs(v_sum-v_total)>.005 then
    raise exception 'La suma de las cuotas debe coincidir con el total del plan.' using errcode='22023';
  end if;
  if p_id is not null then
    select id into v_id from public.tnt_camp_payment_plans where id=p_id and camp_id=p_camp for update;
    if not found then raise exception 'Plan no disponible en esta edición.' using errcode='22023'; end if;
    update public.tnt_camp_payment_plans
      set name=trim(p_values->>'name'),total_amount=v_total,
          description=coalesce(p_values->>'description',''),
          active=coalesce((p_values->>'active')::boolean,true),updated_at=now()
      where id=v_id;
  else
    insert into public.tnt_camp_payment_plans(camp_id,name,total_amount,description,active)
      values(p_camp,trim(p_values->>'name'),v_total,coalesce(p_values->>'description',''),
        coalesce((p_values->>'active')::boolean,true)) returning id into v_id;
  end if;
  delete from public.tnt_camp_plan_installments where plan_id=v_id;
  insert into public.tnt_camp_plan_installments(plan_id,installment_no,label,amount,due_date,grace_days)
    select v_id,ord::integer,coalesce(nullif(trim(item->>'label'),''),'Cuota '||ord),
      (item->>'amount')::numeric,(item->>'due_date')::date,coalesce((item->>'grace_days')::integer,0)
    from jsonb_array_elements(p_installments) with ordinality as x(item,ord);
  return v_id;
end $$;
revoke all on function public.tnt_camp_save_payment_plan(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.tnt_camp_save_payment_plan(uuid,jsonb,jsonb,uuid) to authenticated;
