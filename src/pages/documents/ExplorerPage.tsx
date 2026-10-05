import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileText, FolderPlus, FolderSearch, Upload } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Breadcrumbs } from '@/components/documents/Breadcrumbs'
import { ExplorerToolbar } from '@/components/documents/ExplorerToolbar'
import { BulkBar } from '@/components/documents/BulkBar'
import { DocumentItem } from '@/components/documents/DocumentItem'
import { DocumentDialogs, type DocumentDialogState } from '@/components/documents/DocumentDialogs'
import { FolderItem } from '@/components/folders/FolderItem'
import { FolderDialogs, type FolderDialogState } from '@/components/folders/FolderDialogs'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDocuments } from '@/hooks/useDocuments'
import { useFolderCounts, useFolders } from '@/hooks/useFolders'
import { useExplorerActions } from '@/hooks/useExplorerActions'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useSelection } from '@/hooks/useSelection'
import { useThumbnails } from '@/hooks/useThumbnails'
import { useUploadQueue } from '@/hooks/useUploadQueue'
import { useViewMode } from '@/hooks/useViewMode'
import { CATEGORY_LABELS, type FileCategory } from '@/lib/fileTypes'
import type { SortState } from '@/services/documents'
import { childrenOf, pathTo } from '@/utils/folderTree'
import type { Folder, VaultDocument } from '@/types/entities'

export function ExplorerPage() {
  const { folderId: folderParam } = useParams()
  const folderId = folderParam ?? null
  const navigate = useNavigate()
  const { openPicker, setTargetFolder } = useUploadQueue()
  const { download, downloadMany } = useDocumentActions()
  const actions = useExplorerActions()

  const [view, setView] = useViewMode()
  const [sort, setSort] = useState<SortState>({ field: 'date', dir: 'desc' })
  const [fileType, setFileType] = useState<FileCategory | null>(null)
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null)
  const [docDialog, setDocDialog] = useState<DocumentDialogState>(null)

  const foldersQ = useFolders()
  const countsQ = useFolderCounts()
  const docsQ = useDocuments({ folderId, sort, fileType })

  const folders = useMemo(() => foldersQ.data ?? [], [foldersQ.data])
  const counts = countsQ.data ?? {}
  const docs = useMemo(() => docsQ.data?.pages.flatMap((p) => p.rows) ?? [], [docsQ.data])
  const subfolders = useMemo(() => (fileType ? [] : childrenOf(folders, folderId)), [folders, folderId, fileType])
  const path = useMemo(() => pathTo(folders, folderId), [folders, folderId])
  const current = path[path.length - 1] ?? null

  const selection = useSelection(useMemo(() => docs.map((d) => d.id), [docs]))
  const thumbs = useThumbnails(docs, view === 'grid')

  // New uploads land in the folder you're looking at.
  useEffect(() => {
    setTargetFolder(folderId)
    return () => setTargetFolder(null)
  }, [folderId, setTargetFolder])
  useEffect(() => { selection.clear() }, [folderId, fileType, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDocs = useMemo(() => docs.filter((d) => selection.selected.has(d.id)), [docs, selection.selected])

  const openFolder = useCallback((f: Folder) => navigate(`/folders/${f.id}`), [navigate])
  const handlers = useMemo(() => ({
    onOpen: (d: VaultDocument) => navigate(`/documents/${d.id}`),
    onDownload: (d: VaultDocument) => download(d),
    onRename: (d: VaultDocument) => setDocDialog({ kind: 'renameDoc', doc: d }),
    onMove: (d: VaultDocument) => setDocDialog({ kind: 'moveDocs', docs: [d] }),
    onDelete: (d: VaultDocument) => setDocDialog({ kind: 'deleteDocs', docs: [d] }),
    onFavorite: (d: VaultDocument) => { void actions.toggleFavorite(d) },
  }), [navigate, download, actions])

  const loading = foldersQ.isLoading || docsQ.isLoading
  const failed = foldersQ.isError || docsQ.isError

  if (folderId && !foldersQ.isLoading && !foldersQ.isError && !current) {
    return (
      <EmptyState
        icon={FolderSearch}
        title="Folder not found"
        description="It may have been deleted or moved."
        action={<Link to="/documents"><Button variant="secondary">Back to Documents</Button></Link>}
      />
    )
  }

  const empty = !loading && !failed && docs.length === 0 && subfolders.length === 0
  const isGrid = view === 'grid'

  return (
    <>
      <div className="mb-2"><Breadcrumbs path={path} /></div>
      <PageHeader
        title={current?.name ?? 'Documents'}
        description={!loading && !failed ? `${docsQ.data?.pages[0]?.total ?? 0} ${(docsQ.data?.pages[0]?.total ?? 0) === 1 ? 'document' : 'documents'}${subfolders.length ? ` · ${subfolders.length} ${subfolders.length === 1 ? 'folder' : 'folders'}` : ''}` : undefined}
        actions={<Button variant="secondary" onClick={() => setFolderDialog({ kind: 'newFolder', parentId: folderId })}><FolderPlus className="h-4 w-4" aria-hidden /> New folder</Button>}
      />

      <ExplorerToolbar sort={sort} onSort={setSort} fileType={fileType} onFileType={setFileType} view={view} onView={setView} />

      {selection.selected.size > 0 && (
        <BulkBar
          count={selection.selected.size}
          allSelected={selection.allSelected}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onMove={() => setDocDialog({ kind: 'moveDocs', docs: selectedDocs })}
          onDownload={() => { void downloadMany(selectedDocs) }}
          onDelete={() => setDocDialog({ kind: 'deleteDocs', docs: selectedDocs })}
        />
      )}

      {loading ? (
        <div className={isGrid ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'space-y-2'} aria-busy>
          {Array.from({ length: isGrid ? 8 : 6 }).map((_, i) => <Skeleton key={i} className={isGrid ? 'aspect-[4/3] w-full' : 'h-14 w-full'} />)}
        </div>
      ) : failed ? (
        <EmptyState
          icon={FileText}
          title="Couldn't load this view"
          description="Check your connection and try again."
          action={<Button variant="secondary" onClick={() => { void foldersQ.refetch(); void docsQ.refetch() }}>Try again</Button>}
        />
      ) : empty ? (
        fileType ? (
          <EmptyState icon={FileText} title={`No ${CATEGORY_LABELS[fileType].toLowerCase()} files here`} description="Try another type or clear the filter." action={<Button variant="secondary" onClick={() => setFileType(null)}>Clear filter</Button>} />
        ) : (
          <EmptyState
            icon={FileText}
            title={current ? 'This folder is empty' : 'No documents yet'}
            description="Upload PDFs, images, Office files, text or ZIPs up to 50 MB. You can also drag files onto this page."
            action={<Button onClick={() => openPicker()}><Upload className="h-4 w-4" aria-hidden /> Upload documents</Button>}
          />
        )
      ) : isGrid ? (
        <div className="space-y-6">
          {subfolders.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subfolders.map((f) => (
                <FolderItem key={f.id} folder={f} view="grid" docCount={counts[f.id] ?? 0} onOpen={openFolder}
                  onRename={(x) => setFolderDialog({ kind: 'renameFolder', folder: x })}
                  onMove={(x) => setFolderDialog({ kind: 'moveFolder', folder: x })}
                  onDelete={(x) => setFolderDialog({ kind: 'deleteFolder', folder: x })} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {docs.map((d) => (
              <DocumentItem key={d.id} doc={d} view="grid" selected={selection.selected.has(d.id)} onToggle={(s) => selection.toggle(d.id, s)} thumbUrl={thumbs[d.storage_path]} {...handlers} />
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="hidden items-center gap-3 border-b border-line bg-subtle px-4 py-2 text-xs font-semibold text-muted sm:flex">
            <span className="w-4 shrink-0" />
            <span className="flex-1 pl-8">Name</span>
            <span className="w-28 shrink-0">Type</span>
            <span className="w-24 shrink-0">Size</span>
            <span className="w-28 shrink-0">Modified</span>
            <span className="w-9 shrink-0" />
          </div>
          <div className="divide-y divide-line">
            {subfolders.map((f) => (
              <FolderItem key={f.id} folder={f} view="list" docCount={counts[f.id] ?? 0} onOpen={openFolder}
                onRename={(x) => setFolderDialog({ kind: 'renameFolder', folder: x })}
                onMove={(x) => setFolderDialog({ kind: 'moveFolder', folder: x })}
                onDelete={(x) => setFolderDialog({ kind: 'deleteFolder', folder: x })} />
            ))}
            {docs.map((d) => (
              <DocumentItem key={d.id} doc={d} view="list" selected={selection.selected.has(d.id)} onToggle={(s) => selection.toggle(d.id, s)} {...handlers} />
            ))}
          </div>
        </div>
      )}

      {docsQ.hasNextPage && !loading && !failed && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => docsQ.fetchNextPage()} loading={docsQ.isFetchingNextPage}>Load more</Button>
        </div>
      )}

      <FolderDialogs
        dialog={folderDialog}
        folders={folders}
        counts={counts}
        onClose={() => setFolderDialog(null)}
        onDeleted={(f) => { if (f.id === folderId) navigate(f.parent_id ? `/folders/${f.parent_id}` : '/documents', { replace: true }) }}
      />
      <DocumentDialogs dialog={docDialog} folders={folders} onClose={() => setDocDialog(null)} onDone={selection.clear} />
    </>
  )
}
