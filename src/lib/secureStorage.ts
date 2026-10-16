import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'
import { logger } from './logger'

// Supabase oturumu (access + refresh token) icin depolama: telefonda Android
// Keystore / iOS Keychain ile sifrelenir. WebView'in localStorage'i duz
// metindir ve iOS'ta cihaz yedegine girer.
//
// Onceki surumler oturumu localStorage'da tuttugu icin ilk okumada oradaki
// kayit guvenli depoya tasinir; kullanici cikis yapmak zorunda kalmaz.
// Eklenti calismazsa localStorage'a donulur — kullanici uygulamanin disinda
// kalmasindansa eski davranis tercih edilir.

function legacyGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function legacyRemove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // depolama kapali olabilir
  }
}

async function secureGet(key: string): Promise<string | null> {
  const { value: keys } = await SecureStoragePlugin.keys()
  if (!keys.includes(key)) return null
  const { value } = await SecureStoragePlugin.get({ key })
  return value
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    let stored: string | null
    try {
      stored = await secureGet(key)
    } catch (e) {
      logger.warn('Guvenli depo okunamadi, localStorage kullaniliyor', e)
      return legacyGet(key)
    }
    if (stored !== null) return stored

    const legacy = legacyGet(key)
    if (legacy === null) return null
    try {
      await SecureStoragePlugin.set({ key, value: legacy })
      legacyRemove(key)
    } catch (e) {
      logger.warn('Oturum guvenli depoya tasinamadi', e)
    }
    return legacy
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStoragePlugin.set({ key, value })
      legacyRemove(key)
    } catch (e) {
      logger.warn('Guvenli depoya yazilamadi, localStorage kullaniliyor', e)
      try {
        localStorage.setItem(key, value)
      } catch {
        // depolama kapali olabilir
      }
    }
  },

  async removeItem(key: string): Promise<void> {
    legacyRemove(key)
    try {
      await SecureStoragePlugin.remove({ key })
    } catch {
      // anahtar zaten yok
    }
  },
}
