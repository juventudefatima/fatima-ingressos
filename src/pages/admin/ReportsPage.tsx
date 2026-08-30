import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listEvents } from '@/services/events'
import { getEventReport } from '@/services/admin'
import { supabase } from '@/lib/supabaseClient'
import type { EventItem, EventReport } from '@/types'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Loading } from '@/components/ui/Loading'
import { formatCurrency } from '@/utils/format'

export default function ReportsPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventId, setEventId] = useState('')
  const [report, setReport] = useState<EventReport | null>(null)

  useEffect(() => {
    listEvents().then((evs) => {
      setEvents(evs)
      if (evs.length > 0) setEventId(evs[0].id)
    })
  }, [])

  useEffect(() => {
    if (!eventId) return
    setReport(null)
    getEventReport(eventId).then(setReport).catch((e) => toast.error(e.message))

    // Atualiza os números sozinho a cada venda, entrega ou cancelamento
    // deste evento, sem precisar recarregar a página.
    const channel = supabase
      .channel(`report-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `event_id=eq.${eventId}` }, () => {
        getEventReport(eventId).then(setReport).catch((e) => toast.error(e.message))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_items' }, () => {
        getEventReport(eventId).then(setReport).catch((e) => toast.error(e.message))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'redemptions', filter: `event_id=eq.${eventId}` }, () => {
        getEventReport(eventId).then(setReport).catch((e) => toast.error(e.message))
      })
      .subscribe()

    // Reforço: no máximo 2s de atraso mesmo sem o evento do Realtime.
    const interval = setInterval(() => {
      getEventReport(eventId).then(setReport).catch(() => {})
    }, 2000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [eventId])

  return (
    <div className="space-y-5 max-w-2xl">
      <Select label="Evento" value={eventId} onChange={(e) => setEventId(e.target.value)}>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>{ev.name}</option>
        ))}
      </Select>

      {!report ? (
        <Loading label="Carregando relatório…" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Vendas" value={report.totals.total_orders} />
            <StatCard label="Tickets emitidos" value={report.totals.total_tickets} />
            <StatCard label="Itens vendidos" value={report.totals.total_items_sold} />
            <StatCard label="Itens entregues" value={report.totals.total_items_delivered} />
            <StatCard label="Arrecadado" value={formatCurrency(report.totals.total_revenue)} />
          </div>

          <Card className="p-5">
            <h3 className="font-display font-semibold mb-3">Produtos</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink/50">
                  <th className="pb-2">Produto</th>
                  <th className="pb-2 text-right">Vendidos</th>
                  <th className="pb-2 text-right">Entregues</th>
                  <th className="pb-2 text-right">Restantes</th>
                </tr>
              </thead>
              <tbody>
                {report.by_product.map((p, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-2">{p.product_name}</td>
                    <td className="py-2 text-right">{p.sold}</td>
                    <td className="py-2 text-right">{p.delivered}</td>
                    <td className="py-2 text-right">{p.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h3 className="font-display font-semibold mb-3">Vendas por caixa</h3>
            {report.by_cashier.map((c, i) => (
              <div key={i} className="flex justify-between text-sm py-1.5 border-t border-line first:border-0">
                <span>{c.cashier_name}</span>
                <span>{c.sales_count} vendas · {formatCurrency(c.total_amount)}</span>
              </div>
            ))}
            {report.by_cashier.length === 0 && <p className="text-sm text-ink/50">Sem dados.</p>}
          </Card>

          <Card className="p-5">
            <h3 className="font-display font-semibold mb-3">Entregas por validador</h3>
            {report.by_validator.map((v, i) => (
              <div key={i} className="flex justify-between text-sm py-1.5 border-t border-line first:border-0">
                <span>{v.validator_name}</span>
                <span>{v.redemptions_count} operações · {v.items_delivered} itens</span>
              </div>
            ))}
            {report.by_validator.length === 0 && <p className="text-sm text-ink/50">Sem dados.</p>}
          </Card>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-ink/50 mb-1">{label}</p>
      <p className="font-display font-bold text-xl">{value}</p>
    </Card>
  )
}
