// Edge Function: admin-reset-password
// Só admin pode chamar. Recebe o id de uma solicitação pendente e a nova
// senha (escolhida pelo próprio admin, ele quem avisa a pessoa por fora do
// sistema), define a senha via Admin API e marca a solicitação como
// resolvida.

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
      throw new Error('Você não possui permissão para realizar esta operação.')
    }

    const { request_id, new_password } = await req.json()
    if (!request_id || !new_password || String(new_password).length < 6) {
      throw new Error('Informe uma senha com pelo menos 6 caracteres.')
    }

    const { data: request } = await admin
      .from('password_reset_requests')
      .select('id, profile_id, status')
      .eq('id', request_id)
      .single()

    if (!request) throw new Error('Solicitação não encontrada.')
    if (!request.profile_id) {
      throw new Error('Não foi possível localizar automaticamente essa conta — confira o telefone/usuário e crie/edite manualmente se precisar.')
    }

    await admin.auth.admin.updateUserById(request.profile_id, { password: new_password })
    await admin.from('profiles').update({ must_change_password: true }).eq('id', request.profile_id)
    // Se for cliente, também destrava caso estivesse bloqueado por tentativas erradas.
    await admin.from('customers').update({ failed_login_attempts: 0, locked_until: null }).eq('id', request.profile_id)

    await admin
      .from('password_reset_requests')
      .update({ status: 'done', resolved_at: new Date().toISOString(), resolved_by: userData.user.id })
      .eq('id', request_id)

    await admin.from('audit_logs').insert({
      actor_id: userData.user.id,
      actor_role: 'admin',
      action: 'password_reset.resolve',
      details: { request_id, profile_id: request.profile_id },
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
