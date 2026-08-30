import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listStaff, createStaffUser, setUserActive } from '@/services/admin'
import type { Profile } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Loading } from '@/components/ui/Loading'

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[] | null>(null)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'cashier' | 'validator'>('cashier')
  const [saving, setSaving] = useState(false)

  function reload() {
    listStaff().then(setUsers).catch((e) => toast.error(e.message))
  }
  useEffect(reload, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await createStaffUser({ full_name: fullName, username, password, role })
      toast.success(`Usuário "${username}" criado.`)
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
          <Card key={u.id} className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{u.full_name}</p>
              <p className="text-sm text-ink/50">@{u.username} · {u.role === 'cashier' ? 'Caixa' : 'Validador'}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={u.active ? 'success' : 'danger'}>{u.active ? 'Ativo' : 'Bloqueado'}</Badge>
              <Button size="sm" variant="outline" onClick={() => toggleActive(u)}>
                {u.active ? 'Bloquear' : 'Desbloquear'}
              </Button>
            </div>
          </Card>
        ))}
        {users.length === 0 && <p className="text-sm text-ink/50">Nenhum usuário de equipe cadastrado ainda.</p>}
      </div>
    </div>
  )
}
