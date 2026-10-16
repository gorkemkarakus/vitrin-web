const sharp = require('sharp')
const path = require('path')

// Kaynak: src/assets/brand/logo-mark.png (yaziyi olmayan, seffaf zeminli
// marka ikonu). Buradan @capacitor/assets'in bekledigi 5 dosya uretilir;
// ardindan: npx @capacitor/assets generate (README > Ikonlar).
const MARK = path.join(__dirname, '..', 'src', 'assets', 'brand', 'logo-mark.png')

async function run() {
  const dir = __dirname
  const mark = () => sharp(MARK)

  // icon.png: legacy/iOS ikonu icin duz beyaz zeminde, buyukce
  const markLegacy = await mark().resize({ width: 760, height: 760, fit: 'inside' }).toBuffer()
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ffffff' } })
    .composite([{ input: markLegacy, gravity: 'center' }])
    .flatten({ background: '#ffffff' })
    .png()
    .toFile(path.join(dir, 'icon.png'))
  console.log('icon.png yazildi')

  // icon-foreground.png: Android adaptive-icon guvenli alani icin kucultulmus, SEFFAF
  const markForeground = await mark().resize({ width: 620, height: 620, fit: 'inside' }).toBuffer()
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: markForeground, gravity: 'center' }])
    .png()
    .toFile(path.join(dir, 'icon-foreground.png'))
  console.log('icon-foreground.png yazildi')

  // icon-background.png: duz beyaz zemin
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ffffff' } })
    .png()
    .toFile(path.join(dir, 'icon-background.png'))
  console.log('icon-background.png yazildi')

  // splash.png / splash-dark.png: uygulamanin acik-tema arka plan tonu (#f4f1ea)
  // uzerinde ortalanmis marka (splash ekraninda ayri bir koyu-tema tasarimi yok,
  // ayni goruntu kullaniliyor — capacitor.config.ts'teki SplashScreen ayarlariyla tutarli)
  const markSplash = await mark().resize({ width: 760, height: 760, fit: 'inside' }).toBuffer()
  for (const name of ['splash.png', 'splash-dark.png']) {
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#f4f1ea' } })
      .composite([{ input: markSplash, gravity: 'center' }])
      .flatten({ background: '#f4f1ea' })
      .png()
      .toFile(path.join(dir, name))
  }
  console.log('splash.png / splash-dark.png yazildi')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
