// Musteriden alinan bir odemeyi acik borclara en eskiden baslayarak dagitir.
// Borclar yalnizca bir randevuya ya da pakete bagli odemelerle kapandigi icin
// (bkz. customerDebts) odeme hedefsiz kaydedilirse "kalan odeme" dusmez.
// Borcu asan kisim hedefsiz (null) satir olarak doner.

export interface OpenDebt {
  target: string // 'appt:<id>' | 'pkg:<id>'
  date: string // siralama icin: randevu zamani / paketin acildigi zaman
  remaining: number
}

export interface Allocation {
  target: string | null
  amount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function allocatePayment(amount: number, debts: OpenDebt[]): Allocation[] {
  const out: Allocation[] = []
  let left = round2(amount)
  for (const d of [...debts].filter((x) => x.remaining > 0).sort((a, b) => a.date.localeCompare(b.date))) {
    if (left <= 0) break
    const part = round2(Math.min(left, d.remaining))
    out.push({ target: d.target, amount: part })
    left = round2(left - part)
  }
  if (left > 0) out.push({ target: null, amount: left })
  return out
}
