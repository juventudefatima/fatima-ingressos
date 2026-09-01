import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { homeForRole } from '@/components/layout/ProtectedRoute'

export default function ChangePasswordPage() {
  const { changePassword, profile } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

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
    setLoading(true)
    try {
      await changePassword(password)
      toast.success('Senha alterada com sucesso!')
      navigate(homeForRole(profile?.role || 'customer'))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <Card className="w-full max-w-sm p-6">
        {profile?.role === 'customer' ? (
          <>
            <h1 className="font-display font-bold text-xl mb-1">Olá, {profile.full_name}! 👋</h1>
            <p className="text-sm text-ink/60 mb-5">
              Seja bem-vindo(a) ao SI-DATA! Seus ingressos vão aparecer aqui assim que você entrar. No dia do
              evento, é só abrir o ticket pra gerar o código de entrada e mostrar na hora de retirar seus itens.
              Antes de continuar, escolha uma senha nova (a atual foi gerada automaticamente com base no seu
              telefone).
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display font-bold text-xl mb-1">Defina uma nova senha</h1>
            <p className="text-sm text-ink/60 mb-5">
              Por segurança, você precisa trocar a senha inicial antes de continuar.
            </p>
          </>
        )}
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
          <Button type="submit" fullWidth loading={loading}>
            Salvar e continuar
          </Button>
        </form>
      </Card>
    </div>
  )
}
