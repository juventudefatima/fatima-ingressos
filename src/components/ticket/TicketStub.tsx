import type { MyTicket } from '@/types'
import { formatDate, formatTime } from '@/utils/format'
import { BarcodeDisplay } from './BarcodeDisplay'
import { Badge } from '@/components/ui/Badge'

const statusLabel: Record<string, { text: string; tone: 'success' | 'warning' | 'danger' }> = {
  active: { text: 'Válido', tone: 'success' },
  fully_redeemed: { text: 'Ticket utilizado', tone: 'neutral' as unknown as 'success' },
  cancelled: { text: 'Cancelado', tone: 'danger' },
}

export function TicketStub({ ticket }: { ticket: MyTicket }) {
  const st = statusLabel[ticket.status] || statusLabel.active

  return (
    <div className="bg-surface rounded-ticket shadow-card overflow-hidden border border-line/60">
      <div className="bg-primary text-white px-6 py-5" style={ticket.primary_color ? { backgroundColor: ticket.primary_color } : undefined}>
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-white/70 font-semibold">{ticket.event_name}</p>
          {ticket.logo_url && (
            <img src={ticket.logo_url} alt="" className="h-8 w-8 object-contain rounded bg-white/10 p-0.5" />
          )}
        </div>
        <div className="flex items-end justify-between mt-2">
          <div>
            <p className="font-display font-bold text-2xl leading-none">{formatDate(ticket.event_date)}</p>
            <p className="text-white/80 text-sm mt-1">{formatTime(ticket.event_time)} · {ticket.location}</p>
          </div>
          <Badge tone={st.tone}>{st.text}</Badge>
        </div>
      </div>

      {/* "Perfuração" do ticket */}
      <div className="relative">
        <div className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-paper" />
        <div className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-paper" />
        <div className="border-t-2 border-dashed border-line mx-4" />
      </div>

      <div className="px-6 py-5">
        <p className="text-xs uppercase tracking-widest text-ink/40 font-semibold mb-3">Itens do ticket</p>
        <ul className="space-y-2 mb-6">
          {ticket.items.map((item, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span>
                {item.quantity_purchased}x {item.product_name}
              </span>
              <span className={`font-semibold ${item.available === 0 ? 'text-ink/40' : 'text-primary-dark'}`}>
                {item.available} disponível{item.available === 1 ? '' : 'is'}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-t border-line pt-5">
          {ticket.status === 'cancelled' ? (
            <p className="text-center text-danger text-sm font-medium py-4">Este ticket foi cancelado.</p>
          ) : ticket.locked ? (
            <p className="text-center text-ink/60 text-sm py-6">
              Seu ticket estará disponível no dia do evento
              <br />
              <span className="font-semibold">({formatDate(ticket.event_date)})</span>.
            </p>
          ) : ticket.status === 'fully_redeemed' ? (
            <p className="text-center text-ink/60 text-sm py-6">Ticket utilizado.</p>
          ) : ticket.public_code ? (
            <BarcodeDisplay value={ticket.public_code} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
