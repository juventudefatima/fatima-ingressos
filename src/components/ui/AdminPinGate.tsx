import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// Substitui window.prompt/alert: em iPhone, quando o site roda como app
// instalado (modo "standalone"), o iOS desativa silenciosamente as caixas
// nativas do navegador — prompt()/alert() simplesmente não funcionam,
// sem erro nenhum. Por isso a segunda etapa precisa ser uma tela nossa,
// não uma caixa do sistema.
export function AdminPinGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('verify_admin_pin', { p_pin: pin.trim() })
      if (rpcError) {
        setError(rpcError.message)
      } else if (data === true) {
        onSuccess()
      } else {
        setError('Código incorreto.')
        setPin('')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="bg-surface rounded-ticket shadow-card max-w-sm w-full p-6">
        <div className="text-center mb-5">
          <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary-light flex items-center justify-center text-2xl">
            🔒
          </div>
          <h2 className="font-display font-bold text-lg">Verificação necessária</h2>
          <p className="text-ink/60 text-sm mt-1">Digite o código de segunda etapa para continuar.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Código"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="•••••"
          />
          {error && <p className="text-danger text-sm">{error}</p>}
          <Button type="submit" fullWidth size="lg" loading={loading} disabled={pin.length === 0}>
            Confirmar
          </Button>
        </form>
      </div>
    </div>
  )
}
