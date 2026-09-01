export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatTime(timeStr: string): string {
  return (timeStr || '').slice(0, 5)
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR')
}
