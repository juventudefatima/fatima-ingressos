import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getMyTickets } from '@/services/tickets'
import { supabase } from '@/lib/supabaseClient'
import type { MyTicket } from '@/types'
import { TicketStub } from '@/components/ticket/TicketStub'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Loading } from '@/components/ui/Loading'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate, formatTime } from '@/utils/format'

type View = 'events' | 'tickets' | 'detail'

const statusTone: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success', fully_redeemed: 'neutral', cancelled: 'danger',
}
const statusText: Record<string, string> = {
  active: 'Válido', fully_redeemed: 'Utilizado', cancelled: 'Cancelado',
}

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<MyTicket[] | null>(null)
  const [view, setView] = useState<View>('events')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  function reload() {
    getMyTickets()
      .then(setTickets)
      .catch((err) => toast.error(err.message))
  }

  useEffect(() => {
    reload()
    const channel = supabase
      .channel('my-tickets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_items' }, reload)
      .subscribe()
    const interval = setInterval(reload, 2000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  if (tickets === null) return <Loading label="Carregando seus tickets…" />
  if (tickets.length === 0) {
    return <EmptyState title="Você ainda não tem tickets" description="Seus tickets aparecerão aqui após uma compra em algum evento." />
  }

  // Agrupa os tickets por evento (um cliente pode ter mais de uma compra no mesmo evento)
  const eventsMap = new Map<string, MyTicket[]>()
  tickets.forEach((t) => {
    const list = eventsMap.get(t.event_id) || []
    list.push(t)
    eventsMap.set(t.event_id, list)
  })
  const eventGroups = Array.from(eventsMap.entries()).map(([eventId, ts]) => ({ eventId, tickets: ts, first: ts[0] }))

  // --- Tela 3: detalhe completo do ticket ---
  if (view === 'detail' && selectedTicketId) {
    const ticket = tickets.find((t) => t.id === selectedTicketId)
    if (!ticket) { setView('events'); return null }
    return (
      <div className="space-y-4 max-w-md mx-auto">
        <button className="text-sm text-primary font-medium" onClick={() => setView('tickets')}>
          ← Voltar aos tickets deste evento
        </button>
        <TicketStub ticket={ticket} />
      </div>
    )
  }

  // --- Tela 2: lista de tickets (compras) daquele evento ---
  if (view === 'tickets' && selectedEventId) {
    const group = eventGroups.find((g) => g.eventId === selectedEventId)
    if (!group) { setView('events'); return null }
    return (
      <div className="space-y-4 max-w-md mx-auto">
        <button className="text-sm text-primary font-medium" onClick={() => setView('events')}>
          ← Voltar aos meus eventos
        </button>
        <h1 className="font-display font-bold text-xl">{group.first.event_name}</h1>
        <div className="space-y-2">
          {group.tickets.map((t) => {
            const totalItens = t.items.reduce((s, i) => s + i.quantity_purchased, 0)
            return (
              <Card
                key={t.id}
                hoverable
                className="p-4 cursor-pointer flex items-center justify-between"
                onClick={() => { setSelectedTicketId(t.id); setView('detail') }}
              >
                <div>
                  <p className="font-medium">{totalItens} item(ns)</p>
                  <p className="text-sm text-ink/50">
                    {t.items.map((i) => `${i.quantity_purchased}x ${i.product_name}`).join(', ')}
                  </p>
                </div>
                <Badge tone={statusTone[t.status] || 'neutral'}>{statusText[t.status] || t.status}</Badge>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // --- Tela 1: lista de eventos que o cliente comprou ---
  return (
    <div className="space-y-6 max-w-md mx-auto">
      <h1 className="font-display font-bold text-2xl">Meus eventos</h1>
      <div className="grid gap-3">
        {eventGroups.map(({ eventId, tickets: ts, first }) => (
          <Card
            key={eventId}
            hoverable
            className="p-0 overflow-hidden cursor-pointer"
            onClick={() => { setSelectedEventId(eventId); setView('tickets') }}
          >
            <div className="px-5 py-4 text-white flex items-center gap-3 bg-primary" style={first.primary_color ? { backgroundColor: first.primary_color } : undefined}>
              {first.logo_url && <img src={first.logo_url} alt="" className="h-9 w-9 object-contain rounded bg-white/10 p-0.5" />}
              <div className="flex-1">
                <p className="font-display font-semibold">{first.event_name}</p>
                <p className="text-white/80 text-sm">{formatDate(first.event_date)} · {formatTime(first.event_time)}</p>
              </div>
              <span className="text-white/70 text-lg">›</span>
            </div>
            <div className="px-5 py-2.5 text-sm text-ink/50 bg-paper">
              {ts.length} compra(s) neste evento
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
