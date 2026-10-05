import { Download, FolderInput, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  count: number
  allSelected: boolean
  onSelectAll: () => void
  onMove: () => void
  onDownload: () => void
  onDelete: () => void
  onClear: () => void
}

export function BulkBar({ count, allSelected, onSelectAll, onMove, onDownload, onDelete, onClear }: Props) {
  return (
    <div role="toolbar" aria-label="Bulk actions" className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3 py-2 shadow-sm">
      <button onClick={onClear} aria-label="Clear selection" className="grid h-8 w-8 place-items-center rounded-md text-accent hover:bg-surface/60"><X className="h-4 w-4" /></button>
      <span className="text-sm font-semibold text-accent">{count} selected</span>
      {!allSelected && <button onClick={onSelectAll} className="text-sm font-medium text-accent underline-offset-2 hover:underline">Select all loaded</button>}
      <div className="ml-auto flex gap-2">
        <Button variant="secondary" size="sm" onClick={onMove}><FolderInput className="h-4 w-4" aria-hidden /> Move</Button>
        <Button variant="secondary" size="sm" onClick={onDownload}><Download className="h-4 w-4" aria-hidden /> Download</Button>
        <Button variant="danger" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4" aria-hidden /> Trash</Button>
      </div>
    </div>
  )
}
