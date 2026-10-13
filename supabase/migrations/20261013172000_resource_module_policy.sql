-- Organization resources follow Organization availability, including when Glosario is paused.
alter policy tnt_module_required on public.tnt_library_items
 using (public.tnt_module_available(coalesce(module,'glosario')))
 with check (public.tnt_module_available(coalesce(module,'glosario')));
notify pgrst,'reload schema';
