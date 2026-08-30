import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabaseClient'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/Loading'
import { EmptyState } from '@/components/ui/EmptyState'

interface ResetRequest {
  id: string
  target_role: 'customer' | 'staff'
  identifier: string
  profile_id: string | null
  status: 'pending' | 'done'
  requested_at: string
}

async function callAdminReset(requestId: string, newPassword: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const resp = await fetch(`${supabaseUrl}/functions/v1/admin-reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ request_id: requestId, new_password: newPassword }),
  })
  const body = await resp.json()
  if (!resp.ok) throw new Error(body.error || 'Não foi possível resetar a senha.')
}

function RequestRow({ request, onResolved }: { request: ResetRequest; onResolved: () => void }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleReset() {
    if (password.length < 6) {
      toast.error('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    setLoading(true)
    try {
      await callAdminReset(request.id, password)
      toast.success('Senha redefinida! Avise a pessoa por fora do sistema.')
      onResolved()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {request.target_role === 'customer' ? '📱 Cliente' : '👤 Equipe'} — {request.identifier}
          </p>
          <p className="text-xs text-ink/50">
            {new Date(request.requested_at).toLocaleString('pt-BR')}
            {!request.profile_id && ' · ⚠️ conta não encontrada automaticamente'}
          </p>
        </div>
        {!open && (
          <Button size="sm" onClick={() => setOpen(true)} disabled={!request.profile_id}>
            Resetar senha
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 flex gap-2 items-end">
          <div className="flex-1">
            <Input
              label="Nova senha"
              placeholder="mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button onClick={handleReset} loading={loading}>Confirmar</Button>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        </div>
      )}
    </Card>
  )
}

export default function PasswordResetsPage() {
  const [requests, setRequests] = useState<ResetRequest[] | null>(null)

  function reload() {
    supabase
      .from('password_reset_requests')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        else setRequests(data as ResetRequest[])
      })
  }

  useEffect(() => {
    reload()
    const channel = supabase
      .channel('password-reset-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'password_reset_requests' }, reload)
      .subscribe()
    const interval = setInterval(reload, 2000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  if (requests === null) return <Loading label="Carregando solicitações…" />
  if (requests.length === 0) {
    return <EmptyState title="Nenhuma solicitação pendente" description="Quando alguém clicar em 'esqueci minha senha', a solicitação aparece aqui na hora." />
  }

  return (
    <div className="space-y-3 max-w-2xl">
      {requests.map((r) => (
        <RequestRow key={r.id} request={r} onResolved={reload} />
      ))}
    </div>
  )
}
