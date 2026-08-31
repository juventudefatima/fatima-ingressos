import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { listOrdersByEvent, cancelOrder, editOrderItem } from '@/services/admin'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Loading } from '@/components/ui/Loading'
import { formatCurrency, formatDateTime } from '@/utils/format'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = any

function OrderItemRow({ item, onSaved }: { item: OrderRow; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [qty, setQty] = useState(String(item.quantity))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const n = parseInt(qty, 10)
    if (!n || n <= 0) {
      toast.error('Informe uma quantidade válida.')
      return
    }
    setSaving(true)
    try {
      await editOrderItem(item.id, n)
      toast.success('Item atualizado.')
      setEditing(false)
      onSaved()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-1">
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-16 border border-line rounded px-2 py-1 text-sm"
        />
        <span>x {item.product_name_snapshot}</span>
        <button className="text-primary text-xs font-semibold" onClick={handleSave} disabled={saving}>
          Salvar
        </button>
        <button className="text-ink/40 text-xs" onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-2 py-1">
      <span>{item.quantity}x {item.product_name_snapshot} — {formatCurrency(item.subtotal)}</span>
      <button className="text-primary text-xs font-semibold" onClick={() => setEditing(true)}>
        Editar
      </button>
    </li>
  )
}

export default function OrdersPage() {
  const { eventId = '' } = useParams()
  const [orders, setOrders] = useState<OrderRow[] | null>(null)

  function reload() {
    listOrdersByEvent(eventId).then(setOrders).catch((e) => toast.error(e.message))
  }
  useEffect(reload, [eventId])

  async function handleCancel(orderId: string) {
    if (!confirm('Cancelar este pedido? O ticket ficará inválido, mas o histórico é mantido.')) return
    try {
      await cancelOrder(orderId)
      toast.success('Pedido cancelado.')
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (orders === null) return <Loading />

  return (
    <div className="space-y-4 max-w-2xl">
      <a href="/fatima-ingressos/admin" className="text-sm text-primary underline">← Voltar aos eventos</a>
      <h2 className="font-display font-bold text-xl">Pedidos</h2>
      <div className="grid gap-3">
        {orders.map((o) => (
          <Card key={o.id} className="p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-semibold">{o.customers?.profiles?.full_name} — {o.customers?.phone}</p>
                <p className="text-xs text-ink/50">{formatDateTime(o.created_at)}</p>
              </div>
              <Badge tone={o.status === 'cancelled' ? 'danger' : 'success'}>
                {o.status === 'cancelled' ? 'Cancelado' : o.payment_status}
              </Badge>
            </div>
            <ul className="text-sm text-ink/70 mb-2">
              {o.order_items?.map((it: OrderRow) => (
                <OrderItemRow key={it.id} item={it} onSaved={reload} />
              ))}
            </ul>
            <div className="flex justify-between items-center pt-2 border-t border-line">
              <span className="font-semibold">{formatCurrency(o.total)}</span>
              {o.status !== 'cancelled' && (
                <Button size="sm" variant="danger" onClick={() => handleCancel(o.id)}>Cancelar pedido</Button>
              )}
            </div>
          </Card>
        ))}
        {orders.length === 0 && <p className="text-sm text-ink/50">Nenhum pedido ainda.</p>}
      </div>
    </div>
  )
}
