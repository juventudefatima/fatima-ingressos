// Edge Function: admin-edit-customer
// Só admin pode chamar. Edita nome e/ou telefone de um cliente.
//
// Por que isso precisa ser uma Edge Function e não um UPDATE direto: o
// telefone é usado pra montar o e-mail sintético de login
// (cliente.<telefone>@eventix.local). Se só atualizássemos a coluna
// "phone" na tabela, o cliente ficaria com telefone novo no cadastro mas
// login antigo — quebrando o acesso dele. Aqui sincronizamos os dois.

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

    const { customer_id, full_name, phone } = await req.json()
    if (!customer_id) throw new Error('Cliente não informado.')

    const { data: customer } = await admin.from('customers').select('phone').eq('id', customer_id).single()
    if (!customer) throw new Error('Cliente não encontrado.')

    const newDigits = phone ? String(phone).replace(/\D/g, '') : customer.phone
    if (newDigits.length < 10) throw new Error('Telefone inválido.')

    if (newDigits !== customer.phone) {
      const { data: conflict } = await admin.from('customers').select('id').eq('phone', newDigits).maybeSingle()
      if (conflict) throw new Error('Já existe outro cliente cadastrado com esse telefone.')

      const { error: emailErr } = await admin.auth.admin.updateUserById(customer_id, {
        email: `cliente.${newDigits}@eventix.local`,
      })
      if (emailErr) throw new Error(emailErr.message)

      await admin.from('customers').update({ phone: newDigits }).eq('id', customer_id)
    }

    if (full_name && String(full_name).trim()) {
      await admin.from('profiles').update({ full_name: String(full_name).trim() }).eq('id', customer_id)
    }

    await admin.from('audit_logs').insert({
      actor_id: userData.user.id,
      actor_role: 'admin',
      action: 'customer.edit',
      details: { customer_id, new_phone: newDigits !== customer.phone ? newDigits : undefined, new_name: full_name },
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
