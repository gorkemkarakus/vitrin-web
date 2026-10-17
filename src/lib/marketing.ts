// Sunucudaki _shared/marketing.ts ile ayni: her kampanya mesajinin sonuna
// sunucu ekler; burada yalnizca onizlemede gostermek icin.
export const OPT_OUT_FOOTER = 'Kampanya mesajı almak istemiyorsanız RET yazın.'

export function withOptOutFooter(message: string): string {
  return message.includes(OPT_OUT_FOOTER) ? message : `${message.trimEnd()}\n\n${OPT_OUT_FOOTER}`
}

export const CONSENT_SOURCE_LABEL: Record<string, string> = {
  manual: 'salonda',
  online_booking: 'online randevuda',
  whatsapp: 'WhatsApp’ta',
  import: 'içe aktarımda',
}
