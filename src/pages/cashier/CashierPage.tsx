import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { listProductsByEvent } from '@/services/products'
import { listMyEvents } from '@/services/events'
import { listCashierProducts, listStockStatus, type StockStatus } from '@/services/admin'
import { findOrCreateCustomer, createSale } from '@/services/sales'
import { useAuth } from '@/contexts/AuthContext'
import type { EventItem, Product, PaymentMethod } from '@/types'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/format'
import { formatPhone } from '@/utils/phone'
import { Loading } from '@/components/ui/Loading'

interface Receipt {
  ticket_code: string
  total: number
  customerName: string
  customerPhone: string
  items: { name: string; quantity: number }[]
  newAccount: boolean
  initialPassword?: string
}

export default function CashierPage() {
  const { profile } = useAuth()
  const [events, setEvents] = useState<EventItem[] | null>(null)
  const [eventId, setEventId] = useState('')
  const [allowedProductIds, setAllowedProductIds] = useState<string[] | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [stock, setStock] = useState<Record<string, StockStatus>>({})
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  useEffect(() => {
    listMyEvents()
      .then((data) => {
        const published = data.filter((e) => e.status === 'published')
        setEvents(published)
        if (published.length > 0) setEventId(published[0].id)
      })
      .catch((err) => toast.error(err.message))

    // Admin não tem restrição de produtos; só busca a lista pra caixa.
    if (profile?.role === 'cashier') {
      listCashierProducts(profile.id)
        .then(setAllowedProductIds)
        .catch((err) => toast.error(err.message))
    } else {
      setAllowedProductIds([])
    }
  }, [profile?.id, profile?.role])

  function reloadStock(evId: string) {
    listStockStatus(evId)
      .then((rows) => {
        const map: Record<string, StockStatus> = {}
        rows.forEach((r) => { map[r.product_id] = r })
        setStock(map)
      })
      .catch((err) => toast.error(err.message))
  }

  useEffect(() => {
    if (!eventId) return
    listProductsByEvent(eventId).then((list) => {
      const active = list.filter((p) => p.active)
      // Lista vazia em allowedProductIds = sem restrição cadastrada.
      const filtered =
        allowedProductIds && allowedProductIds.length > 0
          ? active.filter((p) => allowedProductIds.includes(p.id))
          : active
      setProducts(filtered)
      setQuantities({})
    })
    reloadStock(eventId)
  }, [eventId, allowedProductIds])

  // Quanto ainda dá pra vender deste produto agora (null = sem limite).
  function remainingFor(productId: string): number | null {
    const s = stock[productId]
    if (!s || s.remaining === null) return null
    return s.remaining
  }

  function welcomeWhatsappLink(name: string, phoneDigits: string, password: string): string {
    const appUrl = `${window.location.origin}${import.meta.env.BASE_URL}login`
    const message =
      `Olá, ${name}! 👋 Seja bem-vindo(a) ao SI-DATA.\n\n` +
      `Seu acesso pra ver seus ingressos:\n` +
      `📱 Telefone: ${formatPhone(phoneDigits)}\n` +
      `🔑 Senha inicial: ${password}\n\n` +
      `Acesse por aqui: ${appUrl}\n` +
      `Você pode trocar a senha assim que entrar.`
    // 55 = código do Brasil; o wa.me exige o número completo com DDI.
    return `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(message)}`
  }

  const total = useMemo(
    () => products.reduce((sum, p) => sum + (quantities[p.id] || 0) * p.price, 0),
    [products, quantities],
  )
  const hasItems = Object.values(quantities).some((q) => q > 0)

  function updateQty(productId: string, delta: number) {
    setQuantities((prev) => {
      const current = prev[productId] || 0
      const remaining = remainingFor(productId)
      const max = remaining === null ? Infinity : remaining
      const next = Math.max(0, Math.min(max, current + delta))
      return { ...prev, [productId]: next }
    })
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
    try {
      const { customer_id, created, initial_password } = await findOrCreateCustomer(customerName.trim(), phone)
      const items = products
        .filter((p) => (quantities[p.id] || 0) > 0)
        .map((p) => ({ product_id: p.id, quantity: quantities[p.id] }))

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
        items: products
          .filter((p) => (quantities[p.id] || 0) > 0)
          .map((p) => ({ name: p.name, quantity: quantities[p.id] })),
      })
      setQuantities({})
      setCustomerName('')
      setPhone('')
      reloadStock(eventId)
      toast.success('Venda realizada com sucesso!')
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
            ✅
          </div>
          <h2 className="font-display font-bold text-xl mb-1">Venda realizada com sucesso.</h2>
          <p className="text-ink/60 text-sm mb-5">Ticket: <span className="font-mono font-semibold">{receipt.ticket_code}</span></p>
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
              <p className="text-ink/60 mt-1 mb-3">Ele poderá trocar a senha no primeiro acesso.</p>
              <a
                href={welcomeWhatsappLink(receipt.customerName, receipt.customerPhone, receipt.initialPassword)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-[#25D366] text-white font-display font-semibold px-4 py-2.5 hover:opacity-90 active:scale-[0.98] transition-all"
              >
                💬 Enviar boas-vindas por WhatsApp
              </a>
            </div>
          )}
          <Button fullWidth onClick={() => setReceipt(null)}>Nova venda</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      <h1 className="font-display font-bold text-2xl">Nova venda</h1>

      <Select label="Evento" value={eventId} onChange={(e) => setEventId(e.target.value)}>
        {events.length === 0 && <option value="">Nenhum evento publicado</option>}
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>{ev.name}</option>
        ))}
      </Select>

      <Card className="p-4 divide-y divide-line">
        {products.length === 0 && <p className="text-sm text-ink/50 py-4">Nenhum produto ativo para este evento.</p>}
        {products.map((p) => {
          const remaining = remainingFor(p.id)
          const qty = quantities[p.id] || 0
          const soldOut = remaining !== null && remaining <= 0
          const atMax = remaining !== null && qty >= remaining
          return (
            <div key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-ink/50">{formatCurrency(p.price)}</p>
                {remaining !== null && (
                  <p className={`text-xs mt-0.5 font-medium ${soldOut ? 'text-danger' : 'text-primary-dark'}`}>
                    {soldOut ? 'Esgotado' : `${remaining} disponíve${remaining === 1 ? 'l' : 'is'}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateQty(p.id, -1)}
                  disabled={qty === 0}
                  className="h-9 w-9 rounded-full bg-ink/5 text-lg font-bold active:scale-95 disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-6 text-center font-semibold">{qty}</span>
                <button
                  type="button"
                  onClick={() => updateQty(p.id, 1)}
                  disabled={soldOut || atMax}
                  className="h-9 w-9 rounded-full bg-primary-light text-primary-dark text-lg font-bold active:scale-95 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
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
        <Button type="submit" fullWidth size="lg" loading={submitting} disabled={!eventId || !hasItems}>
          Finalizar venda
        </Button>
      </form>
    </div>
  )
}
