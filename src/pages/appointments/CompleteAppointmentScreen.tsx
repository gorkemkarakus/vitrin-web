import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { NETWORK_ERROR } from '../../lib/messages'
import { friendlyDbError } from '../../lib/dbErrors'
import { useAuth } from '../../contexts/AuthContext'
import { currency } from '../../lib/currency'
import { toLocalDateString } from '../../lib/date'
import { computeDebtItems, type DebtItem } from '../../lib/customerDebts'
import { PAYMENT_METHOD_OPTIONS } from '../../lib/paymentMethods'
import Select from '../../components/Select'
import { ChevronRightIcon, CheckCircleIcon } from '../../components/icons'
import styles from '../AppointmentsPage.module.css'
import { METHOD_SHORT } from './constants'
import { SLOT_MINUTES, type Appointment, type Service, type ServicePackage } from './types'

// Randevu "Tamamlandi" yapilinca acilan tam ekran: islem turu (tek/seansli
// paket), ucret, odeme, onceki borc ve sonraki seans. Kendi durumunu tasir;
// sayfa yalnizca hangi randevunun tamamlandigini bilir (AppointmentsPage).
interface Props {
  appointment: Appointment
  appointments: Appointment[]
  services: Service[]
  servicePackages: ServicePackage[]
  customerName: (id: string | null) => string
  serviceName: (id: string | null) => string
  employeeName: (id: string | null) => string
  isEmployeeAvailable: (employeeId: string, start: Date, durationMinutes: number, excludeApptId?: string) => boolean
  isDayOpenForCandidates: (dateStr: string, candidateIds: string[]) => boolean
  buildTimeOptions: (
    dateStr: string,
    candidateIds: string[],
    durationMinutes: number,
    excludeApptId?: string,
  ) => { value: string; label: string; disabled?: boolean }[]
  // Sayfanin ust hata bandi (kapanis kaydedildi ama ek adim basarisizsa).
  setError: (message: string | null) => void
  onClose: () => void
  loadData: (silent?: boolean) => Promise<void>
}

export default function CompleteAppointmentScreen({
  appointment,
  appointments,
  services,
  servicePackages,
  customerName,
  serviceName,
  employeeName,
  isEmployeeAvailable,
  isDayOpenForCandidates,
  buildTimeOptions,
  setError,
  onClose,
  loadData,
}: Props) {
  const { profile, can } = useAuth()
  const canPay = can('odeme_al')
  const completingAppt = appointment
  // Paketsiz randevuda ucret ilk karede hazir (paketlide acilista yuklenir).
  const initialPrice = appointment.package_id
    ? ''
    : String(appointment.price_override ?? services.find((s) => s.id === appointment.service_id)?.price ?? 0)
  const [completeTypeOpen, setCompleteTypeOpen] = useState(false)
  const [completePayMode, setCompletePayMode] = useState<'full' | 'custom' | 'none'>('full')
  // Musterinin bu randevu/paket disindaki onceki borcu ("Hepsini kapat").
  const [oldDebtItems, setOldDebtItems] = useState<DebtItem[]>([])
  const [includeOldDebt, setIncludeOldDebt] = useState(true)

  // Randevu henuz bir pakete bagli degilse (ilk tamamlama), zorunlu olarak
  // sorulan "Tek Seferlik / Seanslı" karari — paket zaten varsa bu soru hic
  // sorulmuyor (asagida completingAppt.package_id kontrolu ile atlaniyor).
  const [completeTransactionType, setCompleteTransactionType] = useState<'tek' | 'seansli' | null>(
    appointment.package_id ? 'seansli' : 'tek',
  )
  const [completePackageTotalSessions, setCompletePackageTotalSessions] = useState('8')
  const [completePackageSessionNumber, setCompletePackageSessionNumber] = useState('1')
  // Randevu zaten bir pakete bagliysa, o paketin TUM seanslari+odemeleri
  // taze cekilip (handleStatusChange icinde) paketin GUNCEL beklenen/odenen
  // toplami onceden hesaplanir — "Paket Tutarı"/"Kalan Borç" onizlemesi ve
  // "zaten tamamen tahsil edilmis mi" (completeFullyPaid) bundan turetilir.
  const [completeScopeExpected, setCompleteScopeExpected] = useState(0)
  const [completeScopePaid, setCompleteScopePaid] = useState(0)
  const [completeFullyPaid, setCompleteFullyPaid] = useState(false)
  const [completeLoadingScope, setCompleteLoadingScope] = useState(!!appointment.package_id)
  // Standart hizmet fiyatindan farkli olabilecek, BU seansa ozel gercek
  // ucret (ör. ekstra bakim/boya ile pahalanmis) — "Tahsil Edilen Tutar"dan
  // ayri, cunku tutar kismi odenmis olabilir. Degistirilince Tahsil Edilen
  // Tutar da otomatik ona esitlenir (cogu zaman tam tahsil edilir
  // varsayimiyla), ama sonrasinda bagimsiz duzenlenebilir kalir.
  const [completePriceOverride, setCompletePriceOverride] = useState(initialPrice)
  // "Esnek Fiyat" ile acilip kapanan duzenleme modu — varsayilan olarak
  // ucret salt-okunur buyuk yazi ile gosterilir, degistirmek icin once
  // "Esnek Fiyat" dokunulur.
  const [completePriceEditing, setCompletePriceEditing] = useState(false)
  // "Paket Tutarı" da (Düzenle ile) dogrudan toplam olarak girilebilir —
  // girilen toplam, seans basi fiyati (completePriceOverride = toplam /
  // seans sayisi) geriye donuk hesaplayarak gunceller, boylece tek bir
  // kaynak (seans basi fiyat) her zaman dogru kalir.
  const [completePackageAmountEditing, setCompletePackageAmountEditing] = useState(false)
  const [completePaymentAmount, setCompletePaymentAmount] = useState(initialPrice)
  // Bos birakiliyor (varsayilan yontem YOK) — bir tutar girildiyse yontem
  // secilmeden Tamamla butonu acilmiyor (zorunlu secim).
  const [completePaymentMethod, setCompletePaymentMethod] = useState('')
  const [completeFollowupDate, setCompleteFollowupDate] = useState('')
  const [completeFollowupTime, setCompleteFollowupTime] = useState('')
  const [completeNote, setCompleteNote] = useState('')
  const [completeBusy, setCompleteBusy] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

  // Acilis: onceki borc ve (paketliyse) paketin guncel kapsami yuklenir.
  useEffect(() => {
    const appt = appointment
    void (async () => {
      if (appt.customer_id && canPay) loadOldDebt(appt)

      if (appt.package_id) {
        // Paket zaten varsa (ilk seans degil), fiyat ILK SEANSTA belirlenmis
        // ozel ucrete KILITLENIR — bu seansta ayrica sorulmaz/degistirilemez,
        // sadece paketin GUNCEL kalan bakiyesi gosterilir. Ayni sorguyla
        // "zaten tamamen tahsil edilmis mi?" (completeFullyPaid) de burada
        // onceden hesaplanir.
        setCompleteLoadingScope(true)
        const pkg = servicePackages.find((p) => p.id === appt.package_id)
        const standardPrice = pkg?.service_id ? (services.find((s) => s.id === pkg.service_id)?.price ?? 0) : 0
        const [{ data: sessions }, { data: pkgPayments }] = await Promise.all([
          supabase.from('appointments').select('price_override, scheduled_at').eq('package_id', appt.package_id),
          supabase.from('payments').select('amount').eq('package_id', appt.package_id).is('voided_at', null),
        ])
        const sortedSessions = (sessions ?? []).slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
        const pkgSessionPrice = sortedSessions[0]?.price_override ?? standardPrice
        const knownSessionsTotal = sortedSessions.reduce((sum, s) => sum + (s.price_override ?? pkgSessionPrice), 0)
        const remainingSessionsEstimate =
          Math.max(0, (pkg?.total_sessions ?? 0) - (pkg?.session_offset ?? 0) - sortedSessions.length) * pkgSessionPrice
        const scopeExpected = knownSessionsTotal + remainingSessionsEstimate
        const scopePaid = (pkgPayments ?? []).reduce((sum, p) => sum + p.amount, 0)
        setCompleteScopeExpected(scopeExpected)
        setCompleteScopePaid(scopePaid)
        setCompleteFullyPaid(scopePaid >= scopeExpected)
        setCompletePriceOverride(String(appt.price_override ?? pkgSessionPrice))
        setCompletePaymentAmount(String(Math.max(0, scopeExpected - scopePaid)))
        setCompleteLoadingScope(false)
      } else {
        const svc = services.find((s) => s.id === appt.service_id)
        const price = appt.price_override ?? svc?.price ?? 0
        setCompletePriceOverride(String(price))
        setCompletePaymentAmount(String(price))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Musterinin bu kapanisin disindaki borclari (kalem kalem): Musteriler ve
  // Kasa ile ayni hesap (computeDebtItems). Bu randevu ve bagli oldugu paket
  // haric tutulur — onlar kapanisin kendi odeme adiminda.
  async function loadOldDebt(appt: Appointment) {
    const cid = appt.customer_id
    if (!cid) return
    const [{ data: apps }, { data: pkgs }, { data: pays }, { data: svcs }] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, customer_id, service_id, status, scheduled_at, package_id, price_override')
        .eq('customer_id', cid),
      supabase
        .from('service_packages')
        .select('id, customer_id, service_id, total_sessions, session_offset')
        .eq('customer_id', cid),
      supabase
        .from('payments')
        .select('customer_id, amount, appointment_id, package_id')
        .eq('customer_id', cid)
        .is('voided_at', null),
      supabase.from('services').select('id, price'),
    ])
    const priceById = new Map((svcs ?? []).map((x) => [x.id as string, Number(x.price ?? 0)]))
    const items = computeDebtItems(pkgs ?? [], apps ?? [], pays ?? [], priceById).filter(
      (it) =>
        !(it.kind === 'appointment' && it.id === appt.id) && !(it.kind === 'package' && it.id === appt.package_id),
    )
    setOldDebtItems(items)
  }

  // Islem turu degisince fiyat/seans: hizmetin paket sablonu varsa seansli
  // secimde seans sayisi ve seans basi ucret oradan gelir; tek seferlige
  // donulunce normal ucrete geri doner. "Hepsini al" secili ise tahsil
  // edilecek tutar da yeni toplama esitlenir.
  function chooseCompleteType(type: 'tek' | 'seansli') {
    setCompleteTransactionType(type)
    if (!completingAppt || completingAppt.package_id) return
    const svc = services.find((x) => x.id === completingAppt.service_id)
    if (type === 'seansli' && svc?.package_sessions && svc.package_price != null) {
      const perSession = Math.round((svc.package_price / svc.package_sessions) * 100) / 100
      setCompletePackageTotalSessions(String(svc.package_sessions))
      setCompletePriceOverride(String(perSession))
      if (completePayMode === 'full')
        setCompletePaymentAmount(String(Math.round(perSession * svc.package_sessions * 100) / 100))
      return
    }
    const single = completingAppt.price_override ?? svc?.price ?? 0
    setCompletePriceOverride(String(single))
    if (completePayMode === 'full') {
      const sessions = type === 'seansli' ? Number(completePackageTotalSessions) || 1 : 1
      setCompletePaymentAmount(String(single * sessions))
    }
  }

  async function submitCompletion() {
    if (!completingAppt) return
    setCompleteError(null)

    // 1) Islem turu zorunlu (paket henuz yoksa).
    const isNewPackageDecision = !completingAppt.package_id
    if (isNewPackageDecision && !completeTransactionType) {
      setCompleteError('Lütfen işlem türünü seçin.')
      return
    }
    const creatingPackage = isNewPackageDecision && completeTransactionType === 'seansli'

    let packageTotalSessionsValue = 0
    let packageSessionNumberValue = 0
    if (creatingPackage) {
      packageTotalSessionsValue = Math.round(Number(completePackageTotalSessions))
      packageSessionNumberValue = Math.round(Number(completePackageSessionNumber))
      if (!packageTotalSessionsValue || packageTotalSessionsValue < 1) {
        setCompleteError('Geçerli bir toplam seans sayısı girin.')
        return
      }
      if (
        !packageSessionNumberValue ||
        packageSessionNumberValue < 1 ||
        packageSessionNumberValue > packageTotalSessionsValue
      ) {
        setCompleteError('Geçerli bir "kaçıncı seans" girin (1 ile toplam seans sayısı arasında).')
        return
      }
    }

    const svc = services.find((s) => s.id === completingAppt.service_id)
    const isPackageFlow = !!completingAppt.package_id || creatingPackage

    // 2) Bu seans kacinci/son seans mi? (mevcut paketse siblings'ten,
    // yeni olusturuluyorsa girilen degerlerden hesaplanir).
    let currentSessionNumber = 0
    let totalSessionsForCheck = 0
    if (creatingPackage) {
      currentSessionNumber = packageSessionNumberValue
      totalSessionsForCheck = packageTotalSessionsValue
    } else if (completingAppt.package_id) {
      const pkg = servicePackages.find((p) => p.id === completingAppt.package_id)
      totalSessionsForCheck = pkg?.total_sessions ?? 0
      const siblings = appointments
        .filter((x) => x.package_id === completingAppt.package_id)
        .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
      const idx = siblings.findIndex((x) => x.id === completingAppt.id)
      currentSessionNumber = idx + 1 + (pkg?.session_offset ?? 0)
    }
    const isLastSession = isPackageFlow && totalSessionsForCheck > 0 && currentSessionNumber >= totalSessionsForCheck
    const needsNextSession = isPackageFlow && !isLastSession

    // 3) Sonraki seans tarihi zorunlu (paket akisinda, son seans degilse).
    const followupDuration = svc?.duration_minutes ?? SLOT_MINUTES
    let followupStart: Date | null = null
    if (needsNextSession) {
      if (!completeFollowupDate || !completeFollowupTime) {
        setCompleteError('Bir sonraki seans tarihini seçiniz.')
        return
      }
      followupStart = new Date(`${completeFollowupDate}T${completeFollowupTime}`)
      // Yeni randevu formundaki musaitlik kontrolu (mesai, izin, cakisma)
      // takip randevusu icin de gecerli. Basarisizsa hicbir sey kaydedilmez
      // (randevu tamamlanmaz), pencere acik kalir.
      if (
        completingAppt.employee_id &&
        !isEmployeeAvailable(completingAppt.employee_id, followupStart, followupDuration)
      ) {
        setCompleteError(
          'Seçilen çalışan bu saatte müsait değil (mesai dışı, izinli veya dolu). Farklı bir saat seçin.',
        )
        return
      }
    }

    // Ucret: paket akisinda bu seansin fiyati ilk seansta kilitlenen ozel
    // ucrettir (completePriceOverride; sonraki seanslarda sorulmaz). Tahsil
    // edilen tutar paketin guncel kalan bakiyesine, paket yoksa bu islemin
    // ucretine gore kirpilir; girilen tutar kalan borcu asamaz.
    const price = Number(completePriceOverride) || 0
    let packageExpected = 0
    let packagePaidSoFar = 0
    if (creatingPackage) {
      packageExpected = packageTotalSessionsValue * price
    } else if (completingAppt.package_id) {
      packageExpected = completeScopeExpected
      packagePaidSoFar = completeScopePaid
    }
    const remainingDue = isPackageFlow ? Math.max(0, packageExpected - packagePaidSoFar) : Math.max(0, price)
    // Odeme alma yetkisi yoksa tutar ne girilmis olursa olsun kaydedilmez.
    const rawEntered = canPay ? Number(completePaymentAmount) || 0 : 0
    if (!completeFullyPaid && rawEntered > remainingDue) {
      setCompleteError('Kalan borçtan fazla tutar girilemez.')
      return
    }
    const entered = completeFullyPaid ? 0 : Math.min(rawEntered, remainingDue)

    // Paketin SON seansi kismi odemeyle kapatilamaz — o seansta paketin
    // tum kalan bakiyesi tahsil edilmis olmali (sonraki seans olmayacagi
    // icin kalan borcu tahsil edecek baska bir firsat kalmaz).
    if (isLastSession && !completeFullyPaid && Math.max(0, remainingDue - entered) > 0) {
      setCompleteError(
        canPay
          ? 'Son seansta paketin tüm tutarı ödenmelidir.'
          : 'Paketin son seansını ödeme alma yetkisi olan biri kapatmalı.',
      )
      return
    }

    const oldDebtTotal = oldDebtItems.reduce((sum, it) => sum + it.remaining, 0)
    const oldDebtApplies =
      canPay && !completeFullyPaid && includeOldDebt && completePayMode !== 'none' && oldDebtTotal > 0

    // 4) Odeme yontemi zorunlu (bir tutar tahsil ediliyorsa).
    if ((entered > 0 || oldDebtApplies) && !completePaymentMethod) {
      setCompleteError('Ödeme yöntemini seçin.')
      return
    }

    setCompleteBusy(true)
    try {
      const priceOverrideValue = Number(completePriceOverride)
      const { error: statusErr } = await supabase
        .from('appointments')
        .update({
          status: 'tamamlandi',
          price_override: Number.isFinite(priceOverrideValue) && priceOverrideValue >= 0 ? priceOverrideValue : null,
          // Islem notu notes kolonuna yazilir; source_note randevu alinirken
          // girilen nottur (kampanya adi, bot notu) ve korunmalidir.
          ...(completeNote.trim() ? { notes: completeNote.trim() } : {}),
        })
        .eq('id', completingAppt.id)
      if (statusErr) {
        setCompleteError('Randevu tamamlanamadı: ' + statusErr.message)
        return
      }

      // "Seanslı İşlem" ilk kez secildiyse paket burada olusturulup randevu
      // ona baglanir. Bu, odeme kaydindan ONCE olmali; yoksa odeme bos
      // package_id ile kaydolur ve paket odenmemis gorunur.
      let effectivePackageId = completingAppt.package_id
      if (creatingPackage) {
        const { data: newPackage, error: pkgErr } = await supabase
          .from('service_packages')
          .insert({
            business_id: profile?.business_id,
            customer_id: completingAppt.customer_id,
            service_id: completingAppt.service_id,
            total_sessions: packageTotalSessionsValue,
            session_offset: Math.max(0, packageSessionNumberValue - 1),
            created_by_user_id: profile?.id,
          })
          .select('id')
          .single()
        if (pkgErr || !newPackage) {
          setError('Randevu tamamlandı ama paket oluşturulamadı. ' + friendlyDbError(pkgErr, 'Tekrar deneyin.'))
          onClose()
          await loadData(true)
          return
        }
        effectivePackageId = newPackage.id
        await supabase.from('appointments').update({ package_id: effectivePackageId }).eq('id', completingAppt.id)
      }

      if (entered > 0) {
        const { error: payErr } = await supabase.from('payments').insert({
          // paid_at bir date kolonu; varsayilani sunucunun (UTC) CURRENT_DATE'i —
          // Turkiye'de 00:00-03:00 arasi alinan odeme bir onceki gune yazilirdi.
          paid_at: toLocalDateString(new Date()),
          business_id: profile?.business_id,
          customer_id: completingAppt.customer_id,
          appointment_id: completingAppt.id,
          package_id: effectivePackageId,
          amount: entered,
          method: completePaymentMethod,
          created_by_user_id: profile?.id,
        })
        if (payErr) {
          // Randevu zaten tamamlandi olarak isaretlendi (geri alinamaz) —
          // modal kapatilip hata ana sayfadaki banner'da gosterilir, boylece
          // "hicbir sey olmamis gibi" hissettirmez.
          setError('Randevu tamamlandı ama ödeme kaydedilemedi. ' + friendlyDbError(payErr, 'Tekrar deneyin.'))
          onClose()
          await loadData(true)
          return
        }
      }

      // "Hepsini kapat": onceki borclarin her biri kendi paketine/randevusuna
      // ayri odeme olarak yazilir (borc hesabi kalem bazli eslestiriyor).
      if (oldDebtApplies) {
        const { error: oldErr } = await supabase.from('payments').insert(
          oldDebtItems.map((it) => ({
            paid_at: toLocalDateString(new Date()),
            business_id: profile?.business_id,
            customer_id: completingAppt.customer_id,
            appointment_id: it.kind === 'appointment' ? it.id : null,
            package_id: it.kind === 'package' ? it.id : null,
            amount: it.remaining,
            method: completePaymentMethod,
            created_by_user_id: profile?.id,
          })),
        )
        if (oldErr) {
          setError(
            'Randevu kapandı ama önceki borcun ödemesi kaydedilemedi. ' + friendlyDbError(oldErr, 'Tekrar deneyin.'),
          )
          onClose()
          await loadData(true)
          return
        }
      }

      // Son seansta paket otomatik "tamamlandi" durumuna geciyor — bir daha
      // "Mevcut Pakete Ekle" listesinde gorunmuyor, sonraki seans da hic
      // istenmiyor (asagida needsNextSession zaten false).
      if (effectivePackageId && isLastSession) {
        await supabase.from('service_packages').update({ status: 'tamamlandi' }).eq('id', effectivePackageId)
      }

      if (needsNextSession && followupStart) {
        const { error: followupErr } = await supabase.from('appointments').insert({
          business_id: profile?.business_id,
          customer_id: completingAppt.customer_id,
          service_id: completingAppt.service_id,
          employee_id: completingAppt.employee_id,
          created_by_user_id: profile?.id,
          scheduled_at: followupStart.toISOString(),
          duration_minutes: followupDuration,
          source: completingAppt.source,
          package_id: effectivePackageId,
        })
        if (followupErr) {
          const isOverlap = /exclusion|conflicting key|deadlock/i.test(followupErr.message)
          setError(
            'Randevu tamamlandı ama sonraki seans oluşturulamadı: ' +
              (isOverlap
                ? 'seçilen saat az önce başka bir randevuyla dolmuş. Farklı bir saati "Mevcut Pakete Ekle" ile ekleyin.'
                : followupErr.message),
          )
          onClose()
          await loadData(true)
          return
        }
      }

      onClose()
      await loadData(true)
    } catch {
      setCompleteError(NETWORK_ERROR)
    } finally {
      setCompleteBusy(false)
    }
  }

  // Tamamlama modalinin "onizlemesi" — modalin hangi bolumlerinin
  // gosterilecegini, "Paket Tutarı"/"Kalan Borç" gibi ozet rakamlarin ne
  // olacagini ve Tamamla butonunun ne zaman acilacagini belirler.
  // submitCompletion icindeki AYNI hesaplama gercek kaydi yapar; burasi
  // sadece render/disabled durumunu onceden bilmek icin.
  let completionPreview: {
    isPackageFlow: boolean
    isLastSession: boolean
    needsNextSession: boolean
    creatingPackage: boolean
    currentSessionNumber: number
    totalSessionsForCheck: number
    previewExpected: number
    previewPaidSoFar: number
  } | null = null
  let completePaymentSummary = {
    price: 0,
    remainingDue: 0,
    entered: 0,
    stillOwed: 0,
  }
  if (completingAppt) {
    const isNewPackageDecision = !completingAppt.package_id
    const creatingPackage = isNewPackageDecision && completeTransactionType === 'seansli'
    const isPackageFlow = !!completingAppt.package_id || creatingPackage
    // Paket akisinda "price" seans basi kilitli ozel ucrettir — Esnek
    // Fiyat'la degistirilince Paket Tutarı da ANINDA buna gore yeniden
    // hesaplanir (bkz. asagida previewExpected).
    const price = Number(completePriceOverride) || 0
    let currentSessionNumber = 0
    let totalSessionsForCheck = 0
    let previewExpected = 0
    let previewPaidSoFar = 0
    if (creatingPackage) {
      currentSessionNumber = Math.round(Number(completePackageSessionNumber)) || 0
      totalSessionsForCheck = Math.round(Number(completePackageTotalSessions)) || 0
      previewExpected = totalSessionsForCheck * price
    } else if (completingAppt.package_id) {
      const pkg = servicePackages.find((p) => p.id === completingAppt.package_id)
      totalSessionsForCheck = pkg?.total_sessions ?? 0
      const siblings = appointments
        .filter((x) => x.package_id === completingAppt.package_id)
        .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
      const idx = siblings.findIndex((x) => x.id === completingAppt.id)
      currentSessionNumber = idx + 1 + (pkg?.session_offset ?? 0)
      previewExpected = completeScopeExpected
      previewPaidSoFar = completeScopePaid
    }
    const isLastSession = isPackageFlow && totalSessionsForCheck > 0 && currentSessionNumber >= totalSessionsForCheck
    completionPreview = {
      isPackageFlow,
      isLastSession,
      needsNextSession: isPackageFlow && !isLastSession,
      creatingPackage,
      currentSessionNumber,
      totalSessionsForCheck,
      previewExpected,
      previewPaidSoFar,
    }

    if (!completeFullyPaid) {
      // Musteri bakiyesi/fazla odeme kavrami kaldirildi — girilen tutar
      // hicbir zaman kalan borcu asamaz, dogrudan buna gore kirpilir.
      const remainingDue = isPackageFlow ? Math.max(0, previewExpected - previewPaidSoFar) : Math.max(0, price)
      const entered = canPay ? Math.min(Number(completePaymentAmount) || 0, remainingDue) : 0
      const stillOwed = Math.max(0, remainingDue - entered)
      completePaymentSummary = { price, remainingDue, entered, stillOwed }
    }
  }

  // Eksik zorunlu alanlar — hem "Tamamla" butonunu kilitlemek hem de
  // kullaniciya NEDEN ilerleyemedigini acikca gostermek icin tek yerden.
  const completeMissing: string[] = []
  if (completingAppt) {
    if (!completingAppt.package_id && !completeTransactionType) {
      completeMissing.push('İşlem türünü seçin.')
    }
    if (completionPreview?.creatingPackage) {
      const total = Math.round(Number(completePackageTotalSessions))
      const sessionNo = Math.round(Number(completePackageSessionNumber))
      if (!total || total < 1) completeMissing.push('Geçerli bir toplam seans sayısı girin.')
      else if (!sessionNo || sessionNo < 1 || sessionNo > total)
        completeMissing.push('Geçerli bir "kaçıncı seans" girin.')
    }
    if (!completeFullyPaid && completePaymentSummary.entered > 0 && !completePaymentMethod) {
      completeMissing.push('Ödeme yöntemini seçin.')
    }
    if (!completeFullyPaid && (Number(completePaymentAmount) || 0) > completePaymentSummary.remainingDue) {
      completeMissing.push('Kalan borçtan fazla tutar girilemez.')
    }
    // Paketin SON seansinda kismi odemeyle kapatilamaz — o ana kadar
    // biriken tum paket bakiyesi bu seansta tahsil edilmis olmali,
    // aksi halde bir sonraki seans olmayacagi icin kalan borc hic
    // tahsil edilme sansi bulamadan unutulur.
    if (completionPreview?.isLastSession && !completeFullyPaid && completePaymentSummary.stillOwed > 0) {
      completeMissing.push('Son seansta paketin tüm tutarı ödenmelidir.')
    }
    if (completionPreview?.needsNextSession && (!completeFollowupDate || !completeFollowupTime)) {
      completeMissing.push('Bir sonraki seans tarihini seçiniz.')
    }
  }
  const completeTotalSteps = completionPreview?.needsNextSession ? 3 : 2
  const completeDoneSteps =
    1 +
    (completeFullyPaid || completePaymentSummary.entered > 0 || completePayMode === 'none' || !canPay ? 1 : 0) +
    (completionPreview?.needsNextSession && completeFollowupDate && completeFollowupTime ? 1 : 0)
  const canSubmitCompletion = completingAppt !== null && !completeLoadingScope && completeMissing.length === 0

  return (
    <div className={styles.fullScreen}>
      <div className={styles.fullScroll}>
        <div className={styles.fsHead}>
          <button type="button" className={styles.fsBack} onClick={() => onClose()} aria-label="Geri">
            <ChevronRightIcon width={18} height={18} className={styles.backIcon} />
          </button>
          <span className={styles.fsHeadText}>
            <span className={styles.fsTitle}>Kapanış</span>
            <span className={styles.fsSub}>
              {customerName(completingAppt.customer_id)} ·{' '}
              {new Date(completingAppt.scheduled_at).toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {completingAppt.employee_id ? ` · ${employeeName(completingAppt.employee_id).split(' ')[0]}` : ''}
            </span>
          </span>
          <span className={styles.stepPill}>
            {completeDoneSteps} / {completeTotalSteps}
          </span>
        </div>

        {completeError && (
          <div className={`${styles.banner} ${styles.bannerError}`}>
            <span>{completeError}</span>
            <button type="button" className={styles.bannerClose} onClick={() => setCompleteError(null)}>
              ✕
            </button>
          </div>
        )}

        {/* ---- 1. Hizmet ---- */}
        <div className={styles.stepCard}>
          <div className={styles.stepCardHead}>
            <span className={styles.stepDone}>
              <CheckCircleIcon width={16} height={16} />
            </span>
            <span className={styles.stepText}>
              <span className={styles.stepTitle}>Hizmet yapıldı</span>
              <span className={styles.stepSub}>
                {serviceName(completingAppt.service_id)}
                {completionPreview?.isPackageFlow
                  ? ` · paketten ${completionPreview.currentSessionNumber || '?'}. seans`
                  : ' · tek seferlik'}
              </span>
            </span>
            {!completingAppt.package_id && (
              <button type="button" className={styles.stepLink} onClick={() => setCompleteTypeOpen((v) => !v)}>
                {completeTypeOpen ? 'Kapat' : 'Düzenle'}
              </button>
            )}
          </div>

          {!completingAppt.package_id && completeTypeOpen && (
            <div className={styles.miniSeg}>
              <button
                type="button"
                className={completeTransactionType === 'tek' ? styles.miniSegActive : styles.miniSegBtn}
                onClick={() => chooseCompleteType('tek')}
              >
                Tek seferlik
              </button>
              <button
                type="button"
                className={completeTransactionType === 'seansli' ? styles.miniSegActive : styles.miniSegBtn}
                onClick={() => chooseCompleteType('seansli')}
              >
                Seanslı (paket)
              </button>
            </div>
          )}

          {completionPreview?.isPackageFlow && (
            <div className={styles.pkgBox}>
              <div className={styles.pkgRow}>
                <span className={styles.pkgLabel}>Toplam seans</span>
                {completionPreview.creatingPackage ? (
                  <span className={styles.stepper}>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      disabled={(Number(completePackageTotalSessions) || 1) <= 1}
                      onClick={() =>
                        setCompletePackageTotalSessions(
                          String(Math.max(1, (Number(completePackageTotalSessions) || 1) - 1)),
                        )
                      }
                    >
                      −
                    </button>
                    <span className={styles.stepperValue}>{completePackageTotalSessions || 0}</span>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      onClick={() =>
                        setCompletePackageTotalSessions(String((Number(completePackageTotalSessions) || 0) + 1))
                      }
                    >
                      +
                    </button>
                  </span>
                ) : (
                  <span className={styles.pkgValue}>{completionPreview.totalSessionsForCheck}</span>
                )}
              </div>
              {completionPreview.creatingPackage && (
                <div className={styles.pkgRow}>
                  <span className={styles.pkgLabel}>Bugünkü kaçıncı seans</span>
                  <input
                    className={styles.pkgInput}
                    type="number"
                    min={1}
                    step={1}
                    value={completePackageSessionNumber}
                    onChange={(e) => setCompletePackageSessionNumber(e.target.value)}
                  />
                </div>
              )}
              <div className={styles.pkgRow}>
                <span className={styles.pkgLabel}>Paket tutarı</span>
                {completePackageAmountEditing ? (
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    autoFocus
                    className={styles.pkgInput}
                    defaultValue={completionPreview.previewExpected}
                    onChange={(e) => {
                      const newTotal = Number(e.target.value) || 0
                      const sessionCount = Math.max(1, Math.round(Number(completePackageTotalSessions)) || 1)
                      setCompletePriceOverride(String(newTotal / sessionCount))
                    }}
                    onBlur={() => setCompletePackageAmountEditing(false)}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.pkgValueBtn}
                    disabled={!completionPreview.creatingPackage}
                    onClick={() => setCompletePackageAmountEditing(true)}
                  >
                    {currency.format(completionPreview.previewExpected)}
                  </button>
                )}
              </div>
              <div className={styles.pkgBar}>
                {Array.from({ length: Math.min(completionPreview.totalSessionsForCheck, 30) }).map((_, i) => (
                  <span
                    key={i}
                    className={i < completionPreview!.currentSessionNumber ? styles.pkgSegDone : styles.pkgSeg}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---- 2. Odeme ---- */}
        <div className={`${styles.stepCard} ${styles.stepCardActive}`}>
          <div className={styles.stepCardHead}>
            <span className={styles.stepNum}>2</span>
            <span className={styles.stepTitleBig}>Ödeme</span>
            {!completeFullyPaid && completePaymentSummary.remainingDue > 0 && (
              <span className={styles.stepWarm}>{currency.format(completePaymentSummary.remainingDue)} alınacak</span>
            )}
          </div>
          {completeLoadingScope ? (
            <p className={styles.emptyNote}>Yükleniyor…</p>
          ) : completeFullyPaid ? (
            <p className={styles.stepOk}>Bu paket daha önce tamamen tahsil edildi.</p>
          ) : null}
          {!completeLoadingScope && !completeFullyPaid && canPay && oldDebtItems.length > 0 && (
            <div className={styles.oldDebtBox}>
              <span className={styles.oldDebtTitle}>
                Müşterinin önceki borcu: {currency.format(oldDebtItems.reduce((sum, it) => sum + it.remaining, 0))}
              </span>
              <div className={styles.payOptions}>
                <button
                  type="button"
                  className={includeOldDebt ? styles.payOptionActive : styles.payOption}
                  onClick={() => setIncludeOldDebt(true)}
                >
                  <span className={includeOldDebt ? styles.radioOn : styles.radio} />
                  <span className={styles.payOptionLabel}>Hepsini kapat</span>
                  <span className={styles.payOptionAmount}>
                    {currency.format(
                      completePaymentSummary.remainingDue + oldDebtItems.reduce((sum, it) => sum + it.remaining, 0),
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className={!includeOldDebt ? styles.payOptionActive : styles.payOption}
                  onClick={() => setIncludeOldDebt(false)}
                >
                  <span className={!includeOldDebt ? styles.radioOn : styles.radio} />
                  <span className={styles.payOptionLabel}>Sadece bugünkü</span>
                  <span className={styles.payOptionAmount}>{currency.format(completePaymentSummary.remainingDue)}</span>
                </button>
              </div>
            </div>
          )}
          {completeLoadingScope ? null : completeFullyPaid ? null : !canPay ? (
            <p className={styles.emptyNote}>
              Ödeme alma yetkin yok; {currency.format(completePaymentSummary.remainingDue)} müşterinin borcu olarak
              kalır, yetkili biri tahsil eder.
            </p>
          ) : (
            <>
              <div className={styles.payOptions}>
                <button
                  type="button"
                  className={completePayMode === 'full' ? styles.payOptionActive : styles.payOption}
                  onClick={() => {
                    setCompletePayMode('full')
                    setCompletePaymentAmount(String(completePaymentSummary.remainingDue))
                  }}
                >
                  <span className={completePayMode === 'full' ? styles.radioOn : styles.radio} />
                  <span className={styles.payOptionLabel}>Hepsini al</span>
                  <span className={styles.payOptionAmount}>{currency.format(completePaymentSummary.remainingDue)}</span>
                </button>
                <div className={completePayMode === 'custom' ? styles.payOptionActive : styles.payOption}>
                  <button
                    type="button"
                    className={styles.payOptionInner}
                    onClick={() => {
                      setCompletePayMode('custom')
                      setCompletePaymentAmount('')
                    }}
                  >
                    <span className={completePayMode === 'custom' ? styles.radioOn : styles.radio} />
                    <span className={styles.payOptionLabel}>Farklı tutar</span>
                  </button>
                  {completePayMode === 'custom' ? (
                    <input
                      className={styles.payInput}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={completePaymentSummary.remainingDue}
                      step="0.01"
                      placeholder="₺ tutar"
                      autoFocus
                      value={completePaymentAmount}
                      onChange={(e) => setCompletePaymentAmount(e.target.value)}
                    />
                  ) : (
                    <span className={styles.payOptionMuted}>₺ —</span>
                  )}
                </div>
                {!completionPreview?.isLastSession && (
                  <button
                    type="button"
                    className={completePayMode === 'none' ? styles.payOptionActive : styles.payOption}
                    onClick={() => {
                      setCompletePayMode('none')
                      setCompletePaymentAmount('0')
                    }}
                  >
                    <span className={completePayMode === 'none' ? styles.radioOn : styles.radio} />
                    <span className={styles.payOptionLabel}>Şimdi ödeme yok</span>
                    <span className={styles.payOptionMuted}>borç kalır</span>
                  </button>
                )}
              </div>

              {(completePaymentSummary.entered > 0 ||
                (includeOldDebt && completePayMode !== 'none' && oldDebtItems.length > 0)) && (
                <div className={styles.methodChips}>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      className={completePaymentMethod === m.value ? styles.methodChipActive : styles.methodChip}
                      onClick={() => setCompletePaymentMethod(m.value)}
                    >
                      {METHOD_SHORT[m.value] ?? m.label}
                    </button>
                  ))}
                </div>
              )}

              {!completionPreview?.isPackageFlow && (
                <div className={styles.priceLine}>
                  <span>Hizmet ücreti</span>
                  {completePriceEditing ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      autoFocus
                      className={styles.pkgInput}
                      value={completePriceOverride}
                      onChange={(e) => {
                        setCompletePriceOverride(e.target.value)
                        if (completePayMode === 'full') setCompletePaymentAmount(e.target.value)
                      }}
                      onBlur={() => setCompletePriceEditing(false)}
                    />
                  ) : (
                    <button type="button" className={styles.stepLink} onClick={() => setCompletePriceEditing(true)}>
                      {currency.format(completePaymentSummary.price)} · değiştir
                    </button>
                  )}
                </div>
              )}

              {completePaymentSummary.stillOwed > 0 && (
                <span className={styles.stepWarmNote}>
                  {currency.format(completePaymentSummary.stillOwed)} borç olarak kalacak
                </span>
              )}
            </>
          )}
        </div>

        {/* ---- 3. Sonraki randevu ---- */}
        <div
          className={completionPreview?.needsNextSession ? styles.stepCard : `${styles.stepCard} ${styles.stepCardDim}`}
        >
          <div className={styles.stepCardHead}>
            <span className={styles.stepNumMuted}>3</span>
            <span className={styles.stepText}>
              <span className={styles.stepTitle}>Sonraki randevu</span>
              <span className={styles.stepSub}>
                {completionPreview?.isLastSession
                  ? 'Paketin son seansı — tamamlanınca paket kapanır.'
                  : completionPreview?.needsNextSession
                    ? completeFollowupDate && completeFollowupTime
                      ? `${new Date(`${completeFollowupDate}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} · ${completeFollowupTime}`
                      : 'Paketin sonraki seansı için tarih seç (zorunlu)'
                    : 'Tek seferlik işlem — gerekirse sonra yeni randevu aç'}
              </span>
            </span>
          </div>
          {completionPreview?.needsNextSession && (
            <div className={styles.twoCol}>
              <div className="field field-flush">
                <label htmlFor="followupDate">Tarih</label>
                <input
                  id="followupDate"
                  type="date"
                  value={completeFollowupDate}
                  onChange={(e) => {
                    const newDate = e.target.value
                    const candidateIds = completingAppt.employee_id ? [completingAppt.employee_id] : []
                    if (newDate && !isDayOpenForCandidates(newDate, candidateIds)) {
                      setCompleteError('Seçilen çalışan bu gün çalışmıyor.')
                      return
                    }
                    setCompleteError(null)
                    setCompleteFollowupDate(newDate)
                  }}
                />
              </div>
              <div className="field field-flush">
                <label htmlFor="followupTime">Saat</label>
                <Select
                  id="followupTime"
                  value={completeFollowupTime}
                  onChange={setCompleteFollowupTime}
                  options={buildTimeOptions(
                    completeFollowupDate,
                    completingAppt.employee_id ? [completingAppt.employee_id] : [],
                    services.find((s) => s.id === completingAppt.service_id)?.duration_minutes ?? SLOT_MINUTES,
                  )}
                />
              </div>
            </div>
          )}
        </div>

        {/* ---- Not ---- */}
        <div className={styles.stepCard}>
          <textarea
            className={styles.noteBox}
            placeholder="İşlem notu (isteğe bağlı) — ör. kullanılan renk, müşterinin isteği"
            maxLength={250}
            value={completeNote}
            onChange={(e) => setCompleteNote(e.target.value)}
          />
        </div>

        {completeMissing.length > 0 && (
          <div className={styles.missingList}>
            {completeMissing.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.fsFooter}>
        <button
          type="button"
          className={styles.fsSubmit}
          disabled={completeBusy || !canSubmitCompletion}
          onClick={submitCompletion}
        >
          {completeBusy
            ? 'Kaydediliyor…'
            : completePaymentSummary.entered > 0
              ? `${currency.format(completePaymentSummary.entered)} ${METHOD_SHORT[completePaymentMethod]?.toLocaleLowerCase('tr') ?? ''} alındı · tamamla`.replace(
                  '  ',
                  ' ',
                )
              : 'İşlemi tamamla'}
        </button>
      </div>
    </div>
  )
}
