import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabaseClient'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Loading } from '@/components/ui/Loading'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDateTime } from '@/utils/format'

interface AuditLog {
  id: string
  actor_role: string | null
  action: string
  details: Record<string, unknown> | null
  created_at: string
}

const PAGE_SIZE = 50

const ACTION_LABELS: Record<string, string> = {
  'sale.create': '🧾 Venda realizada',
  'ticket.redeem': '✅ Item entregue',
  'ticket_item.reopen': '↩️ Item reaberto',
  'order.cancel': '🚫 Pedido cancelado',
  'order_item.edit': '✏️ Item de pedido editado',
  'customer.create': '👤 Cliente cadastrado',
  'customer.edit': '✏️ Cliente editado',
  'customer.delete': '🗑️ Cliente excluído',
  'user.set_active': '🔒 Usuário bloqueado/desbloqueado',
  'user.delete': '🗑️ Usuário excluído',
  'password_reset.resolve': '🔑 Senha redefinida',
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const loadedCountRef = useRef(0)

  async function loadPage(offset: number, replace: boolean, count = PAGE_SIZE) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + count - 1)
    if (error) {
      toast.error(error.message)
      return
    }
    const rows = (data as AuditLog[]) || []
    setHasMore(rows.length === count)
    setLogs((prev) => (replace ? rows : [...prev, ...rows]))
    loadedCountRef.current = replace ? rows.length : loadedCountRef.current + rows.length
  }

  useEffect(() => {
    setLoading(true)
    loadPage(0, true).finally(() => setLoading(false))

    // Atualização automática: recarrega a MESMA quantidade que já estava
    // na tela (via loadedCountRef), pra não desfazer um "Carregar mais"
    // que o admin já tinha clicado.
    const refresh = () => loadPage(0, true, Math.max(loadedCountRef.current, PAGE_SIZE))
    const channel = supabase
      .channel('audit-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, refresh)
      .subscribe()
    const interval = setInterval(refresh, 2000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  async function handleLoadMore() {
    setLoadingMore(true)
    await loadPage(logs.length, false)
    setLoadingMore(false)
  }

  if (loading) return <Loading label="Carregando auditoria…" />
  if (logs.length === 0) {
    return <EmptyState title="Nenhum registro ainda" description="Toda venda, entrega, cancelamento e reset de senha aparece aqui." />
  }

  return (
    <div className="space-y-2 max-w-3xl">
      {logs.map((log) => (
        <Card key={log.id} className="p-3">
          <div className="flex justify-between items-start gap-3">
            <div>
              <p className="text-sm font-semibold">
                {ACTION_LABELS[log.action] || log.action}
                {log.actor_role && <span className="text-ink/40 font-normal"> · {log.actor_role}</span>}
              </p>
              {log.details && Object.keys(log.details).length > 0 && (
                <p className="text-xs text-ink/50 mt-0.5 font-mono break-all">
                  {Object.entries(log.details).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' · ')}
                </p>
              )}
            </div>
            <span className="text-xs text-ink/40 whitespace-nowrap">{formatDateTime(log.created_at)}</span>
          </div>
        </Card>
      ))}
      {hasMore && (
        <div className="text-center pt-2">
          <Button variant="outline" size="sm" onClick={handleLoadMore} loading={loadingMore}>
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  )
}
