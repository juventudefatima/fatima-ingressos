-- =========================================================================
-- EVENTIX — RATE LIMIT DE LOGIN + SOLICITAÇÃO DE RESET DE SENHA (MANUAL)
-- Execute depois de 04_seed_admin.sql.
--
-- Fluxo escolhido: em vez de enviar código por WhatsApp automaticamente,
-- qualquer pessoa (cliente OU equipe) pode pedir "esqueci minha senha"
-- informando telefone (cliente) ou usuário (equipe). Isso cria uma
-- solicitação pendente que aparece na hora pro admin, que reseta a senha
-- manualmente (e avisa a pessoa por fora do sistema).
-- =========================================================================

alter table public.customers
  add column if not exists failed_login_attempts int not null default 0,
  add column if not exists locked_until timestamptz;

do $$ begin
  create type password_reset_target_role as enum ('customer', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type password_reset_status as enum ('pending', 'done');
exception when duplicate_object then null; end $$;

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  target_role password_reset_target_role not null,
  identifier text not null,   -- telefone (cliente) ou username (equipe), como a pessoa digitou
  profile_id uuid references public.profiles (id) on delete set null, -- preenchido se o sistema já identificou quem é
  status password_reset_status not null default 'pending',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id)
);
create index if not exists idx_password_reset_requests_status on public.password_reset_requests (status);

alter table public.password_reset_requests enable row level security;

drop policy if exists "password_reset_requests_admin_all" on public.password_reset_requests;
create policy "password_reset_requests_admin_all" on public.password_reset_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- O admin lê/atualiza essa tabela direto do frontend (lista de pendências).
-- A CRIAÇÃO da solicitação continua sendo só pela Edge Function
-- (request-password-reset, com service_role), já que quem está pedindo
-- ainda nem consegue logar — não faz sentido essa tabela aceitar INSERT de
-- "authenticated" aqui.
grant select, update on public.password_reset_requests to authenticated;

-- Pro badge de pendências no painel do admin atualizar sozinho.
alter publication supabase_realtime add table public.password_reset_requests;
