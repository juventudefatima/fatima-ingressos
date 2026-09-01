import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'

interface NavItem {
  to: string
  label: string
  icon: string
}

export function AppShell({ navItems, children }: { navItems: NavItem[]; children: React.ReactNode }) {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-primary text-white flex items-center justify-center font-display font-bold">
              S
            </span>
            <span className="font-display font-semibold text-lg">SI-DATA</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-ink/60">{profile?.full_name}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sair
            </Button>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-2 flex gap-1 overflow-x-auto pb-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `px-4 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive ? 'bg-primary-light text-primary-dark' : 'text-ink/60 hover:bg-ink/5'
                }`
              }
            >
              <span className="mr-1.5">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <div key={location.pathname} className="animate-fade-in-up">
          {children}
        </div>
      </main>
      <footer className="text-center text-xs text-ink/40 py-4">
        SI-DATA — Sistema de Ingressos Digitais · by Igor Cabral
      </footer>
    </div>
  )
}
