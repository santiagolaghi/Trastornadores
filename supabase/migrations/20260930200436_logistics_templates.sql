alter table public.tnt_template_items drop constraint if exists tnt_template_items_task_type_check;
alter table public.tnt_template_items add constraint tnt_template_items_task_type_check check(task_type in ('simple','complex','logistics'));
alter table public.tnt_template_items add column if not exists reference_url text;
alter table public.tnt_template_items add column if not exists budget_estimated numeric check(budget_estimated>=0);
