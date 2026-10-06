import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { FileTypeIcon } from '@/components/documents/FileTypeIcon'
import { SelectCheckbox } from '@/components/documents/SelectCheckbox'
import { useTrash } from '@/hooks/useDocuments'
import { useExplorerActions } from '@/hooks/useExplorerActions'
import { useSelection } from '@/hooks/useSelection'
import { usePin } from '@/hooks/usePin'
import { emptyTrash } from '@/services/documents'
import { toMessage, isPinRequired } from '@/lib/errors'
import { formatBytes, formatDate } from '@/utils/format'
import type { VaultDocument } from '@/types/entities'

type Dialog = { kind: 'forever'; docs: VaultDocument[] } | { kind: 'empty' } | null

export function TrashPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const actions = useExplorerActions()
  const { guarded } = usePin()
  const q = useTrash()
  const docs = useMemo(() => q.data?.pages.flatMap((p) => p.rows) ?? [], [q.data])
  const total = q.data?.pages[0]?.total ?? 0
  const selection = useSelection(useMemo(() => docs.map((d) => d.id), [docs]))
  const selectedDocs = useMemo(() => docs.filter((d) => selection.selected.has(d.id)), [docs, selection.selected])

  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  const restore = async (list: VaultDocument[]) => {
    setBusy(true)
    try {
      await actions.restoreDocs(list)
      selection.clear()
    } catch (e) {
      toast.error(toMessage(e, "Couldn't restore. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!dialog) return
    setBusy(true)
    try {
      if (dialog.kind === 'forever') {
        await actions.deleteForever(dialog.docs.map((d) => d.id))
        selection.clear()
        setDialog(null)
      } else {
        setProgress(0)
        let total = 0
        const { deleted, error } = await guarded('Enter your PIN to empty the Trash permanently.', async () => {
          const result = await emptyTrash((n) => setProgress(total + n))
          total += result.deleted
          if (result.error && isPinRequired(result.error)) throw result.error
          return { deleted: total, error: result.error }
        }, { strict: true })
        for (const key of ['trash', 'trashCount', 'stats', 'documents', 'recent']) qc.invalidateQueries({ queryKey: [key] })
        selection.clear()
        if (error) toast.error(`${deleted} deleted, then it stopped: ${toMessage(error, 'something went wrong')}. Try again to finish.`)
        else toast.success(deleted === 1 ? 'Trash emptied (1 document)' : `Trash emptied (${deleted} documents)`)
        setDialog(null)
      }
    } catch (e) {
      toast.error(toMessage(e, "Couldn't delete. Nothing was lost; try again."))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Trash"
        description="Items stay here until you delete them permanently."
        actions={total > 0 && <Button variant="danger" onClick={() => setDialog({ kind: 'empty' })}><Trash2 className="h-4 w-4" aria-hidden /> Empty Trash</Button>}
      />

      {selection.selected.size > 0 && (
        <div role="toolbar" aria-label="Bulk actions" className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3 py-2 shadow-sm">
          <button onClick={selection.clear} aria-label="Clear selection" className="grid h-8 w-8 place-items-center rounded-md text-accent hover:bg-surface/60"><X className="h-4 w-4" /></button>
          <span className="text-sm font-semibold text-accent">{selection.selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" loading={busy} onClick={() => restore(selectedDocs)}><RotateCcw className="h-4 w-4" aria-hidden /> Restore</Button>
            <Button variant="danger" size="sm" onClick={() => setDialog({ kind: 'forever', docs: selectedDocs })}><Trash2 className="h-4 w-4" aria-hidden /> Delete forever</Button>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <div className="space-y-2" aria-busy>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : q.isError ? (
        <EmptyState icon={Trash2} title="Couldn't load Trash" description="Check your connection and try again." action={<Button variant="secondary" onClick={() => q.refetch()}>Try again</Button>} />
      ) : docs.length === 0 ? (
        <EmptyState icon={Trash2} title="Trash is empty" description="Documents you delete are kept here so you can restore them." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="hidden items-center gap-3 border-b border-line bg-subtle px-4 py-2 text-xs font-semibold text-muted sm:flex">
            <span className="w-4 shrink-0" />
            <span className="flex-1 pl-8">Document</span>
            <span className="w-28 shrink-0">Deleted</span>
            <span className="w-24 shrink-0">Size</span>
            <span className="w-20 shrink-0 text-right">Actions</span>
          </div>
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2 sm:px-4">
                <SelectCheckbox checked={selection.selected.has(d.id)} onToggle={(s) => selection.toggle(d.id, s)} label={`Select ${d.file_name}`} />
                <FileTypeIcon type={d.file_type} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1 py-1">
                  <p className="truncate text-sm font-medium" title={d.file_name}>{d.file_name}</p>
                  <p className="text-xs text-muted sm:hidden">Deleted {d.deleted_at ? formatDate(d.deleted_at) : ''} · {formatBytes(d.file_size)}</p>
                </div>
                <span className="hidden w-28 shrink-0 text-sm text-muted sm:block">{d.deleted_at ? formatDate(d.deleted_at) : ''}</span>
                <span className="hidden w-24 shrink-0 text-sm text-muted sm:block">{formatBytes(d.file_size)}</span>
                <div className="flex w-20 shrink-0 justify-end gap-1">
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => restore([d])} aria-label={`Restore ${d.file_name}`} title="Restore"><RotateCcw className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDialog({ kind: 'forever', docs: [d] })} aria-label={`Delete ${d.file_name} permanently`} title="Delete permanently" className="text-danger hover:text-danger"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q.hasNextPage && (
        <div className="mt-4 flex justify-center"><Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button></div>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.kind === 'empty' ? `Empty Trash (${total})?` : dialog?.docs.length === 1 ? 'Delete permanently?' : `Delete ${dialog?.docs.length} documents permanently?`}
        confirmLabel={dialog?.kind === 'empty' ? 'Empty Trash' : 'Delete forever'}
        destructive
        loading={busy}
        onCancel={() => { if (!busy) setDialog(null) }}
        onConfirm={confirm}
      >
        {progress !== null ? (
          <p role="status">Deleting... {progress} of {total} done.</p>
        ) : dialog?.kind === 'empty' ? (
          <p>This permanently deletes all {total} {total === 1 ? 'document' : 'documents'} in Trash, including the files in storage. This can't be undone.</p>
        ) : (
          <p>{dialog?.docs.length === 1 ? <strong className="text-fg">{dialog.docs[0].file_name}</strong> : 'These documents'} will be deleted for good, including the file{dialog?.docs.length === 1 ? '' : 's'} in storage. This can't be undone.</p>
        )}
      </ConfirmDialog>
    </>
  )
}
