import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'
import { supabase } from '@/lib/supabaseClient'
import { getTicketForValidation, redeemTicketItems, exportEventTicketsForOffline } from '@/services/tickets'
import { listMyEvents } from '@/services/events'
import type { EventItem, ValidationTicket } from '@/types'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Loading } from '@/components/ui/Loading'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { offlineDb, newLocalId, type PendingRedemption, type TicketSnapshotEntry } from '@/lib/offlineDb'

const SNAPSHOT_REFRESH_MS = 30_000

export default function ValidatorPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null)
  const [eventId, setEventId] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [ticket, setTicket] = useState<ValidationTicket | null>(null)
  const [ticketIsOfflineData, setTicketIsOfflineData] = useState(false)
  const [selections, setSelections] = useState<Record<string, number>>({})
  const [loadingTicket, setLoadingTicket] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)

  const isOnline = useOnlineStatus()
  const currentEvent = events?.find((e) => e.id === eventId) || null
  const offlineAllowed = currentEvent?.allow_offline === true

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

  // Enquanto online e o evento permite offline, mantém uma "foto" recente
  // dos tickets salva localmente — é o que o Validador usa se cair a rede.
  useEffect(() => {
    if (!eventId || !offlineAllowed || !isOnline) return
    let cancelled = false
    async function refreshSnapshot() {
      try {
        const data = await exportEventTicketsForOffline(eventId)
        if (!cancelled) await offlineDb.saveTicketSnapshot(eventId, data as TicketSnapshotEntry[])
      } catch (err) {
        console.error('Falha ao atualizar foto offline dos tickets', err)
      }
    }
    void refreshSnapshot()
    const interval = setInterval(refreshSnapshot, SNAPSHOT_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [eventId, offlineAllowed, isOnline])

  function refreshPendingCount() {
    offlineDb.listPendingRedemptions().then((list) => setPendingCount(list.filter((r) => r.event_id === eventId).length))
  }
  useEffect(refreshPendingCount, [eventId])

  useEffect(() => {
    if (isOnline) void syncPendingRedemptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline])

  async function syncPendingRedemptions() {
    const pending = await offlineDb.listPendingRedemptions()
    if (pending.length === 0) return
    setSyncing(true)
    let okCount = 0
    let failCount = 0
    for (const r of pending) {
      try {
        await redeemTicketItems(r.public_code, r.event_id, r.items)
        await offlineDb.removePendingRedemption(r.localId)
        okCount++
      } catch (err) {
        // Fica na fila pra revisão manual — pode ser um conflito real (dois
        // validadores offline entregaram o mesmo item), não descarta sozinho.
        failCount++
        console.error('Falha ao sincronizar entrega pendente', r.localId, err)
      }
    }
    setSyncing(false)
    refreshPendingCount()
    if (okCount > 0) toast.success(`${okCount} entrega(s) offline sincronizada(s).`)
    if (failCount > 0) {
      toast.error(`${failCount} entrega(s) offline com conflito — confira manualmente (pode ter sido entregue duas vezes).`)
    }
  }

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

  // Monta um ValidationTicket a partir da foto offline salva localmente,
  // já descontando o que este mesmo dispositivo já entregou offline (mas
  // que ainda não sincronizou) — pra não deixar entregar duas vezes no
  // mesmo aparelho enquanto sem internet.
  async function lookupTicketOffline(code: string): Promise<ValidationTicket | null> {
    const snapshot = await offlineDb.getTicketSnapshot(eventId)
    if (!snapshot) return null
    const found = snapshot.tickets.find((t) => t.public_code === code.trim().toUpperCase())
    if (!found) return null

    const pending = await offlineDb.listPendingRedemptions()
    const alreadyQueued: Record<string, number> = {}
    for (const p of pending) {
      if (p.public_code !== found.public_code) continue
      for (const it of p.items) {
        alreadyQueued[it.ticket_item_id] = (alreadyQueued[it.ticket_item_id] || 0) + it.quantity
      }
    }

    return {
      ticket_id: found.ticket_id,
      public_code: found.public_code,
      status: 'active',
      event_name: found.event_name,
      items: found.items.map((it) => ({
        ticket_item_id: it.ticket_item_id,
        product_name: it.product_name,
        quantity_purchased: it.quantity_purchased,
        quantity_redeemed: it.quantity_redeemed + (alreadyQueued[it.ticket_item_id] || 0),
        available: it.quantity_purchased - it.quantity_redeemed - (alreadyQueued[it.ticket_item_id] || 0),
      })),
    }
  }

  async function lookupTicket(code: string) {
    if (!eventId) {
      toast.error('Selecione o evento primeiro.')
      return
    }
    setLoadingTicket(true)
    setTicket(null)
    setTicketIsOfflineData(false)
    setSelections({})
    try {
      if (isOnline) {
        const result = await getTicketForValidation(code, eventId)
        setTicket(result)
      } else {
        if (!offlineAllowed) {
          toast.error('Sem internet e este evento não tem modo offline habilitado.')
          return
        }
        const result = await lookupTicketOffline(code)
        if (!result) {
          toast.error('Ticket não encontrado na última foto salva. Só é possível conferir tickets que já existiam quando a internet caiu.')
          return
        }
        setTicket(result)
        setTicketIsOfflineData(true)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoadingTicket(false)
    }
  }

  async function refreshTicketSilently(code: string) {
    try {
      const result = await getTicketForValidation(code, eventId)
      setTicket(result)
    } catch {
      // silencioso de propósito
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
      if (ticketIsOfflineData) {
        const pending: PendingRedemption = {
          localId: newLocalId(),
          event_id: eventId,
          public_code: ticket.public_code,
          items,
          created_at: new Date().toISOString(),
        }
        await offlineDb.addPendingRedemption(pending)
        toast.success('Entrega confirmada offline — vai sincronizar quando a internet voltar.')
        refreshPendingCount()
        const refreshed = await lookupTicketOffline(ticket.public_code)
        setTicket(refreshed)
        setSelections({})
      } else {
        await redeemTicketItems(ticket.public_code, eventId, items)
        toast.success('Entrega confirmada!')
        await lookupTicket(ticket.public_code)
        setSelections({})
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  function scanAnother() {
    setTicket(null)
    setTicketIsOfflineData(false)
    setSelections({})
  }

  useEffect(() => {
    if (!ticket || ticketIsOfflineData) return
    const channel = supabase
      .channel(`ticket-${ticket.ticket_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_items' }, () => {
        void refreshTicketSilently(ticket.public_code)
      })
      .subscribe()

    const interval = setInterval(() => {
      void refreshTicketSilently(ticket.public_code)
    }, 2000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.ticket_id, ticketIsOfflineData])

  if (events === null) return <Loading label="Carregando eventos…" />

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl">Validar ticket</h1>
        {offlineAllowed && (
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              isOnline ? 'bg-primary-light text-primary-dark' : 'bg-danger/10 text-danger'
            }`}
          >
            {isOnline ? '● Online' : '○ Offline'}
          </span>
        )}
      </div>

      {syncing && <div className="bg-primary-light text-primary-dark text-sm rounded-xl p-3">Sincronizando entregas pendentes…</div>}
      {pendingCount > 0 && !syncing && (
        <div className="bg-accent/10 text-accent-dark text-sm rounded-xl p-3">
          {pendingCount} entrega(s) offline aguardando sincronizar.
        </div>
      )}

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
          {ticketIsOfflineData && (
            <div className="bg-danger/10 text-danger text-xs font-semibold rounded-lg p-2.5 text-center">
              ⚠️ MODO OFFLINE — não confirmado em tempo real com o servidor
            </div>
          )}
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
