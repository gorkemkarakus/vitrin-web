import logoFull from '../../assets/brand/logo-full.png'
import { PdfReport, loadImageDataUrl } from './pdfDoc'
import { saveAndSharePdf } from './savePdf'
import { currency } from '../currency'
import { METHOD_LABEL, longDate, type CashClosure, type DaySummary } from '../cashClosure'

// Gun sonu kasa raporu: Adapptiv logosu + isletme adi, lacivert ozet karti,
// yonteme gore tahsilat, kasa sayimi, randevu ozeti, tahsilat ve gider
// listeleri, not ve imza alanlari.
export async function generateCashClosurePdf(opts: {
  businessName: string
  summary: DaySummary
  closure: CashClosure
  closedByName: string
}) {
  const { businessName, summary: s, closure: c, closedByName } = opts
  const report = new PdfReport('Gün sonu kasa raporu', businessName)
  const logo = await loadImageDataUrl(logoFull)
  report.addBrandHeader(logo, 'Gün sonu kasa raporu', longDate(s.date))

  const diff = Number(c.difference)
  const badge =
    Math.abs(diff) < 0.5
      ? { text: 'Kasa tutuyor', tone: 'ok' as const }
      : diff < 0
        ? { text: `${currency.format(Math.abs(diff))} eksik`, tone: 'danger' as const }
        : { text: `${currency.format(diff)} fazla`, tone: 'warn' as const }
  const avg = s.completed > 0 ? s.total / s.completed : 0
  report.addHeroCard({
    label: 'Günün tahsilatı',
    value: currency.format(s.total),
    sub: `${s.payments.length} ödeme · ${s.completed} tamamlanan randevu`,
    side: [
      { label: 'Sayılan nakit', value: currency.format(Number(c.counted_cash)) },
      { label: 'Gider', value: currency.format(s.expenseTotal) },
      { label: 'Ortalama sepet', value: avg > 0 ? currency.format(avg) : '—' },
    ],
    badge,
  })

  report.addSectionTitle('Ödeme yöntemine göre')
  const methods = (['nakit', 'kart', 'havale', 'diger', 'bakiye'] as const).filter((m) => s.byMethod[m] > 0 || m === 'nakit' || m === 'kart')
  report.addKpiGrid(methods.map((m) => ({ label: METHOD_LABEL[m], value: currency.format(s.byMethod[m]) })))

  report.addSectionTitle('Kasa sayımı')
  report.addWaterfall([
    { label: 'Açılış kasası', value: currency.format(Number(c.opening_cash)) },
    { label: '+ Nakit tahsilat', value: currency.format(s.byMethod.nakit) },
    { label: '- Nakitle ödenen gider', value: currency.format(s.cashExpense), negative: s.cashExpense > 0 },
    { label: 'Olması gereken nakit', value: currency.format(Number(c.expected_cash)), strong: true },
    { label: 'Sayılan nakit', value: currency.format(Number(c.counted_cash)) },
    {
      label: Math.abs(diff) < 0.5 ? 'Fark' : diff < 0 ? 'Fark (eksik)' : 'Fark (fazla)',
      value: `${diff > 0 ? '+' : ''}${currency.format(diff)}`,
      strong: true,
      negative: diff < -0.5,
    },
  ])

  report.addSectionTitle('Randevular')
  report.addKpiGrid([
    { label: 'Tamamlanan', value: String(s.completed) },
    { label: 'İptal', value: String(s.cancelled) },
    { label: 'Gelmedi', value: String(s.noShow) },
    { label: 'Ödemesi kalan', value: s.unpaidCount > 0 ? `${s.unpaidCount} · ${currency.format(s.unpaidAmount)}` : '0' },
  ])

  if (s.payments.length > 0) {
    report.addSectionTitle(`Tahsilatlar (${s.payments.length})`)
    report.addTable({
      head: ['Saat', 'Müşteri', 'Hizmet', 'Yöntem', 'Alan', 'Tutar'],
      body: s.payments.map((p) => [p.time, p.customer, p.service, p.method, p.by || '—', currency.format(p.amount)]),
      rightAlignFrom: 5,
    })
  }

  if (s.expenses.length > 0) {
    report.addSectionTitle(`Giderler (${s.expenses.length})`)
    report.addTable({
      head: ['Açıklama', 'Kategori', 'Ödeme şekli', 'Tutar'],
      body: s.expenses.map((e) => [e.description, e.category, e.method ? (METHOD_LABEL[e.method] ?? e.method) : '—', currency.format(e.amount)]),
      rightAlignFrom: 3,
    })
  }

  if (c.note) report.addNoteBox('Not', c.note)

  const closedAt = new Date(c.updated_at || c.created_at).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
  report.addSubText(`Kapanış: ${closedAt}${closedByName ? ` · ${closedByName}` : ''}`)
  report.addSignatures([{ label: 'Kapatan', name: closedByName }, { label: 'Kontrol eden' }])

  report.finalizeFooters()
  await saveAndSharePdf(report.doc, `gun-sonu-${s.date}.pdf`, 'Gün sonu kasa raporu')
}
