import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { jsPDF } from 'jspdf'

// Native (Android/iOS) tarafta jsPDF'in kendi save() metodu (bir <a download>
// tikini simule eder) WebView icinde guvenilir calismiyor — bunun yerine PDF'i
// uygulamanin cache dizinine yazip native paylas sayfasini aciyoruz, kullanici
// oradan "Kaydet"/WhatsApp/Drive vb. secebiliyor. Web'de (tarayicida test
// ederken) normal tarayici indirmesine geri duser.
export async function saveAndSharePdf(doc: jsPDF, filename: string, dialogTitle: string) {
  if (Capacitor.isNativePlatform()) {
    const dataUri = doc.output('datauristring')
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1)
    const path = `raporlar/${filename}`
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Cache, recursive: true })
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
    await Share.share({ title: dialogTitle, dialogTitle, files: [uri] })
  } else {
    doc.save(filename)
  }
}
