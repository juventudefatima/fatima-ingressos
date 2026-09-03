export type UserRole = 'admin' | 'cashier' | 'validator' | 'customer'
export type EventStatus = 'draft' | 'published' | 'closed' | 'cancelled'
export type PaymentMethod = 'cash' | 'pix' | 'card' | 'other'
export type PaymentStatus = 'paid' | 'pending' | 'cancelled'
export type TicketStatus = 'active' | 'cancelled' | 'fully_redeemed'

export interface Profile {
  id: string
  role: UserRole
  full_name: string
  phone: string | null
  username: string | null
  must_change_password: boolean
  active: boolean
  created_at: string
}

export interface EventItem {
  id: string
  name: string
  description: string | null
  event_date: string
  event_time: string
  location: string
  status: EventStatus
  created_at: string
  primary_color: string | null
  logo_url: string | null
  allow_offline: boolean
}

export interface Product {
  id: string
  event_id: string
  name: string
  price: number
  active: boolean
  sort_order: number
  stock_limit: number | null
}

export interface TicketItemView {
  ticket_item_id?: string
  product_name: string
  quantity_purchased: number
  quantity_redeemed: number
  available: number
}

export interface MyTicket {
  id: string
  status: TicketStatus
  public_code: string | null
  locked: boolean
  event_id: string
  event_name: string
  event_date: string
  event_time: string
  location: string
  event_status: EventStatus
  primary_color: string | null
  logo_url: string | null
  items: TicketItemView[]
}

export interface ValidationTicket {
  ticket_id: string
  public_code: string
  status: TicketStatus
  event_name: string
  items: TicketItemView[]
}

export interface CartLine {
  product: Product
  quantity: number
}

export interface EventReport {
  totals: {
    total_orders: number
    total_tickets: number
    total_revenue: number
    total_items_sold: number
    total_items_delivered: number
  }
  by_product: { product_name: string; sold: number; delivered: number; remaining: number }[]
  by_cashier: { cashier_name: string; sales_count: number; total_amount: number }[]
  by_validator: { validator_name: string; redemptions_count: number; items_delivered: number }[]
}