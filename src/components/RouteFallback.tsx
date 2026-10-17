// Tembel yuklenen sayfa gelene kadar: yer kaplamayan, yaklasik 150 ms'den
// kisa yuklemelerde hic gorunmeyen sade bir gosterge.
export default function RouteFallback() {
  return (
    <div
      role="status"
      aria-label="Yükleniyor"
      style={{
        padding: 24,
        textAlign: 'center',
        color: 'var(--text-faint)',
        fontSize: 13,
        animation: 'routeFallbackIn 0.2s 0.15s both',
      }}
    >
      Yükleniyor…
    </div>
  )
}
