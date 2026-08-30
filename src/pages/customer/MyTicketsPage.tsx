import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getMyTickets } from '@/services/tickets'
import { supabase } from '@/lib/supabaseClient'
import type { MyTicket } from '@/types'
import { TicketStub } from '@/components/ticket/TicketStub'
import { Loading } from '@/components/ui/Loading'
import { EmptyState } from '@/components/ui/EmptyState'

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<MyTicket[] | null>(null)

  function reload() {
    getMyTickets()
      .then(setTickets)
      .catch((err) => toast.error(err.message))
  }

  useEffect(() => {
    reload()

    // Tempo real: assim que um validador confirma a entrega de algum item
    // (o que atualiza ticket_items/tickets no banco), recarrega a lista na
    // hora — sem precisar a pessoa dar F5. O Realtime já respeita a RLS:
    // só chegam eventos das linhas que este cliente poderia ler mesmo.
    const channel = supabase
      .channel('my-tickets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_items' }, reload)
      .subscribe()

    // Reforço: mesmo se o Realtime não disparar por algum motivo (rede,
    // configuração do projeto), garante no máximo 2s de atraso.
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

  return (
    <div className="space-y-6">
      <h1 className="font-display font-bold text-2xl">Meus tickets</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        {tickets.map((t) => (
          <TicketStub key={t.id} ticket={t} />
        ))}
      </div>
    </div>
  )
}
