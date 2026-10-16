import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('./supabase', () => ({ supabase: { auth: { getSession } } }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { callEdgeFunction } = await import('./edgeFunctions')

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
})

describe('callEdgeFunction', () => {
  it('guncel oturum token ile POST eder ve data doner', async () => {
    fetchMock.mockResolvedValue(response(200, { data: { id: 'x' } }))
    const res = await callEdgeFunction<{ id: string }>('create-team-member', { a: 1 })

    expect(res).toEqual({ ok: true, data: { id: 'x' } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/functions\/v1\/create-team-member$/)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"a":1}')
  })

  it('sunucu hatasini { ok: false, error } olarak doner', async () => {
    fetchMock.mockResolvedValue(response(403, { error: 'Yetkiniz yok' }))
    expect(await callEdgeFunction('x')).toEqual({ ok: false, status: 403, error: 'Yetkiniz yok' })
  })

  it('JSON olmayan hata govdesinde error null olur', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => Promise.reject(new Error('html')) })
    expect(await callEdgeFunction('x')).toEqual({ ok: false, status: 502, error: null })
  })

  it('govdesiz cagri Content-Type gondermez; oturum yoksa Authorization yok', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    fetchMock.mockResolvedValue(response(200, { data: null }))
    await callEdgeFunction('disconnect-ad-account')
    const init = fetchMock.mock.calls[0][1]
    expect(init.body).toBeUndefined()
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('ag hatasini cagirana firlatir', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(callEdgeFunction('x')).rejects.toThrow('Failed to fetch')
  })
})
