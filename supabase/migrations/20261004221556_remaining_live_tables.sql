-- Keep administration, finance and communications synchronized across devices.
do $$declare t text;begin
 foreach t in array array['tnt_expenses','tnt_debts','tnt_cash_closures','tnt_camp_churches','tnt_camp_penalties','tnt_camp_sponsors','tnt_camp_notification_templates','tnt_camp_outbox','tnt_access_requests','tnt_role_requests','tnt_profile_change_requests','tnt_profile_link_requests','tnt_profile_public_requests','tnt_audit_log'] loop
  if to_regclass('public.'||t) is not null and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;
end $$;
