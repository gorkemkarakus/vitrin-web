import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { SplashScreen } from '@capacitor/splash-screen'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AppSplash from './components/AppSplash'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './layouts/DashboardLayout'
import DashboardPage from './pages/DashboardPage'
import ForcePasswordPage from './pages/ForcePasswordPage'
import { startPush } from './lib/push'
import PushPermissionSheet from './components/PushPermissionSheet'
import ErrorBoundary from './components/ErrorBoundary'
import OfflineBanner from './components/OfflineBanner'
import TimezoneBanner from './components/TimezoneBanner'
import RouteFallback from './components/RouteFallback'
import PlanLimitSheet from './components/PlanLimitSheet'
import PlanLocked from './components/PlanLocked'
import type { PermKey } from './lib/permissions'
import type { PlanFeature } from './lib/plan'

// Sayfalar acildiklarinda yuklenir (ilk acilis paketi kuculur).
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'))
const AccountingPage = lazy(() => import('./pages/AccountingPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const ServicesPage = lazy(() => import('./pages/ServicesPage'))
const ServiceDescriptionPage = lazy(() => import('./pages/ServiceDescriptionPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const MorePage = lazy(() => import('./pages/MorePage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'))
const EmployeeDetailPage = lazy(() => import('./pages/EmployeeDetailPage'))
const EmployeeCreatePage = lazy(() => import('./pages/EmployeeCreatePage'))
const EmployeeSchedulePage = lazy(() => import('./pages/EmployeeSchedulePage'))
const EmployeeLeavesPage = lazy(() => import('./pages/EmployeeLeavesPage'))
const HolidaysPage = lazy(() => import('./pages/HolidaysPage'))
const PerformanceReportPage = lazy(() => import('./pages/PerformanceReportPage'))
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'))
const AdInsightsPage = lazy(() => import('./pages/AdInsightsPage'))
const AiInsightsPage = lazy(() => import('./pages/AiInsightsPage'))
const AdOAuthCallbackPage = lazy(() => import('./pages/AdOAuthCallbackPage'))
const BulkMessagePage = lazy(() => import('./pages/BulkMessagePage'))
const PublicBookingPage = lazy(() => import('./public/PublicBookingPage'))
const LegalPage = lazy(() => import('./public/LegalPage'))
const AccountDeletionPage = lazy(() => import('./public/AccountDeletionPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const CashClosurePage = lazy(() => import('./pages/CashClosurePage'))
const SetupPage = lazy(() => import('./pages/SetupPage'))
const PlansPage = lazy(() => import('./pages/PlansPage'))
const CustomerFieldsPage = lazy(() => import('./pages/CustomerFieldsPage'))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const ImportCustomersPage = lazy(() => import('./pages/ImportCustomersPage'))
const CustomerReportPage = lazy(() => import('./pages/CustomerReportPage'))
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'))
const LeadsPage = lazy(() => import('./pages/LeadsPage'))
const LoyaltyPage = lazy(() => import('./pages/LoyaltyPage'))
const SurveysPage = lazy(() => import('./pages/SurveysPage'))
const SurveyPage = lazy(() => import('./public/SurveyPage'))
const SalonNoticePage = lazy(() => import('./public/SalonNoticePage'))
const PrivacyNoticeSettingsPage = lazy(() => import('./pages/PrivacyNoticeSettingsPage'))

// adminOnly: sadece yonetici. perm: yoneticiye ya da o yetkisi acik calisana.
// feature: paket bu ozelligi kapsamiyorsa sayfanin yerine "paketleri gor" ekrani.
function ProtectedRoute({
  children,
  adminOnly = false,
  perm,
  feature,
}: {
  children: React.ReactNode
  adminOnly?: boolean
  perm?: PermKey
  feature?: PlanFeature
}) {
  const { session, profile, loading, can, hasFeature } = useAuth()

  if (loading) return <div className="loading-screen muted">Yükleniyor…</div>

  if (!session || !profile || !profile.is_active) return <Navigate to="/" replace />
  // Ilk giriste sifre degistirme zorunluysa uygulama acilmadan once.
  if (profile.must_change_password) return <ForcePasswordPage />
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/randevular" replace />
  if (perm && !can(perm)) return <Navigate to="/randevular" replace />
  if (feature && !hasFeature(feature)) return <PlanLocked feature={feature} />

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
  const [pushPromptOpen, setPushPromptOpen] = useState(false)

  // Telefon bildirimleri: giris yapilinca cihaz kaydedilir; bildirime
  // dokununca ilgili ekran acilir (bkz. lib/push.ts).
  const profileId = profile?.id
  useEffect(() => {
    if (session && profileId)
      startPush(
        (route) => navigate(route),
        () => setPushPromptOpen(true),
      )
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
          <Route path="/" element={session && profile ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="randevular" element={<AppointmentsPage />} />
            <Route
              path="mesajlar"
              element={
                <ProtectedRoute perm="mesajlar" feature="messages">
                  <MessagesPage />
                </ProtectedRoute>
              }
            />
            <Route path="ayarlar" element={<SettingsPage />} />
            <Route path="bildirimler" element={<NotificationsPage />} />
            <Route path="musteriler" element={<CustomersPage />} />
            <Route path="musteriler/:id" element={<CustomerDetailPage />} />
            <Route path="daha-fazla" element={<MorePage />} />
            <Route path="planlar" element={<PlansPage />} />
            <Route path="gorevler" element={<TasksPage />} />
            <Route path="potansiyel" element={<LeadsPage />} />
            <Route
              path="memnuniyet"
              element={
                <ProtectedRoute perm="raporlar">
                  <SurveysPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="sadakat"
              element={
                <ProtectedRoute adminOnly>
                  <LoyaltyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="otomasyonlar"
              element={
                <ProtectedRoute adminOnly>
                  <AutomationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="musteri-raporu"
              element={
                <ProtectedRoute perm="raporlar">
                  <CustomerReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="musteriler/ice-aktar"
              element={
                <ProtectedRoute adminOnly>
                  <ImportCustomersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="ayarlar/aydinlatma"
              element={
                <ProtectedRoute adminOnly>
                  <PrivacyNoticeSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="ayarlar/musteri-alanlari"
              element={
                <ProtectedRoute adminOnly>
                  <CustomerFieldsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="dashboard"
              element={
                <ProtectedRoute adminOnly>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="muhasebe"
              element={
                <ProtectedRoute perm="kasa">
                  <AccountingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="ekip"
              element={
                <ProtectedRoute perm="ekip_yonet">
                  <TeamPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="ekip/tatiller"
              element={
                <ProtectedRoute perm="ekip_yonet">
                  <HolidaysPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="ekip/yeni"
              element={
                <ProtectedRoute adminOnly feature="staff">
                  <EmployeeCreatePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="ekip/:id"
              element={
                <ProtectedRoute perm="ekip_yonet">
                  <EmployeeDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="ekip/:id/saatler"
              element={
                <ProtectedRoute perm="ekip_yonet">
                  <EmployeeSchedulePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="ekip/:id/izinler"
              element={
                <ProtectedRoute perm="ekip_yonet">
                  <EmployeeLeavesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="hizmetler"
              element={
                <ProtectedRoute perm="hizmet_yonet">
                  <ServicesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="hizmetler/:id/aciklama"
              element={
                <ProtectedRoute perm="hizmet_yonet">
                  <ServiceDescriptionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="kurulum"
              element={
                <ProtectedRoute adminOnly>
                  <SetupPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="kasa/gun-sonu"
              element={
                <ProtectedRoute perm="kasa">
                  <CashClosurePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="kazancim"
              element={
                <ProtectedRoute perm="kendi_kazanc">
                  <EmployeeDetailPage selfEarnings />
                </ProtectedRoute>
              }
            />
            <Route
              path="performans-raporu"
              element={
                <ProtectedRoute perm="raporlar">
                  <PerformanceReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="giderler"
              element={
                <ProtectedRoute perm="kasa">
                  <ExpensesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="reklam"
              element={
                <ProtectedRoute adminOnly feature="ads">
                  <AdInsightsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="reklam-callback"
              element={
                <ProtectedRoute adminOnly feature="ads">
                  <AdOAuthCallbackPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="ai-analiz"
              element={
                <ProtectedRoute adminOnly feature="ai_insights">
                  <AiInsightsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="toplu-mesaj"
              element={
                <ProtectedRoute adminOnly feature="bulk_campaign">
                  <BulkMessagePage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      {session && !splashVisible && <TimezoneBanner />}
      {session && <PlanLimitSheet />}
      {pushPromptOpen && !splashVisible && session && <PushPermissionSheet onClose={() => setPushPromptOpen(false)} />}
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

// Rota degisince hata ekrani sifirlanir (baska sayfaya gecmek kurtarir).
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

function App() {
  // Native (Android) splash sadece WebView ilk kareyi cizene kadar orada
  // durur — biz kendi animasyonlu splash'imizi (AppSplash) React tarafinda
  // gosteriyoruz, o yuzden native olani hemen birakip ona devrediyoruz.
  // launchAutoHide:false oldugu icin bu cagri gelmezse native splash hic
  // kapanmaz.
  useEffect(() => {
    // index.html'deki "uygulama acilamadi" yedegi bunu gorunce devreye girmez.
    ;(window as Window & { __adapptivStarted?: boolean }).__adapptivStarted = true
    SplashScreen.hide().catch(() => {})
  }, [])

  return (
    <BrowserRouter>
      <OfflineBanner />
      <RouteErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/randevu-al/:slug" element={<PublicBookingPage />} />
            <Route path="/anket/:token" element={<SurveyPage />} />
            <Route path="/aydinlatma/:slug" element={<SalonNoticePage />} />
            <Route path="/sifre-sifirla" element={<ResetPasswordPage />} />
            <Route path="/gizlilik" element={<LegalPage slug="gizlilik" />} />
            <Route path="/kvkk" element={<LegalPage slug="kvkk" />} />
            <Route path="/kullanim-kosullari" element={<LegalPage slug="kullanim-kosullari" />} />
            <Route path="/hesap-silme" element={<AccountDeletionPage />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </BrowserRouter>
  )
}

export default App
