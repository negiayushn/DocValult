import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Folder as FolderIcon, FolderPlus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { Menu } from '@/components/ui/Menu'
import { FolderDialogs, type FolderDialogState } from '@/components/folders/FolderDialogs'
import { useFolderCounts, useFolders } from '@/hooks/useFolders'
import { flattenTree } from '@/utils/folderTree'

export function FoldersPage() {
  const navigate = useNavigate()
  const foldersQ = useFolders()
  const countsQ = useFolderCounts()
  const [dialog, setDialog] = useState<FolderDialogState>(null)
  const folders = useMemo(() => foldersQ.data ?? [], [foldersQ.data])
  const counts = countsQ.data ?? {}
  const flat = useMemo(() => flattenTree(folders), [folders])

  return (
    <>
      <PageHeader
        title="Folders"
        description="Your folder structure at a glance."
        actions={<Button onClick={() => setDialog({ kind: 'newFolder', parentId: null })}><FolderPlus className="h-4 w-4" aria-hidden /> New folder</Button>}
      />
      {foldersQ.isLoading ? (
        <div className="space-y-2" aria-busy>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : foldersQ.isError ? (
        <EmptyState icon={FolderIcon} title="Couldn't load folders" description="Check your connection and try again." action={<Button variant="secondary" onClick={() => foldersQ.refetch()}>Try again</Button>} />
      ) : flat.length === 0 ? (
        <EmptyState icon={FolderIcon} title="No folders yet" description="Create folders like Education, Identity or Banking to keep documents organised." action={<Button onClick={() => setDialog({ kind: 'newFolder', parentId: null })}><FolderPlus className="h-4 w-4" aria-hidden /> Create a folder</Button>} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {flat.map(({ folder, depth }) => {
            const n = counts[folder.id] ?? 0
            return (
              <li key={folder.id} className="flex items-center gap-2 pr-2 hover:bg-subtle/60" style={{ paddingLeft: 12 + depth * 24 }}>
                <button onClick={() => navigate(`/folders/${folder.id}`)} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left">
                  <FolderIcon className="h-5 w-5 shrink-0 fill-accent/15 text-accent" aria-hidden />
                  <span className="truncate text-sm font-semibold">{folder.name}</span>
                  <span className="shrink-0 text-xs text-muted">{n} {n === 1 ? 'document' : 'documents'}</span>
                </button>
                <Menu label={`Actions for folder ${folder.name}`} items={[
                  { label: 'Open', onSelect: () => navigate(`/folders/${folder.id}`) },
                  { label: 'New subfolder', onSelect: () => setDialog({ kind: 'newFolder', parentId: folder.id }) },
                  { label: 'Rename', onSelect: () => setDialog({ kind: 'renameFolder', folder }), separatorBefore: true },
                  { label: 'Move', onSelect: () => setDialog({ kind: 'moveFolder', folder }) },
                  { label: 'Delete folder', danger: true, onSelect: () => setDialog({ kind: 'deleteFolder', folder }), separatorBefore: true },
                ]} />
              </li>
            )
          })}
        </ul>
      )}
      <FolderDialogs dialog={dialog} folders={folders} counts={counts} onClose={() => setDialog(null)} />
    </>
  )
}
