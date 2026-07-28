import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void },
      ) => string
      reset: (widgetId?: string) => void
    }
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

// Site key henuz tanimlanmadiysa (Cloudflare hesabi kurulana kadar) widget
// hic render edilmez, ust bilesen bos bir token ile devam eder — backend'deki
// verifyTurnstile() de ayni sekilde secret tanimli degilse dogrulamayi atlar.
export default function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return

    function renderWidget() {
      if (window.turnstile && containerRef.current) {
        window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY!,
          callback: onToken,
          'expired-callback': () => onToken(''),
        })
      }
    }

    if (window.turnstile) {
      renderWidget()
      return
    }

    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', renderWidget)
      return () => existing.removeEventListener('load', renderWidget)
    }

    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.addEventListener('load', renderWidget)
    document.head.appendChild(script)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!SITE_KEY) return null
  return <div ref={containerRef} />
}
