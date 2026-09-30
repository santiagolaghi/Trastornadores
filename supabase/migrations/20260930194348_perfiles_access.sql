alter policy perfiles_admin_read on public.perfiles_registros using (public.tnt_has_access('perfiles','*','view'));
alter policy perfiles_admin_update on public.perfiles_registros using (public.tnt_has_access('perfiles','*','edit')) with check (public.tnt_has_access('perfiles','*','edit'));
alter policy perfiles_admin_delete on public.perfiles_registros using (public.tnt_has_access('perfiles','*','edit'));
