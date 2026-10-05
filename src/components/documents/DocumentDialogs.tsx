import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PromptDialog } from '@/components/ui/PromptDialog'
import { useToast } from '@/components/ui/Toast'
import { MoveDialog } from '@/components/folders/MoveDialog'
import { useExplorerActions } from '@/hooks/useExplorerActions'
import { toMessage } from '@/lib/errors'
import { nameIssue } from '@/utils/validation'
import type { Folder, VaultDocument } from '@/types/entities'

export type DocumentDialogState =
  | { kind: 'renameDoc'; doc: VaultDocument }
  | { kind: 'moveDocs'; docs: VaultDocument[] }
  | { kind: 'deleteDocs'; docs: VaultDocument[] }
  | null

interface Props {
  dialog: DocumentDialogState
  folders: Folder[]
  onClose: () => void
  /** Called after a successful move or delete so the page can clear its selection. */
  onDone: () => void
}

export function DocumentDialogs({ dialog, folders, onClose, onDone }: Props) {
  const actions = useExplorerActions()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const docs = dialog && dialog.kind !== 'renameDoc' ? dialog.docs : []
  const sameFolder = docs.length > 0 && docs.every((d) => d.folder_id === docs[0].folder_id) ? docs[0].folder_id : undefined

  return (
    <>
      <PromptDialog
        open={dialog?.kind === 'renameDoc'}
        title="Rename document"
        label="File name"
        initialValue={dialog?.kind === 'renameDoc' ? dialog.doc.file_name : ''}
        confirmLabel="Rename"
        validate={(v) => nameIssue(v, 'file name', 255)}
        onSubmit={(name) => (dialog?.kind === 'renameDoc' ? actions.renameDoc(dialog.doc, name) : Promise.resolve())}
        onClose={onClose}
      />
      <MoveDialog
        open={dialog?.kind === 'moveDocs'}
        title={docs.length === 1 ? `Move "${docs[0].file_name}"` : `Move ${docs.length} documents`}
        folders={folders}
        currentFolderId={sameFolder}
        onMove={async (folderId) => { await actions.moveDocs(docs, folderId); onDone() }}
        onClose={onClose}
      />
      <ConfirmDialog
        open={dialog?.kind === 'deleteDocs'}
        title={docs.length === 1 ? 'Move to Trash?' : `Move ${docs.length} documents to Trash?`}
        confirmLabel="Move to Trash"
        destructive
        loading={busy}
        onCancel={onClose}
        onConfirm={async () => {
          setBusy(true)
          try {
            await actions.trashDocs(docs.map((d) => d.id))
            onDone()
            onClose()
          } catch (e) {
            toast.error(toMessage(e, "Couldn't move to Trash."))
          } finally {
            setBusy(false)
          }
        }}
      >
        <p>
          {docs.length === 1 ? <strong className="text-fg">{docs[0].file_name}</strong> : 'These documents'} will leave your library but stay in storage until you delete {docs.length === 1 ? 'it' : 'them'} permanently from Trash.
        </p>
      </ConfirmDialog>
    </>
  )
}
