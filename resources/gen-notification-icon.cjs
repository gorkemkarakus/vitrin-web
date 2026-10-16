const sharp = require('sharp')
const path = require('path')

// Android bildirim kucuk ikonu: seffaf zemin uzerinde TEK RENK (beyaz) siluet
// olmali — renkli uygulama ikonu verilirse Android onu duz bir kare olarak
// gosterir. logo-mark.png'nin seffaflik kanalindan beyaz "A + nokta" uretilir.
// Calistir: node resources/gen-notification-icon.cjs
const MARK = path.join(__dirname, '..', 'src', 'assets', 'brand', 'logo-mark.png')
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res')
const SIZES = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 }

async function run() {
  // Seffaflik maskesi (yumusak kenarlar korunur)
  const alpha = await sharp(MARK).ensureAlpha().extractChannel('alpha').toBuffer()
  const meta = await sharp(MARK).metadata()
  const white = await sharp({
    create: { width: meta.width, height: meta.height, channels: 3, background: '#ffffff' },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer()
  // Dosyadaki seffaf kenar boslugunu kirp — yoksa ikon kutuda kucuk kalir.
  // (trim() renge bakar, burada her yer beyaz; sinir saydamliktan bulunur.)
  const { data: a, info } = await sharp(alpha).raw().toBuffer({ resolveWithObject: true })
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (a[y * info.width + x] > 24) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  const trimmed = await sharp(white)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png()
    .toBuffer()

  for (const [density, size] of Object.entries(SIZES)) {
    // Android onerisi: 24dp alanda ~2dp bosluk
    const inner = Math.round(size * (20 / 24))
    const mark = await sharp(trimmed).resize({ width: inner, height: inner, fit: 'inside' }).toBuffer()
    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: mark, gravity: 'center' }])
      .png()
      .toFile(path.join(RES, `drawable-${density}`, 'ic_stat_adapptiv.png'))
    console.log(`drawable-${density}/ic_stat_adapptiv.png (${size}px)`)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
