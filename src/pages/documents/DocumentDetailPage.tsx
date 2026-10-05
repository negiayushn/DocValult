import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, FileSearch, FolderInput, Pencil, Star, Trash2 } from 'lucide-react'
import { Breadcrumbs } from '@/components/documents/Breadcrumbs'
import { DocumentPreview } from '@/components/documents/DocumentPreview'
import { DocumentDialogs, type DocumentDialogState } from '@/components/documents/DocumentDialogs'
import { TagEditor } from '@/components/documents/TagEditor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useDocument } from '@/hooks/useDocuments'
import { useFolders } from '@/hooks/useFolders'
import { useExplorerActions } from '@/hooks/useExplorerActions'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { CATEGORY_LABELS, type FileCategory } from '@/lib/fileTypes'
import { toMessage } from '@/lib/errors'
import { updateDescription } from '@/services/documents'
import { pathTo } from '@/utils/folderTree'
import { formatBytes } from '@/utils/format'

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  )
}

export function DocumentDetailPage() {
  const { documentId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const actions = useExplorerActions()
  const { download } = useDocumentActions()
  const docQ = useDocument(documentId)
  const foldersQ = useFolders()
  const doc = docQ.data
  const [dialog, setDialog] = useState<DocumentDialogState>(null)
  const [desc, setDesc] = useState('')

  useEffect(() => setDesc(doc?.description ?? ''), [doc?.id, doc?.description])

  const folderPath = useMemo(() => pathTo(foldersQ.data ?? [], doc?.folder_id ?? null), [foldersQ.data, doc?.folder_id])
  const saveDesc = useMutation({
    mutationFn: (text: string) => updateDescription(doc!.id, text),
    onSuccess: () => {
      for (const key of ['document', 'documents']) qc.invalidateQueries({ queryKey: [key] })
      toast.success('Description saved')
    },
    onError: (e) => toast.error(toMessage(e, "Couldn't save the description.")),
  })

  if (docQ.isLoading) {
    return <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-[70vh] lg:col-span-2" /><Skeleton className="h-96" /></div>
  }
  if (docQ.isError) {
    return <EmptyState icon={FileSearch} title="Couldn't load this document" description="Check your connection and try again." action={<Button variant="secondary" onClick={() => docQ.refetch()}>Try again</Button>} />
  }
  if (!doc) {
    return <EmptyState icon={FileSearch} title="Document not found" description="It may have been deleted, or the link is wrong." action={<Link to="/documents"><Button variant="secondary">Back to Documents</Button></Link>} />
  }
  if (doc.deleted_at) {
    return <EmptyState icon={Trash2} title="This document is in Trash" description="Restore it from Trash to open it again." action={<Link to="/trash"><Button variant="secondary">Go to Trash</Button></Link>} />
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/documents'))} aria-label="Go back" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /></button>
        <Breadcrumbs path={folderPath} />
      </div>
      <h1 className="mb-5 break-words text-2xl font-bold tracking-tight">{doc.file_name}</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><DocumentPreview key={doc.id} doc={doc} /></div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => download(doc)}><Download className="h-4 w-4" aria-hidden /> Download</Button>
              <Button variant="secondary" onClick={() => setDialog({ kind: 'renameDoc', doc })}><Pencil className="h-4 w-4" aria-hidden /> Rename</Button>
              <Button variant="secondary" onClick={() => setDialog({ kind: 'moveDocs', docs: [doc] })}><FolderInput className="h-4 w-4" aria-hidden /> Move</Button>
              <Button variant="secondary" onClick={() => { void actions.toggleFavorite(doc) }} aria-pressed={doc.is_favorite}><Star className={`h-4 w-4 ${doc.is_favorite ? 'fill-current text-amber-500' : ''}`} aria-hidden /> {doc.is_favorite ? 'Favorited' : 'Favorite'}</Button>
              <Button variant="danger" className="col-span-2" onClick={() => setDialog({ kind: 'deleteDocs', docs: [doc] })}><Trash2 className="h-4 w-4" aria-hidden /> Move to Trash</Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold">Details</h2>
            <dl className="mt-1 divide-y divide-line">
              <Field label="Type">{CATEGORY_LABELS[doc.file_type as FileCategory] ?? doc.file_type}</Field>
              <Field label="Size">{formatBytes(doc.file_size)}</Field>
              <Field label="Created">{when(doc.created_at)}</Field>
              <Field label="Modified">{when(doc.updated_at)}</Field>
              <Field label="Folder">
                {folderPath.length ? <Link to={`/folders/${doc.folder_id}`} className="text-accent hover:underline">{folderPath.map((f) => f.name).join(' / ')}</Link> : <Link to="/documents" className="text-accent hover:underline">Documents</Link>}
              </Field>
            </dl>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Tags</h2>
            <TagEditor documentId={doc.id} />
          </Card>

          <Card className="p-4">
            <label htmlFor="doc-desc" className="mb-2 block text-sm font-semibold">Description</label>
            <textarea
              id="doc-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={() => { if (desc.trim() !== (doc.description ?? '') && !saveDesc.isPending) saveDesc.mutate(desc) }}
              maxLength={2000}
              rows={4}
              placeholder="Add notes to find this document later..."
              className="w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
            <p className="mt-1 text-xs text-muted">Saved when you click away. Searchable.</p>
          </Card>
        </div>
      </div>

      <DocumentDialogs
        dialog={dialog}
        folders={foldersQ.data ?? []}
        onClose={() => setDialog(null)}
        onDone={() => { if (dialog?.kind === 'deleteDocs') navigate('/documents', { replace: true }) }}
      />
    </>
  )
}
