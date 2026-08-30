// Edge Function: request-password-reset
// Chamada por QUALQUER pessoa (cliente ou equipe) que clicou em "esqueci
// minha senha" — por isso não exige login. Só registra a solicitação;
// quem realmente reseta a senha é o admin, manualmente, pela tela dele.
//
// Aceita telefone (cliente) OU usuário (equipe) no mesmo campo: se parece
// telefone (10+ dígitos), trata como cliente; senão, como usuário de equipe.
//
// Sempre responde com a mesma mensagem de sucesso, mesmo se não achar
// ninguém com esse identificador — evita confirmar pra quem está tentando
// adivinhar quais contas existem.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const genericResponse = () =>
    new Response(
      JSON.stringify({ ok: true, message: 'Solicitação enviada! Um administrador vai entrar em contato para redefinir sua senha.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  try {
    const { identifier } = await req.json()
    const raw = String(identifier || '').trim()
    if (!raw) throw new Error('Informe seu telefone ou usuário.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const digits = raw.replace(/\D/g, '')
    const isPhone = digits.length >= 10

    let targetRole: 'customer' | 'staff'
    let profileId: string | null = null
    let identifierToStore: string

    if (isPhone) {
      targetRole = 'customer'
      identifierToStore = digits
      const { data: customer } = await admin.from('customers').select('id').eq('phone', digits).maybeSingle()
      profileId = customer?.id ?? null
    } else {
      targetRole = 'staff'
      identifierToStore = raw.toLowerCase()
      const { data: profile } = await admin.from('profiles').select('id').eq('username', identifierToStore).maybeSingle()
      profileId = profile?.id ?? null
    }

    await admin.from('password_reset_requests').insert({
      target_role: targetRole,
      identifier: identifierToStore,
      profile_id: profileId,
    })

    return genericResponse()
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
