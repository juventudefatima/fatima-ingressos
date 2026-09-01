// Edge Function: admin-delete-staff-user
// Só admin pode chamar. Exclui de vez o usuário do Supabase Auth — a linha
// em public.profiles some sozinha por causa do "on delete cascade" na FK.
// Por segurança, só deixa excluir cashier/validator (nunca outro admin, pra
// não correr o risco de a organização ficar sem nenhum admin por engano).

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

    const { user_id } = await req.json()
    if (!user_id) throw new Error('Informe o usuário a excluir.')

    const { data: targetProfile } = await admin.from('profiles').select('role, username').eq('id', user_id).single()
    if (!targetProfile) throw new Error('Usuário não encontrado.')
    if (!['cashier', 'validator'].includes(targetProfile.role)) {
      throw new Error('Só é possível excluir usuários de caixa ou validação por aqui.')
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(user_id)
    if (deleteErr) throw new Error(deleteErr.message)

    await admin.from('audit_logs').insert({
      actor_id: userData.user.id,
      actor_role: 'admin',
      action: 'user.delete',
      details: { user_id, username: targetProfile.username, role: targetProfile.role },
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
