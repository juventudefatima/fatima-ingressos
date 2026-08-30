export function onlyDigits(value: string): string {
  return (value || '').replace(/\D/g, '')
}

export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function phoneToSyntheticEmail(phone: string): string {
  return `cliente.${onlyDigits(phone)}@eventix.local`
}

export function staffToSyntheticEmail(username: string): string {
  return `staff.${username.trim().toLowerCase()}@eventix.local`
}

// O Supabase Auth exige senha com no mínimo 6 caracteres, mas a regra de
// negócio pede que a senha inicial do cliente sejam só os 4 primeiros
// dígitos do telefone (sem DDD). Para os dois requisitos conviverem, a senha
// que o cliente digita (4 dígitos) é sempre completada com este sufixo fixo
// antes de ser enviada para o Supabase Auth — tanto na criação da conta
// quanto no login. O cliente nunca vê nem digita o sufixo.
const INITIAL_PASSWORD_PAD = 'Evtx26'

export function padInitialPassword(fourDigitPin: string): string {
  return `${fourDigitPin}${INITIAL_PASSWORD_PAD}`
}
