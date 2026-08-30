-- =========================================================================
-- EVENTIX — CRIAR O PRIMEIRO ADMINISTRADOR
-- Execute por último, DEPOIS de 01, 02 e 03, e depois de configurar o Auth.
--
-- Este projeto não tem tela de "criar admin" (por segurança, ninguém pode
-- se auto-promover a admin pelo app). O primeiro administrador é criado
-- manualmente, uma única vez, direto no painel do Supabase:
--
-- 1. Vá em Authentication > Users > "Add user" no painel do Supabase.
-- 2. E-mail: staff.admin@eventix.local
--    (o app faz login de equipe convertendo "usuário" -> "staff.<usuário>@eventix.local",
--     então o e-mail no Auth PRECISA seguir esse padrão para o login "admin" funcionar)
--    Senha: escolha uma senha forte.
--    Marque "Auto Confirm User".
-- 3. Copie o UUID do usuário criado.
-- 4. Substitua 'COLE_O_UUID_AQUI' abaixo e execute este script no SQL Editor.
-- =========================================================================

insert into public.profiles (id, role, full_name, username, must_change_password, active)
values ('COLE_O_UUID_AQUI', 'admin', 'Administrador', 'admin', false, true)
on conflict (id) do update set role = 'admin', active = true;
