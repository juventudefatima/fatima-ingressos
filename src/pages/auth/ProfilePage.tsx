import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatPhone } from '@/utils/phone'

const roleLabel: Record<string, string> = {
  admin: 'Administrador',
  cashier: 'Caixa',
  validator: 'Validador',
  customer: 'Cliente',
}

export default function ProfilePage() {
  const { profile, changePassword } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('A senha deve ter ao menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      toast.error('As senhas não coincidem.')
      return
    }
    setSaving(true)
    try {
      await changePassword(password)
      setPassword('')
      setConfirm('')
      toast.success('Senha alterada com sucesso!')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return null

  return (
    <div className="max-w-md mx-auto space-y-5">
      <h1 className="font-display font-bold text-2xl">Meu perfil</h1>

      <Card className="p-5 space-y-1">
        <p className="font-semibold">{profile.full_name}</p>
        <p className="text-sm text-ink/60">{roleLabel[profile.role] || profile.role}</p>
        {profile.phone && <p className="text-sm text-ink/60">Telefone: {formatPhone(profile.phone)}</p>}
        {profile.username && <p className="text-sm text-ink/60">Usuário: @{profile.username}</p>}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Aparência</p>
            <p className="text-xs text-ink/60">Escolha entre tema claro ou escuro.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={toggleTheme}>
            {theme === 'dark' ? '☀️ Claro' : '🌙 Escuro'}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-display font-semibold mb-4">Trocar senha</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nova senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            label="Confirme a nova senha"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <Button type="submit" fullWidth loading={saving}>
            Salvar nova senha
          </Button>
        </form>
      </Card>
    </div>
  )
}
