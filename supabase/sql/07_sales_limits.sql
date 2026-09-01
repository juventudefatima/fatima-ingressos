-- =========================================================================
-- EVENTIX — LIMITE DE ESTOQUE POR PRODUTO + PRODUTOS/EVENTOS POR CAIXA
-- Execute depois de 06_admin_improvements.sql.
--
-- Este arquivo também CORRIGE um bug pré-existente: o frontend (EquipePage,
-- CashierPage, ValidatorPage) já chamava a tabela "event_staff" e a RPC
-- "list_my_events()", mas nenhuma das duas nunca existiu no banco — ou seja,
-- "quais eventos ele(a) pode trabalhar" sempre falhava ao salvar, e
-- cashier/validator não conseguiam ver evento nenhum. Criamos as duas aqui,
-- porque restringir PRODUTO por caixa não faz sentido sem primeiro existir
-- a atribuição de EVENTO por caixa.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) EVENT_STAFF — quais eventos cada cashier/validator pode trabalhar
-- -------------------------------------------------------------------------
create table if not exists public.event_staff (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
create index if not exists idx_event_staff_profile on public.event_staff (profile_id);

alter table public.event_staff enable row level security;

drop policy if exists "event_staff_admin_all" on public.event_staff;
create policy "event_staff_admin_all" on public.event_staff
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "event_staff_select_own" on public.event_staff;
create policy "event_staff_select_own" on public.event_staff
  for select using (profile_id = auth.uid());

grant select, insert, update, delete on public.event_staff to authenticated;

-- Eventos que o usuário logado pode ver/trabalhar: admin vê tudo, cliente
-- não usa esta RPC, cashier/validator só veem o que foi atribuído a eles.
create or replace function public.list_my_events()
returns setof public.events
language sql
stable
security definer
set search_path = public
as $$
  select e.*
  from public.events e
  where public.is_admin()
     or exists (
       select 1 from public.event_staff es
       where es.event_id = e.id and es.profile_id = auth.uid()
     )
  order by e.event_date desc;
$$;

grant execute on all functions in schema public to authenticated;

-- -------------------------------------------------------------------------
-- 2) LIMITE DE ESTOQUE — a coluna já era usada no frontend (ProductsPage),
-- mas nunca existiu de fato no banco (ficava sempre null / ignorada).
-- -------------------------------------------------------------------------
alter table public.products
  add column if not exists stock_limit int null check (stock_limit is null or stock_limit >= 0);

-- -------------------------------------------------------------------------
-- 3) CASHIER_PRODUCTS — quais produtos um caixa específico pode vender.
-- Sem nenhuma linha para o caixa = sem restrição (mantém o comportamento
-- atual: qualquer caixa vende qualquer produto ativo do evento atribuído a
-- ele). Só quando o admin cadastra ao menos 1 produto aqui para aquele
-- caixa é que a venda passa a ficar restrita à lista.
-- -------------------------------------------------------------------------
create table if not exists public.cashier_products (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, product_id)
);
create index if not exists idx_cashier_products_profile on public.cashier_products (profile_id);

alter table public.cashier_products enable row level security;

drop policy if exists "cashier_products_admin_all" on public.cashier_products;
create policy "cashier_products_admin_all" on public.cashier_products
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cashier_products_select_own" on public.cashier_products;
create policy "cashier_products_select_own" on public.cashier_products
  for select using (profile_id = auth.uid());

grant select, insert, update, delete on public.cashier_products to authenticated;

-- -------------------------------------------------------------------------
-- 4) CREATE_SALE — reforça no servidor as duas novas regras (nunca confiar
-- só no filtro do frontend). Substitui a função inteira; a única mudança de
-- comportamento real são as duas checagens novas dentro do loop de itens.
-- -------------------------------------------------------------------------
create or replace function public.create_sale(
  p_event_id uuid,
  p_customer_id uuid,
  p_items jsonb,              -- [{ "product_id": "uuid", "quantity": 2 }, ...]
  p_payment_method order_payment_method default 'cash',
  p_payment_status order_payment_status default 'paid'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  ev public.events;
  item jsonb;
  prod public.products;
  qty int;
  running_total numeric(10,2) := 0;
  new_order_id uuid;
  new_ticket_id uuid;
  new_code text;
  code_exists boolean;
  already_sold int;
begin
  actor := public.require_role(array['cashier','admin']::user_role[]);

  select * into ev from public.events where id = p_event_id for update;
  if ev.id is null then
    raise exception 'Evento não encontrado.';
  end if;
  if ev.status <> 'published' then
    raise exception 'Evento não está disponível para vendas.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Nenhum produto informado.';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Cliente não encontrado.';
  end if;

  new_order_id := gen_random_uuid();

  insert into public.orders (id, event_id, customer_id, cashier_id, payment_method, payment_status, total)
  values (new_order_id, p_event_id, p_customer_id, actor.id, p_payment_method, p_payment_status, 0);

  new_ticket_id := gen_random_uuid();

  loop
    new_code := public.generate_ticket_code();
    select exists(select 1 from public.tickets where public_code = new_code) into code_exists;
    exit when not code_exists;
  end loop;

  insert into public.tickets (id, public_code, order_id, event_id, customer_id, status)
  values (new_ticket_id, new_code, new_order_id, p_event_id, p_customer_id, 'active');

  for item in select * from jsonb_array_elements(p_items)
  loop
    qty := (item->>'quantity')::int;
    if qty is null or qty <= 0 then
      raise exception 'Quantidade inválida para um dos produtos.';
    end if;

    -- "for update" trava a linha do produto: além de proteger o preço
    -- histórico (comportamento original), agora também serializa a
    -- checagem de estoque abaixo contra vendas concorrentes do mesmo produto.
    select * into prod from public.products where id = (item->>'product_id')::uuid and event_id = p_event_id for update;
    if prod.id is null then
      raise exception 'Produto não encontrado neste evento.';
    end if;
    if not prod.active then
      raise exception 'Produto "%": está inativo.', prod.name;
    end if;

    -- Restrição de quais produtos este caixa pode vender (admin sempre
    -- pode vender qualquer produto ativo). Sem nenhuma linha cadastrada
    -- para o caixa em cashier_products, não há restrição nenhuma.
    if actor.role = 'cashier'
       and exists (select 1 from public.cashier_products where profile_id = actor.id)
       and not exists (select 1 from public.cashier_products where profile_id = actor.id and product_id = prod.id)
    then
      raise exception 'Você não tem permissão para vender "%".', prod.name;
    end if;

    -- Limite de estoque (opcional por produto). Conta tudo que já foi
    -- vendido em pedidos não cancelados, incluindo esta transação em
    -- andamento graças ao "for update" acima.
    if prod.stock_limit is not null then
      select coalesce(sum(ti.quantity_purchased), 0) into already_sold
      from public.ticket_items ti
      join public.tickets tk on tk.id = ti.ticket_id
      where ti.product_id = prod.id and tk.status <> 'cancelled';

      if already_sold + qty > prod.stock_limit then
        raise exception 'Estoque insuficiente para "%": restam % (pediu %).',
          prod.name, greatest(prod.stock_limit - already_sold, 0), qty;
      end if;
    end if;

    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, subtotal)
    values (new_order_id, prod.id, prod.name, prod.price, qty, prod.price * qty);

    insert into public.ticket_items (ticket_id, product_id, product_name_snapshot, quantity_purchased, quantity_redeemed)
    values (new_ticket_id, prod.id, prod.name, qty, 0);

    running_total := running_total + (prod.price * qty);
  end loop;

  update public.orders set total = running_total where id = new_order_id;

  perform public.log_audit('sale.create', jsonb_build_object(
    'order_id', new_order_id, 'ticket_id', new_ticket_id, 'event_id', p_event_id,
    'customer_id', p_customer_id, 'total', running_total
  ));

  return jsonb_build_object(
    'order_id', new_order_id,
    'ticket_id', new_ticket_id,
    'ticket_code', new_code,
    'total', running_total
  );
end;
$$;

grant execute on all functions in schema public to authenticated;
