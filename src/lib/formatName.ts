function capitalizeWord(word: string): string {
  if (!word) return word
  const first = word.slice(0, 1).toLocaleUpperCase('tr-TR')
  const rest = word.slice(1).toLocaleLowerCase('tr-TR')
  return first + rest
}

export function formatPersonName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => word.split('-').map(capitalizeWord).join('-'))
    .join(' ')
}

// Avatar icin bas harfler ("Ayse Demir" -> "AD")
export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toLocaleUpperCase('tr') ?? '')
      .join('') || '?'
  )
}

export function firstName(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] || '—'
}
