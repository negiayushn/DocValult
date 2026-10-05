import { useEffect, useState } from 'react'
import { AlertCircle, ExternalLink, FileQuestion, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSignedUrl } from '@/hooks/useDocuments'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { SIGNED_URL_TTL_SECONDS } from '@/lib/config'
import type { VaultDocument } from '@/types/entities'

export function DocumentPreview({ doc }: { doc: VaultDocument }) {
  const previewable = doc.file_type === 'pdf' || doc.file_type === 'image'
  const { download } = useDocumentActions()
  const q = useSignedUrl(previewable ? doc.storage_path : undefined)
  const [expiring, setExpiring] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  // The link only lives a few minutes. Offer a refresh just before it dies instead of showing a broken viewer.
  useEffect(() => {
    if (!q.dataUpdatedAt) return
    setExpiring(false)
    const ms = q.dataUpdatedAt + (SIGNED_URL_TTL_SECONDS - 30) * 1000 - Date.now()
    const t = setTimeout(() => setExpiring(true), Math.max(ms, 0))
    return () => clearTimeout(t)
  }, [q.dataUpdatedAt])

  const reload = () => { setImgFailed(false); setExpiring(false); void q.refetch() }
  const frame = 'h-[70vh] min-h-80 w-full overflow-hidden rounded-xl border border-line bg-subtle'

  if (!previewable) {
    return (
      <div className={`${frame} grid place-items-center p-6 text-center`}>
        <div className="flex flex-col items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-muted"><FileQuestion className="h-7 w-7" aria-hidden /></span>
          <div>
            <p className="font-semibold">Preview unavailable</p>
            <p className="mt-1 text-sm text-muted">This file type can't be previewed in the browser.</p>
          </div>
          <Button onClick={() => download(doc)}>Download file</Button>
        </div>
      </div>
    )
  }

  if (q.isLoading) return <Skeleton className={frame} />
  if (q.isError || !q.data || imgFailed) {
    return (
      <div className={`${frame} grid place-items-center p-6 text-center`}>
        <div className="flex flex-col items-center gap-3">
          <AlertCircle className="h-7 w-7 text-danger" aria-hidden />
          <p className="font-semibold">Couldn't load the preview</p>
          <p className="text-sm text-muted">The link may have expired.</p>
          <Button variant="secondary" onClick={reload}><RefreshCw className="h-4 w-4" aria-hidden /> Try again</Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {expiring && (
        <div role="status" className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          <span>The preview link is about to expire.</span>
          <button onClick={reload} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh</button>
        </div>
      )}
      {doc.file_type === 'pdf' ? (
        <>
          <iframe key={q.dataUpdatedAt} src={q.data} title={`Preview of ${doc.file_name}`} className={frame} />
          <p className="mt-2 text-xs text-muted">
            Phone browsers may show only the first page.{' '}
            <a href={q.data} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">Open full PDF <ExternalLink className="h-3 w-3" aria-hidden /></a>
          </p>
        </>
      ) : (
        <div className={`${frame} grid place-items-center`}>
          <img src={q.data} alt={doc.file_name} onError={() => setImgFailed(true)} className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  )
}
