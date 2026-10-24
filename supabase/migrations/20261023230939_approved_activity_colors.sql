-- Preserve existing highlights; accept more presets and strictly bounded custom RGB colors.
-- Authorization and all activity/team RPCs remain unchanged.
alter table public.tnt_tasks drop constraint tnt_tasks_feature_color_check;
alter table public.tnt_tasks add constraint tnt_tasks_feature_color_check
check (feature_color in ('lime','peach','lilac','blue','rose','lemon','mint','coral','teal','grape','sand','sky')
       or feature_color ~ '^#[0-9a-fA-F]{6}$');
