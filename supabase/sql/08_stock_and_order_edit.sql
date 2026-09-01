-- =========================================================================
-- SI-DATA — ESTOQUE EM TEMPO REAL NO CAIXA + DES-CANCELAR PEDIDO +
--           EDIÇÃO COMPLETA DE PEDIDO (adicionar/remover itens)
-- Execute depois de 07_sales_limits.sql.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) ESTOQUE EM TEMPO REAL — o caixa precisa saber quanto ainda pode vender
-- de cada produto (products.stock_limit) sem ter que tentar vender e tomar
-- erro. RLS de tickets/ticket_items não deixa o caixa ver vendas de outros
-- caixas, então isso precisa ser SECURITY DEFINER (soma de todo mundo).
-- -------------------------------------------------------------------------
create or replace function public.list_stock_status(p_event_id uuid)
returns table (product_id uuid, stock_limit int, sold int, remaining int)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as product_id,
    p.stock_limit,
    coalesce(sold.qty, 0) as sold,
    case when p.stock_limit is null then null else greatest(p.stock_limit - coalesce(sold.qty, 0), 0) end as remaining
  from public.products p
  left join (
    select ti.product_id, sum(ti.quantity_purchased) as qty
    from public.ticket_items ti
    join public.tickets tk on tk.id = ti.ticket_id
    where tk.status <> 'cancelled'
    group by ti.product_id
  ) sold on sold.product_id = p.id
  where p.event_id = p_event_id;
$$;

grant execute on all functions in schema public to authenticated;

-- -------------------------------------------------------------------------
-- 2) DES-CANCELAR PEDIDO — reverte um cancelamento feito por engano.
-- Se algum item já tinha sido entregue antes do cancelamento (fica
-- registrado em quantity_redeemed), o ticket volta pro status certo:
-- "fully_redeemed" se está tudo entregue, senão "active".
-- -------------------------------------------------------------------------
create or replace function public.admin_uncancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  ord public.orders;
  new_ticket_status ticket_status;
begin
  actor := public.require_role(array['admin']::user_role[]);

  select * into ord from public.orders where id = p_order_id for update;
  if ord.id is null then
    raise exception 'Pedido não encontrado.';
  end if;
  if ord.status <> 'cancelled' then
    raise exception 'Este pedido não está cancelado.';
  end if;

  update public.orders set status = 'active', cancelled_by = null, cancelled_at = null where id = p_order_id;

  select case
    when exists (
      select 1 from public.ticket_items ti
      join public.tickets tk on tk.id = ti.ticket_id
      where tk.order_id = p_order_id and ti.quantity_redeemed < ti.quantity_purchased
    ) then 'active'::ticket_status
    else 'fully_redeemed'::ticket_status
  end into new_ticket_status;

  update public.tickets set status = new_ticket_status, cancelled_at = null where order_id = p_order_id;

  perform public.log_audit('order.uncancel', jsonb_build_object('order_id', p_order_id));

  return jsonb_build_object('ok', true);
end;
$$;

-- -------------------------------------------------------------------------
-- 3) ADMIN_EDIT_ORDER_ITEM — substituído para também respeitar stock_limit
-- quando a quantidade está sendo AUMENTADA (antes só bloqueava reduzir
-- abaixo do já entregue).
-- -------------------------------------------------------------------------
create or replace function public.admin_edit_order_item(p_order_item_id uuid, p_new_quantity int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  oi public.order_items;
  ti public.ticket_items;
  prod public.products;
  new_total numeric(10,2);
  sold_excluding int;
begin
  actor := public.require_role(array['admin']::user_role[]);

  if p_new_quantity <= 0 then
    raise exception 'A quantidade precisa ser maior que zero (use "remover item" pra tirar do pedido).';
  end if;

  select * into oi from public.order_items where id = p_order_item_id for update;
  if oi.id is null then
    raise exception 'Item do pedido não encontrado.';
  end if;

  select * into prod from public.products where id = oi.product_id for update;

  select ti.* into ti
    from public.ticket_items ti
    join public.tickets tk on tk.id = ti.ticket_id
    where tk.order_id = oi.order_id and ti.product_id = oi.product_id
    for update;

  if ti.id is not null and p_new_quantity < ti.quantity_redeemed then
    raise exception 'Não é possível reduzir para menos do que já foi entregue (%).', ti.quantity_redeemed;
  end if;

  if prod.stock_limit is not null and p_new_quantity > oi.quantity then
    select coalesce(sum(ti2.quantity_purchased), 0) into sold_excluding
    from public.ticket_items ti2
    join public.tickets tk2 on tk2.id = ti2.ticket_id
    where ti2.product_id = prod.id and tk2.status <> 'cancelled' and ti2.id is distinct from ti.id;

    if sold_excluding + p_new_quantity > prod.stock_limit then
      raise exception 'Estoque insuficiente para "%": restam % no total.',
        prod.name, greatest(prod.stock_limit - sold_excluding, 0);
    end if;
  end if;

  update public.order_items
    set quantity = p_new_quantity, subtotal = unit_price_snapshot * p_new_quantity
    where id = oi.id;

  if ti.id is not null then
    update public.ticket_items set quantity_purchased = p_new_quantity where id = ti.id;
  end if;

  select coalesce(sum(subtotal), 0) into new_total from public.order_items where order_id = oi.order_id;
  update public.orders set total = new_total where id = oi.order_id;

  perform public.log_audit('order_item.edit', jsonb_build_object(
    'order_item_id', oi.id, 'order_id', oi.order_id,
    'old_quantity', oi.quantity, 'new_quantity', p_new_quantity
  ));

  return jsonb_build_object('ok', true, 'new_total', new_total);
end;
$$;

-- -------------------------------------------------------------------------
-- 4) ADMIN_ADD_ORDER_ITEM — acrescenta um produto novo a um pedido já
-- existente (ou soma na linha já existente do mesmo produto). Cria a linha
-- irmã em ticket_items também, senão o item nunca poderia ser validado.
-- -------------------------------------------------------------------------
create or replace function public.admin_add_order_item(p_order_id uuid, p_product_id uuid, p_quantity int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  ord public.orders;
  tk public.tickets;
  prod public.products;
  existing_oi public.order_items;
  sold_so_far int;
  new_total numeric(10,2);
begin
  actor := public.require_role(array['admin']::user_role[]);

  if p_quantity <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if ord.id is null then
    raise exception 'Pedido não encontrado.';
  end if;
  if ord.status = 'cancelled' then
    raise exception 'Reative o pedido antes de adicionar itens a ele.';
  end if;

  select * into tk from public.tickets where order_id = p_order_id for update;
  if tk.id is null then
    raise exception 'Ticket do pedido não encontrado.';
  end if;

  select * into prod from public.products where id = p_product_id and event_id = ord.event_id for update;
  if prod.id is null then
    raise exception 'Produto não encontrado neste evento.';
  end if;
  if not prod.active then
    raise exception 'Produto "%": está inativo.', prod.name;
  end if;

  if prod.stock_limit is not null then
    select coalesce(sum(ti.quantity_purchased), 0) into sold_so_far
    from public.ticket_items ti
    join public.tickets tk2 on tk2.id = ti.ticket_id
    where ti.product_id = prod.id and tk2.status <> 'cancelled';

    if sold_so_far + p_quantity > prod.stock_limit then
      raise exception 'Estoque insuficiente para "%": restam % no total.',
        prod.name, greatest(prod.stock_limit - sold_so_far, 0);
    end if;
  end if;

  select * into existing_oi from public.order_items where order_id = p_order_id and product_id = p_product_id for update;

  if existing_oi.id is not null then
    -- Já existe uma linha desse produto neste pedido: soma em vez de duplicar.
    update public.order_items
      set quantity = existing_oi.quantity + p_quantity, subtotal = unit_price_snapshot * (existing_oi.quantity + p_quantity)
      where id = existing_oi.id;

    update public.ticket_items
      set quantity_purchased = quantity_purchased + p_quantity
      where ticket_id = tk.id and product_id = p_product_id;
  else
    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, subtotal)
    values (p_order_id, prod.id, prod.name, prod.price, p_quantity, prod.price * p_quantity);

    insert into public.ticket_items (ticket_id, product_id, product_name_snapshot, quantity_purchased, quantity_redeemed)
    values (tk.id, prod.id, prod.name, p_quantity, 0);
  end if;

  -- Se o ticket já estava "fully_redeemed", o item novo/aumentado volta a
  -- ficar disponível pra validação, então o status precisa voltar a ativo.
  update public.tickets set status = 'active' where id = tk.id and status = 'fully_redeemed';

  select coalesce(sum(subtotal), 0) into new_total from public.order_items where order_id = p_order_id;
  update public.orders set total = new_total where id = p_order_id;

  perform public.log_audit('order_item.add', jsonb_build_object(
    'order_id', p_order_id, 'product_id', prod.id, 'quantity', p_quantity
  ));

  return jsonb_build_object('ok', true, 'new_total', new_total);
end;
$$;

-- -------------------------------------------------------------------------
-- 5) ADMIN_REMOVE_ORDER_ITEM — tira uma linha inteira do pedido. Bloqueado
-- se já foi entregue (precisa reabrir a entrega primeiro) ou se for o
-- último item do pedido (nesse caso, cancele o pedido inteiro).
-- -------------------------------------------------------------------------
create or replace function public.admin_remove_order_item(p_order_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  oi public.order_items;
  ti public.ticket_items;
  item_count int;
  new_total numeric(10,2);
begin
  actor := public.require_role(array['admin']::user_role[]);

  select * into oi from public.order_items where id = p_order_item_id for update;
  if oi.id is null then
    raise exception 'Item do pedido não encontrado.';
  end if;

  select count(*) into item_count from public.order_items where order_id = oi.order_id;
  if item_count <= 1 then
    raise exception 'Este é o único item do pedido — cancele o pedido inteiro em vez de remover o item.';
  end if;

  select ti.* into ti
    from public.ticket_items ti
    join public.tickets tk on tk.id = ti.ticket_id
    where tk.order_id = oi.order_id and ti.product_id = oi.product_id
    for update;

  if ti.id is not null and ti.quantity_redeemed > 0 then
    raise exception 'Não é possível remover: % unidade(s) já foram entregues. Reabra a entrega primeiro.', ti.quantity_redeemed;
  end if;

  if ti.id is not null then
    delete from public.ticket_items where id = ti.id;
  end if;
  delete from public.order_items where id = oi.id;

  select coalesce(sum(subtotal), 0) into new_total from public.order_items where order_id = oi.order_id;
  update public.orders set total = new_total where id = oi.order_id;

  perform public.log_audit('order_item.remove', jsonb_build_object(
    'order_item_id', oi.id, 'order_id', oi.order_id, 'product_id', oi.product_id, 'quantity', oi.quantity
  ));

  return jsonb_build_object('ok', true, 'new_total', new_total);
end;
$$;

grant execute on all functions in schema public to authenticated;
