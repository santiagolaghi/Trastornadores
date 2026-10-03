-- Serialize allocations through their sponsor so concurrent assignments respect the budget.
create or replace function private.tnt_camp_sponsor_budget_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare sponsor public.tnt_camp_sponsors; registration public.tnt_camp_registrations; allocated numeric;
begin
 if tg_table_name='tnt_camp_sponsors' then
  if new.budget<0 or new.budget::text in ('NaN','Infinity','-Infinity') then
   raise exception 'El aporte disponible debe ser un importe positivo o cero.' using errcode='22023';
  end if;
  if tg_op='UPDATE' and new.camp_id<>old.camp_id then
   raise exception 'No se puede mover un padrino a otra edición.' using errcode='22023';
  end if;
  select coalesce(sum(amount),0) into allocated from public.tnt_camp_sponsorships where sponsor_id=new.id;
  if new.budget>0 and allocated>new.budget and (tg_op='INSERT' or new.budget is distinct from old.budget) then
   raise exception 'El aporte no puede ser menor que la ayuda ya asignada.' using errcode='22023';
  end if;
  return new;
 end if;
 select * into sponsor from public.tnt_camp_sponsors
 where id=case when tg_op='DELETE' then old.sponsor_id else new.sponsor_id end for update;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' and (new.sponsor_id<>old.sponsor_id or new.registration_id<>old.registration_id) then
  raise exception 'Quitá la asignación antes de cambiar su padrino o acampante.' using errcode='22023';
 end if;
 select * into registration from public.tnt_camp_registrations where id=new.registration_id;
 if sponsor.id is null or not sponsor.active or registration.id is null or registration.deleted_at is not null
    or registration.status='cancelled' or registration.camp_id<>sponsor.camp_id then
  raise exception 'La ayuda requiere un padrino activo y un acampante de la misma edición.' using errcode='22023';
 end if;
 if new.amount<=0 or new.amount::text in ('NaN','Infinity','-Infinity') then
  raise exception 'El importe de la ayuda debe ser positivo.' using errcode='22023';
 end if;
 select coalesce(sum(amount),0) into allocated from public.tnt_camp_sponsorships
 where sponsor_id=new.sponsor_id and id<>new.id;
 if sponsor.budget>0 and allocated+new.amount>sponsor.budget then
  raise exception 'La ayuda supera el aporte disponible del padrino.' using errcode='22023';
 end if;
 return new;
end $$;
revoke all on function private.tnt_camp_sponsor_budget_guard() from public,anon,authenticated;
drop trigger if exists camp_sponsor_budget_guard on public.tnt_camp_sponsors;
create trigger camp_sponsor_budget_guard before insert or update on public.tnt_camp_sponsors
for each row execute function private.tnt_camp_sponsor_budget_guard();
drop trigger if exists camp_sponsorship_budget_guard on public.tnt_camp_sponsorships;
create trigger camp_sponsorship_budget_guard before insert or update or delete on public.tnt_camp_sponsorships
for each row execute function private.tnt_camp_sponsor_budget_guard();
