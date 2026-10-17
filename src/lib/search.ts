// Turkce arama: "İpek" -> "ipek" (JS'in varsayilan toLowerCase'i "i̇" yapar),
// ve klavyede Turkce harf yazmayan kullanici icin aksan duyarsiz:
// "sule" -> "Şule", "isik" -> "Işık", "cigdem" -> "Çiğdem".
export function normalizeForSearch(text: string): string {
  return text.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').trim()
}

// Bos sorgu her seyle eslesir.
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalizeForSearch(query)
  if (!q) return true
  return fields.some((f) => !!f && normalizeForSearch(f).includes(q))
}
