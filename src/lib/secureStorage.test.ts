import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
const plugin = {
  keys: vi.fn(async () => ({ value: [...store.keys()] })),
  get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key)! })),
  set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
    store.set(key, value)
    return { value: true }
  }),
  remove: vi.fn(async ({ key }: { key: string }) => ({ value: store.delete(key) })),
}
vi.mock('capacitor-secure-storage-plugin', () => ({ SecureStoragePlugin: plugin }))

const legacy = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => legacy.get(k) ?? null,
  setItem: (k: string, v: string) => void legacy.set(k, v),
  removeItem: (k: string) => void legacy.delete(k),
})

const { secureSessionStorage, resetSecureStorageCacheForTests } = await import('./secureStorage')
const KEY = 'sb-test-auth-token'

beforeEach(() => {
  resetSecureStorageCacheForTests()
  store.clear()
  legacy.clear()
  vi.clearAllMocks()
})

describe('secureSessionStorage', () => {
  it('yazilan oturumu guvenli depodan okur', async () => {
    await secureSessionStorage.setItem(KEY, 'oturum')
    expect(store.get(KEY)).toBe('oturum')
    expect(await secureSessionStorage.getItem(KEY)).toBe('oturum')
  })

  it("eski surumun localStorage'daki oturumunu tasir ve oradan siler", async () => {
    legacy.set(KEY, 'eski-oturum')
    expect(await secureSessionStorage.getItem(KEY)).toBe('eski-oturum')
    expect(store.get(KEY)).toBe('eski-oturum')
    expect(legacy.has(KEY)).toBe(false)
  })

  it('kayit yoksa null', async () => {
    expect(await secureSessionStorage.getItem(KEY)).toBeNull()
  })

  it("eklenti calismazsa localStorage'a doner (kullanici disarida kalmaz)", async () => {
    legacy.set(KEY, 'eski-oturum')
    plugin.keys.mockRejectedValueOnce(new Error('keystore yok'))
    expect(await secureSessionStorage.getItem(KEY)).toBe('eski-oturum')

    plugin.set.mockRejectedValueOnce(new Error('keystore yok'))
    await secureSessionStorage.setItem(KEY, 'yeni')
    expect(legacy.get(KEY)).toBe('yeni')
  })

  it('tasima basarisizsa eski kaydi silmez', async () => {
    legacy.set(KEY, 'eski-oturum')
    plugin.set.mockRejectedValueOnce(new Error('dolu'))
    expect(await secureSessionStorage.getItem(KEY)).toBe('eski-oturum')
    expect(legacy.get(KEY)).toBe('eski-oturum')
  })

  it('cikista her iki yerden de siler', async () => {
    store.set(KEY, 'a')
    legacy.set(KEY, 'b')
    await secureSessionStorage.removeItem(KEY)
    expect(store.has(KEY)).toBe(false)
    expect(legacy.has(KEY)).toBe(false)
  })

  it('ilk okumadan sonra guvenli depoya tekrar gitmez (her istekte okunur)', async () => {
    store.set(KEY, 'oturum')
    for (let i = 0; i < 5; i++) expect(await secureSessionStorage.getItem(KEY)).toBe('oturum')
    expect(plugin.get).toHaveBeenCalledTimes(1)
  })

  it('ayni anda gelen ilk okumalar tek cihaz okumasini paylasir', async () => {
    store.set(KEY, 'oturum')
    const values = await Promise.all([1, 2, 3].map(() => secureSessionStorage.getItem(KEY)))
    expect(values).toEqual(['oturum', 'oturum', 'oturum'])
    expect(plugin.keys).toHaveBeenCalledTimes(1)
  })

  it('yazma ve silme bellekteki degeri de gunceller', async () => {
    await secureSessionStorage.setItem(KEY, 'yeni')
    expect(await secureSessionStorage.getItem(KEY)).toBe('yeni')
    await secureSessionStorage.removeItem(KEY)
    expect(await secureSessionStorage.getItem(KEY)).toBeNull()
    expect(plugin.get).not.toHaveBeenCalled()
  })
})
