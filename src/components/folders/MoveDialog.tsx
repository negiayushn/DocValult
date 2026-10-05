import { useEffect, useMemo, useState } from 'react'
import { Folder, FolderOpen } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { toMessage } from '@/lib/errors'
import { flattenTree } from '@/utils/folderTree'
import type { Folder as FolderT } from '@/types/entities'

interface Props {
  open: boolean
  title: string
  folders: FolderT[]
  /** Folders that can't be chosen (the folder being moved and everything inside it). */
  disabledIds?: ReadonlySet<string>
  /** Where the item(s) already live, to prevent a no-op move. */
  currentFolderId?: string | null
  onMove: (folderId: string | null) => Promise<void>
  onClose: () => void
}

export function MoveDialog({ open, title, folders, disabledIds, currentFolderId, onMove, onClose }: Props) {
  const [selected, setSelected] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const flat = useMemo(() => flattenTree(folders), [folders])

  useEffect(() => { if (open) { setSelected(undefined); setError(null) } }, [open])

  const submit = async () => {
    if (selected === undefined) return
    setBusy(true)
    setError(null)
    try { await onMove(selected); onClose() } catch (e) { setError(toMessage(e, "Couldn't move. Please try again.")) } finally { setBusy(false) }
  }

  const row = (id: string | null, name: string, depth: number, disabled: boolean) => {
    const isSelected = selected === id
    const isCurrent = currentFolderId === id
    return (
      <li key={id ?? 'root'}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setSelected(id)}
          aria-pressed={isSelected}
          style={{ paddingLeft: 12 + depth * 20 }}
          className={cn(
            'flex w-full items-center gap-2 rounded-md py-2 pr-3 text-left text-sm',
            isSelected ? 'bg-accent-soft font-semibold text-accent' : 'hover:bg-subtle',
            disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
          )}
        >
          {isSelected ? <FolderOpen className="h-4 w-4 shrink-0" aria-hidden /> : <Folder className="h-4 w-4 shrink-0" aria-hidden />}
          <span className="truncate">{name}</span>
          {isCurrent && <span className="ml-auto shrink-0 text-xs font-normal text-muted">current</span>}
        </button>
      </li>
    )
  }

  return (
    <Modal open={open} title={title} onClose={onClose} busy={busy}>
      <ul className="max-h-72 overflow-y-auto rounded-lg border border-line p-1" aria-label="Destination folder">
        {row(null, 'Documents (top level)', 0, false)}
        {flat.map(({ folder, depth }) => row(folder.id, folder.name, depth + 1, !!disabledIds?.has(folder.id)))}
      </ul>
      {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} loading={busy} disabled={selected === undefined || selected === currentFolderId}>Move here</Button>
      </div>
    </Modal>
  )
}
