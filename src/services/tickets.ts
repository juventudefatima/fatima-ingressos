import { supabase } from '@/lib/supabaseClient'
import type { MyTicket, ValidationTicket } from '@/types'

export async function getMyTickets(): Promise<MyTicket[]> {
  const { data, error } = await supabase.rpc('get_my_tickets')
  if (error) throw new Error(error.message)
  return data as MyTicket[]
}

// Token rotativo (~15 min) para o QR do ticket — ver 07_rotating_qr_code.sql
export async function getRotatingTicketToken(ticketId: string): Promise<{ token: string; expires_at: string }> {
  const { data, error } = await supabase.rpc('get_rotating_ticket_token', { p_ticket_id: ticketId })
  if (error) throw new Error(error.message)
  return data as { token: string; expires_at: string }
}

// Usado pelo Validador: tenta decifrar o valor escaneado como um token
// rotativo. Se não for um token válido (ex: digitação manual do código
// permanente "TKXXXXXXXXXX", ainda mais curto), devolve o valor original
// sem erro — mantém 100% de compatibilidade com o fluxo antigo.
export async function resolveScannedCode(raw: string): Promise<string> {
  const trimmed = raw.trim()
  if (trimmed.length <= 16) return trimmed
  try {
    const { data, error } = await supabase.rpc('resolve_rotating_token', { p_token: trimmed })
    if (error) throw error
    return data as string
  } catch {
    return trimmed
  }
}

export async function getTicketForValidation(publicCode: string, eventId: string): Promise<ValidationTicket> {
  const { data, error } = await supabase.rpc('get_ticket_for_validation', {
    p_public_code: publicCode,
    p_event_id: eventId,
  })
  if (error) throw new Error(error.message)
  return data as ValidationTicket
}

export async function redeemTicketItems(
  publicCode: string,
  eventId: string,
  items: { ticket_item_id: string; quantity: number }[],
) {
  const { data, error } = await supabase.rpc('redeem_ticket_items', {
    p_public_code: publicCode,
    p_event_id: eventId,
    p_items: items,
  })
  if (error) throw new Error(error.message)
  return data
}

// Usado só pelo Validador em eventos com modo offline habilitado: baixa uma
// "foto" de todos os tickets ativos do evento, pra conseguir conferir mesmo
// sem internet. Não deve ser chamado em eventos sem allow_offline = true
// (a função no banco recusa e lança erro nesse caso).
export async function exportEventTicketsForOffline(eventId: string) {
  const { data, error } = await supabase.rpc('export_event_tickets_for_offline', { p_event_id: eventId })
  if (error) throw new Error(error.message)
  return data as {
    public_code: string
    ticket_id: string
    event_name: string
    items: { ticket_item_id: string; product_name: string; quantity_purchased: number; quantity_redeemed: number }[]
  }[]
}
