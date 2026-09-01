import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { formatPhone } from '@/utils/phone'
import { homeForRole } from '@/components/layout/ProtectedRoute'

type Mode = 'customer' | 'staff'

export default function LoginPage() {
  const { profile, loginCustomer, loginStaff } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('customer')
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  if (profile) return <Navigate to={homeForRole(profile.role)} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'customer') {
        await loginCustomer(phone, password)
      } else {
        await loginStaff(username, password)
      }
      navigate('/')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-primary text-white flex items-center justify-center font-display font-bold text-2xl">
            S
          </div>
          <h1 className="font-display font-bold text-2xl">SI-DATA</h1>
          <p className="text-ink/60 text-sm mt-1">Sistema de Ingressos Digitais</p>
        </div>

        <Card className="p-6">
          <div className="flex rounded-xl bg-ink/5 p-1 mb-5">
            <button
              type="button"
              onClick={() => setMode('customer')}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === 'customer' ? 'bg-surface shadow-sm' : 'text-ink/50'}`}
            >
              Sou cliente
            </button>
            <button
              type="button"
              onClick={() => setMode('staff')}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === 'staff' ? 'bg-surface shadow-sm' : 'text-ink/50'}`}
            >
              Equipe do evento
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'customer' ? (
              <Input
                label="Telefone"
                inputMode="numeric"
                placeholder="(47) 99123-4567"
                value={formatPhone(phone)}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            ) : (
              <Input
                label="Usuário"
                placeholder="joao"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                required
              />
            )}
            <Input
              label="Senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" fullWidth size="lg" loading={loading}>
              Entrar
            </Button>
          </form>

          {mode === 'customer' && (
            <p className="text-center mt-3">
              <Link to="/esqueci-senha" className="text-sm text-primary font-medium">
                Esqueci minha senha
              </Link>
            </p>
          )}

          {mode === 'customer' && (
            <p className="text-xs text-ink/50 mt-4 text-center">
              Sua conta é criada automaticamente na primeira compra. A senha inicial são os 4 primeiros dígitos do
              seu telefone (sem o DDD) — você poderá trocá-la no primeiro acesso.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
