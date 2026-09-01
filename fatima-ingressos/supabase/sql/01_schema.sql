-- =========================================================================
-- EVENTIX — SCHEMA PRINCIPAL
-- Execute este arquivo primeiro, no SQL Editor do Supabase (ou via CLI).
-- =========================================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------------------
-- ENUMS
-- -------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'cashier', 'validator', 'customer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_status as enum ('draft', 'published', 'closed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_payment_method as enum ('cash', 'pix', 'card', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_payment_status as enum ('paid', 'pending', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('active', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('active', 'cancelled', 'fully_redeemed');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------------------
-- PROFILES
-- Espelha auth.users (1:1). Toda a lógica de papel/permissão nasce aqui.
-- -------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null,
  full_name text not null,
  phone text,                       -- só relevante para clientes
  username text unique,             -- login "amigável" para caixa/validador (ex: joao)
  must_change_password boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_role on public.profiles (role);

-- -------------------------------------------------------------------------
-- CUSTOMERS
-- Extensão de profiles para clientes (telefone é a chave de busca do caixa).
-- -------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key references public.profiles (id) on delete cascade,
  phone text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_customers_phone on public.customers (phone);

-- -------------------------------------------------------------------------
-- EVENTS
-- -------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  event_date date not null,
  event_time time not null,
  location text not null,
  status event_status not null default 'draft',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_events_status_date on public.events (status, event_date);

-- -------------------------------------------------------------------------
-- PRODUCTS (por evento)
-- -------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_products_event on public.products (event_id);

-- -------------------------------------------------------------------------
-- ORDERS (venda)
-- -------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  event_id uuid not null references public.events (id),
  customer_id uuid not null references public.customers (id),
  cashier_id uuid not null references public.profiles (id),
  payment_method order_payment_method not null default 'cash',
  payment_status order_payment_status not null default 'paid',
  status order_status not null default 'active',
  total numeric(10, 2) not null default 0,
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_event on public.orders (event_id);
create index if not exists idx_orders_customer on public.orders (customer_id);
create index if not exists idx_orders_cashier on public.orders (cashier_id);

-- -------------------------------------------------------------------------
-- ORDER ITEMS — preço histórico congelado no momento da venda
-- -------------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  product_name_snapshot text not null,
  unit_price_snapshot numeric(10, 2) not null,
  quantity int not null check (quantity > 0),
  subtotal numeric(10, 2) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_items_order on public.order_items (order_id);

-- -------------------------------------------------------------------------
-- TICKETS — 1 por pedido. public_code é o único identificador exposto
-- no código de barras / QR. O id (uuid) nunca é mostrado ao usuário.
-- -------------------------------------------------------------------------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  event_id uuid not null references public.events (id),
  customer_id uuid not null references public.customers (id),
  status ticket_status not null default 'active',
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tickets_event on public.tickets (event_id);
create index if not exists idx_tickets_customer on public.tickets (customer_id);
create unique index if not exists idx_tickets_public_code on public.tickets (public_code);

-- -------------------------------------------------------------------------
-- TICKET ITEMS — quantidade comprada x utilizada, controladas separadamente
-- -------------------------------------------------------------------------
create table if not exists public.ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  product_id uuid not null references public.products (id),
  product_name_snapshot text not null,
  quantity_purchased int not null check (quantity_purchased > 0),
  quantity_redeemed int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_redeemed_within_purchased check (quantity_redeemed >= 0 and quantity_redeemed <= quantity_purchased)
);
create index if not exists idx_ticket_items_ticket on public.ticket_items (ticket_id);

-- -------------------------------------------------------------------------
-- REDEMPTIONS — cada operação de entrega (pode conter vários produtos)
-- -------------------------------------------------------------------------
create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id),
  event_id uuid not null references public.events (id),
  validator_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_redemptions_ticket on public.redemptions (ticket_id);
create index if not exists idx_redemptions_validator on public.redemptions (validator_id);

create table if not exists public.redemption_items (
  id uuid primary key default gen_random_uuid(),
  redemption_id uuid not null references public.redemptions (id) on delete cascade,
  ticket_item_id uuid not null references public.ticket_items (id),
  product_name_snapshot text not null,
  quantity int not null check (quantity > 0)
);
create index if not exists idx_redemption_items_redemption on public.redemption_items (redemption_id);

-- -------------------------------------------------------------------------
-- AUDIT LOGS
-- -------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  actor_role user_role,
  action text not null,
  details jsonb,
  ip_address text, -- preenchido apenas quando a ação passa por uma Edge Function (ver README)
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_actor on public.audit_logs (actor_id);
create index if not exists idx_audit_logs_action on public.audit_logs (action);

-- -------------------------------------------------------------------------
-- updated_at trigger genérico
-- -------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles','events','products','orders','tickets','ticket_items']
  loop
    execute format(
      'drop trigger if exists trg_set_updated_at on public.%I; create trigger trg_set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;
