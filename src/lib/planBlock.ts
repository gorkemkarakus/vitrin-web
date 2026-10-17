// Paket hatalari. Veritabani tetikleyicisi "PLAN_LIMIT:<anahtar>" firlatir;
// fonksiyonlar { code: 'PLAN_LIMIT' | 'PLAN_FEATURE' } doner. Sinir hangi
// ekranda yasanirsa yasansin ayni "paketleri gor" penceresi acilir
// (components/PlanLimitSheet.tsx dinler).

export type PlanBlock = { kind: 'limit'; key: string } | { kind: 'feature'; feature?: string }

const LIMIT_MESSAGES: Record<string, string> = {
  max_users: 'Paketinizdeki kullanıcı sınırına ulaştınız.',
  appointments_per_month: 'Paketinizin bu ayki randevu sınırına ulaştınız.',
  max_customers: 'Paketinizdeki müşteri sınırına ulaştınız.',
}

export function planBlockMessage(block: PlanBlock): string {
  if (block.kind === 'feature') return 'Bu özellik paketinizde yok.'
  return LIMIT_MESSAGES[block.key] ?? 'Paketinizin sınırına ulaştınız.'
}

export function planBlockFromError(err: unknown): PlanBlock | null {
  const e = (err ?? {}) as { message?: string; code?: string; limit?: string; feature?: string }
  const m = e.message?.match(/PLAN_LIMIT:([a-z_]+)/)
  if (m) return { kind: 'limit', key: m[1] }
  if (e.code === 'PLAN_LIMIT') return { kind: 'limit', key: e.limit ?? '' }
  if (e.code === 'PLAN_FEATURE') return { kind: 'feature', feature: e.feature }
  return null
}

const PLAN_BLOCK_EVENT = 'adapptiv:plan-block'

export function notifyPlanBlock(block: PlanBlock) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<PlanBlock>(PLAN_BLOCK_EVENT, { detail: block }))
}

export function onPlanBlock(fn: (block: PlanBlock) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<PlanBlock>).detail)
  window.addEventListener(PLAN_BLOCK_EVENT, handler)
  return () => window.removeEventListener(PLAN_BLOCK_EVENT, handler)
}
