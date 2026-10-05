import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { FileTypeIcon } from '@/components/documents/FileTypeIcon'
import { useLargestDocuments, useStats, useStorageBreakdown } from '@/hooks/useDocuments'
import { ALLOWED_TYPES, CATEGORY_LABELS, type FileCategory } from '@/lib/fileTypes'
import { MAX_FILE_SIZE_BYTES, STORAGE_QUOTA_BYTES } from '@/lib/config'
import { toMessage } from '@/lib/errors'
import { formatBytes } from '@/utils/format'
import type { StorageBreakdownRow } from '@/services/documents'

/** Fixed hues: each category is also named and counted in the list, so colour is never the only cue. */
const CATEGORY_COLOR: Record<FileCategory, string> = {
  pdf: '#d64550',
  image: '#2f9e75',
  document: '#3b6fe0',
  spreadsheet: '#c9962b',
  presentation: '#d9753a',
  text: '#7c86a3',
  archive: '#8d5fd3',
}

interface Slice { category: FileCategory; count: number; bytes: number }

export function groupByCategory(rows: StorageBreakdownRow[]): { slices: Slice[]; trashBytes: number; trashCount: number } {
  const map = new Map<FileCategory, Slice>()
  let trashBytes = 0
  let trashCount = 0
  for (const r of rows) {
    trashBytes += r.trashBytes
    trashCount += r.trashCount
    // documents.file_type already stores the coarse category (pdf, image, document, ...)
    const cat = r.fileType in CATEGORY_LABELS ? (r.fileType as FileCategory) : null
    if (!cat || r.activeCount === 0) continue
    const cur = map.get(cat) ?? { category: cat, count: 0, bytes: 0 }
    cur.count += r.activeCount
    cur.bytes += r.activeBytes
    map.set(cat, cur)
  }
  return { slices: [...map.values()].sort((a, b) => b.bytes - a.bytes), trashBytes, trashCount }
}

const pctOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)

export function StoragePage() {
  const stats = useStats()
  const breakdown = useStorageBreakdown()
  const largest = useLargestDocuments(10)

  const used = stats.data?.storageUsed ?? 0
  const quotaPct = Math.min(100, pctOf(used, STORAGE_QUOTA_BYTES))
  const grouped = useMemo(() => groupByCategory(breakdown.data ?? []), [breakdown.data])
  const activeBytes = grouped.slices.reduce((n, s) => n + s.bytes, 0)
  const empty = stats.isSuccess && used === 0

  return (
    <>
      <PageHeader title="Storage" description="See what is using your space." />
      <div className="space-y-6">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Space used</h2>
              {stats.isLoading ? <Skeleton className="mt-2 h-8 w-40" /> : (
                <p className="mt-1 text-3xl font-bold tracking-tight">{formatBytes(used)}</p>
              )}
            </div>
            <p className="text-sm text-muted">of {formatBytes(STORAGE_QUOTA_BYTES)} ({quotaPct < 0.1 && used > 0 ? '<0.1' : quotaPct.toFixed(1)}%)</p>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(quotaPct)}>
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(quotaPct, used > 0 ? 1 : 0)}%` }} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Files in Trash still count until you delete them for good. The {formatBytes(STORAGE_QUOTA_BYTES)} figure is a guide, not a hard cap: your Supabase plan sets the real limit.
          </p>
          {stats.isError && <p role="alert" className="mt-3 text-sm text-danger">{toMessage(stats.error, "Couldn't load your usage.")}</p>}
        </Card>

        {empty ? (
          <EmptyState icon={Trash2} title="Nothing stored yet" description="Upload a document and its size shows up here." />
        ) : (
          <>
            <Card className="p-5 sm:p-6">
              <h2 className="text-base font-semibold">By file type</h2>
              {breakdown.isLoading ? (
                <div className="mt-4 space-y-3"><Skeleton className="h-3 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
              ) : breakdown.isError ? (
                <p role="alert" className="mt-3 text-sm text-danger">{toMessage(breakdown.error, "Couldn't load the breakdown.")} <button className="font-semibold underline" onClick={() => breakdown.refetch()}>Retry</button></p>
              ) : grouped.slices.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No active files. Anything you have is in Trash.</p>
              ) : (
                <>
                  <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-subtle" role="img" aria-label="Share of space by file type">
                    {grouped.slices.map((s) => (
                      <div key={s.category} style={{ width: `${pctOf(s.bytes, activeBytes)}%`, background: CATEGORY_COLOR[s.category] }} title={`${CATEGORY_LABELS[s.category]}: ${formatBytes(s.bytes)}`} />
                    ))}
                  </div>
                  <ul className="mt-4 divide-y divide-line">
                    {grouped.slices.map((s) => (
                      <li key={s.category} className="flex items-center gap-3 py-2.5 text-sm">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: CATEGORY_COLOR[s.category] }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-medium">{CATEGORY_LABELS[s.category]}</span>
                        <span className="text-muted">{s.count} {s.count === 1 ? 'file' : 'files'}</span>
                        <span className="w-20 text-right font-semibold tabular-nums">{formatBytes(s.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {grouped.trashCount > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-subtle px-4 py-3 text-sm">
                  <span className="flex items-center gap-2"><Trash2 className="h-4 w-4 text-muted" aria-hidden />
                    Trash holds <strong>{formatBytes(grouped.trashBytes)}</strong> in {grouped.trashCount} {grouped.trashCount === 1 ? 'file' : 'files'}
                  </span>
                  <Link to="/trash" className="inline-flex min-h-10 items-center font-semibold text-accent hover:underline">Review Trash</Link>
                </div>
              )}
            </Card>

            <Card className="p-5 sm:p-6">
              <h2 className="text-base font-semibold">Largest files</h2>
              {largest.isLoading ? (
                <div className="mt-4 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
              ) : largest.isError ? (
                <p role="alert" className="mt-3 text-sm text-danger">{toMessage(largest.error, "Couldn't load your largest files.")} <button className="font-semibold underline" onClick={() => largest.refetch()}>Retry</button></p>
              ) : (largest.data ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-muted">No active files yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {largest.data!.map((d) => (
                    <li key={d.id}>
                      <Link to={`/documents/${d.id}`} className="flex items-center gap-3 rounded-md py-2.5 hover:bg-subtle sm:px-2">
                        <FileTypeIcon type={d.file_type} className="h-5 w-5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.file_name}</span>
                        <span className="text-sm font-semibold tabular-nums">{formatBytes(d.file_size)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold">Upload limits</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Largest file</dt><dd className="font-medium">{formatBytes(MAX_FILE_SIZE_BYTES)}</dd>
            <dt className="text-muted">Allowed types</dt>
            <dd className="font-medium">{Object.keys(ALLOWED_TYPES).map((e) => e.toUpperCase()).join(', ')}</dd>
          </dl>
        </Card>
      </div>
    </>
  )
}
