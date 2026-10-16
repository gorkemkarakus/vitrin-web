// employee_time_blocks.label degerleri.
//
// Resmi tatiller ayri bir tabloda degil, her aktif calisan icin ayni tarih ve
// bu etiketle employee_time_blocks satiri olarak tutulur: musaitlik hesaplayan
// tum edge function'lar zaten calisan bazli bloklari okudugu icin tatiller
// ek degisiklik olmadan dikkate alinir. Etiket, tatilleri kisisel izinlerden
// ayirmak icin kullanilir; liste bu etikete gore okundugundan degismemeli.
export const HOLIDAY_LABEL = 'Resmi Tatil'
export const BREAK_LABEL = 'Öğle molası'
