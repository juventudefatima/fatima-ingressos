-- =========================================================================
-- EVENTIX — FUNÇÕES (RPC) E LÓGICA DE NEGÓCIO
-- Execute depois de 01_schema.sql.
--
-- Estratégia de segurança adotada neste projeto:
--   Todas as tabelas sensíveis (orders, tickets, ticket_items, redemptions...)
--   NÃO recebem INSERT/UPDATE direto de nenhum papel via RLS (ver 03_policies.sql).
--   Toda escrita passa por funções SECURITY DEFINER abaixo, que:
--     1) reconferem a identidade e o papel de quem chama (auth.uid()),
--     2) revalidam every regra de negócio no servidor (nunca confiam no client),
--     3) executam em transação única, com "FOR UPDATE" para travar as linhas
--        envolvidas e impedir condição de corrida em validações simultâneas.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Helpers de identidade
-- -------------------------------------------------------------------------
create or replace function public.current_profile()
returns public.profiles
language sql
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function public.require_role(p_roles user_role[])
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles;
begin
  select * into prof from public.profiles where id = auth.uid();
  if prof.id is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if not prof.active then
    raise exception 'Usuário bloqueado.' using errcode = '28000';
  end if;
  if not (prof.role = any(p_roles)) then
    raise exception 'Você não possui permissão para realizar esta operação.' using errcode = '42501';
  end if;
  return prof;
end;
$$;

create or replace function public.log_audit(p_action text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, actor_role, action, details)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), p_action, p_details);
end;
$$;

-- -------------------------------------------------------------------------
-- Geração seguro do código público do ticket.
-- NUNCA usa telefone, CPF ou ID sequencial. 10 caracteres em Base32
-- (Crockford, sem caracteres ambíguos), compatível com Code128.
-- -------------------------------------------------------------------------
create or replace function public.generate_ticket_code()
returns text
language plpgsql
as $$
declare
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- sem I, L, O, U (evita ambiguidade)
  code text := '';
  i int;
  raw bytea;
begin
  raw := extensions.gen_random_bytes(10);
  for i in 0..9 loop
    code := code || substr(alphabet, (get_byte(raw, i) % length(alphabet)) + 1, 1);
  end loop;
  return 'TK' || code;
end;
$$;

-- -------------------------------------------------------------------------
-- CRIAR VENDA (caixa) — cria pedido + itens + ticket + itens do ticket
-- em uma única transação atômica.
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

  -- gera um código único (recomeça em caso, extremamente raro, de colisão)
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

    select * into prod from public.products where id = (item->>'product_id')::uuid and event_id = p_event_id for update;
    if prod.id is null then
      raise exception 'Produto não encontrado neste evento.';
    end if;
    if not prod.active then
      raise exception 'Produto "%": está inativo.', prod.name;
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

-- -------------------------------------------------------------------------
-- BUSCAR TICKET PARA O CLIENTE (aplica a regra "só no dia do evento")
-- -------------------------------------------------------------------------
create or replace function public.get_my_tickets()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  result jsonb;
begin
  actor := public.require_role(array['customer','admin']::user_role[]);

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into result
  from (
    select
      tk.id,
      tk.status,
      case when (tk.status <> 'cancelled' and current_date >= ev.event_date) then tk.public_code else null end as public_code,
      case when current_date < ev.event_date then true else false end as locked,
      ev.id as event_id, ev.name as event_name, ev.event_date, ev.event_time, ev.location, ev.status as event_status,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'product_name', ti.product_name_snapshot,
          'quantity_purchased', ti.quantity_purchased,
          'quantity_redeemed', ti.quantity_redeemed,
          'available', ti.quantity_purchased - ti.quantity_redeemed
        ) order by ti.created_at), '[]'::jsonb)
        from public.ticket_items ti where ti.ticket_id = tk.id
      ) as items
    from public.tickets tk
    join public.events ev on ev.id = tk.event_id
    where tk.customer_id = actor.id
    order by ev.event_date desc
  ) t;

  return result;
end;
$$;

-- -------------------------------------------------------------------------
-- VALIDADOR: consultar um ticket pelo código, SEM consumir nada ainda.
-- Reaplica todas as verificações do item 8 do briefing.
-- -------------------------------------------------------------------------
create or replace function public.get_ticket_for_validation(p_public_code text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  tk public.tickets;
  ev public.events;
  items jsonb;
begin
  actor := public.require_role(array['validator','admin']::user_role[]);

  select * into ev from public.events where id = p_event_id;
  if ev.id is null then
    raise exception 'Evento não encontrado.';
  end if;
  if ev.status = 'cancelled' or ev.status = 'draft' then
    raise exception 'Evento encerrado.';
  end if;
  if ev.event_date <> current_date then
    raise exception 'Este evento não está acontecendo hoje.';
  end if;

  select * into tk from public.tickets where public_code = upper(trim(p_public_code));
  if tk.id is null then
    raise exception 'Ticket não encontrado.';
  end if;
  if tk.event_id <> p_event_id then
    raise exception 'Ticket pertence a outro evento.';
  end if;
  if tk.status = 'cancelled' then
    raise exception 'Ticket cancelado.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ticket_item_id', ti.id,
    'product_name', ti.product_name_snapshot,
    'quantity_purchased', ti.quantity_purchased,
    'quantity_redeemed', ti.quantity_redeemed,
    'available', ti.quantity_purchased - ti.quantity_redeemed
  ) order by ti.created_at), '[]'::jsonb) into items
  from public.ticket_items ti where ti.ticket_id = tk.id;

  return jsonb_build_object(
    'ticket_id', tk.id,
    'public_code', tk.public_code,
    'status', tk.status,
    'event_name', ev.name,
    'items', items
  );
end;
$$;

-- -------------------------------------------------------------------------
-- VALIDADOR: confirmar entrega (RPC atômica e segura contra condição
-- de corrida). Usa "FOR UPDATE" para travar as linhas de ticket_items
-- durante toda a transação: se dois validadores chamarem esta função ao
-- mesmo tempo para o mesmo ticket, a segunda chamada só prossegue depois
-- que a primeira commitar — e então vê a quantidade já atualizada.
-- -------------------------------------------------------------------------
create or replace function public.redeem_ticket_items(
  p_public_code text,
  p_event_id uuid,
  p_items jsonb   -- [{ "ticket_item_id": "uuid", "quantity": 1 }, ...]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  tk public.tickets;
  ev public.events;
  item jsonb;
  ti public.ticket_items;
  qty int;
  new_redemption_id uuid;
  total_remaining int;
  result_items jsonb := '[]'::jsonb;
begin
  actor := public.require_role(array['validator','admin']::user_role[]);

  select * into ev from public.events where id = p_event_id;
  if ev.id is null then
    raise exception 'Evento não encontrado.';
  end if;
  if ev.event_date <> current_date then
    raise exception 'Este evento não está acontecendo hoje.';
  end if;

  -- Trava a linha do ticket primeiro: impede duas transações concorrentes
  -- de operarem sobre o mesmo ticket ao mesmo tempo.
  select * into tk from public.tickets where public_code = upper(trim(p_public_code)) for update;
  if tk.id is null then
    raise exception 'Ticket não encontrado.';
  end if;
  if tk.event_id <> p_event_id then
    raise exception 'Ticket pertence a outro evento.';
  end if;
  if tk.status = 'cancelled' then
    raise exception 'Ticket cancelado.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Nenhum item selecionado para entrega.';
  end if;

  new_redemption_id := gen_random_uuid();
  insert into public.redemptions (id, ticket_id, event_id, validator_id)
  values (new_redemption_id, tk.id, p_event_id, actor.id);

  for item in select * from jsonb_array_elements(p_items)
  loop
    qty := (item->>'quantity')::int;
    if qty is null or qty <= 0 then
      raise exception 'Quantidade inválida.';
    end if;

    -- Trava a linha específica do item — esta é a barreira real contra
    -- dupla entrega concorrente do MESMO produto no MESMO ticket.
    select * into ti from public.ticket_items
      where id = (item->>'ticket_item_id')::uuid and ticket_id = tk.id
      for update;

    if ti.id is null then
      raise exception 'Item do ticket não encontrado.';
    end if;

    if (ti.quantity_purchased - ti.quantity_redeemed) <= 0 then
      raise exception 'Não há itens disponíveis para "%".', ti.product_name_snapshot;
    end if;

    if qty > (ti.quantity_purchased - ti.quantity_redeemed) then
      raise exception 'Quantidade solicitada maior que a disponível para "%".', ti.product_name_snapshot;
    end if;

    update public.ticket_items
      set quantity_redeemed = quantity_redeemed + qty
      where id = ti.id;

    insert into public.redemption_items (redemption_id, ticket_item_id, product_name_snapshot, quantity)
    values (new_redemption_id, ti.id, ti.product_name_snapshot, qty);

    result_items := result_items || jsonb_build_object(
      'product_name', ti.product_name_snapshot,
      'delivered_now', qty,
      'available', (ti.quantity_purchased - ti.quantity_redeemed - qty)
    );
  end loop;

  select coalesce(sum(quantity_purchased - quantity_redeemed), 0) into total_remaining
  from public.ticket_items where ticket_id = tk.id;

  if total_remaining = 0 then
    update public.tickets set status = 'fully_redeemed' where id = tk.id;
  end if;

  perform public.log_audit('ticket.redeem', jsonb_build_object(
    'ticket_id', tk.id, 'redemption_id', new_redemption_id, 'items', p_items
  ));

  return jsonb_build_object(
    'redemption_id', new_redemption_id,
    'ticket_status', (select status from public.tickets where id = tk.id),
    'items', result_items
  );
end;
$$;

-- -------------------------------------------------------------------------
-- ADMIN: reabrir item já entregue (estorno de entrega por engano).
-- Só admin. Sempre com auditoria.
-- -------------------------------------------------------------------------
create or replace function public.admin_reopen_ticket_item(p_ticket_item_id uuid, p_quantity int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  ti public.ticket_items;
begin
  actor := public.require_role(array['admin']::user_role[]);

  select * into ti from public.ticket_items where id = p_ticket_item_id for update;
  if ti.id is null then
    raise exception 'Item não encontrado.';
  end if;
  if p_quantity <= 0 or p_quantity > ti.quantity_redeemed then
    raise exception 'Quantidade inválida para reabertura.';
  end if;

  update public.ticket_items set quantity_redeemed = quantity_redeemed - p_quantity where id = ti.id;
  update public.tickets set status = 'active' where id = ti.ticket_id and status = 'fully_redeemed';

  perform public.log_audit('ticket_item.reopen', jsonb_build_object(
    'ticket_item_id', p_ticket_item_id, 'quantity', p_quantity
  ));

  return jsonb_build_object('ok', true);
end;
$$;

-- -------------------------------------------------------------------------
-- ADMIN: cancelar pedido/ticket (nunca apaga fisicamente).
-- -------------------------------------------------------------------------
create or replace function public.admin_cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
begin
  actor := public.require_role(array['admin']::user_role[]);

  update public.orders
    set status = 'cancelled', cancelled_by = actor.id, cancelled_at = now()
    where id = p_order_id;

  update public.tickets
    set status = 'cancelled', cancelled_at = now()
    where order_id = p_order_id;

  perform public.log_audit('order.cancel', jsonb_build_object('order_id', p_order_id));

  return jsonb_build_object('ok', true);
end;
$$;

-- -------------------------------------------------------------------------
-- RELATÓRIOS (admin) — agregados por evento
-- -------------------------------------------------------------------------
create or replace function public.event_report(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  by_product jsonb;
  by_cashier jsonb;
  by_validator jsonb;
  totals jsonb;
begin
  actor := public.require_role(array['admin']::user_role[]);

  select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) into by_product from (
    select
      ti.product_name_snapshot as product_name,
      sum(ti.quantity_purchased) as sold,
      sum(ti.quantity_redeemed) as delivered,
      sum(ti.quantity_purchased - ti.quantity_redeemed) as remaining
    from public.ticket_items ti
    join public.tickets tk on tk.id = ti.ticket_id
    where tk.event_id = p_event_id and tk.status <> 'cancelled'
    group by ti.product_name_snapshot
    order by ti.product_name_snapshot
  ) p;

  select coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb) into by_cashier from (
    select pr.full_name as cashier_name, count(o.id) as sales_count, sum(o.total) as total_amount
    from public.orders o
    join public.profiles pr on pr.id = o.cashier_id
    where o.event_id = p_event_id and o.status <> 'cancelled'
    group by pr.full_name
    order by total_amount desc
  ) c;

  select coalesce(jsonb_agg(row_to_json(v)), '[]'::jsonb) into by_validator from (
    select pr.full_name as validator_name, count(distinct r.id) as redemptions_count,
           sum((ri.quantity)) as items_delivered
    from public.redemptions r
    join public.profiles pr on pr.id = r.validator_id
    join public.redemption_items ri on ri.redemption_id = r.id
    where r.event_id = p_event_id
    group by pr.full_name
    order by items_delivered desc
  ) v;

  select jsonb_build_object(
    'total_orders', (select count(*) from public.orders where event_id = p_event_id and status <> 'cancelled'),
    'total_tickets', (select count(*) from public.tickets where event_id = p_event_id and status <> 'cancelled'),
    'total_revenue', (select coalesce(sum(total), 0) from public.orders where event_id = p_event_id and status <> 'cancelled'),
    'total_items_sold', (select coalesce(sum(ti.quantity_purchased),0) from public.ticket_items ti join public.tickets tk on tk.id = ti.ticket_id where tk.event_id = p_event_id and tk.status <> 'cancelled'),
    'total_items_delivered', (select coalesce(sum(ti.quantity_redeemed),0) from public.ticket_items ti join public.tickets tk on tk.id = ti.ticket_id where tk.event_id = p_event_id and tk.status <> 'cancelled')
  ) into totals;

  return jsonb_build_object('totals', totals, 'by_product', by_product, 'by_cashier', by_cashier, 'by_validator', by_validator);
end;
$$;

-- -------------------------------------------------------------------------
-- ADMIN: bloquear / desbloquear usuário de staff
-- -------------------------------------------------------------------------
create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
begin
  actor := public.require_role(array['admin']::user_role[]);
  update public.profiles set active = p_active where id = p_user_id and role in ('cashier','validator');
  perform public.log_audit('user.set_active', jsonb_build_object('user_id', p_user_id, 'active', p_active));
  return jsonb_build_object('ok', true);
end;
$$;

-- -------------------------------------------------------------------------
-- Usuário logado confirma que já trocou a senha inicial.
-- (A troca da senha em si é feita via supabase.auth.updateUser(), que é uma
-- operação do módulo de Auth, não uma escrita direta em public.profiles.)
-- -------------------------------------------------------------------------
create or replace function public.clear_must_change_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  update public.profiles set must_change_password = false where id = auth.uid();
end;
$$;

grant execute on all functions in schema public to authenticated;
