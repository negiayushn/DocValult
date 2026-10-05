import { FolderInput, Folder as FolderIcon, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { Menu, type MenuItem } from '@/components/ui/Menu'
import { cn } from '@/lib/cn'
import { formatDate } from '@/utils/format'
import type { Folder } from '@/types/entities'
import type { ViewMode } from '@/hooks/useViewMode'

interface Props {
  folder: Folder
  view: ViewMode
  docCount: number
  onOpen: (f: Folder) => void
  onRename: (f: Folder) => void
  onMove: (f: Folder) => void
  onDelete: (f: Folder) => void
}

export function FolderItem({ folder, view, docCount, onOpen, onRename, onMove, onDelete }: Props) {
  const items: MenuItem[] = [
    { label: 'Open', icon: FolderOpen, onSelect: () => onOpen(folder) },
    { label: 'Rename', icon: Pencil, onSelect: () => onRename(folder), separatorBefore: true },
    { label: 'Move', icon: FolderInput, onSelect: () => onMove(folder) },
    { label: 'Delete folder', icon: Trash2, danger: true, onSelect: () => onDelete(folder), separatorBefore: true },
  ]
  const meta = `${docCount} ${docCount === 1 ? 'document' : 'documents'}`

  if (view === 'grid') {
    return (
      <div className="relative rounded-xl border border-line bg-surface hover:border-accent/50">
        <button onClick={() => onOpen(folder)} className="flex w-full items-center gap-3 px-4 py-4 pr-12 text-left" aria-label={`Open folder ${folder.name}`}>
          <FolderIcon className="h-8 w-8 shrink-0 fill-accent/15 text-accent" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold" title={folder.name}>{folder.name}</span>
            <span className="block text-xs text-muted">{meta}</span>
          </span>
        </button>
        <div className="absolute right-1 top-1/2 -translate-y-1/2"><Menu items={items} label={`Actions for folder ${folder.name}`} /></div>
      </div>
    )
  }
  return (
    <div className={cn('flex items-center gap-3 px-3 py-2 hover:bg-subtle/60 sm:px-4')}>
      <span className="w-4 shrink-0" aria-hidden />
      <button onClick={() => onOpen(folder)} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
        <FolderIcon className="h-5 w-5 shrink-0 fill-accent/15 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold" title={folder.name}>{folder.name}</span>
          <span className="block text-xs text-muted sm:hidden">{meta}</span>
        </span>
      </button>
      <span className="hidden w-28 shrink-0 text-sm text-muted sm:block">Folder</span>
      <span className="hidden w-24 shrink-0 text-sm text-muted sm:block">{meta}</span>
      <span className="hidden w-28 shrink-0 text-sm text-muted sm:block">{formatDate(folder.updated_at)}</span>
      <Menu items={items} label={`Actions for folder ${folder.name}`} />
    </div>
  )
}
