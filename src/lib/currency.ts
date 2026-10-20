// Kuruslu bicim: PDF/rapor gibi her zaman iki hane gereken yerler icin.
export const currencyExact = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })
export const currencyWhole = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0,
})

// Tam tutarda kurus yazilmaz (₺71.221), kuruslu tutarda yazilir (₺71.221,50):
// ekran ",00" kalabaligindan kurtulur, hassasiyet kaybolmaz.
export const currencySmart = {
  format(value: number) {
    const cents = Math.round(value * 100)
    return (cents % 100 === 0 ? currencyWhole : currencyExact).format(value)
  },
}

// Uygulamadaki varsayilan para bicimi.
export const currency = currencySmart
