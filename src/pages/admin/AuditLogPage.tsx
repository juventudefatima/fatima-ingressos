import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabaseClient'
import { Card } from '@/components/ui/Card'
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

const ACTION_LABELS: Record<string, string> = {
  'sale.create': '🧾 Venda realizada',
  'ticket.redeem': '✅ Item entregue',
  'ticket_item.reopen': '↩️ Item reaberto',
  'order.cancel': '🚫 Pedido cancelado',
  'order_item.edit': '✏️ Item de pedido editado',
  'customer.create': '👤 Cliente cadastrado',
  'user.set_active': '🔒 Usuário bloqueado/desbloqueado',
  'user.delete': '🗑️ Usuário excluído',
  'password_reset.resolve': '🔑 Senha redefinida',
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null)

  function reload() {
    supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        else setLogs(data as AuditLog[])
      })
  }

  useEffect(() => {
    reload()
    const channel = supabase
      .channel('audit-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, reload)
      .subscribe()
    const interval = setInterval(reload, 2000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  if (logs === null) return <Loading label="Carregando auditoria…" />
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
    </div>
  )
}
