import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, type PermKey } from '../lib/permissions'
import { publicSiteBase } from '../lib/bookingUrl'

interface Profile {
  id: string
  business_id: string
  role: 'admin' | 'user'
  full_name: string | null
  is_active: boolean
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  // Oturumdaki kullanicinin yetkisi var mi (yonetici icin hep true).
  can: (perm: PermKey) => boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]   = useState<Session | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<Set<PermKey>>(new Set())
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) fetchProfile(data.session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) fetchProfile(newSession.user.id)
      else { setProfile(null); setPermissions(new Set()); setLoading(false) }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const [{ data }, { data: perms, error: permErr }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, business_id, role, full_name, is_active')
        .eq('id', userId)
        .maybeSingle(),
      supabase.rpc('my_permissions'),
    ])
    setProfile(data ?? null)
    // RPC yoksa (migration oncesi) rol bazli eski davranis.
    if (!permErr && Array.isArray(perms)) setPermissions(new Set(perms as PermKey[]))
    else setPermissions(new Set(data?.role === 'admin' ? ALL_PERMISSIONS : DEFAULT_PERMISSIONS))
    setLoading(false)
  }

  function can(perm: PermKey) {
    return profile?.role === 'admin' || permissions.has(perm)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function resetPassword(email: string) {
    // Telefonda origin "https://localhost" oldugu icin maildeki link orada
    // calismaz; site adresi tanimliysa o kullanilir.
    const base = publicSiteBase() ?? window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${base}/sifre-sifirla`,
    })
    if (error) return { error: error.message }
    return { error: null }
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      can,
      signIn,
      signOut,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
