// Edge Function: create-customer
// Chamada pelo caixa (ou admin) no momento da venda.
// Usa a service_role key (variável de ambiente do lado do servidor, nunca
// exposta ao frontend) apenas aqui dentro, para criar a conta de Auth do
// cliente. Faz "find or create" pelo telefone.
//
// Regra de senha inicial: 4 primeiros dígitos do telefone, DESCONSIDERANDO
// o DDD. Ex.: (47) 99123-4567 -> DDD=47, restante=991234567 -> senha=9912.

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

    // Cliente "caller": só serve para descobrir QUEM está chamando e
    // reconferir o papel dele nas tabelas protegidas por RLS.
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

    if (!callerProfile || !callerProfile.active || !['cashier', 'admin'].includes(callerProfile.role)) {
      throw new Error('Você não possui permissão para realizar esta operação.')
    }

    const { full_name, phone } = await req.json()
    if (!full_name || !phone) throw new Error('Nome e telefone são obrigatórios.')

    const digits = String(phone).replace(/\D/g, '')
    if (digits.length < 10) throw new Error('Telefone inválido. Informe DDD + número.')

    // já existe cliente com este telefone?
    const { data: existingCustomer } = await admin
      .from('customers')
      .select('id, phone, profiles(full_name)')
      .eq('phone', digits)
      .maybeSingle()

    if (existingCustomer) {
      return new Response(
        JSON.stringify({ customer_id: existingCustomer.id, created: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const rest = digits.slice(2) // remove DDD
    const initialPassword = rest.slice(0, 4)
    if (initialPassword.length < 4) throw new Error('Telefone inválido para gerar senha inicial.')

    // BUGFIX: o Supabase Auth rejeita senhas com menos de 6 caracteres, e a
    // senha inicial (4 dígitos do telefone) tem só 4 — sem este ajuste, a
    // criação do usuário falhava sempre. O cliente continua digitando só os
    // 4 dígitos (é isso que ele recebe e usa no login); o sufixo fixo abaixo
    // é só para satisfazer a regra de tamanho mínimo do Supabase e nunca é
    // exposto a ele. Ver padInitialPassword() em utils/phone.ts.
    const PASSWORD_PAD = 'Evtx26'
    const authPassword = `${initialPassword}${PASSWORD_PAD}`

    const syntheticEmail = `cliente.${digits}@eventix.local`

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password: authPassword,
      email_confirm: true,
      user_metadata: { full_name, phone: digits, role: 'customer' },
    })
    if (createErr) throw createErr
    const newUserId = created.user.id

    const { error: profileErr } = await admin.from('profiles').insert({
      id: newUserId,
      role: 'customer',
      full_name,
      phone: digits,
      must_change_password: true,
      active: true,
      created_by: userData.user.id,
    })
    if (profileErr) throw profileErr

    const { error: customerErr } = await admin.from('customers').insert({
      id: newUserId,
      phone: digits,
    })
    if (customerErr) throw customerErr

    await admin.from('audit_logs').insert({
      actor_id: userData.user.id,
      actor_role: callerProfile.role,
      action: 'customer.create',
      details: { customer_id: newUserId, phone: digits },
    })

    return new Response(
      JSON.stringify({ customer_id: newUserId, created: true, initial_password: initialPassword, login_email: syntheticEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
