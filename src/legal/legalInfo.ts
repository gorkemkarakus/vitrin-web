// Yasal metinlerde gecen sirket bilgileri — TEK YER. Koseli parantezli
// degerler yer tutucudur; yayin oncesi doldurulmali (npm run check:release
// bunlari yakalar, bkz. RELEASE_CHECKLIST.md).
export const LEGAL_INFO = {
  brand: 'Adapptiv',
  companyName: '[Şirket unvanı]',
  address: '[Şirket adresi]',
  mersisNo: '[MERSİS numarası]',
  contactEmail: '[iletişim e-posta adresi]',
  kepAddress: '[KEP adresi]',
  // Yasal metinlerin herkese acik adresi (magaza konsollarina bu girilir).
  webBaseUrl: '[https://alan-adi]',
  lastUpdated: '17 Ekim 2026',
} as const

export const PLACEHOLDER_RE = /\[[^\]]+\]/
