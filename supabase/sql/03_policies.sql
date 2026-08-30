-- =========================================================================
-- EVENTIX — ROW LEVEL SECURITY
-- Execute depois de 01_schema.sql e 02_functions.sql.
--
-- Princípio adotado: as tabelas operacionais (orders, tickets, ticket_items,
-- redemptions, redemption_items, audit_logs) NÃO recebem INSERT/UPDATE direto
-- de nenhum papel de client. Toda escrita nelas passa pelas funções
-- SECURITY DEFINER de 02_functions.sql, que já revalidam papel e regras.
-- RLS aqui cuida do que pode ser LIDO por SELECT, e protege profiles/events/
-- products/customers de escrita direta indevida.
-- =========================================================================

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.events enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_items enable row level security;
alter table public.redemptions enable row level security;
alter table public.redemption_items enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.my_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------- profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_limited" on public.profiles;
create policy "profiles_update_own_limited" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- IMPORTANTE: a policy acima é apenas por LINHA (o usuário só atinge a
-- própria linha). Sozinha, ela NÃO impede que o próprio usuário tente
-- alterar as colunas "role" ou "active" nessa mesma linha (ex.: se
-- promover a admin). Por isso revogamos o privilégio de UPDATE em nível
-- de COLUNA para o papel "authenticated" e liberamos apenas os campos que
-- o próprio usuário pode legitimamente mudar. Alterações de "role",
-- "active", "username" e "must_change_password" só acontecem através das
-- funções SECURITY DEFINER (que rodam com o privilégio do dono da função,
-- não do chamador) ou das Edge Functions com service_role.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- BUGFIX: RLS por si só não libera nada — é uma camada de FILTRO em cima do
-- GRANT básico do Postgres. Sem estes GRANTs, toda consulta direta do
-- frontend a estas tabelas (profiles, events, products) falhava com 403
-- mesmo com a policy de RLS correta, porque o Postgres barrava antes de
-- sequer avaliar a policy.
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.customers to authenticated;
grant select on public.orders to authenticated;
grant select on public.tickets to authenticated;
grant select on public.ticket_items to authenticated;
grant select on public.redemptions to authenticated;
grant select on public.redemption_items to authenticated;

-- Habilita o Realtime (atualização instantânea no front-end) para as tabelas
-- que mudam durante a venda/validação. O Realtime do Supabase respeita as
-- políticas de RLS de cada tabela — cada usuário só recebe eventos das
-- linhas que ele já poderia ler normalmente.
alter publication supabase_realtime add table public.tickets, public.ticket_items, public.redemptions, public.orders;

-- BUGFIX: is_admin() e my_role() são criadas neste arquivo, DEPOIS do
-- "grant execute on all functions..." que roda no final do 02_functions.sql.
-- Aquele grant só vale para as funções que já existiam naquele momento, então
-- estas duas ficavam sem permissão de execução para "authenticated" — e como
-- as políticas de RLS de events/products chamam essas funções, toda leitura
-- dessas tabelas falhava com "permission denied". Repetir o grant aqui, no
-- final, cobre também as funções criadas neste arquivo.
grant execute on all functions in schema public to authenticated;

-- --------------------------------------------------------------- customers
drop policy if exists "customers_select_self_or_staff" on public.customers;
create policy "customers_select_self_or_staff" on public.customers
  for select using (
    id = auth.uid()
    or public.is_admin()
    or public.my_role() in ('cashier','validator')
  );
-- Nenhuma policy de INSERT/UPDATE direto: criação de cliente acontece pela
-- Edge Function "create-customer" (usa service_role, ver README).

-- ------------------------------------------------------------------ events
drop policy if exists "events_select_published_or_staff" on public.events;
create policy "events_select_published_or_staff" on public.events
  for select using (
    status = 'published'
    or public.is_admin()
    or public.my_role() in ('cashier','validator')
  );

drop policy if exists "events_admin_write" on public.events;
create policy "events_admin_write" on public.events
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- products
drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products
  for select using (
    public.is_admin()
    or public.my_role() in ('cashier','validator')
    or exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
  );

drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------ orders
drop policy if exists "orders_select" on public.orders;
create policy "orders_select" on public.orders
  for select using (
    public.is_admin()
    or cashier_id = auth.uid()
    or customer_id = auth.uid()
  );
-- Sem policy de insert/update: criação via RPC create_sale(); cancelamento
-- via RPC admin_cancel_order().

-- ------------------------------------------------------------- order_items
drop policy if exists "order_items_select" on public.order_items;
create policy "order_items_select" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (public.is_admin() or o.cashier_id = auth.uid() or o.customer_id = auth.uid())
    )
  );

-- ----------------------------------------------------------------- tickets
drop policy if exists "tickets_select" on public.tickets;
create policy "tickets_select" on public.tickets
  for select using (
    public.is_admin()
    or customer_id = auth.uid()
    or exists (select 1 from public.orders o where o.id = order_id and o.cashier_id = auth.uid())
  );
-- Validador NÃO tem select direto: ele só enxerga tickets através das RPCs
-- get_ticket_for_validation() / redeem_ticket_items(), que são SECURITY
-- DEFINER e devolvem apenas o necessário para o evento do dia.

-- ------------------------------------------------------------- ticket_items
drop policy if exists "ticket_items_select" on public.ticket_items;
create policy "ticket_items_select" on public.ticket_items
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and (public.is_admin()
             or t.customer_id = auth.uid()
             or exists (select 1 from public.orders o where o.id = t.order_id and o.cashier_id = auth.uid()))
    )
  );

-- ------------------------------------------------------------- redemptions
drop policy if exists "redemptions_select" on public.redemptions;
create policy "redemptions_select" on public.redemptions
  for select using (public.is_admin() or validator_id = auth.uid());

drop policy if exists "redemption_items_select" on public.redemption_items;
create policy "redemption_items_select" on public.redemption_items
  for select using (
    exists (
      select 1 from public.redemptions r
      where r.id = redemption_id and (public.is_admin() or r.validator_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------- audit_logs
drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select" on public.audit_logs
  for select using (public.is_admin());
-- Sem insert direto: só via log_audit(), chamada internamente pelas RPCs.
