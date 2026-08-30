// Edge Function: create-staff-user
// Somente admin. Cria login de CAIXA ou VALIDADOR com usuário/senha
// definidos pelo próprio admin (não usa e-mail real do funcionário).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autenticado.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData.user) throw new Error('Não autenticado.')

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .single()

    if (!callerProfile || !callerProfile.active || callerProfile.role !== 'admin') {
      throw new Error('Somente administradores podem criar usuários.')
    }

    const { full_name, username, password, role } = await req.json()
    if (!full_name || !username || !password || !role) {
      throw new Error('Preencha nome, usuário, senha e tipo.')
    }
    if (!['cashier', 'validator'].includes(role)) {
      throw new Error('Tipo de usuário inválido.')
    }
    if (password.length < 6) {
      throw new Error('A senha deve ter ao menos 6 caracteres.')
    }

    const cleanUsername = String(username).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
    if (!cleanUsername) throw new Error('Usuário inválido.')

    const { data: existing } = await admin.from('profiles').select('id').eq('username', cleanUsername).maybeSingle()
    if (existing) throw new Error('Já existe um usuário com esse login.')

    const syntheticEmail = `staff.${cleanUsername}@eventix.local`

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name, username: cleanUsername, role },
    })
    if (createErr) throw createErr
    const newUserId = created.user.id

    const { error: profileErr } = await admin.from('profiles').insert({
      id: newUserId,
      role,
      full_name,
      username: cleanUsername,
      must_change_password: true,
      active: true,
      created_by: userData.user.id,
    })
    if (profileErr) throw profileErr

    await admin.from('audit_logs').insert({
      actor_id: userData.user.id,
      actor_role: 'admin',
      action: 'staff_user.create',
      details: { user_id: newUserId, role, username: cleanUsername },
    })

    return new Response(
      JSON.stringify({ user_id: newUserId, username: cleanUsername, login_email: syntheticEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
