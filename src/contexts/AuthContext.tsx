import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Profile } from '@/types'

interface AuthContextValue {
  profile: Profile | null
  loading: boolean
  loginCustomer: (phone: string, password: string) => Promise<void>
  loginStaff: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (error || !data) {
      setProfile(null)
    } else {
      setProfile(data as Profile)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadProfile()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadProfile()
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  async function loginCustomer(phone: string, password: string) {
    const digits = phone.replace(/\D/g, '')
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    const resp = await fetch(`${supabaseUrl}/functions/v1/customer-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ phone: digits, password }),
    })
    const body = await resp.json()
    if (!resp.ok) throw new Error(body.error || 'Telefone ou senha inválidos.')

    // A Edge Function já validou a senha e criou a sessão do lado do
    // servidor (onde dá pra checar o limite de tentativas com segurança);
    // aqui só aplicamos essa sessão no cliente Supabase do navegador.
    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    })
    if (error) throw error
  }

  async function loginStaff(username: string, password: string) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    const resp = await fetch(`${supabaseUrl}/functions/v1/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ username, password }),
    })
    const body = await resp.json()
    if (!resp.ok) throw new Error(body.error || 'Usuário ou senha inválidos.')

    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  async function changePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    await supabase.rpc('clear_must_change_password')
    await loadProfile()
  }

  return (
    <AuthContext.Provider
      value={{ profile, loading, loginCustomer, loginStaff, logout, changePassword, refreshProfile: loadProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
