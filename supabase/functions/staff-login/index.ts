// Edge Function: staff-login
// Mesma lógica de customer-login, mas pra equipe (cashier/validator/admin),
// usando as colunas failed_login_attempts/locked_until na tabela profiles.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { username, password } = await req.json()
    const cleanUsername = String(username || '').trim().toLowerCase()
    if (!cleanUsername || !password) throw new Error('Usuário ou senha inválidos.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const genericError = 'Usuário ou senha inválidos.'

    const { data: staffProfile } = await admin
      .from('profiles')
      .select('id, failed_login_attempts, locked_until, active')
      .eq('username', cleanUsername)
      .maybeSingle()

    if (!staffProfile) throw new Error(genericError)
    if (!staffProfile.active) throw new Error('Usuário bloqueado. Fale com o administrador.')

    if (staffProfile.locked_until && new Date(staffProfile.locked_until) > new Date()) {
      const minutosRestantes = Math.ceil((new Date(staffProfile.locked_until).getTime() - Date.now()) / 60000)
      throw new Error(`Muitas tentativas erradas. Tente de novo em ${minutosRestantes} minuto(s).`)
    }

    const email = `staff.${cleanUsername}@eventix.local`
    const anon = createClient(supabaseUrl, anonKey)
    const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({ email, password })

    if (signInErr || !signInData.session) {
      const attempts = (staffProfile.failed_login_attempts || 0) + 1
      const update: Record<string, unknown> = { failed_login_attempts: attempts }
      if (attempts >= MAX_ATTEMPTS) {
        update.locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
      }
      await admin.from('profiles').update(update).eq('id', staffProfile.id)

      if (attempts >= MAX_ATTEMPTS) {
        throw new Error(`Muitas tentativas erradas. Conta bloqueada por ${LOCK_MINUTES} minutos.`)
      }
      throw new Error(genericError)
    }

    await admin.from('profiles').update({ failed_login_attempts: 0, locked_until: null }).eq('id', staffProfile.id)

    return new Response(
      JSON.stringify({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
