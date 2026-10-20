import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'
import { logger } from './logger'

// Supabase oturumu (access + refresh token) icin depolama: telefonda Android
// Keystore / iOS Keychain ile sifrelenir. WebView'in localStorage'i duz
// metindir ve iOS'ta cihaz yedegine girer.
//
// Supabase istemcisi oturumu HER istekte yeniden okur; guvenli depodan okuma
// (yerel kopru + RSA sifre cozme) pahali oldugu icin deger ilk okumadan sonra
// bellekte tutulur. Yazma ve silme hem bellegi hem guvenli depoyu gunceller.
//
// Onceki surumler oturumu localStorage'da tuttugu icin ilk okumada oradaki
// kayit guvenli depoya tasinir; kullanici cikis yapmak zorunda kalmaz.
// Eklenti calismazsa localStorage'a donulur — kullanici uygulamanin disinda
// kalmasindansa eski davranis tercih edilir.

const cache = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

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

// Bazi cihazlarda Keystore cagrisi hic donmeyebiliyor; acilis bunu beklerken
// logoda kalmasin diye okuma sure sinirli (asilirsa localStorage'a donulur).
const SECURE_READ_TIMEOUT_MS = 4000

async function secureGetRaw(key: string): Promise<string | null> {
  const { value: keys } = await SecureStoragePlugin.keys()
  if (!keys.includes(key)) return null
  const { value } = await SecureStoragePlugin.get({ key })
  return value
}

function secureGet(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('guvenli depo zaman asimi')), SECURE_READ_TIMEOUT_MS)
    secureGetRaw(key).then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

async function readFromDevice(key: string): Promise<string | null> {
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
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (cache.has(key)) return cache.get(key) ?? null
    // Ayni anda gelen ilk okumalar tek bir cihaz okumasini paylasir.
    let read = pending.get(key)
    if (!read) {
      read = readFromDevice(key).finally(() => pending.delete(key))
      pending.set(key, read)
    }
    const value = await read
    if (!cache.has(key)) cache.set(key, value)
    return cache.get(key) ?? null
  },

  async setItem(key: string, value: string): Promise<void> {
    cache.set(key, value)
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
    cache.set(key, null)
    legacyRemove(key)
    try {
      await SecureStoragePlugin.remove({ key })
    } catch {
      // anahtar zaten yok
    }
  },
}

// Yalnizca testler icin: bellek onbellegini sifirlar.
export function resetSecureStorageCacheForTests() {
  cache.clear()
  pending.clear()
}
