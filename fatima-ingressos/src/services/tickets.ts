import { supabase } from '@/lib/supabaseClient'
import type { MyTicket, ValidationTicket } from '@/types'

export async function getMyTickets(): Promise<MyTicket[]> {
  const { data, error } = await supabase.rpc('get_my_tickets')
  if (error) throw new Error(error.message)
  return data as MyTicket[]
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
