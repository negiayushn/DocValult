import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PromptDialog } from '@/components/ui/PromptDialog'
import { useToast } from '@/components/ui/Toast'
import { MoveDialog } from './MoveDialog'
import { useExplorerActions } from '@/hooks/useExplorerActions'
import { toMessage } from '@/lib/errors'
import { descendantIds } from '@/utils/folderTree'
import { nameIssue } from '@/utils/validation'
import type { Folder } from '@/types/entities'

export type FolderDialogState =
  | { kind: 'newFolder'; parentId: string | null }
  | { kind: 'renameFolder'; folder: Folder }
  | { kind: 'moveFolder'; folder: Folder }
  | { kind: 'deleteFolder'; folder: Folder }
  | null

interface Props {
  dialog: FolderDialogState
  folders: Folder[]
  counts: Record<string, number>
  onClose: () => void
  /** Called after a folder is deleted, so a page showing it can navigate away. */
  onDeleted?: (folder: Folder) => void
}

export function FolderDialogs({ dialog, folders, counts, onClose, onDeleted }: Props) {
  const actions = useExplorerActions()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const validate = (v: string) => nameIssue(v, 'folder name', 120)

  const deleteInfo = (() => {
    if (dialog?.kind !== 'deleteFolder') return null
    const ids = descendantIds(folders, dialog.folder.id)
    let docs = 0
    for (const id of ids) docs += counts[id] ?? 0
    return { subfolders: ids.size - 1, docs }
  })()

  return (
    <>
      <PromptDialog
        open={dialog?.kind === 'newFolder'}
        title="New folder"
        label="Folder name"
        confirmLabel="Create"
        validate={validate}
        onSubmit={(name) => actions.createFolder(name, dialog?.kind === 'newFolder' ? dialog.parentId : null)}
        onClose={onClose}
      />
      <PromptDialog
        open={dialog?.kind === 'renameFolder'}
        title="Rename folder"
        label="Folder name"
        initialValue={dialog?.kind === 'renameFolder' ? dialog.folder.name : ''}
        confirmLabel="Rename"
        validate={validate}
        onSubmit={(name) => (dialog?.kind === 'renameFolder' ? actions.renameFolder(dialog.folder, name) : Promise.resolve())}
        onClose={onClose}
      />
      <MoveDialog
        open={dialog?.kind === 'moveFolder'}
        title={dialog?.kind === 'moveFolder' ? `Move "${dialog.folder.name}"` : 'Move folder'}
        folders={folders}
        disabledIds={dialog?.kind === 'moveFolder' ? descendantIds(folders, dialog.folder.id) : undefined}
        currentFolderId={dialog?.kind === 'moveFolder' ? dialog.folder.parent_id : undefined}
        onMove={(parentId) => (dialog?.kind === 'moveFolder' ? actions.moveFolder(dialog.folder, parentId) : Promise.resolve())}
        onClose={onClose}
      />
      <ConfirmDialog
        open={dialog?.kind === 'deleteFolder'}
        title={dialog?.kind === 'deleteFolder' ? `Delete "${dialog.folder.name}"?` : 'Delete folder?'}
        confirmLabel="Delete folder"
        destructive
        loading={deleting}
        onCancel={onClose}
        onConfirm={async () => {
          if (dialog?.kind !== 'deleteFolder') return
          setDeleting(true)
          try {
            await actions.deleteFolder(dialog.folder)
            onDeleted?.(dialog.folder)
            onClose()
          } catch (e) {
            toast.error(toMessage(e, "Couldn't delete this folder."))
          } finally {
            setDeleting(false)
          }
        }}
      >
        {deleteInfo && (
          <div className="space-y-2">
            <p>
              This removes the folder{deleteInfo.subfolders > 0 ? ` and its ${deleteInfo.subfolders} ${deleteInfo.subfolders === 1 ? 'subfolder' : 'subfolders'}` : ''}.
            </p>
            <p>
              {deleteInfo.docs > 0
                ? `The ${deleteInfo.docs} ${deleteInfo.docs === 1 ? 'document' : 'documents'} inside will be moved to Trash, not erased. Restoring one puts it back at the top level.`
                : 'It contains no documents.'}
            </p>
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
