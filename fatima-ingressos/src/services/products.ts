import { supabase } from '@/lib/supabaseClient'
import type { Product } from '@/types'

export async function listProductsByEvent(eventId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data as Product[]
}

export async function createProduct(input: { event_id: string; name: string; price: number; sort_order?: number; stock_limit?: number | null }) {
  const { data, error } = await supabase.from('products').insert(input).select().single()
  if (error) throw error
  return data as Product
}

export async function updateProduct(id: string, input: Partial<Product>) {
  const { data, error } = await supabase.from('products').update(input).eq('id', id).select().single()
  if (error) throw error
  return data as Product
}

export async function toggleProductActive(id: string, active: boolean) {
  return updateProduct(id, { active })
}
