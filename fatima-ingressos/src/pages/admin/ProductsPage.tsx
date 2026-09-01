import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { listProductsByEvent, createProduct, updateProduct, toggleProductActive } from '@/services/products'
import { listEvents } from '@/services/events'
import type { Product, EventItem } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Loading } from '@/components/ui/Loading'
import { formatCurrency } from '@/utils/format'

export default function ProductsPage() {
  const { eventId = '' } = useParams()
  const [event, setEvent] = useState<EventItem | null>(null)
  const [products, setProducts] = useState<Product[] | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stockLimit, setStockLimit] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editStock, setEditStock] = useState('')

  function reload() {
    listProductsByEvent(eventId).then(setProducts).catch((e) => toast.error(e.message))
  }
  useEffect(() => {
    reload()
    listEvents().then((evs) => setEvent(evs.find((e) => e.id === eventId) || null))
  }, [eventId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const priceNum = Number(price.replace(',', '.'))
    if (!name.trim() || isNaN(priceNum) || priceNum < 0) {
      toast.error('Informe nome e preço válidos.')
      return
    }
    const stockNum = stockLimit.trim() ? parseInt(stockLimit, 10) : null
    setSaving(true)
    try {
      await createProduct({ event_id: eventId, name: name.trim(), price: priceNum, stock_limit: stockNum })
      setName('')
      setPrice('')
      setStockLimit('')
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function saveEditedPrice(id: string) {
    const priceNum = Number(editPrice.replace(',', '.'))
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('Preço inválido.')
      return
    }
    const stockNum = editStock.trim() ? parseInt(editStock, 10) : null
    try {
      await updateProduct(id, { price: priceNum, stock_limit: stockNum })
      setEditingId(null)
      reload()
      toast.success('Produto atualizado. Pedidos antigos mantêm o valor histórico.')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (products === null) return <Loading />

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <a href="/admin" className="text-sm text-primary underline">← Voltar aos eventos</a>
        <h2 className="font-display font-bold text-xl mt-1">Produtos — {event?.name}</h2>
      </div>

      <Card className="p-4">
        <form onSubmit={handleCreate} className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <Input label="Novo produto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hambúrguer" />
          </div>
          <div className="w-28">
            <Input label="Preço (R$)" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15,00" inputMode="decimal" />
          </div>
          <div className="w-32">
            <Input
              label="Estoque (opcional)"
              value={stockLimit}
              onChange={(e) => setStockLimit(e.target.value)}
              placeholder="Sem limite"
              inputMode="numeric"
            />
          </div>
          <Button type="submit" loading={saving}>Adicionar</Button>
        </form>
      </Card>

      <div className="grid gap-3">
        {products.map((p) => (
          <Card key={p.id} className="p-4 flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="font-medium">{p.name}</p>
              {editingId === p.id ? (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <input
                    className="w-24 rounded-lg border border-line px-2 py-1 text-sm"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    autoFocus
                  />
                  <input
                    className="w-28 rounded-lg border border-line px-2 py-1 text-sm"
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    placeholder="Sem limite"
                  />
                  <Button size="sm" onClick={() => saveEditedPrice(p.id)}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
                </div>
              ) : (
                <button
                  className="text-sm text-ink/50 underline decoration-dotted"
                  onClick={() => { setEditingId(p.id); setEditPrice(String(p.price)); setEditStock(p.stock_limit ? String(p.stock_limit) : '') }}
                >
                  {formatCurrency(p.price)} · {p.stock_limit ? `limite: ${p.stock_limit}` : 'sem limite de estoque'} (editar)
                </button>
              )}
            </div>
            <Button
              size="sm"
              variant={p.active ? 'outline' : 'secondary'}
              onClick={() => toggleProductActive(p.id, !p.active).then(reload)}
            >
              {p.active ? 'Desativar' : 'Ativar'}
            </Button>
          </Card>
        ))}
        {products.length === 0 && <p className="text-sm text-ink/50">Nenhum produto cadastrado ainda.</p>}
      </div>
    </div>
  )
}
