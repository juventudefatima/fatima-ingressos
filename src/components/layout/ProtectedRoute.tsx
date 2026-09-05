import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types'
import { Loading } from '@/components/ui/Loading'
import { AdminPinGate } from '@/components/ui/AdminPinGate'

const ADMIN_2FA_SESSION_KEY = 'sidata-admin-2fa-ok'

export function ProtectedRoute({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  const [twoFactorOk, setTwoFactorOk] = useState(
    () => sessionStorage.getItem(ADMIN_2FA_SESSION_KEY) === '1',
  )

  if (loading) return <Loading label="Verificando sessão…" />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.must_change_password) return <Navigate to="/trocar-senha" replace />
  if (!roles.includes(profile.role)) return <Navigate to={homeForRole(profile.role)} replace />

  // Segunda etapa só pro admin — tela própria (não caixa nativa do
  // navegador), pra funcionar igual em qualquer aparelho, incluindo o app
  // instalado no iPhone, onde prompt()/alert() não funcionam.
  if (profile.role === 'admin' && !twoFactorOk) {
    return (
      <AdminPinGate
        onSuccess={() => {
          sessionStorage.setItem(ADMIN_2FA_SESSION_KEY, '1')
          setTwoFactorOk(true)
        }}
      />
    )
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
