import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listEvents, createEvent, updateEvent, deleteEvent } from '@/services/events'
import type { EventItem, EventStatus } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Loading } from '@/components/ui/Loading'
import { formatDate, formatTime } from '@/utils/format'
import { Link } from 'react-router-dom'

const statusTone: Record<EventStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  published: 'success',
  closed: 'warning',
  cancelled: 'danger',
}
const statusLabel: Record<EventStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
}

const emptyForm = { name: '', description: '', event_date: '', event_time: '', location: '' }

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  function reload() {
    listEvents().then(setEvents).catch((e) => toast.error(e.message))
  }
  useEffect(reload, [])

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }
  function openEdit(ev: EventItem) {
    setEditing(ev)
    setForm({
      name: ev.name,
      description: ev.description || '',
      event_date: ev.event_date,
      event_time: ev.event_time,
      location: ev.location,
    })
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await updateEvent(editing.id, form)
        toast.success('Evento atualizado.')
      } else {
        await createEvent({ ...form, status: 'draft' })
        toast.success('Evento criado como rascunho.')
      }
      setShowForm(false)
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(ev: EventItem, status: EventStatus) {
    try {
      await updateEvent(ev.id, { status })
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function handleDelete(ev: EventItem) {
    if (!confirm(`Excluir o evento "${ev.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteEvent(ev.id)
      reload()
    } catch (err) {
      toast.error('Não é possível excluir: já existem vendas para este evento. Cancele-o em vez de excluir.')
    }
  }

  if (events === null) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-ink/60 text-sm">{events.length} evento(s)</p>
        <Button onClick={openNew}>+ Novo evento</Button>
      </div>

      {showForm && (
        <Card className="p-5">
          <form onSubmit={handleSave} className="space-y-4">
            <Input label="Nome do evento" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Data" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
              <Input label="Horário" type="time" value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} required />
            </div>
            <Input label="Local" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1.5">Descrição</label>
              <textarea
                className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:ring-2 focus:ring-primary/30"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>Salvar</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-3">
        {events.map((ev) => (
          <Card key={ev.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold">{ev.name}</p>
                <Badge tone={statusTone[ev.status]}>{statusLabel[ev.status]}</Badge>
              </div>
              <p className="text-sm text-ink/50">
                {formatDate(ev.event_date)} · {formatTime(ev.event_time)} · {ev.location}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={ev.status}
                onChange={(e) => handleStatusChange(ev, e.target.value as EventStatus)}
                className="!py-2 !text-sm"
              >
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
                <option value="closed">Encerrado</option>
                <option value="cancelled">Cancelado</option>
              </Select>
              <Link to={`/admin/eventos/${ev.id}/produtos`}>
                <Button size="sm" variant="outline">Produtos</Button>
              </Link>
              <Link to={`/admin/eventos/${ev.id}/pedidos`}>
                <Button size="sm" variant="outline">Pedidos</Button>
              </Link>
              <Button size="sm" variant="outline" onClick={() => openEdit(ev)}>Editar</Button>
              <Button size="sm" variant="danger" onClick={() => handleDelete(ev)}>Excluir</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
