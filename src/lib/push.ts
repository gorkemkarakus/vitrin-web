import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'
import { logger } from './logger'

// Telefon bildirimleri. Firebase dosyalari (android/app/google-services.json,
// iOS'ta GoogleService-Info.plist + APNs) eklenmeden register() uygulamayi
// cokertebilecegi icin yalnizca VITE_PUSH_ENABLED=1 ile derlenen surumde acilir.
export const pushEnabled = Capacitor.isNativePlatform() && import.meta.env.VITE_PUSH_ENABLED === '1'

const TOKEN_KEY = 'adapptiv.push.token'
let started = false

function storedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function startPush(onOpen: (route: string) => void) {
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

    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive === 'granted') await PushNotifications.register()
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
