const sharp = require('sharp')
const path = require('path')

async function run() {
  const dir = __dirname

  await sharp(path.join(dir, 'icon-source.svg')).resize(1024, 1024).png().toFile(path.join(dir, 'icon.png'))
  console.log('icon.png yazildi')

  // Android adaptive icon foreground: mark ortada, guvenli alan icin daha kucuk
  await sharp(Buffer.from(`
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <rect x="362" y="362" width="300" height="300" rx="66" fill="#f4f1ea"/>
    </svg>
  `))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(dir, 'icon-foreground.png'))
  console.log('icon-foreground.png yazildi')

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: '#3d4632' },
  })
    .png()
    .toFile(path.join(dir, 'icon-background.png'))
  console.log('icon-background.png yazildi')

  await sharp(path.join(dir, 'splash-source.svg'))
    .resize(2732, 2732)
    .png()
    .toFile(path.join(dir, 'splash.png'))
  console.log('splash.png yazildi')

  await sharp(path.join(dir, 'splash-source.svg'))
    .resize(2732, 2732)
    .png()
    .toFile(path.join(dir, 'splash-dark.png'))
  console.log('splash-dark.png yazildi')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
