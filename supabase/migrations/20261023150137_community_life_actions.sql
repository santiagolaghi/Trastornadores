create or replace function tnt_actions.community_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not tnt_actions.community_active_person(public.tnt_current_person_id()) then raise exception 'Completá tu perfil e iniciá sesión para continuar.' using errcode='42501';end if;
 if p_action in('save_module','save_grant','save_content') then return tnt_actions.community_action_manage(p_action,p_data);
 elsif p_action in('join_content','progress_content','leave_content','vote','consent') then return tnt_actions.community_action_participate(p_action,p_data);
 elsif p_action in('ask','answer','request_welcome','assign_referent','respond_referent','followup','request_family','review_family','request_baptism','save_baptism') then return tnt_actions.community_action_care(p_action,p_data);
 elsif p_action in('preferences','save_phrase','save_day','save_game','poll_report') then return tnt_actions.community_action_personal(p_action,p_data);
 else raise exception 'Acción no disponible.' using errcode='22023';end if;
end $$;
create or replace function public.tnt_community_action(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select tnt_actions.community_action(p_action,p_data)$$;
revoke all on function tnt_actions.community_action(text,jsonb),public.tnt_community_action(text,jsonb) from public,anon;
grant execute on function tnt_actions.community_action(text,jsonb),public.tnt_community_action(text,jsonb) to authenticated;
