-- The service-only SECURITY INVOKER wrapper calls its private helper.
-- EXECUTE is already restricted to service_role; it also needs schema USAGE.
grant usage on schema tnt_actions to service_role;
