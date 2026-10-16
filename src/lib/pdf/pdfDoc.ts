import { jsPDF } from 'jspdf'
import autoTable, { type RowInput } from 'jspdf-autotable'
import { registerPdfFonts } from './registerFonts'
import { pdfColors, pdfLayout } from './theme'

export interface PdfKpiItem {
  label: string
  value: string
}

export interface PdfTableOptions {
  head: string[]
  body: RowInput[]
  rightAlignFrom?: number
}

const { marginX, marginTop, marginBottom, pageWidth, pageHeight } = pdfLayout

export class PdfReport {
  doc: jsPDF
  cursorY: number
  private reportTitle: string
  private businessName: string

  constructor(reportTitle: string, businessName: string) {
    this.reportTitle = reportTitle
    this.businessName = businessName
    this.doc = new jsPDF({ unit: 'mm', format: 'a4' })
    registerPdfFonts(this.doc)
    this.doc.setProperties({ title: reportTitle })
    this.cursorY = marginTop
  }

  private get contentWidth() {
    return pageWidth - marginX * 2
  }

  ensureSpace(height: number) {
    if (this.cursorY + height > pageHeight - marginBottom) {
      this.doc.addPage()
      this.cursorY = marginTop
    }
  }

  addCoverHeader(periodLabel: string, generatedLabel: string) {
    const doc = this.doc
    doc.setFillColor(...pdfColors.signal)
    doc.rect(0, 0, pageWidth, 3.5, 'F')

    doc.setFont('Inter', 'bold')
    doc.setFontSize(19)
    doc.setTextColor(...pdfColors.text)
    doc.text(this.reportTitle, marginX, 21)

    doc.setFont('Inter', 'semibold')
    doc.setFontSize(11)
    doc.setTextColor(...pdfColors.signal)
    doc.text(this.businessName, marginX, 28.5)

    doc.setFont('Inter', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...pdfColors.textDim)
    doc.text(periodLabel, marginX, 34.5)
    doc.text(generatedLabel, pageWidth - marginX, 34.5, { align: 'right' })

    doc.setDrawColor(...pdfColors.line)
    doc.setLineWidth(0.3)
    doc.line(marginX, 39, pageWidth - marginX, 39)

    this.cursorY = 47
  }

  addSectionTitle(text: string) {
    this.ensureSpace(13)
    const doc = this.doc
    doc.setFont('Inter', 'semibold')
    doc.setFontSize(12.5)
    doc.setTextColor(...pdfColors.text)
    doc.text(text, marginX, this.cursorY)
    this.cursorY += 2.6
    doc.setDrawColor(...pdfColors.signal2)
    doc.setLineWidth(0.7)
    doc.line(marginX, this.cursorY, marginX + 9, this.cursorY)
    this.cursorY += 6.5
  }

  addSubText(text: string) {
    this.ensureSpace(6)
    const doc = this.doc
    doc.setFont('Inter', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...pdfColors.textDim)
    doc.text(text, marginX, this.cursorY)
    this.cursorY += 6
  }

  addKpiGrid(items: PdfKpiItem[]) {
    const doc = this.doc
    const cols = Math.min(4, items.length)
    const gap = 4
    const cardW = (this.contentWidth - gap * (cols - 1)) / cols
    const cardH = 20
    const rows = Math.ceil(items.length / cols)
    this.ensureSpace(rows * (cardH + gap))
    items.forEach((item, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = marginX + col * (cardW + gap)
      const y = this.cursorY + row * (cardH + gap)
      doc.setFillColor(...pdfColors.panel2)
      doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F')
      doc.setFont('Inter', 'normal')
      doc.setFontSize(7.8)
      doc.setTextColor(...pdfColors.textDim)
      doc.text(item.label, x + 3.5, y + 7.2)
      doc.setFont('Inter', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(...pdfColors.text)
      doc.text(item.value, x + 3.5, y + 15.5)
    })
    this.cursorY += rows * (cardH + gap) + 3
  }

  addTable({ head, body, rightAlignFrom }: PdfTableOptions) {
    const columnStyles: Record<number, { halign: 'right' }> = {}
    if (rightAlignFrom !== undefined) {
      for (let i = rightAlignFrom; i < head.length; i++) columnStyles[i] = { halign: 'right' }
    }
    autoTable(this.doc, {
      startY: this.cursorY,
      margin: { left: marginX, right: marginX, bottom: marginBottom },
      head: [head],
      body,
      styles: {
        font: 'Inter',
        fontSize: 8.7,
        textColor: pdfColors.text,
        lineColor: pdfColors.line,
        lineWidth: 0.15,
        cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      },
      headStyles: {
        font: 'Inter',
        fontStyle: 'bold',
        fillColor: pdfColors.signal,
        textColor: pdfColors.white,
        fontSize: 8.3,
      },
      alternateRowStyles: { fillColor: pdfColors.panel2 },
      columnStyles,
      theme: 'grid',
    })
    const lastTable = (this.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
    this.cursorY = (lastTable?.finalY ?? this.cursorY) + 8
  }

  addWaterfall(rows: { label: string; value: string; strong?: boolean; negative?: boolean }[]) {
    this.ensureSpace(rows.length * 6.4 + 4)
    const doc = this.doc
    for (const r of rows) {
      doc.setFont('Inter', r.strong ? 'bold' : 'normal')
      doc.setFontSize(r.strong ? 10 : 9)
      doc.setTextColor(...(r.negative ? pdfColors.danger : pdfColors.text))
      doc.text(r.label, marginX, this.cursorY)
      doc.text(r.value, pageWidth - marginX, this.cursorY, { align: 'right' })
      this.cursorY += r.strong ? 7.2 : 6.2
      if (r.strong) {
        doc.setDrawColor(...pdfColors.line)
        doc.setLineWidth(0.25)
        doc.line(marginX, this.cursorY - 5.6, pageWidth - marginX, this.cursorY - 5.6)
      }
    }
    this.cursorY += 3
  }

  // Markali ust bilgi: solda Adapptiv logosu, sagda rapor turu, isletme adi
  // ve tarih; altinda turuncu + gri cizgi.
  addBrandHeader(logoDataUrl: string | null, reportLabel: string, dateLabel: string) {
    const doc = this.doc
    doc.setFillColor(...pdfColors.signal)
    doc.rect(0, 0, pageWidth, 2.2, 'F')
    if (logoDataUrl) {
      // logo-full.png 900x271 → 38 x 11.4 mm
      doc.addImage(logoDataUrl, 'PNG', marginX, 11, 38, 11.4)
    } else {
      doc.setFont('Inter', 'bold')
      doc.setFontSize(18)
      doc.setTextColor(...pdfColors.signal)
      doc.text('adapptiv', marginX, 20)
    }
    const right = pageWidth - marginX
    doc.setFont('Inter', 'semibold')
    doc.setFontSize(7.8)
    doc.setTextColor(...pdfColors.signal2)
    doc.text(reportLabel.toLocaleUpperCase('tr'), right, 12.5, { align: 'right', charSpace: 0.4 })
    doc.setFont('Inter', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...pdfColors.signal)
    doc.text(this.businessName, right, 19.5, { align: 'right' })
    doc.setFont('Inter', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...pdfColors.textDim)
    doc.text(dateLabel, right, 25, { align: 'right' })
    doc.setDrawColor(...pdfColors.signal2)
    doc.setLineWidth(0.6)
    doc.line(marginX, 30.5, marginX + 18, 30.5)
    doc.setDrawColor(...pdfColors.line)
    doc.setLineWidth(0.25)
    doc.line(marginX + 18, 30.5, right, 30.5)
    this.cursorY = 39
  }

  // Lacivert ozet karti: solda buyuk deger, sagda kucuk satirlar, istege
  // bagli durum rozeti (yesil / turuncu / kirmizi).
  addHeroCard(opts: {
    label: string
    value: string
    sub?: string
    side: { label: string; value: string }[]
    badge?: { text: string; tone: 'ok' | 'warn' | 'danger' }
  }) {
    const doc = this.doc
    const h = 36
    this.ensureSpace(h + 6)
    const x = marginX
    const y = this.cursorY
    const w = this.contentWidth
    doc.setFillColor(...pdfColors.signal)
    doc.roundedRect(x, y, w, h, 3.5, 3.5, 'F')
    doc.setFont('Inter', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...pdfColors.navyDim)
    doc.text(opts.label, x + 7, y + 10)
    doc.setFont('Inter', 'bold')
    doc.setFontSize(24)
    doc.setTextColor(...pdfColors.white)
    doc.text(opts.value, x + 7, y + 22)
    if (opts.sub) {
      doc.setFont('Inter', 'normal')
      doc.setFontSize(8.2)
      doc.setTextColor(...pdfColors.navyDim)
      doc.text(opts.sub, x + 7, y + 29.5)
    }
    const sx = x + w * 0.56
    doc.setDrawColor(...pdfColors.navy2)
    doc.setLineWidth(0.3)
    doc.line(sx - 5, y + 7, sx - 5, y + h - 7)
    opts.side.slice(0, 3).forEach((row, i) => {
      const ry = y + 11 + i * 8.5
      doc.setFont('Inter', 'normal')
      doc.setFontSize(8.2)
      doc.setTextColor(...pdfColors.navyDim)
      doc.text(row.label, sx, ry)
      doc.setFont('Inter', 'semibold')
      doc.setFontSize(9.5)
      doc.setTextColor(...pdfColors.white)
      doc.text(row.value, x + w - 7, ry, { align: 'right' })
    })
    if (opts.badge) {
      const fill =
        opts.badge.tone === 'ok' ? pdfColors.okBg : opts.badge.tone === 'warn' ? pdfColors.warnBg : pdfColors.dangerBg
      const ink =
        opts.badge.tone === 'ok' ? pdfColors.ok : opts.badge.tone === 'warn' ? pdfColors.warn : pdfColors.danger
      doc.setFont('Inter', 'bold')
      doc.setFontSize(8)
      const tw = doc.getTextWidth(opts.badge.text) + 7
      // Sol sutunun sag ust kosesi (etiketle ayni hizada) — sag satirlarla cakismaz.
      const bx = sx - 11 - tw
      const by = y + 5.8
      doc.setFillColor(...fill)
      doc.roundedRect(bx, by, tw, 6, 3, 3, 'F')
      doc.setTextColor(...ink)
      doc.text(opts.badge.text, bx + tw / 2, by + 4.1, { align: 'center' })
    }
    this.cursorY = y + h + 10
  }

  // Acik renk not kutusu.
  addNoteBox(title: string, text: string) {
    const doc = this.doc
    doc.setFont('Inter', 'normal')
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(text, this.contentWidth - 12) as string[]
    const h = 11 + lines.length * 4.6
    this.ensureSpace(h + 4)
    doc.setFillColor(...pdfColors.tint)
    doc.roundedRect(marginX, this.cursorY, this.contentWidth, h, 2.5, 2.5, 'F')
    doc.setFont('Inter', 'semibold')
    doc.setFontSize(8)
    doc.setTextColor(...pdfColors.signal)
    doc.text(title, marginX + 6, this.cursorY + 7)
    doc.setFont('Inter', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...pdfColors.text)
    doc.text(lines, marginX + 6, this.cursorY + 12.5)
    this.cursorY += h + 7
  }

  // Imza alanlari ("Kapatan", "Kontrol eden").
  addSignatures(items: { label: string; name?: string }[]) {
    const doc = this.doc
    this.ensureSpace(26)
    const gap = 10
    const w = (this.contentWidth - gap * (items.length - 1)) / items.length
    items.forEach((it, i) => {
      const x = marginX + i * (w + gap)
      const y = this.cursorY + 14
      doc.setDrawColor(...pdfColors.textDim)
      doc.setLineWidth(0.25)
      doc.line(x, y, x + w, y)
      doc.setFont('Inter', 'semibold')
      doc.setFontSize(8.5)
      doc.setTextColor(...pdfColors.text)
      doc.text(it.label, x, y + 5)
      if (it.name) {
        doc.setFont('Inter', 'normal')
        doc.setTextColor(...pdfColors.textDim)
        doc.text(it.name, x + w, y + 5, { align: 'right' })
      }
    })
    this.cursorY += 26
  }

  finalizeFooters() {
    const doc = this.doc
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      if (i > 1) {
        doc.setFont('Inter', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(...pdfColors.textDim)
        doc.text(`${this.reportTitle} — ${this.businessName}`, marginX, 10)
      }
      doc.setDrawColor(...pdfColors.line)
      doc.setLineWidth(0.2)
      doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12)
      doc.setFont('Inter', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...pdfColors.textDim)
      doc.text('Adapptiv ile oluşturuldu', marginX, pageHeight - 8)
      doc.text(`Sayfa ${i} / ${pageCount}`, pageWidth - marginX, pageHeight - 8, { align: 'right' })
    }
  }
}

// Uygulamanin paketindeki bir gorseli (or. logo) PDF'e gomulecek data URL'e
// cevirir. Basarisiz olursa null (rapor yazili logoyla devam eder).
export async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
