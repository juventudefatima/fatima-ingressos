import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProtectedRoute, homeForRole } from '@/components/layout/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { Loading } from '@/components/ui/Loading'

import LoginPage from '@/pages/auth/LoginPage'
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'

import MyTicketsPage from '@/pages/customer/MyTicketsPage'
import CashierPage from '@/pages/cashier/CashierPage'
import ValidatorPage from '@/pages/validator/ValidatorPage'

import AdminDashboard from '@/pages/admin/AdminDashboard'
import EventsPage from '@/pages/admin/EventsPage'
import ProductsPage from '@/pages/admin/ProductsPage'
import OrdersPage from '@/pages/admin/OrdersPage'
import EquipePage from '@/pages/admin/EquipePage'
import CustomersPage from '@/pages/admin/CustomersPage'
import ReportsPage from '@/pages/admin/ReportsPage'
import PasswordResetsPage from '@/pages/admin/PasswordResetsPage'
import AuditLogPage from '@/pages/admin/AuditLogPage'

function CustomerShell() {
  return (
    <AppShell navItems={[{ to: '/meus-tickets', label: 'Meus tickets', icon: '🎫' }]}>
      <MyTicketsPage />
    </AppShell>
  )
}

function CashierShell() {
  return (
    <AppShell navItems={[{ to: '/caixa', label: 'Vender', icon: '🧾' }]}>
      <CashierPage />
    </AppShell>
  )
}

function ValidatorShell() {
  return (
    <AppShell navItems={[{ to: '/validador', label: 'Validar', icon: '📷' }]}>
      <ValidatorPage />
    </AppShell>
  )
}

function AdminShell() {
  return (
    <AppShell
      navItems={[
        { to: '/admin', label: 'Painel', icon: '📊' },
      ]}
    >
      <AdminDashboard />
    </AppShell>
  )
}

function RootRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return <Loading />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.must_change_password) return <Navigate to="/trocar-senha" replace />
  return <Navigate to={homeForRole(profile.role)} replace />
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route path="/trocar-senha" element={<ChangePasswordPage />} />

          <Route
            path="/meus-tickets"
            element={
              <ProtectedRoute roles={['customer']}>
                <CustomerShell />
              </ProtectedRoute>
            }
          />

          <Route
            path="/caixa"
            element={
              <ProtectedRoute roles={['cashier', 'admin']}>
                <CashierShell />
              </ProtectedRoute>
            }
          />

          <Route
            path="/validador"
            element={
              <ProtectedRoute roles={['validator', 'admin']}>
                <ValidatorShell />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<EventsPage />} />
            <Route path="equipe" element={<EquipePage />} />
            <Route path="usuarios" element={<CustomersPage />} />
            <Route path="relatorios" element={<ReportsPage />} />
            <Route path="senhas" element={<PasswordResetsPage />} />
            <Route path="auditoria" element={<AuditLogPage />} />
            <Route path="eventos/:eventId/produtos" element={<ProductsPage />} />
            <Route path="eventos/:eventId/pedidos" element={<OrdersPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
