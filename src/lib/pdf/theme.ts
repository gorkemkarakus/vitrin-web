// theme.css'teki CSS degiskenlerinin PDF icin duz RGB karsiliklari —
// jsPDF CSS custom property okuyamadigi icin sabitler burada tekrarlaniyor.
// (H2 · Lacivert Blok: lacivert #13284F, turuncu vurgu #FF6A13.)
type Rgb = [number, number, number]

export const pdfColors = {
  signal: [19, 40, 79] as Rgb, // --signal (lacivert)
  signal2: [255, 106, 19] as Rgb, // --accent (turuncu vurgu)
  navy2: [30, 53, 97] as Rgb, // --navy-2
  navyDim: [168, 180, 202] as Rgb, // --navy-dim
  tint: [231, 236, 245] as Rgb, // --tint
  text: [17, 24, 39] as Rgb, // --text
  textDim: [91, 99, 115] as Rgb, // --text-dim
  line: [231, 233, 238] as Rgb, // --line
  panel2: [245, 246, 248] as Rgb, // --bg
  ok: [11, 122, 75] as Rgb, // --ok-text
  okBg: [227, 244, 236] as Rgb, // --ok-bg
  danger: [180, 35, 24] as Rgb, // --danger-text
  dangerBg: [254, 228, 226] as Rgb, // --danger-bg
  warn: [180, 71, 10] as Rgb, // --warn-text
  warnBg: [255, 244, 236] as Rgb, // --warn-bg
  white: [255, 255, 255] as Rgb,
}

export const pdfLayout = {
  pageWidth: 210,
  pageHeight: 297,
  marginX: 14,
  marginTop: 16,
  marginBottom: 18,
}
