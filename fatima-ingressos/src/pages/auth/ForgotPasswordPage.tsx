import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ identifier: identifier.trim() }),
      })
      const body = await resp.json()
      if (!resp.ok) throw new Error(body.error || 'Não foi possível enviar a solicitação.')
      setSent(true)
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
          <h1 className="font-display font-bold text-2xl">Esqueci minha senha</h1>
          <p className="text-ink/60 text-sm mt-1">
            Um administrador vai redefinir sua senha e entrar em contato com você.
          </p>
        </div>

        <Card className="p-6">
          {sent ? (
            <div className="text-center space-y-4">
              <p className="text-sm">
                Solicitação enviada! Um administrador vai entrar em contato para redefinir sua senha.
              </p>
              <Link to="/login" className="text-sm text-primary font-medium">
                Voltar para o login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Telefone (cliente) ou usuário (equipe)"
                placeholder="(47) 99123-4567 ou joao"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoCapitalize="none"
                required
              />
              <Button type="submit" fullWidth size="lg" loading={loading}>
                Enviar solicitação
              </Button>
              <p className="text-center">
                <Link to="/login" className="text-sm text-primary font-medium">
                  Voltar para o login
                </Link>
              </p>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
