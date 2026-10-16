import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { SplashScreen } from '@capacitor/splash-screen'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AppSplash from './components/AppSplash'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './layouts/DashboardLayout'
import MessagesPage from './pages/MessagesPage'
import AppointmentsPage from './pages/AppointmentsPage'
import AccountingPage from './pages/AccountingPage'
import TeamPage from './pages/TeamPage'
import ServicesPage from './pages/ServicesPage'
import ServiceDescriptionPage from './pages/ServiceDescriptionPage'
import DashboardPage from './pages/DashboardPage'
import SettingsPage from './pages/SettingsPage'
import MorePage from './pages/MorePage'
import CustomersPage from './pages/CustomersPage'
import CustomerDetailPage from './pages/CustomerDetailPage'
import EmployeeDetailPage from './pages/EmployeeDetailPage'
import EmployeeCreatePage from './pages/EmployeeCreatePage'
import EmployeeSchedulePage from './pages/EmployeeSchedulePage'
import EmployeeLeavesPage from './pages/EmployeeLeavesPage'
import HolidaysPage from './pages/HolidaysPage'
import PerformanceReportPage from './pages/PerformanceReportPage'
import GiderlerPage from './pages/GiderlerPage'
import AdInsightsPage from './pages/AdInsightsPage'
import AiInsightsPage from './pages/AiInsightsPage'
import AdOAuthCallbackPage from './pages/AdOAuthCallbackPage'
import TopluMesajPage from './pages/TopluMesajPage'
import PublicBookingPage from './public/PublicBookingPage'
import NotificationsPage from './pages/NotificationsPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ForcePasswordPage from './pages/ForcePasswordPage'
import CashClosurePage from './pages/CashClosurePage'
import SetupPage from './pages/SetupPage'
import { startPush } from './lib/push'
import type { PermKey } from './lib/permissions'

// adminOnly: sadece yonetici. perm: yoneticiye ya da o yetkisi acik calisana.
function ProtectedRoute({
  children,
  adminOnly = false,
  perm,
}: {
  children: React.ReactNode
  adminOnly?: boolean
  perm?: PermKey
}) {
  const { session, profile, loading, can } = useAuth()

  if (loading) return (
    <div className="loading-screen muted">
      Yükleniyor…
    </div>
  )

  if (!session || !profile || !profile.is_active) return <Navigate to="/" replace />
  // Ilk giriste sifre degistirme zorunluysa uygulama acilmadan once.
  if (profile.must_change_password) return <ForcePasswordPage />
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/randevular" replace />
  if (perm && !can(perm)) return <Navigate to="/randevular" replace />

  return <>{children}</>
}

const MIN_SPLASH_MS = 2600
const SPLASH_FADE_MS = 380

function AppRoutes() {
  const { session, profile, loading } = useAuth()
  const [splashVisible, setSplashVisible] = useState(true)
  const [splashFadingOut, setSplashFadingOut] = useState(false)
  const mountedAt = useRef(Date.now())
  const navigate = useNavigate()

  // Telefon bildirimleri: giris yapilinca cihaz kaydedilir; bildirime
  // dokununca ilgili ekran acilir (bkz. lib/push.ts).
  const profileId = profile?.id
  useEffect(() => {
    if (session && profileId) startPush((route) => navigate(route))
  }, [session, profileId, navigate])

  // Auth kontrolu genelde cok hizli bitiyor (~100ms) — splash animasyonun
  // gorunur olmasi icin gercek ekran altta hazir olsa bile en az
  // MIN_SPLASH_MS boyunca ustte tutup ondan sonra yumusakca soldur.
  useEffect(() => {
    if (loading) return
    const elapsed = Date.now() - mountedAt.current
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed)
    const fadeTimer = setTimeout(() => setSplashFadingOut(true), remaining)
    const removeTimer = setTimeout(() => setSplashVisible(false), remaining + SPLASH_FADE_MS)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [loading])

  return (
    <>
      {!loading && (
        <Routes>
          <Route
            path="/"
            element={session && profile ? <Navigate to="/dashboard" replace /> : <LoginPage />}
          />
          <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route path="randevular" element={<AppointmentsPage />} />
            <Route path="mesajlar"   element={<ProtectedRoute perm="mesajlar"><MessagesPage /></ProtectedRoute>} />
            <Route path="ayarlar"    element={<SettingsPage />} />
            <Route path="bildirimler" element={<NotificationsPage />} />
            <Route path="musteriler" element={<CustomersPage />} />
            <Route path="musteriler/:id" element={<CustomerDetailPage />} />
            <Route path="daha-fazla" element={<MorePage />} />
            <Route
              path="dashboard"
              element={<ProtectedRoute adminOnly><DashboardPage /></ProtectedRoute>}
            />
            <Route
              path="muhasebe"
              element={<ProtectedRoute perm="kasa"><AccountingPage /></ProtectedRoute>}
            />
            <Route
              path="ekip"
              element={<ProtectedRoute perm="ekip_yonet"><TeamPage /></ProtectedRoute>}
            />
            <Route
              path="ekip/tatiller"
              element={<ProtectedRoute perm="ekip_yonet"><HolidaysPage /></ProtectedRoute>}
            />
            <Route
              path="ekip/yeni"
              element={<ProtectedRoute adminOnly><EmployeeCreatePage /></ProtectedRoute>}
            />
            <Route
              path="ekip/:id"
              element={<ProtectedRoute perm="ekip_yonet"><EmployeeDetailPage /></ProtectedRoute>}
            />
            <Route
              path="ekip/:id/saatler"
              element={<ProtectedRoute perm="ekip_yonet"><EmployeeSchedulePage /></ProtectedRoute>}
            />
            <Route
              path="ekip/:id/izinler"
              element={<ProtectedRoute perm="ekip_yonet"><EmployeeLeavesPage /></ProtectedRoute>}
            />
            <Route
              path="hizmetler"
              element={<ProtectedRoute perm="hizmet_yonet"><ServicesPage /></ProtectedRoute>}
            />
            <Route
              path="hizmetler/:id/aciklama"
              element={<ProtectedRoute perm="hizmet_yonet"><ServiceDescriptionPage /></ProtectedRoute>}
            />
            <Route
              path="kurulum"
              element={<ProtectedRoute adminOnly><SetupPage /></ProtectedRoute>}
            />
            <Route
              path="kasa/gun-sonu"
              element={<ProtectedRoute perm="kasa"><CashClosurePage /></ProtectedRoute>}
            />
            <Route
              path="kazancim"
              element={<ProtectedRoute perm="kendi_kazanc"><EmployeeDetailPage selfEarnings /></ProtectedRoute>}
            />
            <Route
              path="performans-raporu"
              element={<ProtectedRoute perm="raporlar"><PerformanceReportPage /></ProtectedRoute>}
            />
            <Route
              path="giderler"
              element={<ProtectedRoute perm="kasa"><GiderlerPage /></ProtectedRoute>}
            />
            <Route
              path="reklam"
              element={<ProtectedRoute adminOnly><AdInsightsPage /></ProtectedRoute>}
            />
            <Route
              path="reklam-callback"
              element={<ProtectedRoute adminOnly><AdOAuthCallbackPage /></ProtectedRoute>}
            />
            <Route
              path="ai-analiz"
              element={<ProtectedRoute adminOnly><AiInsightsPage /></ProtectedRoute>}
            />
            <Route
              path="toplu-mesaj"
              element={<ProtectedRoute adminOnly><TopluMesajPage /></ProtectedRoute>}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      {splashVisible && <AppSplash fadingOut={splashFadingOut} />}
    </>
  )
}

function AuthenticatedApp() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

function App() {
  // Native (Android) splash sadece WebView ilk kareyi cizene kadar orada
  // durur — biz kendi animasyonlu splash'imizi (AppSplash) React tarafinda
  // gosteriyoruz, o yuzden native olani hemen birakip ona devrediyoruz.
  // launchAutoHide:false oldugu icin bu cagri gelmezse native splash hic
  // kapanmaz.
  useEffect(() => {
    SplashScreen.hide().catch(() => {})
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/randevu-al/:slug" element={<PublicBookingPage />} />
        <Route path="/sifre-sifirla" element={<ResetPasswordPage />} />
        <Route path="/*" element={<AuthenticatedApp />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
