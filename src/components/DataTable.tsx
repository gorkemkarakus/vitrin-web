import type { ReactNode } from 'react'
import styles from './DataTable.module.css'

export interface Column<T> {
  key: string
  label: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
  // Verilirse baslik tiklanabilir; siralama ust bilesende yapilir.
  sortKey?: string
  width?: string
}

export interface TableSort {
  key: string
  dir: 'asc' | 'desc'
}

// Genis ekran listeleri icin sade tablo. Satir tiklaninca onRowClick; klavye
// ile de acilabilsin diye satir odaklanabilir ve Enter dinlenir.
export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  sort,
  onSort,
  ariaLabel,
  rowLabel,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  sort?: TableSort
  onSort?: (key: string) => void
  ariaLabel: string
  rowLabel?: (row: T) => string
}) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table} aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort && c.sortKey && sort.key === c.sortKey
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={c.align === 'right' ? styles.right : undefined}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sortKey && onSort ? (
                    <button
                      type="button"
                      className={active ? `${styles.sortBtn} ${styles.sortActive}` : styles.sortBtn}
                      onClick={() => onSort(c.sortKey!)}
                    >
                      {c.label}
                      <span className={styles.arrow} aria-hidden="true">
                        {active ? (sort!.dir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={onRowClick ? styles.clickable : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter') onRowClick(r)
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={rowLabel?.(r)}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? styles.right : undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
