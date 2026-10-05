import { useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, RotateCcw, X } from 'lucide-react'
import { useUploadQueue, type UploadItem } from '@/hooks/useUploadQueue'
import { FileTypeIcon } from '@/components/documents/FileTypeIcon'
import { categoryFor } from '@/lib/fileTypes'
import { formatBytes } from '@/utils/format'
import { cn } from '@/lib/cn'

function Row({ item }: { item: UploadItem }) {
  const { cancel, retry } = useUploadQueue()
  const pct = Math.round(item.progress * 100)
  const inFlight = item.status === 'queued' || item.status === 'uploading'
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <FileTypeIcon type={categoryFor(item.name) ?? ''} className="mt-0.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {item.status === 'queued' ? 'Waiting' : item.status === 'uploading' ? `${pct}%` : item.status === 'done' ? formatBytes(item.file.size) : ''}
          </span>
        </div>
        {inFlight && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${item.name}`}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${pct}%` }} />
          </div>
        )}
        {item.status === 'error' && <p className="mt-1 text-xs text-danger">{item.error}</p>}
        {item.status === 'cancelled' && <p className="mt-1 text-xs text-muted">Cancelled</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.status === 'done' && <CheckCircle2 className="h-5 w-5 text-success" aria-label="Uploaded" />}
        {item.status === 'error' && <AlertCircle className="h-5 w-5 text-danger" aria-hidden />}
        {(item.status === 'error' || item.status === 'cancelled') && (
          <button onClick={() => retry(item.id)} aria-label={`Retry ${item.name}`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        {inFlight && (
          <button onClick={() => cancel(item.id)} aria-label={`Cancel ${item.name}`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  )
}

export function UploadQueuePanel() {
  const { items, activeCount, clearFinished } = useUploadQueue()
  const [collapsed, setCollapsed] = useState(false)
  if (items.length === 0) return null

  const done = items.filter((i) => i.status === 'done').length
  const failed = items.filter((i) => i.status === 'error').length
  const title = activeCount > 0
    ? `Uploading ${activeCount} ${activeCount === 1 ? 'file' : 'files'}...`
    : failed > 0
      ? `${done} uploaded, ${failed} failed`
      : `${done} ${done === 1 ? 'file' : 'files'} uploaded`

  return (
    <section
      aria-label="Uploads"
      className={cn(
        'fixed z-40 overflow-hidden rounded-xl border border-line bg-surface shadow-xl',
        'inset-x-3 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-6 md:right-6 md:w-96',
      )}
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold" aria-live="polite">{title}</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-subtle">
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {activeCount === 0 && (
            <button onClick={clearFinished} aria-label="Dismiss uploads" className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-subtle">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>
      {!collapsed && <ul className="max-h-72 divide-y divide-line overflow-y-auto">{items.map((i) => <Row key={i.id} item={i} />)}</ul>}
    </section>
  )
}
