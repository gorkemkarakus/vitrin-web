// Supabase (PostgREST) tek istekte en fazla 1000 satir dondurur ve fazlasini
// sessizce keser. Tum kayitlari gereken sorgular bu yardimciyla 1000'erlik
// sayfalar halinde cekilir.
//
// `build` her cagrida YENI bir sorgu dondurmeli (builder tekrar
// kullanilamaz) ve sayfalarin kaymamasi icin sorgu sabit bir siralamaya
// sahip olmali — siralama verilmediyse en azindan `.order('id')` eklenmeli.
const PAGE_SIZE = 1000

interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

export async function fetchAll<T>(
  build: () => RangeQuery<T>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1)
    if (error) return { data: rows, error }
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
