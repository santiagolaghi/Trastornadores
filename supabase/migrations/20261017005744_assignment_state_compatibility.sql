-- Older merge functions used “confirmed”; all assignment writers share the accepted state.
create or replace function public.tnt_direct_activity_assignment() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.assignment_status in('assigned','read','confirmed') then
  new.assignment_status:='accepted';
  new.responded_at:=coalesce(new.responded_at,now());
 end if;
 return new;
end $$;

notify pgrst,'reload schema';
