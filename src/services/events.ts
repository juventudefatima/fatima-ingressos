import { supabase } from '@/lib/supabaseClient'
import type { EventItem, EventStatus } from '@/types'

export async function listEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false })
  if (error) throw error
  return data as EventItem[]
}

// Usado por Caixa e Validador: admin vê todos os eventos; cashier/validator
// só veem os eventos em que o admin atribuiu eles (tabela event_staff).
export async function listMyEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase.rpc('list_my_events')
  if (error) throw error
  return data as EventItem[]
}

export async function createEvent(input: {
  name: string
  description?: string
  event_date: string
  event_time: string
  location: string
  status?: EventStatus
  primary_color?: string | null
  logo_url?: string | null
}) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('events')
    .insert({ ...input, created_by: userData.user?.id })
    .select()
    .single()
  if (error) throw error
  return data as EventItem
}

export async function updateEvent(id: string, input: Partial<EventItem>) {
  const { data, error } = await supabase.from('events').update(input).eq('id', id).select().single()
  if (error) throw error
  return data as EventItem
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}

// Envia o logo pro bucket público "event-logos" e devolve a URL pública
// pra salvar em events.logo_url.
export async function uploadEventLogo(eventId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${eventId}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('event-logos').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('event-logos').getPublicUrl(path)
  return data.publicUrl
}
