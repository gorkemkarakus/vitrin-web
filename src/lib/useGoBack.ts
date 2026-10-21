import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// Geri: uygulama icinde gelinen ekrana doner (Ana sayfa -> Giderler -> geri =
// Ana sayfa). Sayfa dogrudan acildiysa (bildirim, link, yenileme) gecmiste
// onceki ekran yoktur; o zaman sayfanin ust ekranina gider.
export function useGoBack() {
  const navigate = useNavigate()
  return useCallback(
    (fallback: string) => {
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
      if (idx > 0) navigate(-1)
      else navigate(fallback, { replace: true })
    },
    [navigate],
  )
}
