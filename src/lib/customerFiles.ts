import { supabase } from './supabase'

// Musteri dosyalari (bkz. migration 20261018000006_customer_files.sql): ozel
// depolama alani "customer-files", yol "<isletme>/<musteri>/<rastgele>.<uzanti>".
// Goruntuleme gecici imzali baglantiyla (1 saat).

const BUCKET = 'customer-files'
const MAX_BYTES = 10 * 1024 * 1024
const MAX_SIDE = 2000

export type FileKind = 'oncesi' | 'sonrasi' | 'onam' | 'belge' | 'diger'

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  oncesi: 'Öncesi',
  sonrasi: 'Sonrası',
  onam: 'Onam formu',
  belge: 'Belge',
  diger: 'Diğer',
}

export interface CustomerFile {
  id: string
  path: string
  file_name: string
  mime: string
  size_bytes: number
  kind: FileKind
  note: string | null
  uploaded_by: string | null
  created_at: string
  url?: string
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

// Buyuk fotograflar yuklenmeden once kucultulur (depolama kotasi + hiz).
// HEIC tarayicida cizilemedigi icin oldugu gibi gider.
async function shrinkImage(file: File): Promise<{ blob: Blob; mime: string; ext: string }> {
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
  if (!file.type.startsWith('image/') || file.type === 'image/heic') return { blob: file, mime: file.type, ext }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return { blob: file, mime: file.type, ext }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    return blob ? { blob, mime: 'image/jpeg', ext: 'jpg' } : { blob: file, mime: file.type, ext }
  } catch {
    return { blob: file, mime: file.type, ext }
  }
}

export async function uploadCustomerFile(
  businessId: string,
  customerId: string,
  file: File,
  kind: FileKind,
): Promise<string | null> {
  if (!ACCEPTED.includes(file.type)) return 'Yalnızca fotoğraf (JPG, PNG, WEBP, HEIC) ve PDF yüklenebilir.'
  const { blob, mime, ext } = await shrinkImage(file)
  if (blob.size > MAX_BYTES) return 'Dosya 10 MB’tan büyük.'
  const path = `${businessId}/${customerId}/${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false })
  if (upErr) return 'Dosya yüklenemedi, lütfen tekrar deneyin.'
  const { data: auth } = await supabase.auth.getUser()
  const { error: rowErr } = await supabase.from('customer_files').insert({
    business_id: businessId,
    customer_id: customerId,
    path,
    file_name: file.name.slice(0, 200) || `dosya.${ext}`,
    mime,
    size_bytes: blob.size,
    kind,
    uploaded_by: auth.user?.id,
  })
  if (rowErr) {
    await supabase.storage.from(BUCKET).remove([path])
    return 'Dosya kaydedilemedi, lütfen tekrar deneyin.'
  }
  return null
}

export async function listCustomerFiles(customerId: string): Promise<CustomerFile[]> {
  const { data, error } = await supabase
    .from('customer_files')
    .select('id, path, file_name, mime, size_bytes, kind, note, uploaded_by, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const files = (data ?? []) as CustomerFile[]
  if (files.length === 0) return files
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(
    files.map((f) => f.path),
    3600,
  )
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
  return files.map((f) => ({ ...f, url: urlOf.get(f.path) ?? undefined }))
}

export async function deleteCustomerFile(file: Pick<CustomerFile, 'id' | 'path'>): Promise<string | null> {
  const { error: stErr } = await supabase.storage.from(BUCKET).remove([file.path])
  if (stErr) return 'Dosya silinemedi.'
  const { error } = await supabase.from('customer_files').delete().eq('id', file.id)
  return error ? 'Dosya kaydı silinemedi.' : null
}

// KVKK "kisisel verilerini sil": depolamadaki tum dosyalar (kayitlari
// anonymize_customer siler).
export async function removeAllCustomerFiles(customerId: string): Promise<boolean> {
  const { data } = await supabase.from('customer_files').select('path').eq('customer_id', customerId)
  const paths = (data ?? []).map((r) => r.path as string)
  if (paths.length === 0) return true
  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  return !error
}
