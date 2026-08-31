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

export async function deleteStaffUser(userId: string) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${FUNCTIONS_URL}/admin-delete-staff-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ user_id: userId }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Erro ao excluir usuário.')
}

const CUSTOMERS_PAGE_SIZE = 50

export async function listCustomers(offset = 0, search = '') {
  const term = search.trim()

  if (term) {
    const digits = term.replace(/\D/g, '')
    if (digits.length >= 3) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, phone, created_at, profiles(full_name), orders(id)')
        .ilike('phone', `%${digits}%`)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }
    // Busca por nome: o supabase-js não filtra fácil por coluna de tabela
    // aninhada (profiles.full_name) direto no join, então trazemos até 200
    // registros recentes e filtramos o nome no cliente.
    const { data, error } = await supabase
      .from('customers')
      .select('id, phone, created_at, profiles(full_name), orders(id)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    const lower = term.toLowerCase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).filter((c: any) => (c.profiles?.full_name || '').toLowerCase().includes(lower))
  }

  const { data, error } = await supabase
    .from('customers')
    .select('id, phone, created_at, profiles(full_name), orders(id)')
    .order('created_at', { ascending: false })
    .range(offset, offset + CUSTOMERS_PAGE_SIZE - 1)
  if (error) throw error
  return data
}

// --- atribuição de eventos por usuário da equipe ---

export async function listEventStaff(profileId: string): Promise<string[]> {
  const { data, error } = await supabase.from('event_staff').select('event_id').eq('profile_id', profileId)
  if (error) throw error
  return (data || []).map((r) => r.event_id)
}

export async function setEventStaff(profileId: string, eventIds: string[]) {
  const { error: delErr } = await supabase.from('event_staff').delete().eq('profile_id', profileId)
  if (delErr) throw delErr
  if (eventIds.length === 0) return
  const { error: insErr } = await supabase
    .from('event_staff')
    .insert(eventIds.map((event_id) => ({ event_id, profile_id: profileId })))
  if (insErr) throw insErr
}

// --- editar/excluir cliente ---

export async function editCustomer(customerId: string, fullName: string, phone: string) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch(`${FUNCTIONS_URL}/admin-edit-customer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ customer_id: customerId, full_name: fullName, phone }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Erro ao editar cliente.')
}

export async function deleteCustomer(customerId: string) {
  const { error } = await supabase.rpc('admin_delete_customer', { p_customer_id: customerId })
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
