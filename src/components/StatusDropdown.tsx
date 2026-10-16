import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import styles from './StatusDropdown.module.css'

export interface StatusDropdownOption {
  value: string
  label: string
  color: string // nokta + kapalı haldeki yazı rengi (ör. 'var(--warn-text)')
  bg: string // kapalı haldeki zemin rengi (ör. 'var(--warn-bg)')
}

interface StatusDropdownProps {
  value: string
  options: StatusDropdownOption[]
  onChange: (value: string) => void
  urgent?: boolean
  // Tablo hücresi disinda (ör. randevu kartinin ayagi gibi dar/icerik-genisligi
  // alanlarda) kullanildiginda varsayilan width:100% yerine kucuk bir "hap"
  // gibi icerik genisliginde gorunur — statusBadge ile ayni olcude kalir.
  compact?: boolean
}

// Native <select>'in acilan listesi isletim sistemine aittir ve "hap"
// gorunumuyle uyumlu bicimlendirilemez; bu yuzden menu elle cizilir.
// Alt navigasyon barina yakin satirlarda liste barin arkasinda kalmasin diye
// acilmadan once asagidaki bos alan olculur, yetmiyorsa menu yukari acilir.
const MENU_ITEM_HEIGHT = 34
const MENU_PADDING = 12
const BOTTOM_NAV_RESERVE = 80

export default function StatusDropdown({ value, options, onChange, urgent, compact }: StatusDropdownProps) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]
  const closeMenu = useCallback(() => setOpen(false), [])

  function toggleOpen() {
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect()
      const menuHeight = options.length * MENU_ITEM_HEIGHT + MENU_PADDING
      const spaceBelow = window.innerHeight - rect.bottom - BOTTOM_NAV_RESERVE
      setOpenUpward(spaceBelow < menuHeight)
    }
    setOpen((v) => !v)
  }

  useDismiss(wrapRef, open, closeMenu)

  return (
    <div className={`${styles.wrap} ${compact ? styles.wrapCompact : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.trigger} ${compact ? styles.triggerCompact : ''} ${urgent ? styles.triggerUrgent : ''}`}
        style={{ color: current.color, background: current.bg }}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={styles.dot} style={{ background: current.color }} />
        {current.label}
        <svg className={styles.chevron} width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className={`${styles.menu} ${openUpward ? styles.menuUp : ''}`} role="listbox">
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`${styles.menuItem} ${o.value === value ? styles.menuItemActive : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              <span className={styles.dot} style={{ background: o.color }} />
              <span className={styles.menuItemLabel}>{o.label}</span>
              {o.value === value && (
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden="true">
                  <path
                    d="M1 5L4.5 8.5L11 1.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
