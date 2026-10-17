import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, type PermKey } from '../lib/permissions'
import { publicSiteBase } from '../lib/bookingUrl'
import { fetchMyPlan, type MyPlan, type PlanFeature } from '../lib/plan'

interface Profile {
  id: string
  business_id: string
  role: 'admin' | 'user'
  full_name: string | null
  is_active: boolean
  // Yonetici "ilk giriste kendi sifresini belirlesin" dediyse true.
  must_change_password?: boolean
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  // Oturumdaki kullanicinin yetkisi var mi (yonetici icin hep true).
  can: (perm: PermKey) => boolean
  // Isletmenin paketi (sinirlar, ozellikler, kullanim). Okunamazsa null.
  plan: MyPlan | null
  // Ozellik pakette var mi. Paket okunamadiysa true: kilit asil sunucuda,
  // gecici bir hatada ekranlar kapanmasin.
  hasFeature: (feature: PlanFeature) => boolean
  refreshPlan: () => Promise<void>
  refreshProfile: () => Promise<void>
  // code: Supabase hata kodu (ör. 'email_not_confirmed')
  signIn: (email: string, password: string) => Promise<{ error: string | null; code?: string }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<Set<PermKey>>(new Set())
  const [plan, setPlan] = useState<MyPlan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) fetchProfile(data.session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) fetchProfile(newSession.user.id)
      else {
        setProfile(null)
        setPermissions(new Set())
        setPlan(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const [{ data }, { data: perms, error: permErr }, myPlan] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.rpc('my_permissions'),
      fetchMyPlan(),
    ])
    setProfile(data ?? null)
    setPlan(myPlan)
    // my_permissions yanit vermezse role gore varsayilan yetkiler.
    if (!permErr && Array.isArray(perms)) setPermissions(new Set(perms as PermKey[]))
    else setPermissions(new Set(data?.role === 'admin' ? ALL_PERMISSIONS : DEFAULT_PERMISSIONS))
    setLoading(false)
  }

  async function refreshProfile() {
    if (session) await fetchProfile(session.user.id)
  }

  function can(perm: PermKey) {
    return profile?.role === 'admin' || permissions.has(perm)
  }

  function hasFeature(feature: PlanFeature) {
    return !plan || plan.features.includes(feature)
  }

  async function refreshPlan() {
    const myPlan = await fetchMyPlan()
    if (myPlan) setPlan(myPlan)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message, code: error.code }
    return { error: null }
  }

  async function signOut() {
    // Bu cihaz bildirim listesinden cikarilir (oturum hala acikken).
    const { stopPush } = await import('../lib/push')
    await stopPush()
    // Yalnizca bu cihaz: varsayilan 'global' kapsam ayni hesabin diger
    // cihazlardaki oturumlarini da iptal ediyordu.
    await supabase.auth.signOut({ scope: 'local' })
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
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        can,
        plan,
        hasFeature,
        refreshPlan,
        refreshProfile,
        signIn,
        signOut,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth yalnizca AuthProvider icinde kullanilabilir')
  return ctx
}
