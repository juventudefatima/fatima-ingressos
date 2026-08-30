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
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null)
  const [search, setSearch] = useState('')

  function reload() {
    listCustomers().then(setCustomers).catch((e) => toast.error(e.message))
  }
  useEffect(reload, [])

  if (customers === null) return <Loading label="Carregando clientes…" />
  if (customers.length === 0) {
    return <EmptyState title="Nenhum cliente cadastrado ainda" description="Clientes são cadastrados automaticamente na primeira compra." />
  }

  const filtered = customers.filter((c) => {
    const term = search.replace(/\D/g, '') || search.toLowerCase()
    return c.phone.includes(term) || (c.profiles?.full_name || '').toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="space-y-4 max-w-2xl">
      <input
        placeholder="Buscar por nome ou telefone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-line rounded-xl px-4 py-2.5"
      />
      <p className="text-sm text-ink/50">{filtered.length} de {customers.length} cliente(s)</p>
      <div className="grid gap-2">
        {filtered.map((c) => (
          <CustomerCard key={c.id} customer={c} onChanged={reload} />
        ))}
      </div>
    </div>
  )
}
