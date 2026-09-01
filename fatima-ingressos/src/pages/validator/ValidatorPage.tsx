import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'
import { supabase } from '@/lib/supabaseClient'
import { getTicketForValidation, redeemTicketItems } from '@/services/tickets'
import { listMyEvents } from '@/services/events'
import type { EventItem, ValidationTicket } from '@/types'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Loading } from '@/components/ui/Loading'

export default function ValidatorPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null)
  const [eventId, setEventId] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [ticket, setTicket] = useState<ValidationTicket | null>(null)
  const [selections, setSelections] = useState<Record<string, number>>({})
  const [loadingTicket, setLoadingTicket] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)

  useEffect(() => {
    listMyEvents()
      .then((data) => {
        const usable = data.filter((e) => e.status !== 'draft')
        setEvents(usable)
        const today = usable.find((e) => e.status === 'published')
        if (today) setEventId(today.id)
        else if (usable.length > 0) setEventId(usable[0].id)
      })
      .catch((err) => toast.error(err.message))
    return () => {
      controlsRef.current?.stop()
    }
  }, [])

  async function startCamera() {
    setCameraOn(true)
    try {
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result) {
          controls.stop()
          setCameraOn(false)
          void lookupTicket(result.getText())
        }
      })
      controlsRef.current = controls
    } catch (err) {
      toast.error('Não foi possível acessar a câmera. Use a digitação manual abaixo.')
      setCameraOn(false)
    }
  }

  function stopCamera() {
    controlsRef.current?.stop()
    setCameraOn(false)
  }

  async function lookupTicket(code: string) {
    if (!eventId) {
      toast.error('Selecione o evento primeiro.')
      return
    }
    setLoadingTicket(true)
    setTicket(null)
    setSelections({})
    try {
      const result = await getTicketForValidation(code, eventId)
      setTicket(result)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoadingTicket(false)
    }
  }

  // Usado pelo Realtime/polling: atualiza só as quantidades disponíveis do
  // ticket já aberto, SEM mexer nas quantidades que o validador já estava
  // selecionando pra entregar (senão o operador perderia a seleção a cada
  // atualização automática).
  async function refreshTicketSilently(code: string) {
    try {
      const result = await getTicketForValidation(code, eventId)
      setTicket(result)
    } catch {
      // silencioso de propósito — erro aqui não deve interromper o trabalho
      // do validador; a próxima ação manual dele vai revalidar tudo de novo.
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!manualCode.trim()) return
    void lookupTicket(manualCode.trim())
    setManualCode('')
  }

  function updateSelection(ticketItemId: string, delta: number, max: number) {
    setSelections((prev) => ({
      ...prev,
      [ticketItemId]: Math.min(max, Math.max(0, (prev[ticketItemId] || 0) + delta)),
    }))
  }

  async function handleConfirmDelivery() {
    if (!ticket) return
    const items = Object.entries(selections)
      .filter(([, qty]) => qty > 0)
      .map(([ticket_item_id, quantity]) => ({ ticket_item_id, quantity }))
    if (items.length === 0) {
      toast.error('Selecione ao menos um item para entregar.')
      return
    }
    setConfirming(true)
    try {
      await redeemTicketItems(ticket.public_code, eventId, items)
      toast.success('Entrega confirmada!')
      await lookupTicket(ticket.public_code)
      setSelections({})
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  function scanAnother() {
    setTicket(null)
    setSelections({})
  }

  useEffect(() => {
    if (!ticket) return
    // Se outro validador confirmar entrega deste mesmo ticket enquanto esta
    // tela está aberta, atualiza as quantidades disponíveis na hora — sem
    // apagar o que este validador já estava selecionando pra entregar.
    const channel = supabase
      .channel(`ticket-${ticket.ticket_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_items' }, () => {
        void refreshTicketSilently(ticket.public_code)
      })
      .subscribe()

    // Reforço: no máximo 2s de atraso mesmo sem o evento do Realtime.
    const interval = setInterval(() => {
      void refreshTicketSilently(ticket.public_code)
    }, 2000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.ticket_id])

  if (events === null) return <Loading label="Carregando eventos…" />

  return (
    <div className="max-w-md mx-auto space-y-5">
      <h1 className="font-display font-bold text-2xl">Validar ticket</h1>

      <Select label="Evento" value={eventId} onChange={(e) => { setEventId(e.target.value); setTicket(null) }}>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>{ev.name} — {ev.event_date}</option>
        ))}
      </Select>

      {!ticket && (
        <>
          <Card className="p-4 space-y-3">
            <video
              ref={videoRef}
              className={`w-full rounded-xl bg-black aspect-square object-cover ${cameraOn ? '' : 'hidden'}`}
              muted
              autoPlay
              playsInline
            />
            {cameraOn ? (
              <Button variant="outline" fullWidth size="lg" onClick={stopCamera}>Parar câmera</Button>
            ) : (
              <Button fullWidth size="lg" onClick={startCamera} disabled={!eventId}>
                📷 Ativar câmera
              </Button>
            )}
          </Card>

          <form onSubmit={handleManualSubmit} className="space-y-2">
            <Input
              label="Digite o código do ticket"
              placeholder="TKXXXXXXXXXX"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            />
            <Button type="submit" variant="outline" fullWidth loading={loadingTicket}>
              Validar
            </Button>
          </form>
        </>
      )}

      {loadingTicket && <Loading label="Buscando ticket…" />}

      {ticket && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono font-bold text-lg">{ticket.public_code}</p>
            <span className="text-xs text-ink/50">{ticket.event_name}</span>
          </div>

          <div className="space-y-3">
            {ticket.items.map((item) => (
              <div key={item.ticket_item_id} className="border border-line rounded-xl p-4">
                <div className="flex justify-between mb-2">
                  <p className="font-semibold">{item.product_name}</p>
                  <p className="text-sm text-ink/50">
                    Comprados: {item.quantity_purchased} · Entregues: {item.quantity_redeemed}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    Disponíveis: <b>{item.available}</b>
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateSelection(item.ticket_item_id!, -1, item.available)}
                      className="h-11 w-11 rounded-full bg-ink/5 text-xl font-bold active:scale-95"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-semibold text-lg">
                      {selections[item.ticket_item_id!] || 0}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateSelection(item.ticket_item_id!, 1, item.available)}
                      disabled={item.available === 0}
                      className="h-11 w-11 rounded-full bg-primary-light text-primary-dark text-xl font-bold active:scale-95 disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" size="lg" onClick={scanAnother}>Escanear outro</Button>
            <Button size="lg" loading={confirming} onClick={handleConfirmDelivery}>Confirmar entrega</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
