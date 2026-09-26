-- Shared communication and permissions. Existing messages remain unchanged.
alter table public.tnt_chat_messages add column if not exists body_rich text;
alter table public.tnt_chat_messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.tnt_chat_messages add constraint tnt_attachments_array check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=10);
alter table public.tnt_task_comments add column if not exists body_rich text;
alter table public.tnt_task_comments add column if not exists kind text not null default 'question' check(kind in ('question','note'));
alter table public.tnt_task_comments add column if not exists resolved_at timestamptz;
alter table public.tnt_task_comments add column if not exists resolved_by uuid references public.tnt_people(id);

create or replace function public.tnt_can_manage_module(p_module text)
returns boolean language sql stable security invoker set search_path='' as $$
 select public.tnt_has_access(p_module,'*','edit')
$$;
revoke all on function public.tnt_can_manage_module(text) from public,anon;
grant execute on function public.tnt_can_manage_module(text) to authenticated;

create or replace function private.tnt_protect_chat_message()
returns trigger language plpgsql security invoker set search_path='' as $$
declare f jsonb;
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.thread_id<>old.thread_id or new.person_id is distinct from old.person_id) then raise exception 'No se puede mover un mensaje.' using errcode='42501'; end if;
 if auth.uid() is not null and not public.tnt_can_read_thread(new.thread_id) then raise exception 'No tenés acceso a esta conversación.' using errcode='42501'; end if;
 if new.reply_to is not null and not exists(select 1 from public.tnt_chat_messages where id=new.reply_to and thread_id=new.thread_id) then raise exception 'La respuesta debe pertenecer a la misma conversación.'; end if;
 if new.attachment_url like 'tnt-chat-files/%' and split_part(new.attachment_url,'/',2)<>new.thread_id::text then raise exception 'Archivo de otra conversación.'; end if;
 for f in select value from jsonb_array_elements(new.attachments) loop
   if coalesce(f->>'path','') not like 'tnt-chat-files/'||new.thread_id::text||'/%' then raise exception 'Archivo de otra conversación.'; end if;
 end loop;
 if length(coalesce(new.body,''))>10000 or length(coalesce(new.body_rich,''))>100000 then raise exception 'Mensaje demasiado largo.'; end if;
 return new;
end $$;

update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf','text/plain','audio/mpeg','audio/mp4','audio/webm','audio/ogg','video/webm','video/mp4','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] where id='tnt-chat-files';

insert into public.tnt_chat_threads(title,thread_type,is_pinned)
select 'TNT General','general',true where not exists(select 1 from public.tnt_chat_threads where thread_type='general' and not is_archived);

drop policy if exists tnt_comments_update on public.tnt_task_comments;
create policy tnt_comments_update on public.tnt_task_comments for update to authenticated
using(exists(select 1 from public.tnt_tasks t where t.id=task_id and public.tnt_can_manage_event(t.event_id)))
with check(exists(select 1 from public.tnt_tasks t where t.id=task_id and public.tnt_can_manage_event(t.event_id)));
drop policy if exists tnt_comments_insert on public.tnt_task_comments;
create policy tnt_comments_insert on public.tnt_task_comments for insert to authenticated with check(
 person_id=public.tnt_current_person_id() and exists(select 1 from public.tnt_tasks t where t.id=task_id and
 (public.tnt_can_manage_event(t.event_id) or (kind='question' and (
 exists(select 1 from public.tnt_task_assignees a where a.task_id=t.id and a.person_id=public.tnt_current_person_id()) or
 exists(select 1 from public.tnt_event_members m where m.event_id=t.event_id and m.person_id=public.tnt_current_person_id()))))));
-- Event chats also include people assigned to an activity, even before event membership is reconciled.
create policy tnt_threads_assignee_insert on public.tnt_chat_threads for insert to authenticated with check(
 thread_type='event' and created_by=public.tnt_current_person_id() and exists(select 1 from public.tnt_tasks t join public.tnt_task_assignees a on a.task_id=t.id where t.event_id=tnt_chat_threads.event_id and a.person_id=public.tnt_current_person_id()));

-- Buffet now uses the same authenticated TNT session. The original database is kept intact.
create table public.tnt_cash_closures (
 id uuid default gen_random_uuid() not null,
 shift_id uuid not null,
 sales_total numeric default 0 not null,
 cash_sales numeric default 0 not null,
 transfer_total numeric default 0 not null,
 fiado_total numeric default 0 not null,
 expense_total numeric default 0 not null,
 expected_cash numeric default 0 not null,
 counted_cash numeric default 0 not null,
 difference numeric default 0 not null,
 profit_estimate numeric default 0 not null,
 closed_by text not null,
 notes text default ''::text not null,
 created_at timestamp with time zone default now() not null
);
create table public.tnt_debt_payments (
 id uuid default gen_random_uuid() not null,
 debt_id uuid not null,
 payment_shift_id uuid not null,
 amount numeric not null,
 method text not null,
 collected_by text not null,
 created_at timestamp with time zone default now() not null
);
create table public.tnt_debts (
 id uuid default gen_random_uuid() not null,
 sale_id uuid not null,
 customer_name text not null,
 amount numeric not null,
 status text default 'pending'::text not null,
 paid_method text,
 paid_at timestamp with time zone,
 created_at timestamp with time zone default now() not null
);
create table public.tnt_expenses (
 id uuid default gen_random_uuid() not null,
 shift_id uuid not null,
 category text default 'Otro'::text not null,
 description text not null,
 amount numeric not null,
 method text default 'cash'::text not null,
 created_by text not null,
 created_at timestamp with time zone default now() not null
);
create table public.tnt_menu_items (
 id uuid default gen_random_uuid() not null,
 shift_id uuid not null,
 product_id uuid not null,
 price numeric not null,
 cost numeric default 0 not null,
 initial_qty integer default 0 not null,
 remaining_qty integer default 0 not null,
 active boolean default true not null,
 sort_order integer default 0 not null,
 created_at timestamp with time zone default now() not null
);
create table public.tnt_orders (
 id uuid default gen_random_uuid() not null,
 order_no bigint generated by default as identity not null,
 shift_id uuid not null,
 sale_id uuid not null,
 customer_name text default ''::text not null,
 summary text not null,
 notes text default ''::text not null,
 status text default 'new'::text not null,
 cashier_name text not null,
 taken_by text,
 taken_at timestamp with time zone,
 ready_at timestamp with time zone,
 delivered_at timestamp with time zone,
 created_at timestamp with time zone default now() not null
);
create table public.tnt_products (
 id uuid default gen_random_uuid() not null,
 name text not null,
 emoji text default '🍽️'::text not null,
 category text default 'General'::text not null,
 image_url text,
 active boolean default true not null,
 requires_prep boolean default true not null,
 kind text default 'product'::text not null,
 combo_components jsonb default '[]'::jsonb not null,
 default_price numeric default 0 not null,
 default_cost numeric default 0 not null,
 created_at timestamp with time zone default now() not null,
 updated_at timestamp with time zone default now() not null
);
create table public.tnt_sale_items (
 id uuid default gen_random_uuid() not null,
 sale_id uuid not null,
 menu_item_id uuid,
 product_id uuid,
 product_name text not null,
 emoji text default '🍽️'::text not null,
 qty integer not null,
 unit_price numeric not null,
 unit_cost numeric default 0 not null,
 line_total numeric not null,
 requires_prep boolean default true not null
);
create table public.tnt_sales (
 id uuid default gen_random_uuid() not null,
 shift_id uuid not null,
 customer_name text default ''::text not null,
 total numeric not null,
 total_cost numeric default 0 not null,
 method text not null,
 received numeric default 0 not null,
 change_amount numeric default 0 not null,
 notes text default ''::text not null,
 cashier_name text not null,
 created_at timestamp with time zone default now() not null
);
create table public.tnt_buffet_settings (
 key text not null,
 value text not null,
 updated_at timestamp with time zone default now() not null
);
create table public.tnt_shifts (
 id uuid default gen_random_uuid() not null,
 shift_date date not null,
 status text default 'planning'::text not null,
 opening_cash numeric default 0 not null,
 notes text default ''::text not null,
 opened_by text,
 opened_at timestamp with time zone,
 closed_by text,
 closed_at timestamp with time zone,
 created_at timestamp with time zone default now() not null
);
alter table public.tnt_buffet_settings add constraint tnt_buffet_settings_pkey PRIMARY KEY (key);
alter table public.tnt_menu_items add constraint tnt_menu_items_cost_check CHECK ((cost >= (0)::numeric));
alter table public.tnt_menu_items add constraint tnt_menu_items_initial_qty_check CHECK ((initial_qty >= 0));
alter table public.tnt_menu_items add constraint tnt_menu_items_pkey PRIMARY KEY (id);
alter table public.tnt_menu_items add constraint tnt_menu_items_price_check CHECK ((price >= (0)::numeric));
alter table public.tnt_menu_items add constraint tnt_menu_items_remaining_qty_check CHECK ((remaining_qty >= 0));
alter table public.tnt_menu_items add constraint tnt_menu_items_shift_id_product_id_key UNIQUE (shift_id, product_id);
alter table public.tnt_shifts add constraint tnt_shifts_opening_cash_check CHECK ((opening_cash >= (0)::numeric));
alter table public.tnt_shifts add constraint tnt_shifts_pkey PRIMARY KEY (id);
alter table public.tnt_shifts add constraint tnt_shifts_shift_date_key UNIQUE (shift_date);
alter table public.tnt_shifts add constraint tnt_shifts_status_check CHECK ((status = ANY (ARRAY['planning'::text, 'open'::text, 'closed'::text])));
alter table public.tnt_products add constraint tnt_products_default_cost_check CHECK ((default_cost >= (0)::numeric));
alter table public.tnt_products add constraint tnt_products_default_price_check CHECK ((default_price >= (0)::numeric));
alter table public.tnt_products add constraint tnt_products_kind_check CHECK ((kind = ANY (ARRAY['product'::text, 'combo'::text])));
alter table public.tnt_products add constraint tnt_products_pkey PRIMARY KEY (id);
alter table public.tnt_expenses add constraint tnt_expenses_amount_check CHECK ((amount > (0)::numeric));
alter table public.tnt_expenses add constraint tnt_expenses_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'transfer'::text])));
alter table public.tnt_expenses add constraint tnt_expenses_pkey PRIMARY KEY (id);
alter table public.tnt_debts add constraint tnt_debts_amount_check CHECK ((amount > (0)::numeric));
alter table public.tnt_debts add constraint tnt_debts_paid_method_check CHECK ((paid_method = ANY (ARRAY['cash'::text, 'transfer'::text])));
alter table public.tnt_debts add constraint tnt_debts_pkey PRIMARY KEY (id);
alter table public.tnt_debts add constraint tnt_debts_sale_id_key UNIQUE (sale_id);
alter table public.tnt_debts add constraint tnt_debts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text])));
alter table public.tnt_debt_payments add constraint tnt_debt_payments_amount_check CHECK ((amount > (0)::numeric));
alter table public.tnt_debt_payments add constraint tnt_debt_payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'transfer'::text])));
alter table public.tnt_debt_payments add constraint tnt_debt_payments_pkey PRIMARY KEY (id);
alter table public.tnt_sales add constraint tnt_sales_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'transfer'::text, 'fiado'::text])));
alter table public.tnt_sales add constraint tnt_sales_pkey PRIMARY KEY (id);
alter table public.tnt_sales add constraint tnt_sales_total_check CHECK ((total >= (0)::numeric));
alter table public.tnt_sales add constraint tnt_sales_total_cost_check CHECK ((total_cost >= (0)::numeric));
alter table public.tnt_sale_items add constraint tnt_sale_items_line_total_check CHECK ((line_total >= (0)::numeric));
alter table public.tnt_sale_items add constraint tnt_sale_items_pkey PRIMARY KEY (id);
alter table public.tnt_sale_items add constraint tnt_sale_items_qty_check CHECK ((qty > 0));
alter table public.tnt_sale_items add constraint tnt_sale_items_unit_price_check CHECK ((unit_price >= (0)::numeric));
alter table public.tnt_orders add constraint tnt_orders_order_no_key UNIQUE (order_no);
alter table public.tnt_orders add constraint tnt_orders_pkey PRIMARY KEY (id);
alter table public.tnt_orders add constraint tnt_orders_sale_id_key UNIQUE (sale_id);
alter table public.tnt_orders add constraint tnt_orders_status_check CHECK ((status = ANY (ARRAY['new'::text, 'taken'::text, 'ready'::text, 'delivered'::text, 'cancelled'::text])));
alter table public.tnt_cash_closures add constraint tnt_cash_closures_pkey PRIMARY KEY (id);
alter table public.tnt_cash_closures add constraint tnt_cash_closures_shift_id_key UNIQUE (shift_id);
alter table public.tnt_menu_items add constraint tnt_menu_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES tnt_products(id);
alter table public.tnt_menu_items add constraint tnt_menu_items_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES tnt_shifts(id) ON DELETE CASCADE;
alter table public.tnt_expenses add constraint tnt_expenses_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES tnt_shifts(id);
alter table public.tnt_debts add constraint tnt_debts_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES tnt_sales(id);
alter table public.tnt_debt_payments add constraint tnt_debt_payments_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES tnt_debts(id);
alter table public.tnt_debt_payments add constraint tnt_debt_payments_payment_shift_id_fkey FOREIGN KEY (payment_shift_id) REFERENCES tnt_shifts(id);
alter table public.tnt_sales add constraint tnt_sales_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES tnt_shifts(id);
alter table public.tnt_sale_items add constraint tnt_sale_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES tnt_menu_items(id);
alter table public.tnt_sale_items add constraint tnt_sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES tnt_products(id);
alter table public.tnt_sale_items add constraint tnt_sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES tnt_sales(id) ON DELETE CASCADE;
alter table public.tnt_orders add constraint tnt_orders_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES tnt_sales(id) ON DELETE CASCADE;
alter table public.tnt_orders add constraint tnt_orders_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES tnt_shifts(id);
alter table public.tnt_cash_closures add constraint tnt_cash_closures_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES tnt_shifts(id);
alter table public.tnt_cash_closures enable row level security;
revoke all on public.tnt_cash_closures from anon;
grant select,insert,update,delete on public.tnt_cash_closures to authenticated;
create policy buffet_read on public.tnt_cash_closures for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_cash_closures for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
alter table public.tnt_debt_payments enable row level security;
revoke all on public.tnt_debt_payments from anon;
grant select,insert,update,delete on public.tnt_debt_payments to authenticated;
create policy buffet_read on public.tnt_debt_payments for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_debt_payments for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
alter table public.tnt_debts enable row level security;
revoke all on public.tnt_debts from anon;
grant select,insert,update,delete on public.tnt_debts to authenticated;
create policy buffet_read on public.tnt_debts for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_debts for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
alter table public.tnt_expenses enable row level security;
revoke all on public.tnt_expenses from anon;
grant select,insert,update,delete on public.tnt_expenses to authenticated;
create policy buffet_read on public.tnt_expenses for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_expenses for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
alter table public.tnt_menu_items enable row level security;
revoke all on public.tnt_menu_items from anon;
grant select,insert,update,delete on public.tnt_menu_items to authenticated;
create policy buffet_read on public.tnt_menu_items for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_menu_items for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
alter table public.tnt_orders enable row level security;
revoke all on public.tnt_orders from anon;
grant select,insert,update,delete on public.tnt_orders to authenticated;
create policy buffet_read on public.tnt_orders for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_orders for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
alter table public.tnt_products enable row level security;
revoke all on public.tnt_products from anon;
grant select,insert,update,delete on public.tnt_products to authenticated;
create policy buffet_read on public.tnt_products for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_products for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
alter table public.tnt_sale_items enable row level security;
revoke all on public.tnt_sale_items from anon;
grant select,insert,update,delete on public.tnt_sale_items to authenticated;
create policy buffet_read on public.tnt_sale_items for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_sale_items for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
alter table public.tnt_sales enable row level security;
revoke all on public.tnt_sales from anon;
grant select,insert,update,delete on public.tnt_sales to authenticated;
create policy buffet_read on public.tnt_sales for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_sales for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
alter table public.tnt_buffet_settings enable row level security;
revoke all on public.tnt_buffet_settings from anon;
grant select,insert,update,delete on public.tnt_buffet_settings to authenticated;
create policy buffet_read on public.tnt_buffet_settings for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_buffet_settings for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
alter table public.tnt_shifts enable row level security;
revoke all on public.tnt_shifts from anon;
grant select,insert,update,delete on public.tnt_shifts to authenticated;
create policy buffet_read on public.tnt_shifts for select to authenticated using(public.tnt_has_access('buffet','*','view'));
create policy buffet_write on public.tnt_shifts for all to authenticated using(public.tnt_has_access('buffet','*','edit')) with check(public.tnt_has_access('buffet','*','edit'));
grant usage on sequence public.tnt_orders_order_no_seq to authenticated;
create index tnt_sale_items_sale_idx on public.tnt_sale_items(sale_id);
create index tnt_orders_shift_idx on public.tnt_orders(shift_id,created_at);
create index tnt_menu_shift_idx on public.tnt_menu_items(shift_id);
create table public.tnt_buffet_audit(id uuid primary key default gen_random_uuid(),actor uuid references public.tnt_people(id),action text not null,snapshot jsonb not null,created_at timestamptz not null default now());
alter table public.tnt_buffet_audit enable row level security;
grant select,insert on public.tnt_buffet_audit to authenticated;
revoke all on public.tnt_buffet_audit from anon;
create policy buffet_audit_read on public.tnt_buffet_audit for select to authenticated using(public.tnt_has_access('buffet','*','manage'));
create policy buffet_audit_insert on public.tnt_buffet_audit for insert to authenticated with check(actor=public.tnt_current_person_id() and public.tnt_has_access('buffet','*','edit'));
CREATE OR REPLACE FUNCTION public.tnt_claim_order(p_order_id uuid, p_staff text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare v public.tnt_orders;
begin
  if not public.tnt_has_access('buffet','*','edit') then raise exception 'No tenés permiso para modificar Buffet.' using errcode='42501'; end if;
  update public.tnt_orders set status='taken',taken_by=p_staff,taken_at=now()
  where id=p_order_id and status='new' returning * into v;
  if not found then select * into v from public.tnt_orders where id=p_order_id; end if;
  if v.id is null then raise exception 'Orden inexistente'; end if;
  return to_jsonb(v);
end; $function$
;
revoke all on function public.tnt_claim_order(uuid,text) from public,anon;
grant execute on function public.tnt_claim_order(uuid,text) to authenticated;
CREATE OR REPLACE FUNCTION public.tnt_close_shift(p_shift_id uuid, p_counted_cash numeric, p_staff text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_shift public.tnt_shifts;
  v_sales numeric; v_cash numeric; v_transfer numeric; v_fiado numeric; v_cost numeric;
  v_exp numeric; v_cash_exp numeric; v_transfer_exp numeric;
  v_debt_cash numeric; v_debt_transfer numeric;
  v_expected numeric; v_profit numeric; v_close public.tnt_cash_closures;
begin
  if not public.tnt_has_access('buffet','*','edit') then raise exception 'No tenés permiso para modificar Buffet.' using errcode='42501'; end if;
  select * into v_shift from public.tnt_shifts where id=p_shift_id for update;
  if not found then raise exception 'Jornada inexistente'; end if;
  select coalesce(sum(total),0),coalesce(sum(total) filter(where method='cash'),0),coalesce(sum(total) filter(where method='transfer'),0),coalesce(sum(total) filter(where method='fiado'),0),coalesce(sum(total_cost),0)
    into v_sales,v_cash,v_transfer,v_fiado,v_cost from public.tnt_sales where shift_id=p_shift_id;
  select coalesce(sum(amount),0),coalesce(sum(amount) filter(where method='cash'),0),coalesce(sum(amount) filter(where method='transfer'),0)
    into v_exp,v_cash_exp,v_transfer_exp from public.tnt_expenses where shift_id=p_shift_id;
  select coalesce(sum(amount) filter(where method='cash'),0),coalesce(sum(amount) filter(where method='transfer'),0)
    into v_debt_cash,v_debt_transfer from public.tnt_debt_payments where payment_shift_id=p_shift_id;
  v_expected := v_shift.opening_cash + v_cash + v_debt_cash - v_cash_exp;
  v_profit := v_sales - v_cost - v_exp;
  insert into public.tnt_cash_closures(shift_id,sales_total,cash_sales,transfer_total,fiado_total,expense_total,expected_cash,counted_cash,difference,profit_estimate,closed_by,notes)
  values(p_shift_id,v_sales,v_cash,v_transfer+v_debt_transfer-v_transfer_exp,v_fiado,v_exp,v_expected,greatest(coalesce(p_counted_cash,0),0),greatest(coalesce(p_counted_cash,0),0)-v_expected,v_profit,p_staff,coalesce(p_notes,''))
  on conflict(shift_id) do update set sales_total=excluded.sales_total,cash_sales=excluded.cash_sales,transfer_total=excluded.transfer_total,fiado_total=excluded.fiado_total,expense_total=excluded.expense_total,expected_cash=excluded.expected_cash,counted_cash=excluded.counted_cash,difference=excluded.difference,profit_estimate=excluded.profit_estimate,closed_by=excluded.closed_by,notes=excluded.notes,created_at=now()
  returning * into v_close;
  update public.tnt_shifts set status='closed',closed_by=p_staff,closed_at=now() where id=p_shift_id;
  return to_jsonb(v_close);
end; $function$
;
revoke all on function public.tnt_close_shift(uuid,numeric,text,text) from public,anon;
grant execute on function public.tnt_close_shift(uuid,numeric,text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.tnt_copy_last_menu(p_shift_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare v_prev uuid; v_count integer;
begin
  if not public.tnt_has_access('buffet','*','edit') then raise exception 'No tenés permiso para modificar Buffet.' using errcode='42501'; end if;
  select s2.id into v_prev from public.tnt_shifts s2
  where s2.id<>p_shift_id and s2.shift_date < (select shift_date from public.tnt_shifts where id=p_shift_id)
  order by s2.shift_date desc limit 1;
  if v_prev is null then return 0; end if;
  insert into public.tnt_menu_items(shift_id,product_id,price,cost,initial_qty,remaining_qty,active,sort_order)
  select p_shift_id,product_id,price,cost,initial_qty,initial_qty,active,sort_order
  from public.tnt_menu_items where shift_id=v_prev
  on conflict(shift_id,product_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end; $function$
;
revoke all on function public.tnt_copy_last_menu(uuid) from public,anon;
grant execute on function public.tnt_copy_last_menu(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.tnt_create_sale(p_shift_id uuid, p_customer_name text, p_method text, p_received numeric, p_notes text, p_cashier text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_shift public.tnt_shifts; v_sale public.tnt_sales; v_order public.tnt_orders;
  v_item jsonb; v_mi record; v_qty integer; v_total numeric := 0; v_cost numeric := 0;
  v_prep_parts text[] := array[]::text[]; v_prep_count integer := 0; v_change numeric := 0;
  v_comp jsonb; v_comp_mi record;
begin
  if not public.tnt_has_access('buffet','*','edit') then raise exception 'No tenés permiso para modificar Buffet.' using errcode='42501'; end if;
  if p_method not in ('cash','transfer','fiado') then raise exception 'Método inválido'; end if;
  if coalesce(trim(p_cashier),'')='' then raise exception 'Falta operador'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Pedido vacío'; end if;
  if p_method='fiado' and coalesce(trim(p_customer_name),'')='' then raise exception 'El fiado necesita nombre'; end if;
  select * into v_shift from public.tnt_shifts where id=p_shift_id for update;
  if not found or v_shift.status<>'open' then raise exception 'La caja no está abierta'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(coalesce((v_item->>'qty')::integer,0),0);
    if v_qty<=0 then raise exception 'Cantidad inválida'; end if;
    select mi.id,mi.product_id,mi.price,mi.cost,mi.remaining_qty,mi.active,p.name,p.emoji,p.requires_prep,p.kind,p.combo_components
      into v_mi
    from public.tnt_menu_items mi join public.tnt_products p on p.id=mi.product_id
    where mi.id=(v_item->>'menu_item_id')::uuid and mi.shift_id=p_shift_id
    for update of mi;
    if not found or not v_mi.active then raise exception 'Producto no disponible'; end if;
    if v_mi.remaining_qty < v_qty then raise exception 'Stock insuficiente de %', v_mi.name; end if;
    update public.tnt_menu_items set remaining_qty=remaining_qty-v_qty where id=v_mi.id;

    if v_mi.kind='combo' then
      for v_comp in select * from jsonb_array_elements(v_mi.combo_components) loop
        select mi.id,mi.remaining_qty,p.name into v_comp_mi
        from public.tnt_menu_items mi join public.tnt_products p on p.id=mi.product_id
        where mi.shift_id=p_shift_id and mi.product_id=(v_comp->>'product_id')::uuid
        for update of mi;
        if not found then raise exception 'Falta componente del combo'; end if;
        if v_comp_mi.remaining_qty < ((v_comp->>'qty')::integer * v_qty) then raise exception 'Stock insuficiente de %', v_comp_mi.name; end if;
        update public.tnt_menu_items set remaining_qty=remaining_qty-((v_comp->>'qty')::integer*v_qty) where id=v_comp_mi.id;
      end loop;
    end if;

    v_total := v_total + v_mi.price*v_qty;
    v_cost := v_cost + v_mi.cost*v_qty;
  end loop;

  if p_method='cash' then
    if coalesce(p_received,0) < v_total then raise exception 'El efectivo recibido es menor al total'; end if;
    v_change := coalesce(p_received,0)-v_total;
  end if;

  insert into public.tnt_sales(shift_id,customer_name,total,total_cost,method,received,change_amount,notes,cashier_name)
  values(p_shift_id,trim(coalesce(p_customer_name,'')),v_total,v_cost,p_method,case when p_method='cash' then coalesce(p_received,0) else 0 end,v_change,coalesce(p_notes,''),p_cashier)
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::integer;
    select mi.id,mi.product_id,mi.price,mi.cost,p.name,p.emoji,p.requires_prep into v_mi
    from public.tnt_menu_items mi join public.tnt_products p on p.id=mi.product_id
    where mi.id=(v_item->>'menu_item_id')::uuid;
    insert into public.tnt_sale_items(sale_id,menu_item_id,product_id,product_name,emoji,qty,unit_price,unit_cost,line_total,requires_prep)
    values(v_sale.id,v_mi.id,v_mi.product_id,v_mi.name,v_mi.emoji,v_qty,v_mi.price,v_mi.cost,v_mi.price*v_qty,v_mi.requires_prep);
    if v_mi.requires_prep then
      v_prep_count := v_prep_count+1;
      v_prep_parts := array_append(v_prep_parts, case when v_qty>1 then v_qty::text||'× ' else '' end || upper(v_mi.name));
    end if;
  end loop;

  if p_method='fiado' then
    insert into public.tnt_debts(sale_id,customer_name,amount) values(v_sale.id,trim(p_customer_name),v_total);
  end if;

  if v_prep_count>0 then
    insert into public.tnt_orders(shift_id,sale_id,customer_name,summary,notes,cashier_name)
    values(p_shift_id,v_sale.id,trim(coalesce(p_customer_name,'')),array_to_string(v_prep_parts,' + '),coalesce(p_notes,''),p_cashier)
    returning * into v_order;
  end if;

  return jsonb_build_object('sale',to_jsonb(v_sale),'order',case when v_order.id is null then null else to_jsonb(v_order) end);
end; $function$
;
revoke all on function public.tnt_create_sale(uuid,text,text,numeric,text,text,jsonb) from public,anon;
grant execute on function public.tnt_create_sale(uuid,text,text,numeric,text,text,jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.tnt_delete_sale(p_sale_id uuid, p_staff text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_sale public.tnt_sales;
  v_shift public.tnt_shifts;
  v_item record;
  v_kind text;
  v_components jsonb;
  v_comp jsonb;
  v_debt public.tnt_debts;
begin
  if not public.tnt_has_access('buffet','*','edit') then raise exception 'No tenés permiso para modificar Buffet.' using errcode='42501'; end if;
  select * into v_sale from public.tnt_sales where id=p_sale_id for update;
  if not found then raise exception 'Venta inexistente'; end if;

  select * into v_shift from public.tnt_shifts where id=v_sale.shift_id for update;
  if v_shift.status='closed' then
    raise exception 'No se puede borrar una venta de una jornada ya cerrada';
  end if;

  select * into v_debt from public.tnt_debts where sale_id=p_sale_id;
  if found and v_debt.status='paid' then
    raise exception 'No se puede borrar una venta fiada que ya fue cobrada';
  end if;

  insert into public.tnt_buffet_audit(actor,action,snapshot) values(public.tnt_current_person_id(),'sale_cancelled',jsonb_build_object('sale',to_jsonb(v_sale),'items',(select jsonb_agg(to_jsonb(i)) from public.tnt_sale_items i where sale_id=p_sale_id),'reason',p_staff));
  for v_item in
    select si.menu_item_id, si.product_id, si.qty
    from public.tnt_sale_items si
    where si.sale_id=p_sale_id
  loop
    if v_item.menu_item_id is not null then
      update public.tnt_menu_items
      set remaining_qty = remaining_qty + v_item.qty
      where id=v_item.menu_item_id;
    end if;

    select p.kind, p.combo_components into v_kind, v_components
    from public.tnt_products p where p.id=v_item.product_id;

    if v_kind='combo' and jsonb_typeof(v_components)='array' then
      for v_comp in select * from jsonb_array_elements(v_components)
      loop
        update public.tnt_menu_items
        set remaining_qty = remaining_qty + (((v_comp->>'qty')::integer) * v_item.qty)
        where shift_id=v_sale.shift_id
          and product_id=(v_comp->>'product_id')::uuid;
      end loop;
    end if;
  end loop;

  update public.tnt_orders set status='cancelled' where sale_id=p_sale_id and status<>'cancelled';
  delete from public.tnt_orders where sale_id=p_sale_id;

  if v_debt.id is not null then
    delete from public.tnt_debt_payments where debt_id=v_debt.id;
    delete from public.tnt_debts where id=v_debt.id;
  end if;

  delete from public.tnt_sale_items where sale_id=p_sale_id;
  delete from public.tnt_sales where id=p_sale_id;

  return jsonb_build_object('id',v_sale.id,'total',v_sale.total,'customer_name',v_sale.customer_name,'method',v_sale.method,'deleted_by',coalesce(nullif(trim(p_staff),''),'Equipo'));
end;
$function$
;
revoke all on function public.tnt_delete_sale(uuid,text) from public,anon;
grant execute on function public.tnt_delete_sale(uuid,text) to authenticated;
CREATE OR REPLACE FUNCTION public.tnt_deliver_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare v public.tnt_orders;
begin
  if not public.tnt_has_access('buffet','*','edit') then raise exception 'No tenés permiso para modificar Buffet.' using errcode='42501'; end if;
  update public.tnt_orders set status='delivered',delivered_at=now()
  where id=p_order_id and status='ready' returning * into v;
  if not found then select * into v from public.tnt_orders where id=p_order_id; end if;
  if v.id is null then raise exception 'Orden inexistente'; end if;
  return to_jsonb(v);
end; $function$
;
revoke all on function public.tnt_deliver_order(uuid) from public,anon;
grant execute on function public.tnt_deliver_order(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.tnt_open_shift(p_date date, p_opening_cash numeric, p_staff text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare v public.tnt_shifts;
begin
  if not public.tnt_has_access('buffet','*','edit') then raise exception 'No tenés permiso para modificar Buffet.' using errcode='42501'; end if;
  if coalesce(trim(p_staff),'')='' then raise exception 'Falta operador'; end if;
  select * into v from public.tnt_shifts where shift_date=p_date for update;
  if found then
    if v.status='closed' then raise exception 'La jornada ya está cerrada'; end if;
    update public.tnt_shifts set status='open', opening_cash=greatest(coalesce(p_opening_cash,0),0), opened_by=p_staff, opened_at=coalesce(opened_at,now()) where id=v.id returning * into v;
  else
    insert into public.tnt_shifts(shift_date,status,opening_cash,opened_by,opened_at) values(p_date,'open',greatest(coalesce(p_opening_cash,0),0),p_staff,now()) returning * into v;
  end if;
  return to_jsonb(v);
end; $function$
;
revoke all on function public.tnt_open_shift(date,numeric,text) from public,anon;
grant execute on function public.tnt_open_shift(date,numeric,text) to authenticated;
CREATE OR REPLACE FUNCTION public.tnt_pay_debt(p_debt_id uuid, p_shift_id uuid, p_method text, p_staff text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare v public.tnt_debts;
begin
  if not public.tnt_has_access('buffet','*','edit') then raise exception 'No tenés permiso para modificar Buffet.' using errcode='42501'; end if;
  if p_method not in ('cash','transfer') then raise exception 'Método inválido'; end if;
  select * into v from public.tnt_debts where id=p_debt_id for update;
  if not found then raise exception 'Fiado inexistente'; end if;
  if v.status='paid' then return to_jsonb(v); end if;
  insert into public.tnt_debt_payments(debt_id,payment_shift_id,amount,method,collected_by) values(v.id,p_shift_id,v.amount,p_method,p_staff);
  update public.tnt_debts set status='paid',paid_method=p_method,paid_at=now() where id=v.id returning * into v;
  return to_jsonb(v);
end; $function$
;
revoke all on function public.tnt_pay_debt(uuid,uuid,text,text) from public,anon;
grant execute on function public.tnt_pay_debt(uuid,uuid,text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.tnt_ready_order(p_order_id uuid, p_staff text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare v public.tnt_orders;
begin
  if not public.tnt_has_access('buffet','*','edit') then raise exception 'No tenés permiso para modificar Buffet.' using errcode='42501'; end if;
  update public.tnt_orders set status='ready',taken_by=coalesce(taken_by,p_staff),taken_at=coalesce(taken_at,now()),ready_at=now()
  where id=p_order_id and status in ('new','taken') returning * into v;
  if not found then select * into v from public.tnt_orders where id=p_order_id; end if;
  if v.id is null then raise exception 'Orden inexistente'; end if;
  return to_jsonb(v);
end; $function$
;
revoke all on function public.tnt_ready_order(uuid,text) from public,anon;
grant execute on function public.tnt_ready_order(uuid,text) to authenticated;
CREATE OR REPLACE FUNCTION public.tnt_update_sale(p_sale_id uuid, p_customer_name text, p_method text, p_received numeric, p_notes text, p_staff text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_sale public.tnt_sales;
  v_shift public.tnt_shifts;
  v_old record;
  v_item jsonb;
  v_mi record;
  v_qty integer;
  v_price numeric;
  v_total numeric := 0;
  v_cost numeric := 0;
  v_change numeric := 0;
  v_kind text;
  v_components jsonb;
  v_comp jsonb;
  v_comp_mi record;
  v_debt public.tnt_debts;
  v_order public.tnt_orders;
  v_prep_parts text[] := array[]::text[];
  v_prep_count integer := 0;
begin
  if not public.tnt_has_access('buffet','*','edit') then raise exception 'No tenés permiso para modificar Buffet.' using errcode='42501'; end if;
  select * into v_sale from public.tnt_sales where id=p_sale_id for update;
  if not found then raise exception 'Venta inexistente'; end if;

  select * into v_shift from public.tnt_shifts where id=v_sale.shift_id for update;
  if not found then raise exception 'Jornada inexistente'; end if;
  if v_shift.status='closed' then raise exception 'No se puede editar una venta de una jornada ya cerrada'; end if;

  if p_method not in ('cash','transfer','fiado') then raise exception 'Método inválido'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'La venta necesita al menos un producto'; end if;
  if p_method='fiado' and coalesce(trim(p_customer_name),'')='' then raise exception 'El fiado necesita nombre'; end if;

  select * into v_debt from public.tnt_debts where sale_id=p_sale_id;
  if found and v_debt.status='paid' then raise exception 'No se puede editar un fiado que ya fue cobrado'; end if;

  insert into public.tnt_buffet_audit(actor,action,snapshot) values(public.tnt_current_person_id(),'sale_edited',jsonb_build_object('sale',to_jsonb(v_sale),'items',(select jsonb_agg(to_jsonb(i)) from public.tnt_sale_items i where sale_id=p_sale_id)));
  -- 1) Reponer exactamente el stock de la venta anterior.
  for v_old in
    select si.menu_item_id, si.product_id, si.qty
    from public.tnt_sale_items si
    where si.sale_id=p_sale_id
  loop
    if v_old.menu_item_id is not null then
      update public.tnt_menu_items
      set remaining_qty=remaining_qty+v_old.qty
      where id=v_old.menu_item_id;
    end if;

    select p.kind,p.combo_components into v_kind,v_components
    from public.tnt_products p where p.id=v_old.product_id;
    if v_kind='combo' and jsonb_typeof(v_components)='array' then
      for v_comp in select * from jsonb_array_elements(v_components)
      loop
        update public.tnt_menu_items
        set remaining_qty=remaining_qty+(((v_comp->>'qty')::integer)*v_old.qty)
        where shift_id=v_sale.shift_id
          and product_id=(v_comp->>'product_id')::uuid;
      end loop;
    end if;
  end loop;

  delete from public.tnt_sale_items where sale_id=p_sale_id;

  -- 2) Validar y aplicar la venta corregida.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty:=greatest(coalesce((v_item->>'qty')::integer,0),0);
    if v_qty<=0 then raise exception 'Cantidad inválida'; end if;

    select mi.id,mi.product_id,mi.price,mi.cost,mi.remaining_qty,p.name,p.emoji,p.requires_prep,p.kind,p.combo_components
      into v_mi
    from public.tnt_menu_items mi
    join public.tnt_products p on p.id=mi.product_id
    where mi.id=(v_item->>'menu_item_id')::uuid
      and mi.shift_id=v_sale.shift_id
    for update of mi;
    if not found then raise exception 'Producto inexistente en el menú de esta jornada'; end if;
    if v_mi.remaining_qty<v_qty then raise exception 'Stock insuficiente de %',v_mi.name; end if;

    v_price:=coalesce(nullif(v_item->>'unit_price','')::numeric,v_mi.price);
    if v_price<0 then raise exception 'Precio inválido'; end if;

    update public.tnt_menu_items set remaining_qty=remaining_qty-v_qty where id=v_mi.id;

    if v_mi.kind='combo' then
      for v_comp in select * from jsonb_array_elements(v_mi.combo_components)
      loop
        select mi.id,mi.remaining_qty,p.name into v_comp_mi
        from public.tnt_menu_items mi
        join public.tnt_products p on p.id=mi.product_id
        where mi.shift_id=v_sale.shift_id
          and mi.product_id=(v_comp->>'product_id')::uuid
        for update of mi;
        if not found then raise exception 'Falta componente del combo'; end if;
        if v_comp_mi.remaining_qty < ((v_comp->>'qty')::integer*v_qty) then raise exception 'Stock insuficiente de %',v_comp_mi.name; end if;
        update public.tnt_menu_items
        set remaining_qty=remaining_qty-((v_comp->>'qty')::integer*v_qty)
        where id=v_comp_mi.id;
      end loop;
    end if;

    insert into public.tnt_sale_items(
      sale_id,menu_item_id,product_id,product_name,emoji,qty,unit_price,unit_cost,line_total,requires_prep
    ) values(
      v_sale.id,v_mi.id,v_mi.product_id,v_mi.name,v_mi.emoji,v_qty,v_price,v_mi.cost,v_price*v_qty,v_mi.requires_prep
    );

    v_total:=v_total+(v_price*v_qty);
    v_cost:=v_cost+(v_mi.cost*v_qty);
    if v_mi.requires_prep then
      v_prep_count:=v_prep_count+1;
      v_prep_parts:=array_append(v_prep_parts,case when v_qty>1 then v_qty::text||'× ' else '' end||upper(v_mi.name));
    end if;
  end loop;

  if p_method='cash' then
    if coalesce(p_received,0)<v_total then raise exception 'El efectivo recibido es menor al total'; end if;
    v_change:=coalesce(p_received,0)-v_total;
  end if;

  update public.tnt_sales
  set customer_name=trim(coalesce(p_customer_name,'')),
      total=v_total,
      total_cost=v_cost,
      method=p_method,
      received=case when p_method='cash' then coalesce(p_received,0) else 0 end,
      change_amount=v_change,
      notes=coalesce(p_notes,''),
      cashier_name=coalesce(nullif(trim(p_staff),''),cashier_name)
  where id=v_sale.id
  returning * into v_sale;

  -- 3) Mantener fiado consistente.
  if p_method='fiado' then
    if v_debt.id is null then
      insert into public.tnt_debts(sale_id,customer_name,amount)
      values(v_sale.id,trim(p_customer_name),v_total)
      returning * into v_debt;
    else
      update public.tnt_debts
      set customer_name=trim(p_customer_name),amount=v_total,status='pending',paid_method=null,paid_at=null
      where id=v_debt.id
      returning * into v_debt;
    end if;
  elsif v_debt.id is not null then
    delete from public.tnt_debt_payments where debt_id=v_debt.id;
    delete from public.tnt_debts where id=v_debt.id;
    v_debt:=null;
  end if;

  -- 4) Mantener orden de preparación consistente.
  select * into v_order from public.tnt_orders where sale_id=v_sale.id;
  if v_prep_count>0 then
    if v_order.id is null then
      insert into public.tnt_orders(shift_id,sale_id,customer_name,summary,notes,cashier_name)
      values(v_sale.shift_id,v_sale.id,trim(coalesce(p_customer_name,'')),array_to_string(v_prep_parts,' + '),coalesce(p_notes,''),v_sale.cashier_name)
      returning * into v_order;
    else
      update public.tnt_orders
      set customer_name=trim(coalesce(p_customer_name,'')),
          summary=array_to_string(v_prep_parts,' + '),
          notes=coalesce(p_notes,''),
          cashier_name=v_sale.cashier_name,
          status=case when status='delivered' then 'delivered' else 'new' end,
          taken_by=case when status='delivered' then taken_by else null end,
          taken_at=case when status='delivered' then taken_at else null end,
          ready_at=case when status='delivered' then ready_at else null end,
          delivered_at=case when status='delivered' then delivered_at else null end
      where id=v_order.id
      returning * into v_order;
    end if;
  elsif v_order.id is not null then
    delete from public.tnt_orders where id=v_order.id;
    v_order:=null;
  end if;

  return jsonb_build_object('sale',to_jsonb(v_sale),'order',case when v_order.id is null then null else to_jsonb(v_order) end);
exception when others then
  raise;
end;
$function$
;
revoke all on function public.tnt_update_sale(uuid,text,text,numeric,text,text,jsonb) from public,anon;
grant execute on function public.tnt_update_sale(uuid,text,text,numeric,text,text,jsonb) to authenticated;

create or replace function public.tnt_can_read_thread(p_thread uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.tnt_current_person_id() is not null and (
 public.tnt_is_admin() or exists(select 1 from public.tnt_chat_threads t where t.id=p_thread and (
 t.created_by=public.tnt_current_person_id() or t.thread_type='general'
 or exists(select 1 from public.tnt_chat_members m where m.thread_id=t.id and m.person_id=public.tnt_current_person_id())
 or (t.thread_type in ('module','efe') and t.module is not null and public.tnt_has_access(t.module,coalesce(t.scope,'*'),'view'))
 or (t.thread_type='event' and t.event_id is not null and (public.tnt_can_manage_event(t.event_id)
   or exists(select 1 from public.tnt_event_members m where m.event_id=t.event_id and m.person_id=public.tnt_current_person_id())
   or exists(select 1 from public.tnt_tasks et join public.tnt_task_assignees ea on ea.task_id=et.id where et.event_id=t.event_id and ea.person_id=public.tnt_current_person_id())))
 or (t.thread_type='task' and t.task_id is not null and (
   exists(select 1 from public.tnt_task_assignees a where a.task_id=t.task_id and a.person_id=public.tnt_current_person_id())
   or exists(select 1 from public.tnt_tasks task where task.id=t.task_id and public.tnt_can_manage_event(task.event_id))))
 )))
$$;
revoke all on function public.tnt_can_read_thread(uuid) from public,anon;
grant execute on function public.tnt_can_read_thread(uuid) to authenticated;


create or replace function public.tnt_open_activity_chat(p_task uuid default null,p_event uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_title text; v_event uuid;
begin
 if public.tnt_current_person_id() is null or (p_task is null)=(p_event is null) then
   raise exception 'Elegí una tarea o un evento.' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tnt-chat:'||coalesce(p_task,p_event)::text,0));
 if p_task is not null then
   select title,event_id into v_title,v_event from public.tnt_tasks where id=p_task;
   if v_title is null or not (public.tnt_can_manage_event(v_event) or exists(select 1 from public.tnt_task_assignees where task_id=p_task and person_id=public.tnt_current_person_id())) then
     raise exception 'Este chat es para los responsables de la tarea.' using errcode='42501';
   end if;
   select id into v_id from public.tnt_chat_threads where thread_type='task' and task_id=p_task order by created_at limit 1;
   if v_id is null then
     insert into public.tnt_chat_threads(title,thread_type,task_id,created_by) values(v_title,'task',p_task,public.tnt_current_person_id()) returning id into v_id;
   end if;
 else
   select name into v_title from public.tnt_events where id=p_event;
   if v_title is null or not (public.tnt_can_manage_event(p_event) or exists(select 1 from public.tnt_event_members where event_id=p_event and person_id=public.tnt_current_person_id()) or exists(select 1 from public.tnt_tasks t join public.tnt_task_assignees a on a.task_id=t.id where t.event_id=p_event and a.person_id=public.tnt_current_person_id())) then
     raise exception 'Este chat es para los participantes del evento.' using errcode='42501';
   end if;
   select id into v_id from public.tnt_chat_threads where thread_type='event' and event_id=p_event order by created_at limit 1;
   if v_id is null then
     insert into public.tnt_chat_threads(title,thread_type,event_id,created_by) values(v_title,'event',p_event,public.tnt_current_person_id()) returning id into v_id;
   end if;
 end if;
 return v_id;
end $$;
revoke all on function public.tnt_open_activity_chat(uuid,uuid) from public,anon;
grant execute on function public.tnt_open_activity_chat(uuid,uuid) to authenticated;


-- Campamento: enrollment and payments belong to an edition, not a browser.
create table public.tnt_camp_editions(
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>1),
 start_date date not null,end_date date not null,location text not null default '',capacity integer not null default 100 check(capacity>0),
 fee numeric not null default 0 check(fee>=0),status text not null default 'planning' check(status in('planning','open','closed','archived')),
 description text not null default '',created_by uuid references public.tnt_people(id),created_at timestamptz not null default now(),check(end_date>=start_date));
create table public.tnt_camp_registrations(
 id uuid primary key default gen_random_uuid(),camp_id uuid not null references public.tnt_camp_editions(id),person_id uuid not null references public.tnt_people(id),
 document_no text not null default '',congregation text not null default '',fee numeric not null check(fee>=0),
 status text not null default 'pending' check(status in('pending','confirmed','cancelled')),"authorization" boolean not null default false,
 notes text not null default '',answers jsonb not null default '{}',checked_in_at timestamptz,checked_out_at timestamptz,
 deleted_at timestamptz,deleted_by uuid references public.tnt_people(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index tnt_camp_registration_active on public.tnt_camp_registrations(camp_id,person_id) where deleted_at is null;
create index tnt_camp_registration_camp on public.tnt_camp_registrations(camp_id,deleted_at);
create table public.tnt_camp_payments(
 id uuid primary key default gen_random_uuid(),registration_id uuid not null references public.tnt_camp_registrations(id),amount numeric not null check(amount>0),
 method text not null check(method in('cash','transfer','other')),reference text not null default '',paid_at timestamptz not null default now(),
 recorded_by uuid references public.tnt_people(id),voided_at timestamptz,void_reason text);
create index tnt_camp_payment_registration on public.tnt_camp_payments(registration_id);
create table public.tnt_camp_health(
 registration_id uuid primary key references public.tnt_camp_registrations(id),allergies text not null default '',medication text not null default '',
 conditions text not null default '',emergency_name text not null default '',emergency_phone text not null default '',updated_at timestamptz not null default now());
create table public.tnt_camp_resources(
 id uuid primary key default gen_random_uuid(),camp_id uuid not null references public.tnt_camp_editions(id),kind text not null check(kind in('room','bus','team')),
 name text not null check(length(trim(name))>0),capacity integer not null check(capacity>0),unique(camp_id,kind,name));
create table public.tnt_camp_assignments(
 registration_id uuid not null references public.tnt_camp_registrations(id),resource_id uuid not null references public.tnt_camp_resources(id),kind text not null check(kind in('room','bus','team')),
 primary key(registration_id,kind));
create index tnt_camp_assignment_resource on public.tnt_camp_assignments(resource_id);

do $$ declare t text; begin
 foreach t in array array['tnt_camp_editions','tnt_camp_registrations','tnt_camp_payments','tnt_camp_resources','tnt_camp_assignments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy camp_read on public.%I for select to authenticated using(public.tnt_has_access(''campamento'',''*'',''view''))',t);
 execute format('create policy camp_insert on public.%I for insert to authenticated with check(public.tnt_has_access(''campamento'',''*'',''edit''))',t);
 execute format('create policy camp_update on public.%I for update to authenticated using(public.tnt_has_access(''campamento'',''*'',''edit'')) with check(public.tnt_has_access(''campamento'',''*'',''edit''))',t);
 end loop;end $$;
grant delete on public.tnt_camp_resources,public.tnt_camp_assignments to authenticated;
create policy camp_resource_delete on public.tnt_camp_resources for delete to authenticated using(public.tnt_has_access('campamento','*','edit'));
create policy camp_assignment_delete on public.tnt_camp_assignments for delete to authenticated using(public.tnt_has_access('campamento','*','edit'));
alter table public.tnt_camp_health enable row level security;
revoke all on public.tnt_camp_health from anon;
grant select,insert,update on public.tnt_camp_health to authenticated;
create policy camp_health_read on public.tnt_camp_health for select to authenticated using(public.tnt_has_access('campamento-salud','*','view') or exists(select 1 from public.tnt_camp_registrations r where r.id=registration_id and r.person_id=public.tnt_current_person_id()));
create policy camp_health_insert on public.tnt_camp_health for insert to authenticated with check(public.tnt_has_access('campamento-salud','*','edit'));
create policy camp_health_update on public.tnt_camp_health for update to authenticated using(public.tnt_has_access('campamento-salud','*','edit')) with check(public.tnt_has_access('campamento-salud','*','edit'));

create or replace function private.tnt_camp_capacity() returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.tnt_camp_editions; resource public.tnt_camp_resources; v_camp uuid; v_count int;
begin
 if tg_table_name='tnt_camp_registrations' then
  select * into c from public.tnt_camp_editions where id=new.camp_id for update;
  if new.deleted_at is null and new.status<>'cancelled' then
   select count(*) into v_count from public.tnt_camp_registrations where camp_id=new.camp_id and deleted_at is null and status<>'cancelled' and id<>new.id;
   if v_count>=c.capacity then raise exception 'La edición no tiene más cupos.'; end if;
  end if;
  if tg_op='UPDATE' and (new.person_id<>old.person_id or new.camp_id<>old.camp_id) then raise exception 'No se puede mover una ficha a otra persona o edición.'; end if;
  new.updated_at:=now();
 else
  select * into resource from public.tnt_camp_resources where id=new.resource_id for update;
  select camp_id into v_camp from public.tnt_camp_registrations where id=new.registration_id and deleted_at is null and status<>'cancelled';
  if v_camp is null or v_camp<>resource.camp_id or new.kind<>resource.kind then raise exception 'Asignación inválida para esta edición.'; end if;
  select count(*) into v_count from public.tnt_camp_assignments a join public.tnt_camp_registrations r on r.id=a.registration_id where a.resource_id=new.resource_id and a.registration_id<>new.registration_id and r.deleted_at is null and r.status<>'cancelled';
  if v_count>=resource.capacity then raise exception 'Este recurso no tiene más lugares.'; end if;
 end if;
 return new;
end $$;
revoke all on function private.tnt_camp_capacity() from public,anon;
create trigger tnt_camp_capacity before insert or update on public.tnt_camp_registrations for each row execute function private.tnt_camp_capacity();
create trigger tnt_camp_assignment_capacity before insert or update on public.tnt_camp_assignments for each row execute function private.tnt_camp_capacity();

create or replace function public.tnt_save_camp_registration(p_id uuid,p_camp uuid,p_person uuid,p_person_values jsonb,p_values jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_person uuid; v_id uuid; v_fee numeric;
begin
 if not public.tnt_has_access('campamento','*','edit') then raise exception 'No tenés permiso para editar fichas.' using errcode='42501'; end if;
 if nullif(trim(p_person_values->>'full_name'),'') is null then raise exception 'Falta el nombre completo.'; end if;
 v_person:=coalesce(p_person,gen_random_uuid());v_id:=coalesce(p_id,gen_random_uuid());
 if p_id is not null and exists(select 1 from public.tnt_camp_registrations where id=p_id and (camp_id<>p_camp or person_id<>v_person)) then raise exception 'La ficha no coincide.'; end if;
 insert into public.tnt_people(id,full_name,normalized_name,birthday,phone,sex,source,active)
 values(v_person,trim(p_person_values->>'full_name'),lower(trim(p_person_values->>'full_name')),nullif(p_person_values->>'birthday','')::date,p_person_values->>'phone',nullif(p_person_values->>'sex',''),'campamento',true)
 on conflict(id) do update set full_name=excluded.full_name,normalized_name=excluded.normalized_name,birthday=excluded.birthday,phone=excluded.phone,sex=excluded.sex;
 select fee into v_fee from public.tnt_camp_editions where id=p_camp;
 insert into public.tnt_camp_registrations(id,camp_id,person_id,document_no,congregation,fee,status,"authorization",notes,answers)
 values(v_id,p_camp,v_person,coalesce(p_values->>'document_no',''),coalesce(p_values->>'congregation',''),coalesce(nullif(p_values->>'fee','')::numeric,v_fee),coalesce(p_values->>'status','pending'),coalesce((p_values->>'authorization')::boolean,false),coalesce(p_values->>'notes',''),coalesce(p_values->'answers','{}'))
 on conflict(id) do update set document_no=excluded.document_no,congregation=excluded.congregation,fee=excluded.fee,status=excluded.status,"authorization"=excluded."authorization",notes=excluded.notes,answers=excluded.answers;
 return v_id;
end $$;
revoke all on function public.tnt_save_camp_registration(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.tnt_save_camp_registration(uuid,uuid,uuid,jsonb,jsonb) to authenticated;

-- Attendance uses the central account and group-scoped permissions.
alter table public.tnt_efe_followups add column if not exists group_id uuid references public.tnt_efe_groups(id);
alter table public.tnt_efe_followups add column if not exists note text not null default '';
create unique index tnt_efe_followup_group on public.tnt_efe_followups(person_id,group_id,wednesday_date);
drop policy if exists tnt_efe_memberships_read on public.tnt_efe_memberships;
drop policy if exists tnt_efe_memberships_write on public.tnt_efe_memberships;
create policy efe_memberships_read on public.tnt_efe_memberships for select to authenticated using(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_has_access('efe',g.code,'view')));
create policy efe_memberships_write on public.tnt_efe_memberships for all to authenticated using(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_has_access('efe',g.code,'edit'))) with check(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_has_access('efe',g.code,'edit')));
-- Remove old broad attendance policies before installing scoped replacements.
do $$ declare p record; begin
 for p in select policyname,tablename from pg_policies where schemaname='public' and tablename in('tnt_efe_wednesday_attendance','tnt_efe_followups','tnt_saturday_attendance') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename);end loop;end $$;
create policy efe_attendance_read on public.tnt_efe_wednesday_attendance for select to authenticated using(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_has_access('efe',g.code,'view')));
create policy efe_attendance_write on public.tnt_efe_wednesday_attendance for all to authenticated using(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_has_access('efe',g.code,'edit'))) with check(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_has_access('efe',g.code,'edit')));
create policy efe_followup_read on public.tnt_efe_followups for select to authenticated using(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_has_access('efe',g.code,'edit')));
create policy efe_followup_write on public.tnt_efe_followups for all to authenticated using(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_has_access('efe',g.code,'edit'))) with check(exists(select 1 from public.tnt_efe_groups g where g.id=group_id and public.tnt_has_access('efe',g.code,'edit')));
create policy saturday_attendance_read on public.tnt_saturday_attendance for select to authenticated using(public.tnt_has_access('lista-sabados','*','view'));
create policy saturday_attendance_write on public.tnt_saturday_attendance for all to authenticated using(public.tnt_has_access('lista-sabados','*','edit')) with check(public.tnt_has_access('lista-sabados','*','edit'));
create policy people_insert_efe_group on public.tnt_people for insert to authenticated with check(exists(select 1 from public.tnt_efe_groups g where public.tnt_has_access('efe',g.code,'edit')));
create policy people_update_efe_group on public.tnt_people for update to authenticated using(exists(select 1 from public.tnt_efe_memberships m join public.tnt_efe_groups g on g.id=m.group_id where m.person_id=tnt_people.id and public.tnt_has_access('efe',g.code,'edit'))) with check(exists(select 1 from public.tnt_efe_memberships m join public.tnt_efe_groups g on g.id=m.group_id where m.person_id=tnt_people.id and public.tnt_has_access('efe',g.code,'edit')));

create table public.tnt_saturday_members(person_id uuid primary key references public.tnt_people(id),active boolean not null default true,created_at timestamptz not null default now());
alter table public.tnt_saturday_members enable row level security;
revoke all on public.tnt_saturday_members from anon;
grant select,insert,update on public.tnt_saturday_members to authenticated;
create policy saturday_members_read on public.tnt_saturday_members for select to authenticated using(public.tnt_has_access('lista-sabados','*','view'));
create policy saturday_members_insert on public.tnt_saturday_members for insert to authenticated with check(public.tnt_has_access('lista-sabados','*','edit'));
create policy saturday_members_update on public.tnt_saturday_members for update to authenticated using(public.tnt_has_access('lista-sabados','*','edit')) with check(public.tnt_has_access('lista-sabados','*','edit'));
insert into public.tnt_saturday_members(person_id) select distinct person_id from public.tnt_saturday_attendance on conflict do nothing;

create or replace function public.tnt_save_attendance_person(p_id uuid,p_group uuid,p_values jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid());v_code text;
begin
 if p_group is not null then select code into v_code from public.tnt_efe_groups where id=p_group;
  if not public.tnt_has_access('efe',v_code,'edit') then raise exception 'No tenés permiso para este grupo.' using errcode='42501';end if;
 elsif not public.tnt_has_access('lista-sabados','*','edit') then raise exception 'No tenés permiso para editar la lista.' using errcode='42501'; end if;
 if nullif(trim(p_values->>'full_name'),'') is null then raise exception 'Falta el nombre.';end if;
 insert into public.tnt_people(id,full_name,normalized_name,birthday,phone,source,active)
 values(v_id,trim(p_values->>'full_name'),lower(trim(p_values->>'full_name')),nullif(p_values->>'birthday','')::date,p_values->>'phone',case when p_group is null then 'lista-sabados' else 'efe' end,true)
 on conflict(id) do update set full_name=excluded.full_name,normalized_name=excluded.normalized_name,birthday=excluded.birthday,phone=excluded.phone;
 if p_group is not null then insert into public.tnt_efe_memberships(person_id,group_id,leader_name,active) values(v_id,p_group,coalesce(p_values->>'leader_name',''),true)
 on conflict(person_id,group_id) do update set leader_name=excluded.leader_name,active=true;else insert into public.tnt_saturday_members(person_id,active) values(v_id,true) on conflict(person_id) do update set active=true;end if;
 return v_id;
end $$;
revoke all on function public.tnt_save_attendance_person(uuid,uuid,jsonb) from public,anon;
grant execute on function public.tnt_save_attendance_person(uuid,uuid,jsonb) to authenticated;
