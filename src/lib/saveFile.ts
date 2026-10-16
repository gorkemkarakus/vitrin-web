import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// Ikili bir dosyayi (xlsx vb.) kaydeder: native'de cache'e yazip paylas
// sayfasini acar (bkz. pdf/savePdf.ts), tarayicida normal indirme yapar.
export async function saveAndShareFile(bytes: Uint8Array, filename: string, mime: string, dialogTitle: string) {
  if (Capacitor.isNativePlatform()) {
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    const path = `disari-aktarim/${filename}`
    await Filesystem.writeFile({ path, data: btoa(binary), directory: Directory.Cache, recursive: true })
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
    await Share.share({ title: dialogTitle, dialogTitle, files: [uri] })
    return
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
