import { useMemo, useState } from 'react'

import type { VendorTea } from './data'

type SortKey = 'name' | 'shop' | 'country' | 'teaType' | 'format' | 'ingredients'

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: 'name', label: 'Tea', className: 'w-[24%]' },
  { key: 'shop', label: 'Shop', className: 'w-[12%]' },
  { key: 'country', label: 'Country', className: 'w-[10%]' },
  { key: 'teaType', label: 'Type', className: 'w-[8%]' },
  { key: 'format', label: 'Format', className: 'w-[8%]' },
  { key: 'ingredients', label: 'Ingredients', className: 'w-[38%]' },
]

/**
 * Every tea at once — no paging, which is the point of this table rather than an oversight.
 * 1,641 rows of plain text render in one frame, and being able to scan the whole set is
 * what makes the shape of the data visible.
 */
export function TeaTable({ rows }: { rows: VendorTea[] }) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: 'name',
    descending: false,
  })

  const sorted = useMemo(() => {
    const direction = sort.descending ? -1 : 1
    return [...rows].sort((a, b) => {
      if (sort.key === 'ingredients') {
        return (a.ingredients.length - b.ingredients.length) * direction
      }
      return a[sort.key].localeCompare(b[sort.key]) * direction
    })
  }, [rows, sort])

  function toggle(key: SortKey) {
    setSort((prev) => ({ key, descending: prev.key === key ? !prev.descending : false }))
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-neutral-700">
            {COLUMNS.map((column) => (
              <th key={column.key} scope="col" className={`${column.className} p-0`}>
                <button
                  type="button"
                  onClick={() => toggle(column.key)}
                  aria-sort={
                    sort.key === column.key
                      ? sort.descending
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                  }
                  className="w-full px-2 py-2 text-left text-[0.7rem] font-semibold tracking-wide text-neutral-300 uppercase hover:text-brand-300"
                >
                  {column.label}
                  {sort.key === column.key ? (sort.descending ? ' ↓' : ' ↑') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((tea) => (
            <tr key={`${tea.shop}-${tea.name}`} className="border-b border-neutral-800 align-top">
              <td className="px-2 py-1.5">
                <a
                  href={tea.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brand-300 hover:underline"
                >
                  {tea.name}
                </a>
              </td>
              <td className="px-2 py-1.5 text-neutral-400">{tea.shop}</td>
              <td className="px-2 py-1.5 text-neutral-400">{tea.country}</td>
              <td className="px-2 py-1.5 text-neutral-400">{tea.teaType || '—'}</td>
              <td className="px-2 py-1.5 text-neutral-400">
                {tea.format || <span title="the shop does not say">—</span>}
              </td>
              <td className="px-2 py-1.5 text-neutral-400">
                {tea.ingredients.join(', ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="px-2 py-6 text-center text-sm text-neutral-400">
          No teas match those filters.
        </p>
      )}
    </div>
  )
}
