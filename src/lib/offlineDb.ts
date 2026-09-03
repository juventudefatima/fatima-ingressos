// =========================================================================
// Camada bem simples de armazenamento offline, usando IndexedDB puro (sem
// biblioteca externa, pra não precisar instalar nada novo). Guarda:
//   - "pending_sales": vendas feitas offline no Caixa, esperando sincronizar
//   - "pending_redemptions": entregas confirmadas offline no Validador
//   - "ticket_snapshot": última "foto" dos tickets do evento, pro Validador
//     conseguir conferir mesmo sem internet
// =========================================================================

const DB_NAME = 'sidata-offline'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('pending_sales')) {
        db.createObjectStore('pending_sales', { keyPath: 'localId' })
      }
      if (!db.objectStoreNames.contains('pending_redemptions')) {
        db.createObjectStore('pending_redemptions', { keyPath: 'localId' })
      }
      if (!db.objectStoreNames.contains('ticket_snapshot')) {
        db.createObjectStore('ticket_snapshot', { keyPath: 'event_id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export interface PendingSale {
  localId: string
  event_id: string
  customer_name: string
  customer_phone: string
  items: { product_id: string; quantity: number }[]
  payment_method: string
  created_at: string
}

export interface PendingRedemption {
  localId: string
  event_id: string
  public_code: string
  items: { ticket_item_id: string; quantity: number }[]
  created_at: string
}

export interface TicketSnapshotItem {
  ticket_item_id: string
  product_name: string
  quantity_purchased: number
  quantity_redeemed: number
}
export interface TicketSnapshotEntry {
  public_code: string
  ticket_id: string
  event_name: string
  items: TicketSnapshotItem[]
}

export const offlineDb = {
  async addPendingSale(sale: PendingSale) {
    await withStore('pending_sales', 'readwrite', (s) => s.put(sale))
  },
  async listPendingSales(): Promise<PendingSale[]> {
    return withStore('pending_sales', 'readonly', (s) => s.getAll())
  },
  async removePendingSale(localId: string) {
    await withStore('pending_sales', 'readwrite', (s) => s.delete(localId))
  },

  async addPendingRedemption(r: PendingRedemption) {
    await withStore('pending_redemptions', 'readwrite', (s) => s.put(r))
  },
  async listPendingRedemptions(): Promise<PendingRedemption[]> {
    return withStore('pending_redemptions', 'readonly', (s) => s.getAll())
  },
  async removePendingRedemption(localId: string) {
    await withStore('pending_redemptions', 'readwrite', (s) => s.delete(localId))
  },

  async saveTicketSnapshot(eventId: string, tickets: TicketSnapshotEntry[]) {
    await withStore('ticket_snapshot', 'readwrite', (s) =>
      s.put({ event_id: eventId, tickets, updated_at: new Date().toISOString() }),
    )
  },
  async getTicketSnapshot(
    eventId: string,
  ): Promise<{ event_id: string; tickets: TicketSnapshotEntry[]; updated_at: string } | undefined> {
    return withStore('ticket_snapshot', 'readonly', (s) => s.get(eventId))
  },
}

export function newLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
