import { ArrowDownAZ, ArrowUpAZ, LayoutGrid, List } from 'lucide-react'
import { CATEGORY_LABELS, type FileCategory } from '@/lib/fileTypes'
import type { SortField, SortState } from '@/services/documents'
import type { ViewMode } from '@/hooks/useViewMode'
import { cn } from '@/lib/cn'

const selectCls = 'h-10 rounded-lg border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25'

interface Props {
  sort: SortState
  onSort: (s: SortState) => void
  fileType: FileCategory | null
  onFileType: (t: FileCategory | null) => void
  view: ViewMode
  onView: (v: ViewMode) => void
  /** Search results are ranked by recency, so sorting is hidden there. */
  hideSort?: boolean
  hideFilter?: boolean
}

export function ExplorerToolbar({ sort, onSort, fileType, onFileType, view, onView, hideSort, hideFilter }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {!hideSort && <><label className="flex items-center gap-2 text-sm text-muted">
        <span className="sr-only sm:not-sr-only">Sort</span>
        <select aria-label="Sort by" value={sort.field} onChange={(e) => onSort({ ...sort, field: e.target.value as SortField })} className={selectCls}>
          <option value="date">Date modified</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
          <option value="type">Type</option>
        </select>
      </label>
      <button
        onClick={() => onSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
        aria-label={sort.dir === 'asc' ? 'Ascending. Switch to descending' : 'Descending. Switch to ascending'}
        className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-fg"
      >
        {sort.dir === 'asc' ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
      </button></>}
      {!hideFilter && <select aria-label="Filter by type" value={fileType ?? ''} onChange={(e) => onFileType((e.target.value || null) as FileCategory | null)} className={selectCls}>
        <option value="">All types</option>
        {(Object.keys(CATEGORY_LABELS) as FileCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
      </select>}
      <div role="group" aria-label="View" className="ml-auto inline-flex rounded-lg border border-line bg-surface p-0.5">
        {([['list', List, 'List view'], ['grid', LayoutGrid, 'Grid view']] as const).map(([v, Icon, label]) => (
          <button key={v} onClick={() => onView(v)} aria-label={label} aria-pressed={view === v}
            className={cn('grid h-9 w-9 place-items-center rounded-md', view === v ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg')}>
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  )
}
