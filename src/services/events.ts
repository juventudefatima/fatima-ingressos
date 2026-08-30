import { supabase } from '@/lib/supabaseClient'
import type { EventItem, EventStatus } from '@/types'

export async function listEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false })
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
