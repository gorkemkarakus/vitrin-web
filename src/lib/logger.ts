// Tanilama ciktisi yalnizca gelistirme derlemesinde yazilir; uretimde
// cihaz loglarina hicbir sey dusmez.
const enabled = import.meta.env.DEV

export const logger = {
  warn: (...args: unknown[]) => {
    if (enabled) console.warn(...args)
  },
  error: (...args: unknown[]) => {
    if (enabled) console.error(...args)
  },
}
