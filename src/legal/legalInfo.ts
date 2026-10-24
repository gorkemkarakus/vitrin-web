// Yasal metinlerde gecen sirket bilgileri — TEK YER. Koseli parantezli
// degerler yer tutucudur; yayin oncesi doldurulmali (npm run check:release
// bunlari yakalar, bkz. RELEASE_CHECKLIST.md).
export const LEGAL_INFO = {
  brand: 'Adapptiv',
  companyName: 'Sis İnternet ve Yazılım Hizmetleri San. Tic. Ltd. Şti.',
  address: 'Derecik Mah. 747. Sok. No: 2/3, İlkadım / Samsun',
  mersisNo: '[MERSİS numarası]',
  contactEmail: 'info@adapptivdigital.com',
  kepAddress: '[KEP adresi]',
  // Yasal metinlerin herkese acik adresi (magaza konsollarina bu girilir).
  webBaseUrl: 'https://isletme.adapptivdigital.com',
  // Tanitim sitesindeki veri silme sayfasi (Randevu reposu: /veri-silme, EN: /data-deletion).
  deletionPath: '/veri-silme',
  lastUpdated: '24 Ekim 2026',
} as const

export const PLACEHOLDER_RE = /\[[^\]]+\]/
