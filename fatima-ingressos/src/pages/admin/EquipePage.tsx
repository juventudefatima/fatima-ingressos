import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listStaff, createStaffUser, setUserActive, deleteStaffUser, listEventStaff, setEventStaff } from '@/services/admin'
import { listEvents } from '@/services/events'
import type { Profile, EventItem } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Loading } from '@/components/ui/Loading'

function EventAssignment({ user, events }: { user: Profile; events: EventItem[] }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)

  async function toggleOpen() {
    if (!open && selected === null) {
      try {
        const ids = await listEventStaff(user.id)
        setSelected(ids)
      } catch (err) {
        toast.error((err as Error).message)
        return
      }
    }
    setOpen(!open)
  }

  function toggleEvent(id: string) {
    setSelected((prev) => {
      const cur = prev || []
      return cur.includes(id) ? cur.filter((e) => e !== id) : [...cur, id]
    })
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      await setEventStaff(user.id, selected)
      toast.success('Eventos atualizados.')
      setOpen(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2">
      <button className="text-xs text-primary font-semibold" onClick={toggleOpen}>
        {open ? 'Fechar' : '🗓️ Quais eventos ele(a) pode trabalhar'}
      </button>
      {open && (
        <div className="mt-2 border border-line rounded-lg p-3 space-y-1.5 max-h-56 overflow-y-auto">
          {events.length === 0 && <p className="text-xs text-ink/50">Nenhum evento cadastrado ainda.</p>}
          {events.map((ev) => (
            <label key={ev.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected?.includes(ev.id) || false}
                onChange={() => toggleEvent(ev.id)}
              />
              {ev.name} <span className="text-ink/40">({ev.event_date})</span>
            </label>
          ))}
          <Button size="sm" onClick={handleSave} loading={saving}>Salvar</Button>
        </div>
      )}
    </div>
  )
}

export default function EquipePage() {
  const [users, setUsers] = useState<Profile[] | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'cashier' | 'validator'>('cashier')
  const [saving, setSaving] = useState(false)

  function reload() {
    listStaff().then(setUsers).catch((e) => toast.error(e.message))
  }
  useEffect(() => {
    reload()
    listEvents().then(setEvents).catch((e) => toast.error(e.message))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await createStaffUser({ full_name: fullName, username, password, role })
      toast.success(`Usuário "${username}" criado. Agora atribua os eventos que ele(a) pode trabalhar.`)
      setFullName('')
      setUsername('')
      setPassword('')
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(u: Profile) {
    try {
      await setUserActive(u.id, !u.active)
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function handleDelete(u: Profile) {
    if (!confirm(`Excluir "${u.full_name}" (@${u.username}) para sempre? Essa ação não pode ser desfeita.`)) return
    try {
      await deleteStaffUser(u.id)
      toast.success('Usuário excluído.')
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (users === null) return <Loading />

  return (
    <div className="space-y-5 max-w-xl">
      <Card className="p-5">
        <h2 className="font-display font-semibold mb-4">Criar usuário de caixa ou validação</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Input label="Usuário (login)" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="joao" required />
          <Input label="Senha inicial" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 6 caracteres" required />
          <Select label="Tipo" value={role} onChange={(e) => setRole(e.target.value as 'cashier' | 'validator')}>
            <option value="cashier">Caixa</option>
            <option value="validator">Validador</option>
          </Select>
          <Button type="submit" loading={saving}>Criar usuário</Button>
        </form>
      </Card>

      <div className="grid gap-3">
        {users.map((u) => (
          <Card key={u.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{u.full_name}</p>
                <p className="text-sm text-ink/50">@{u.username} · {u.role === 'cashier' ? 'Caixa' : 'Validador'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={u.active ? 'success' : 'danger'}>{u.active ? 'Ativo' : 'Bloqueado'}</Badge>
                <Button size="sm" variant="outline" onClick={() => toggleActive(u)}>
                  {u.active ? 'Bloquear' : 'Desbloquear'}
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(u)}>
                  Excluir
                </Button>
              </div>
            </div>
            <EventAssignment user={u} events={events} />
          </Card>
        ))}
        {users.length === 0 && <p className="text-sm text-ink/50">Nenhum usuário de equipe cadastrado ainda.</p>}
      </div>
    </div>
  )
}
