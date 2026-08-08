import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
import PublicBookingPage from './public/PublicBookingPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { session, profile, loading } = useAuth()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-dim)' }}>
      Yükleniyor…
    </div>
  )

  if (!session || !profile || !profile.is_active) return <Navigate to="/" replace />
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/randevular" replace />

  return <>{children}</>
}

const MIN_SPLASH_MS = 2600
const SPLASH_FADE_MS = 380

function AppRoutes() {
  const { session, profile, loading } = useAuth()
  const [splashVisible, setSplashVisible] = useState(true)
  const [splashFadingOut, setSplashFadingOut] = useState(false)
  const mountedAt = useRef(Date.now())

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
            <Route path="mesajlar"   element={<MessagesPage />} />
            <Route path="ayarlar"    element={<SettingsPage />} />
            <Route path="musteriler" element={<CustomersPage />} />
            <Route path="musteriler/:id" element={<CustomerDetailPage />} />
            <Route path="daha-fazla" element={<MorePage />} />
            <Route
              path="dashboard"
              element={<ProtectedRoute adminOnly><DashboardPage /></ProtectedRoute>}
            />
            <Route
              path="muhasebe"
              element={<ProtectedRoute adminOnly><AccountingPage /></ProtectedRoute>}
            />
            <Route
              path="ekip"
              element={<ProtectedRoute adminOnly><TeamPage /></ProtectedRoute>}
            />
            <Route
              path="ekip/tatiller"
              element={<ProtectedRoute adminOnly><HolidaysPage /></ProtectedRoute>}
            />
            <Route
              path="ekip/yeni"
              element={<ProtectedRoute adminOnly><EmployeeCreatePage /></ProtectedRoute>}
            />
            <Route
              path="ekip/:id"
              element={<ProtectedRoute adminOnly><EmployeeDetailPage /></ProtectedRoute>}
            />
            <Route
              path="ekip/:id/saatler"
              element={<ProtectedRoute adminOnly><EmployeeSchedulePage /></ProtectedRoute>}
            />
            <Route
              path="ekip/:id/izinler"
              element={<ProtectedRoute adminOnly><EmployeeLeavesPage /></ProtectedRoute>}
            />
            <Route
              path="hizmetler"
              element={<ProtectedRoute adminOnly><ServicesPage /></ProtectedRoute>}
            />
            <Route
              path="hizmetler/:id/aciklama"
              element={<ProtectedRoute adminOnly><ServiceDescriptionPage /></ProtectedRoute>}
            />
            <Route
              path="performans-raporu"
              element={<ProtectedRoute adminOnly><PerformanceReportPage /></ProtectedRoute>}
            />
            <Route
              path="giderler"
              element={<ProtectedRoute adminOnly><GiderlerPage /></ProtectedRoute>}
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
