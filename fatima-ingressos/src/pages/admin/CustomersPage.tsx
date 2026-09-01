import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listCustomers, editCustomer, deleteCustomer } from '@/services/admin'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Loading } from '@/components/ui/Loading'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDateTime } from '@/utils/format'
import { formatPhone } from '@/utils/phone'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CustomerRow = any

const PAGE_SIZE = 50

function CustomerCard({ customer, onChanged }: { customer: CustomerRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(customer.profiles?.full_name || '')
  const [phone, setPhone] = useState(formatPhone(customer.phone))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await editCustomer(customer.id, name, phone)
      toast.success('Cliente atualizado.')
      setEditing(false)
      onChanged()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const ordersCount = customer.orders?.length || 0
    const aviso = ordersCount > 0
      ? `Este cliente tem ${ordersCount} pedido(s). Excluir vai apagar TODO o histórico de compras e tickets dele(a) também. Essa ação não pode ser desfeita. Confirma?`
      : `Excluir "${customer.profiles?.full_name}" para sempre?`
    if (!confirm(aviso)) return
    try {
      await deleteCustomer(customer.id)
      toast.success('Cliente excluído.')
      onChanged()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (editing) {
    return (
      <Card className="p-4 space-y-3">
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} loading={saving}>Salvar</Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4 flex items-center justify-between gap-3">
      <div>
        <p className="font-medium">{customer.profiles?.full_name || '(sem nome)'}</p>
        <p className="text-sm text-ink/50">
          {formatPhone(customer.phone)} · cadastrado em {formatDateTime(customer.created_at)} · {customer.orders?.length || 0} pedido(s)
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Editar</Button>
        <Button size="sm" variant="danger" onClick={handleDelete}>Excluir</Button>
      </div>
    </Card>
  )
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState('')

  async function reload() {
    setLoading(true)
    try {
      const data = await listCustomers(0, search)
      setCustomers(data || [])
      setHasMore(!search.trim() && (data?.length || 0) === PAGE_SIZE)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = setTimeout(reload, 300) // debounce da busca
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function handleLoadMore() {
    setLoadingMore(true)
    try {
      const data = await listCustomers(customers.length, '')
      setCustomers((prev) => [...prev, ...(data || [])])
      setHasMore((data?.length || 0) === PAGE_SIZE)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <input
        placeholder="Buscar por nome ou telefone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-line rounded-xl px-4 py-2.5"
      />

      {loading ? (
        <Loading label="Carregando clientes…" />
      ) : customers.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado" description="Clientes são cadastrados automaticamente na primeira compra." />
      ) : (
        <>
          <p className="text-sm text-ink/50">{customers.length} cliente(s){hasMore ? '+' : ''}</p>
          <div className="grid gap-2">
            {customers.map((c) => (
              <CustomerCard key={c.id} customer={c} onChanged={reload} />
            ))}
          </div>
          {hasMore && (
            <div className="text-center pt-2">
              <Button variant="outline" size="sm" onClick={handleLoadMore} loading={loadingMore}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
