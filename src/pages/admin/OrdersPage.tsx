import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  listOrdersByEvent,
  cancelOrder,
  editOrderItem,
  uncancelOrder,
  addOrderItem,
  removeOrderItem,
} from '@/services/admin'
import { listProductsByEvent } from '@/services/products'
import type { Product } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
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

  async function handleRemove() {
    if (!confirm(`Remover "${item.product_name_snapshot}" deste pedido?`)) return
    setSaving(true)
    try {
      await removeOrderItem(item.id)
      toast.success('Item removido.')
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
      <button className="text-danger text-xs font-semibold" onClick={handleRemove} disabled={saving}>
        Remover
      </button>
    </li>
  )
}

function AddItemRow({ orderId, eventId, existingProductIds, onSaved }: {
  orderId: string
  eventId: string
  existingProductIds: string[]
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [products, setProducts] = useState<Product[] | null>(null)
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('1')
  const [saving, setSaving] = useState(false)

  function toggleOpen() {
    if (!open && products === null) {
      listProductsByEvent(eventId)
        .then((list) => {
          const active = list.filter((p) => p.active)
          setProducts(active)
          if (active.length > 0) setProductId(active[0].id)
        })
        .catch((err) => toast.error(err.message))
    }
    setOpen(!open)
  }

  async function handleAdd() {
    const n = parseInt(qty, 10)
    if (!productId || !n || n <= 0) {
      toast.error('Escolha um produto e uma quantidade válida.')
      return
    }
    setSaving(true)
    try {
      await addOrderItem(orderId, productId, n)
      toast.success('Item adicionado.')
      setQty('1')
      setOpen(false)
      onSaved()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2">
      <button type="button" className="text-primary text-xs font-semibold" onClick={toggleOpen}>
        {open ? 'Fechar' : '+ Adicionar item ao pedido'}
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {products === null && <p className="text-xs text-ink/50">Carregando produtos…</p>}
          {products && products.length === 0 && <p className="text-xs text-ink/50">Nenhum produto ativo neste evento.</p>}
          {products && products.length > 0 && (
            <>
              <Select value={productId} onChange={(e) => setProductId(e.target.value)} className="!w-auto text-sm">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{existingProductIds.includes(p.id) ? ' (já no pedido)' : ''}
                  </option>
                ))}
              </Select>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-16 border border-line rounded px-2 py-1.5 text-sm"
              />
              <Button size="sm" onClick={handleAdd} loading={saving}>Adicionar</Button>
            </>
          )}
        </div>
      )}
    </div>
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

  async function handleUncancel(orderId: string) {
    if (!confirm('Reativar este pedido? O ticket volta a ficar válido.')) return
    try {
      await uncancelOrder(orderId)
      toast.success('Pedido reativado.')
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
            {o.status !== 'cancelled' && (
              <AddItemRow
                orderId={o.id}
                eventId={eventId}
                existingProductIds={(o.order_items || []).map((it: OrderRow) => it.product_id)}
                onSaved={reload}
              />
            )}
            <div className="flex justify-between items-center pt-2 mt-2 border-t border-line">
              <span className="font-semibold">{formatCurrency(o.total)}</span>
              {o.status === 'cancelled' ? (
                <Button size="sm" variant="outline" onClick={() => handleUncancel(o.id)}>Reativar pedido</Button>
              ) : (
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
