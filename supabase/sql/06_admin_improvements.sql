-- =========================================================================
-- EVENTIX — AUDITORIA (frontend) + EDITAR ITEM DE PEDIDO + RATE LIMIT STAFF
-- Execute depois de 05_password_reset.sql.
-- =========================================================================

-- 1) Tela de auditoria no admin precisa poder LER audit_logs direto
-- (a política de RLS já existia — só faltava o GRANT de base, mesmo bug de
-- sempre: RLS sozinho não libera nada sem o GRANT correspondente).
grant select on public.audit_logs to authenticated;

-- 2) Editar quantidade de um item já vendido, sem precisar cancelar o
-- pedido inteiro. Atualiza order_items (histórico da venda), ticket_items
-- (o que ainda pode ser retirado na validação) e recalcula o total do
-- pedido — tudo em uma transação, com FOR UPDATE.
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
  new_total numeric(10,2);
begin
  actor := public.require_role(array['admin']::user_role[]);

  if p_new_quantity <= 0 then
    raise exception 'A quantidade precisa ser maior que zero (use "cancelar pedido" para remover tudo).';
  end if;

  select * into oi from public.order_items where id = p_order_item_id for update;
  if oi.id is null then
    raise exception 'Item do pedido não encontrado.';
  end if;

  select ti.* into ti
    from public.ticket_items ti
    join public.tickets tk on tk.id = ti.ticket_id
    where tk.order_id = oi.order_id and ti.product_id = oi.product_id
    for update;

  if ti.id is not null and p_new_quantity < ti.quantity_redeemed then
    raise exception 'Não é possível reduzir para menos do que já foi entregue (%).', ti.quantity_redeemed;
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

grant execute on all functions in schema public to authenticated;

-- 3) Rate limit de login para a EQUIPE (caixa/validador/admin), espelhando
-- o que já existe para cliente (que usa a tabela customers). Aqui usamos a
-- própria profiles, já que staff não tem linha em customers.
alter table public.profiles
  add column if not exists failed_login_attempts int not null default 0,
  add column if not exists locked_until timestamptz;
