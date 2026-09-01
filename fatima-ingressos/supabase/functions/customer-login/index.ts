// Edge Function: customer-login
// Substitui o supabase.auth.signInWithPassword() direto do frontend para o
// login de CLIENTE. Motivo: só aqui, com a service_role key, dá pra checar
// e atualizar o contador de tentativas erradas ANTES de tentar autenticar —
// se o cliente não pudesse ser interceptado, qualquer um poderia tentar
// senhas ilimitadas direto pela API do Supabase Auth.
//
// Regra: 5 tentativas erradas seguidas -> bloqueia por 15 minutos.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15
const INITIAL_PASSWORD_PAD = 'Evtx26' // igual ao padInitialPassword() do frontend

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone, password } = await req.json()
    const digits = String(phone || '').replace(/\D/g, '')
    if (digits.length < 10 || !password) throw new Error('Telefone ou senha inválidos.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: customer } = await admin
      .from('customers')
      .select('id, failed_login_attempts, locked_until')
      .eq('phone', digits)
      .maybeSingle()

    // Mensagem genérica sempre igual, exista ou não o telefone — evita que
    // alguém descubra quais telefones têm cadastro só testando o login.
    const genericError = 'Telefone ou senha inválidos.'

    if (!customer) throw new Error(genericError)

    if (customer.locked_until && new Date(customer.locked_until) > new Date()) {
      const minutosRestantes = Math.ceil((new Date(customer.locked_until).getTime() - Date.now()) / 60000)
      throw new Error(`Muitas tentativas erradas. Tente de novo em ${minutosRestantes} minuto(s).`)
    }

    const email = `cliente.${digits}@eventix.local`
    const anon = createClient(supabaseUrl, anonKey)

    let { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({ email, password })

    // Mesma lógica de padding da senha inicial de 4 dígitos que existe no
    // frontend (ver padInitialPassword em utils/phone.ts) — replicada aqui
    // porque esta função roda em Deno, fora do bundle do frontend.
    if (signInErr && /^\d{4}$/.test(password)) {
      ;({ data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
        email,
        password: `${password}${INITIAL_PASSWORD_PAD}`,
      }))
    }

    if (signInErr || !signInData.session) {
      const attempts = (customer.failed_login_attempts || 0) + 1
      const update: Record<string, unknown> = { failed_login_attempts: attempts }
      if (attempts >= MAX_ATTEMPTS) {
        update.locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
      }
      await admin.from('customers').update(update).eq('id', customer.id)

      if (attempts >= MAX_ATTEMPTS) {
        throw new Error(`Muitas tentativas erradas. Conta bloqueada por ${LOCK_MINUTES} minutos.`)
      }
      throw new Error(genericError)
    }

    // Login certo: zera o contador de tentativas.
    await admin.from('customers').update({ failed_login_attempts: 0, locked_until: null }).eq('id', customer.id)

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
