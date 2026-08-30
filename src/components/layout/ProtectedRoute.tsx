import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types'
import { Loading } from '@/components/ui/Loading'

export function ProtectedRoute({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { profile, loading } = useAuth()

  if (loading) return <Loading label="Verificando sessão…" />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.must_change_password) return <Navigate to="/trocar-senha" replace />
  if (!roles.includes(profile.role)) return <Navigate to={homeForRole(profile.role)} replace />

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
