import { Download, ExternalLink, FolderInput, Pencil, Star, Trash2 } from 'lucide-react'
import { FileTypeIcon } from './FileTypeIcon'
import { SelectCheckbox } from './SelectCheckbox'
import { Menu, type MenuItem } from '@/components/ui/Menu'
import { CATEGORY_LABELS, type FileCategory } from '@/lib/fileTypes'
import { cn } from '@/lib/cn'
import { Highlight } from './Highlight'
import { formatBytes, formatDate } from '@/utils/format'
import type { VaultDocument } from '@/types/entities'
import type { ViewMode } from '@/hooks/useViewMode'

export interface DocumentHandlers {
  onOpen: (d: VaultDocument) => void
  onDownload: (d: VaultDocument) => void
  onRename: (d: VaultDocument) => void
  onMove: (d: VaultDocument) => void
  onDelete: (d: VaultDocument) => void
  onFavorite: (d: VaultDocument) => void
}

interface Props extends DocumentHandlers {
  doc: VaultDocument
  view: ViewMode
  selected: boolean
  onToggle: (shift: boolean) => void
  thumbUrl?: string
  /** Extra line under the name, e.g. the folder path. */
  subtitle?: string
  highlight?: string
}

export function DocumentItem({ doc, view, selected, onToggle, thumbUrl, subtitle, highlight, ...h }: Props) {
  const items: MenuItem[] = [
    { label: 'Open', icon: ExternalLink, onSelect: () => h.onOpen(doc) },
    { label: 'Download', icon: Download, onSelect: () => h.onDownload(doc) },
    { label: doc.is_favorite ? 'Remove from favorites' : 'Add to favorites', icon: Star, onSelect: () => h.onFavorite(doc) },
    { label: 'Rename', icon: Pencil, onSelect: () => h.onRename(doc), separatorBefore: true },
    { label: 'Move', icon: FolderInput, onSelect: () => h.onMove(doc) },
    { label: 'Move to Trash', icon: Trash2, danger: true, onSelect: () => h.onDelete(doc), separatorBefore: true },
  ]
  const fav = doc.is_favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-amber-500" aria-label="Favorite" />

  if (view === 'grid') {
    return (
      <div className={cn('group relative overflow-hidden rounded-xl border bg-surface', selected ? 'border-accent ring-2 ring-accent/30' : 'border-line')}>
        <button onClick={() => h.onOpen(doc)} className="block w-full text-left" aria-label={`Open ${doc.file_name}`}>
          <div className="grid aspect-[4/3] place-items-center bg-subtle">
            {thumbUrl ? (
              <img src={thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            ) : (
              <FileTypeIcon type={doc.file_type} className="h-10 w-10 text-accent/70" />
            )}
          </div>
          <div className="px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-sm font-medium"><span className="truncate" title={doc.file_name}><Highlight text={doc.file_name} term={highlight} /></span>{fav}</p>
            <p className="mt-0.5 text-xs text-muted">{formatBytes(doc.file_size)} · {formatDate(doc.updated_at)}</p>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
        </button>
        <div className="absolute left-2 top-2 rounded-md bg-surface/90 p-1.5"><SelectCheckbox checked={selected} onToggle={onToggle} label={`Select ${doc.file_name}`} /></div>
        <div className="absolute right-1 top-1 rounded-md bg-surface/90"><Menu items={items} label={`Actions for ${doc.file_name}`} /></div>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-3 px-3 py-2 sm:px-4', selected ? 'bg-accent-soft' : 'hover:bg-subtle/60')}>
      <SelectCheckbox checked={selected} onToggle={onToggle} label={`Select ${doc.file_name}`} />
      <button onClick={() => h.onOpen(doc)} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
        <FileTypeIcon type={doc.file_type} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium"><span className="truncate" title={doc.file_name}><Highlight text={doc.file_name} term={highlight} /></span>{fav}</span>
          {subtitle && <span className="block truncate text-xs text-muted">{subtitle}</span>}
          <span className="block text-xs text-muted sm:hidden">{formatBytes(doc.file_size)} · {formatDate(doc.updated_at)}</span>
        </span>
      </button>
      <span className="hidden w-28 shrink-0 text-sm text-muted sm:block">{CATEGORY_LABELS[doc.file_type as FileCategory] ?? doc.file_type}</span>
      <span className="hidden w-24 shrink-0 text-sm text-muted sm:block">{formatBytes(doc.file_size)}</span>
      <span className="hidden w-28 shrink-0 text-sm text-muted sm:block">{formatDate(doc.updated_at)}</span>
      <Menu items={items} label={`Actions for ${doc.file_name}`} />
    </div>
  )
}
