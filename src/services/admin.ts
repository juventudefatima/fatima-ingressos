import { supabase, FUNCTIONS_URL } from '@/lib/supabaseClient'
import type { EventReport, Profile } from '@/types'

export async function createStaffUser(input: {
  full_name: string
  username: string
  password: string
  role: 'cashier' | 'validator'
}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${FUNCTIONS_URL}/create-staff-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Erro ao criar usuário.')
  return json as { user_id: string; username: string }
}

export async function listStaff(role?: 'cashier' | 'validator'): Promise<Profile[]> {
  let query = supabase.from('profiles').select('*').in('role', role ? [role] : ['cashier', 'validator'])
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data as Profile[]
}

export async function setUserActive(userId: string, active: boolean) {
  const { error } = await supabase.rpc('admin_set_user_active', { p_user_id: userId, p_active: active })
  if (error) throw new Error(error.message)
}

export async function getEventReport(eventId: string): Promise<EventReport> {
  const { data, error } = await supabase.rpc('event_report', { p_event_id: eventId })
  if (error) throw new Error(error.message)
  return data as EventReport
}

export async function cancelOrder(orderId: string) {
  const { error } = await supabase.rpc('admin_cancel_order', { p_order_id: orderId })
  if (error) throw new Error(error.message)
}

export async function reopenTicketItem(ticketItemId: string, quantity: number) {
  const { error } = await supabase.rpc('admin_reopen_ticket_item', {
    p_ticket_item_id: ticketItemId,
    p_quantity: quantity,
  })
  if (error) throw new Error(error.message)
}

export async function listOrdersByEvent(eventId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customers(phone, profiles(full_name)), order_items(*)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function editOrderItem(orderItemId: string, newQuantity: number) {
  const { error } = await supabase.rpc('admin_edit_order_item', {
    p_order_item_id: orderItemId,
    p_new_quantity: newQuantity,
  })
  if (error) throw new Error(error.message)
}
