import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { listProductsByEvent } from '@/services/products'
import { listMyEvents } from '@/services/events'
import { findOrCreateCustomer, createSale } from '@/services/sales'
import type { EventItem, Product, PaymentMethod } from '@/types'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/format'
import { formatPhone } from '@/utils/phone'
import { Loading } from '@/components/ui/Loading'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { offlineDb, newLocalId, type PendingSale } from '@/lib/offlineDb'

interface Receipt {
  ticket_code: string | null
  total: number
  customerName: string
  customerPhone: string
  items: { name: string; quantity: number }[]
  newAccount: boolean
  initialPassword?: string
  pending: boolean
}

const PRODUCTS_CACHE_PREFIX = 'sidata-products-cache-'

export default function CashierPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null)
  const [eventId, setEventId] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const isOnline = useOnlineStatus()
  const currentEvent = events?.find((e) => e.id === eventId) || null
  const offlineAllowed = currentEvent?.allow_offline === true

  useEffect(() => {
    listMyEvents()
      .then((data) => {
        const published = data.filter((e) => e.status === 'published')
        setEvents(published)
        if (published.length > 0) setEventId(published[0].id)
      })
      .catch((err) => toast.error(err.message))
  }, [])

  // Enquanto online e o evento permite offline, mantém um cache local dos
  // produtos sempre atualizado — é o que o Caixa vai usar se a conexão cair.
  useEffect(() => {
    if (!eventId) return
    if (isOnline) {
      listProductsByEvent(eventId).then((list) => {
        const active = list.filter((p) => p.active)
        setProducts(active)
        setQuantities({})
        if (offlineAllowed) {
          localStorage.setItem(PRODUCTS_CACHE_PREFIX + eventId, JSON.stringify(active))
        }
      })
    } else if (offlineAllowed) {
      const cached = localStorage.getItem(PRODUCTS_CACHE_PREFIX + eventId)
      if (cached) {
        setProducts(JSON.parse(cached))
        setQuantities({})
      } else {
        toast.error('Sem produtos em cache para este evento. Conecte-se à internet ao menos uma vez antes do evento.')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, isOnline])

  function refreshPendingCount() {
    offlineDb.listPendingSales().then((list) => setPendingCount(list.filter((s) => s.event_id === eventId).length))
  }
  useEffect(refreshPendingCount, [eventId])

  // Assim que a conexão volta, sincroniza sozinho a fila de vendas pendentes.
  useEffect(() => {
    if (isOnline) void syncPendingSales()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline])

  async function syncPendingSales() {
    const pending = await offlineDb.listPendingSales()
    if (pending.length === 0) return
    setSyncing(true)
    let okCount = 0
    for (const sale of pending) {
      try {
        const { customer_id, created } = await findOrCreateCustomer(sale.customer_name, sale.customer_phone)
        await createSale({
          event_id: sale.event_id,
          customer_id,
          items: sale.items,
          payment_method: sale.payment_method as PaymentMethod,
          payment_status: 'paid',
        })
        await offlineDb.removePendingSale(sale.localId)
        okCount++
        void created
      } catch (err) {
        // Deixa na fila pra tentar de novo na próxima sincronização —
        // não trava as outras vendas pendentes por causa de uma só falhar.
        console.error('Falha ao sincronizar venda pendente', sale.localId, err)
      }
    }
    setSyncing(false)
    refreshPendingCount()
    if (okCount > 0) {
      toast.success(`${okCount} venda(s) offline sincronizada(s) com sucesso!`)
    }
  }

  const total = useMemo(
    () => products.reduce((sum, p) => sum + (quantities[p.id] || 0) * p.price, 0),
    [products, quantities],
  )
  const hasItems = Object.values(quantities).some((q) => q > 0)

  function updateQty(productId: string, delta: number) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, (prev[productId] || 0) + delta) }))
  }

  async function handleFinish(e: React.FormEvent) {
    e.preventDefault()
    if (!hasItems) {
      toast.error('Selecione ao menos um produto.')
      return
    }
    if (!customerName.trim() || phone.replace(/\D/g, '').length < 10) {
      toast.error('Informe nome e telefone válidos do cliente.')
      return
    }
    setSubmitting(true)
    const items = products
      .filter((p) => (quantities[p.id] || 0) > 0)
      .map((p) => ({ product_id: p.id, quantity: quantities[p.id] }))
    const itemsForReceipt = products
      .filter((p) => (quantities[p.id] || 0) > 0)
      .map((p) => ({ name: p.name, quantity: quantities[p.id] }))

    try {
      if (!isOnline) {
        // Sem internet: guarda a venda inteira numa fila local. O ticket só
        // ganha código de verdade quando sincronizar (por isso não dá pra
        // mostrar o código nem o QR agora).
        const pending: PendingSale = {
          localId: newLocalId(),
          event_id: eventId,
          customer_name: customerName.trim(),
          customer_phone: phone.replace(/\D/g, ''),
          items,
          payment_method: paymentMethod,
          created_at: new Date().toISOString(),
        }
        await offlineDb.addPendingSale(pending)
        setReceipt({
          ticket_code: null,
          total,
          customerName: customerName.trim(),
          customerPhone: phone.replace(/\D/g, ''),
          newAccount: false,
          items: itemsForReceipt,
          pending: true,
        })
        refreshPendingCount()
        toast.success('Venda registrada offline — vai sincronizar sozinha quando a internet voltar.')
      } else {
        const { customer_id, created, initial_password } = await findOrCreateCustomer(customerName.trim(), phone)
        const sale = await createSale({
          event_id: eventId,
          customer_id,
          items,
          payment_method: paymentMethod,
          payment_status: 'paid',
        })
        setReceipt({
          ticket_code: sale.ticket_code,
          total: sale.total,
          customerName: customerName.trim(),
          customerPhone: phone.replace(/\D/g, ''),
          newAccount: created,
          initialPassword: initial_password,
          items: itemsForReceipt,
          pending: false,
        })
        toast.success('Venda realizada com sucesso!')
      }
      setQuantities({})
      setCustomerName('')
      setPhone('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (events === null) return <Loading label="Carregando eventos…" />

  if (receipt) {
    return (
      <div className="max-w-md mx-auto">
        <Card className="p-6 text-center">
          <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary-light flex items-center justify-center text-2xl">
            {receipt.pending ? '📴' : '✅'}
          </div>
          <h2 className="font-display font-bold text-xl mb-1">
            {receipt.pending ? 'Venda registrada offline.' : 'Venda realizada com sucesso.'}
          </h2>
          {receipt.pending ? (
            <p className="text-ink/60 text-sm mb-5">
              Vai sincronizar e gerar o ticket assim que a internet voltar.
            </p>
          ) : (
            <p className="text-ink/60 text-sm mb-5">
              Ticket: <span className="font-mono font-semibold">{receipt.ticket_code}</span>
            </p>
          )}
          <div className="text-left bg-paper rounded-xl p-4 mb-5">
            <p className="text-sm font-semibold mb-2">{receipt.customerName}</p>
            <ul className="text-sm space-y-1 text-ink/70">
              {receipt.items.map((i, idx) => (
                <li key={idx}>{i.quantity}x {i.name}</li>
              ))}
            </ul>
            <div className="border-t border-line mt-3 pt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCurrency(receipt.total)}</span>
            </div>
          </div>
          {receipt.newAccount && receipt.initialPassword && (
            <div className="text-left bg-primary-light rounded-xl p-4 mb-5 text-sm">
              <p className="font-semibold mb-1">📱 Avise o cliente — acesso aos ingressos:</p>
              <p>Telefone: <span className="font-mono">{formatPhone(receipt.customerPhone)}</span></p>
              <p>Senha inicial: <span className="font-mono font-semibold">{receipt.initialPassword}</span></p>
              <p className="text-ink/60 mt-1">Ele poderá trocar a senha no primeiro acesso.</p>
            </div>
          )}
          <Button fullWidth onClick={() => setReceipt(null)}>Nova venda</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl">Nova venda</h1>
        {offlineAllowed && (
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              isOnline ? 'bg-primary-light text-primary-dark' : 'bg-danger/10 text-danger'
            }`}
          >
            {isOnline ? '● Online' : '○ Offline'}
          </span>
        )}
      </div>

      {!isOnline && offlineAllowed && (
        <div className="bg-danger/10 text-danger text-sm rounded-xl p-3">
          Sem internet — vendas ficam na fila e sincronizam sozinhas quando a conexão voltar.
          O ticket só sai depois de sincronizar.
        </div>
      )}
      {!isOnline && !offlineAllowed && (
        <div className="bg-danger/10 text-danger text-sm rounded-xl p-3">
          Sem internet e este evento não tem modo offline habilitado — peça ao admin para ativar,
          ou aguarde a conexão voltar.
        </div>
      )}
      {syncing && <div className="bg-primary-light text-primary-dark text-sm rounded-xl p-3">Sincronizando vendas pendentes…</div>}
      {pendingCount > 0 && !syncing && (
        <div className="bg-accent/10 text-accent-dark text-sm rounded-xl p-3">
          {pendingCount} venda(s) offline aguardando sincronizar.
        </div>
      )}

      <Select label="Evento" value={eventId} onChange={(e) => setEventId(e.target.value)}>
        {events.length === 0 && <option value="">Nenhum evento publicado</option>}
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>{ev.name}</option>
        ))}
      </Select>

      <Card className="p-4 divide-y divide-line">
        {products.length === 0 && <p className="text-sm text-ink/50 py-4">Nenhum produto ativo para este evento.</p>}
        {products.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-ink/50">{formatCurrency(p.price)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => updateQty(p.id, -1)}
                className="h-9 w-9 rounded-full bg-ink/5 text-lg font-bold active:scale-95"
              >
                −
              </button>
              <span className="w-6 text-center font-semibold">{quantities[p.id] || 0}</span>
              <button
                type="button"
                onClick={() => updateQty(p.id, 1)}
                className="h-9 w-9 rounded-full bg-primary-light text-primary-dark text-lg font-bold active:scale-95"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </Card>

      <Card className="p-4 flex items-center justify-between">
        <span className="font-display font-semibold">Total</span>
        <span className="font-display font-bold text-xl">{formatCurrency(total)}</span>
      </Card>

      <form onSubmit={handleFinish} className="space-y-4">
        <Card className="p-4 space-y-4">
          <Input label="Nome do cliente" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          <Input
            label="Telefone"
            inputMode="numeric"
            value={formatPhone(phone)}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(47) 99123-4567"
            required
          />
          <Select label="Forma de pagamento" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            <option value="cash">Dinheiro</option>
            <option value="pix">PIX</option>
            <option value="card">Cartão</option>
            <option value="other">Outro</option>
          </Select>
        </Card>
        <Button type="submit" fullWidth size="lg" loading={submitting} disabled={!eventId || !hasItems || (!isOnline && !offlineAllowed)}>
          Finalizar venda
        </Button>
      </form>
    </div>
  )
}
