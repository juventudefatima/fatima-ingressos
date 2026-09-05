import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import type { UserRole } from '@/types'
import { Loading } from '@/components/ui/Loading'

const ADMIN_2FA_SESSION_KEY = 'sidata-admin-2fa-ok'

// Segunda etapa só pro admin: pede um PIN pela caixa nativa do navegador
// (window.prompt), confere no banco (nunca em texto puro no código do
// site) e libera pelo resto da sessão do navegador — não pergunta de novo
// a cada troca de tela, só quando abrir uma aba/sessão nova.
function useAdminSecondFactor(isAdmin: boolean) {
  const [checking, setChecking] = useState(isAdmin)
  const [ok, setOk] = useState(() => sessionStorage.getItem(ADMIN_2FA_SESSION_KEY) === '1')

  useEffect(() => {
    if (!isAdmin || ok) {
      setChecking(false)
      return
    }

    async function ask() {
      for (let tries = 0; tries < 3; tries++) {
        const pin = window.prompt('Segunda etapa — digite o código de verificação:')
        if (pin === null) break // cancelou
        try {
          const { data, error } = await supabase.rpc('verify_admin_pin', { p_pin: pin.trim() })
          if (error) {
            window.alert(error.message)
            break
          }
          if (data === true) {
            sessionStorage.setItem(ADMIN_2FA_SESSION_KEY, '1')
            setOk(true)
            break
          }
          window.alert('Código incorreto.')
        } catch (err) {
          window.alert((err as Error).message)
          break
        }
      }
      setChecking(false)
    }
    void ask()
  }, [isAdmin, ok])

  return { checking, ok }
}

export function ProtectedRoute({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const { checking: checking2fa, ok: twoFactorOk } = useAdminSecondFactor(isAdmin)

  if (loading) return <Loading label="Verificando sessão…" />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.must_change_password) return <Navigate to="/trocar-senha" replace />
  if (!roles.includes(profile.role)) return <Navigate to={homeForRole(profile.role)} replace />

  if (isAdmin) {
    if (checking2fa) return <Loading label="Verificando…" />
    if (!twoFactorOk) {
      return (
        <div className="max-w-sm mx-auto mt-20 text-center space-y-4">
          <p className="font-display font-bold text-lg">Verificação necessária</p>
          <p className="text-ink/60 text-sm">
            Não foi possível confirmar o código de segunda etapa. Recarregue a página para tentar de novo.
          </p>
        </div>
      )
    }
  }

  return <>{children}</>
}

export function homeForRole(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/admin'
    case 'cashier':
      return '/caixa'
    case 'validator':
      return '/validador'
    case 'customer':
    default:
      return '/meus-tickets'
  }
}
