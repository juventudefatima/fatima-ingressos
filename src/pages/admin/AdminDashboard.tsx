import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

const tabs = [
  { to: '/admin', label: 'Eventos', end: true },
  { to: '/admin/usuarios', label: 'Usuários' },
  { to: '/admin/relatorios', label: 'Relatórios' },
  { to: '/admin/senhas', label: 'Senhas' },
  { to: '/admin/auditoria', label: 'Auditoria' },
]

export default function AdminDashboard() {
  const [pendingCount, setPendingCount] = useState(0)
  const location = useLocation()

  useEffect(() => {
    function reload() {
      supabase
        .from('password_reset_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count }) => setPendingCount(count || 0))
    }
    reload()
    const channel = supabase
      .channel('password-reset-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'password_reset_requests' }, reload)
      .subscribe()
    const interval = setInterval(reload, 2000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl mb-3">Painel administrativo</h1>
        <div className="flex gap-2 border-b border-line">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `relative px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isActive ? 'border-primary text-primary-dark' : 'border-transparent text-ink/50 hover:text-ink'
                }`
              }
            >
              {t.label}
              {t.to === '/admin/senhas' && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </div>
      <div key={location.pathname} className="animate-fade-in-up">
        <Outlet />
      </div>
    </div>
  )
}
