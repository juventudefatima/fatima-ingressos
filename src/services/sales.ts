import { supabase, FUNCTIONS_URL } from '@/lib/supabaseClient'
import type { PaymentMethod, PaymentStatus } from '@/types'

export async function findOrCreateCustomer(fullName: string, phone: string) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${FUNCTIONS_URL}/create-customer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ full_name: fullName, phone }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Erro ao registrar cliente.')
  return json as { customer_id: string; created: boolean; initial_password?: string }
}

export async function createSale(input: {
  event_id: string
  customer_id: string
  items: { product_id: string; quantity: number }[]
  payment_method: PaymentMethod
  payment_status: PaymentStatus
}) {
  const { data, error } = await supabase.rpc('create_sale', {
    p_event_id: input.event_id,
    p_customer_id: input.customer_id,
    p_items: input.items,
    p_payment_method: input.payment_method,
    p_payment_status: input.payment_status,
  })
  if (error) throw new Error(error.message)
  return data as { order_id: string; ticket_id: string; ticket_code: string; total: number }
}
