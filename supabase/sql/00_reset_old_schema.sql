-- =========================================================================
-- EVENTIX — RESET DO PROJETO SUPABASE ANTES DE INSTALAR
-- Execute ESTE arquivo primeiro, ANTES do 01_schema.sql, SOMENTE se este
-- projeto Supabase já tiver tabelas de um sistema anterior (schema
-- incompatível). Ele apaga PERMANENTEMENTE todas as tabelas e tipos enum
-- do schema "public" — não mexe em auth.users nem em outros schemas.
--
-- ATENÇÃO: isso é destrutivo e irreversível. Se tiver qualquer dúvida,
-- exporte um backup pelo painel do Supabase (Database > Backups) antes.
-- =========================================================================

do $$
declare
  r record;
begin
  for r in (select tablename from pg_tables where schemaname = 'public') loop
    execute 'drop table if exists public.' || quote_ident(r.tablename) || ' cascade';
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in (
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'
  ) loop
    execute 'drop type if exists public.' || quote_ident(r.typname) || ' cascade';
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in (
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ) loop
    execute format('drop function if exists public.%I(%s) cascade', r.proname, r.args);
  end loop;
end $$;

-- IMPORTANTE: usuários de auth.users do sistema anterior (se algum) continuam
-- existindo — só as tabelas/funções de public são apagadas. Se quiser
-- remover também os usuários antigos de Authentication > Users, faça isso
-- manualmente pelo painel do Supabase antes de criar o admin do Eventix
-- (04_seed_admin.sql), para não colidir com o e-mail staff.admin@eventix.local.
