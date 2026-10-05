import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, type LucideIcon } from 'lucide-react'
import { BulkBar } from './BulkBar'
import { DocumentItem } from './DocumentItem'
import { DocumentDialogs, type DocumentDialogState } from './DocumentDialogs'
import { ExplorerToolbar } from './ExplorerToolbar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useFolders } from '@/hooks/useFolders'
import { useExplorerActions } from '@/hooks/useExplorerActions'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useSelection } from '@/hooks/useSelection'
import { useThumbnails } from '@/hooks/useThumbnails'
import { useViewMode } from '@/hooks/useViewMode'
import { pathTo } from '@/utils/folderTree'
import type { FileCategory } from '@/lib/fileTypes'
import type { SortState } from '@/services/documents'
import type { VaultDocument } from '@/types/entities'

interface Props {
  docs: VaultDocument[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  hasNextPage: boolean
  fetchNextPage: () => void
  isFetchingNextPage: boolean
  empty: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }
  /** Section headings (e.g. Today / Yesterday). */
  groupBy?: (d: VaultDocument) => string
  /** Sort and type-filter controls, for collections that support them. */
  toolbar?: { sort: SortState; onSort: (s: SortState) => void; fileType: FileCategory | null; onFileType: (t: FileCategory | null) => void; hideSort?: boolean }
  /** Shown when loading fails. */
  errorText?: string
  /** Search term to highlight in file names. */
  highlight?: string
}

/** A selectable list/grid of documents with the standard row actions. Used by Favorites, Recent and Search. */
export function DocumentCollection({ docs, isLoading, isError, onRetry, hasNextPage, fetchNextPage, isFetchingNextPage, empty, groupBy, toolbar, highlight, errorText }: Props) {
  const navigate = useNavigate()
  const { download, downloadMany } = useDocumentActions()
  const actions = useExplorerActions()
  const foldersQ = useFolders()
  const folders = useMemo(() => foldersQ.data ?? [], [foldersQ.data])
  const [view, setView] = useViewMode()
  const [dialog, setDialog] = useState<DocumentDialogState>(null)

  const selection = useSelection(useMemo(() => docs.map((d) => d.id), [docs]))
  const thumbs = useThumbnails(docs, view === 'grid')
  const selectedDocs = useMemo(() => docs.filter((d) => selection.selected.has(d.id)), [docs, selection.selected])

  const handlers = useMemo(() => ({
    onOpen: (d: VaultDocument) => navigate(`/documents/${d.id}`),
    onDownload: (d: VaultDocument) => { void download(d) },
    onRename: (d: VaultDocument) => setDialog({ kind: 'renameDoc', doc: d }),
    onMove: (d: VaultDocument) => setDialog({ kind: 'moveDocs', docs: [d] }),
    onDelete: (d: VaultDocument) => setDialog({ kind: 'deleteDocs', docs: [d] }),
    onFavorite: (d: VaultDocument) => { void actions.toggleFavorite(d) },
  }), [navigate, download, actions])

  const groups = useMemo(() => {
    const out: { label: string; docs: VaultDocument[] }[] = []
    for (const d of docs) {
      const label = groupBy ? groupBy(d) : ''
      const last = out[out.length - 1]
      if (last && last.label === label) last.docs.push(d)
      else out.push({ label, docs: [d] })
    }
    return out
  }, [docs, groupBy])

  const location = (d: VaultDocument) => pathTo(folders, d.folder_id).map((f) => f.name).join(' / ') || 'Documents'
  const isGrid = view === 'grid'

  return (
    <>
      <ExplorerToolbar
        sort={toolbar?.sort ?? { field: 'date', dir: 'desc' }}
        onSort={toolbar?.onSort ?? (() => {})}
        fileType={toolbar?.fileType ?? null}
        onFileType={toolbar?.onFileType ?? (() => {})}
        view={view}
        onView={setView}
        hideSort={!toolbar || !!toolbar.hideSort}
        hideFilter={!toolbar}
      />

      {selection.selected.size > 0 && (
        <BulkBar
          count={selection.selected.size}
          allSelected={selection.allSelected}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onMove={() => setDialog({ kind: 'moveDocs', docs: selectedDocs })}
          onDownload={() => { void downloadMany(selectedDocs) }}
          onDelete={() => setDialog({ kind: 'deleteDocs', docs: selectedDocs })}
        />
      )}

      {isLoading ? (
        <div className={isGrid ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'space-y-2'} aria-busy>
          {Array.from({ length: isGrid ? 8 : 6 }).map((_, i) => <Skeleton key={i} className={isGrid ? 'aspect-[4/3] w-full' : 'h-14 w-full'} />)}
        </div>
      ) : isError ? (
        <EmptyState icon={FileText} title="Couldn't load documents" description={errorText ?? 'Check your connection and try again.'} action={<Button variant="secondary" onClick={onRetry}>Try again</Button>} />
      ) : docs.length === 0 ? (
        <EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
      ) : (
        <div className="space-y-6">
          {groups.map((g, gi) => (
            <section key={`${g.label}-${gi}`} aria-label={g.label || undefined}>
              {g.label && <h2 className="mb-2 text-sm font-semibold text-muted">{g.label}</h2>}
              {isGrid ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {g.docs.map((d) => (
                    <DocumentItem key={d.id} doc={d} view="grid" highlight={highlight} subtitle={location(d)} selected={selection.selected.has(d.id)} onToggle={(s) => selection.toggle(d.id, s)} thumbUrl={thumbs[d.storage_path]} {...handlers} />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                  {g.docs.map((d) => (
                    <DocumentItem key={d.id} doc={d} view="list" highlight={highlight} subtitle={location(d)} selected={selection.selected.has(d.id)} onToggle={(s) => selection.toggle(d.id, s)} {...handlers} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {hasNextPage && !isLoading && !isError && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={fetchNextPage} loading={isFetchingNextPage}>Load more</Button>
        </div>
      )}

      <DocumentDialogs dialog={dialog} folders={folders} onClose={() => setDialog(null)} onDone={selection.clear} />
    </>
  )
}
