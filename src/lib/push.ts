import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'
import { logger } from './logger'

// Telefon bildirimleri. Firebase dosyalari (android/app/google-services.json,
// iOS'ta GoogleService-Info.plist + APNs) eklenmeden register() uygulamayi
// cokertebilecegi icin yalnizca VITE_PUSH_ENABLED=1 ile derlenen surumde acilir.
const pushEnabled = Capacitor.isNativePlatform() && import.meta.env.VITE_PUSH_ENABLED === '1'
export const pushAvailable = pushEnabled

const TOKEN_KEY = 'adapptiv.push.token'
// 'Simdi degil' denince sistem izni bu sure boyunca tekrar sorulmaz.
const SNOOZE_KEY = 'adapptiv.push.snoozedAt'
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
let started = false

function storedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

// Izin henuz sorulmadiysa sistem penceresini HEMEN acmaz: once onNeedsPrompt
// ile uygulamanin kendi aciklama ekrani gosterilir (bkz. PushPermissionSheet),
// kullanici kabul ederse enablePush() sistem iznini ister.
export async function startPush(onOpen: (route: string) => void, onNeedsPrompt?: () => void) {
  if (!pushEnabled || started) return
  started = true
  try {
    await PushNotifications.addListener('registration', async ({ value }) => {
      try {
        localStorage.setItem(TOKEN_KEY, value)
      } catch {
        /* depolama kapali olabilir */
      }
      const { error } = await supabase.rpc('register_push_device', {
        p_token: value,
        p_platform: Capacitor.getPlatform(),
      })
      if (error) logger.warn('Bildirim cihazi kaydedilemedi', error.message)
    })
    await PushNotifications.addListener('registrationError', (e) => logger.warn('Bildirim kaydi basarisiz', e.error))
    await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const route = (notification.data as { route?: string } | undefined)?.route
      if (route && route.startsWith('/')) onOpen(route)
    })

    if (Capacitor.getPlatform() === 'android') {
      await PushNotifications.createChannel({
        id: 'randevular',
        name: 'Randevular',
        description: 'Yeni ve iptal edilen randevular',
        importance: 4,
        sound: 'default',
      })
    }

    const perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'granted') await PushNotifications.register()
    else if ((perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') && !promptSnoozed())
      onNeedsPrompt?.()
  } catch (e) {
    logger.warn('Bildirimler baslatilamadi', e)
  }
}

// Cikista bu cihaz hesaptan ayrilir (baska biri girerse onceki kisinin
// bildirimleri gelmesin). Oturum kapanmadan once cagrilmali.
export async function stopPush() {
  if (!pushEnabled) return
  const token = storedToken()
  try {
    if (token) await supabase.rpc('unregister_push_device', { p_token: token })
    await PushNotifications.removeAllListeners()
  } catch {
    /* cikis yine de devam eder */
  }
  started = false
}

function promptSnoozed() {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY) ?? 0)
    return Date.now() - at < SNOOZE_MS
  } catch {
    return false
  }
}

export function snoozePushPrompt() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()))
  } catch {
    /* depolama kapali olabilir */
  }
}

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unavailable'

export async function pushPermission(): Promise<PushPermission> {
  if (!pushEnabled) return 'unavailable'
  try {
    const { receive } = await PushNotifications.checkPermissions()
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'unavailable'
  }
}

// Kullanici aciklama ekraninda 'Bildirimleri ac' dediginde sistem iznini ister.
export async function enablePush(): Promise<PushPermission> {
  if (!pushEnabled) return 'unavailable'
  try {
    const { receive } = await PushNotifications.requestPermissions()
    if (receive === 'granted') {
      await PushNotifications.register()
      return 'granted'
    }
    return receive === 'denied' ? 'denied' : 'prompt'
  } catch (e) {
    logger.warn('Bildirim izni istenemedi', e)
    return 'unavailable'
  }
}
