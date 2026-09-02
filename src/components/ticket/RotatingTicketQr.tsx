import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { getRotatingTicketToken } from '@/services/tickets'
import { QrCode } from './QrCode'
import { Loading } from '@/components/ui/Loading'

// Mostra um QR que muda a cada ~15 minutos: um print/screenshot deste
// ticket fica inútil depois desse tempo, dificultando que outra pessoa
// use o ingresso no lugar do dono. A troca é sincronizada com o relógio
// do servidor (expires_at), não um timer fixo do celular.
export function RotatingTicketQr({ ticketId }: { ticketId: string }) {
  const [token, setToken] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function refresh() {
    try {
      const { token: newToken, expires_at } = await getRotatingTicketToken(ticketId)
      setToken(newToken)
      setError(null)
      const msLeft = new Date(expires_at).getTime() - Date.now()
      setSecondsLeft(Math.max(0, Math.round(msLeft / 1000)))
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = setTimeout(refresh, Math.max(1000, msLeft + 500))
    } catch (err) {
      setError((err as Error).message)
      toast.error((err as Error).message)
    }
  }

  useEffect(() => {
    void refresh()
    tickIntervalRef.current = setInterval(() => {
      setSecondsLeft((s) => (s !== null && s > 0 ? s - 1 : 0))
    }, 1000)
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  if (error) return <p className="text-center text-danger text-sm py-4">{error}</p>
  if (!token) return <Loading label="Gerando código…" />

  const mm = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0
  const ss = secondsLeft !== null ? secondsLeft % 60 : 0

  return (
    <div className="flex flex-col items-center gap-2">
      <QrCode value={token} />
      <p className="text-xs text-ink/40 text-center">
        Por segurança, este código se renova sozinho
        {secondsLeft !== null ? ` em ${mm}:${String(ss).padStart(2, '0')}` : ''}. Não vale a pena printar.
      </p>
    </div>
  )
}
