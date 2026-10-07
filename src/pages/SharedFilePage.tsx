import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, ExternalLink, FileX2, Loader2 } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { FileTypeIcon } from '@/components/documents/FileTypeIcon'
import { ShareGoneError, fetchSharedInfo, fetchSharedUrl } from '@/services/share'
import { categoryFor } from '@/lib/fileTypes'
import { toMessage } from '@/lib/errors'
import { formatBytes } from '@/utils/format'

/** Public page behind a share link (/s/<code>). No sign-in. */
export function SharedFilePage() {
  const { code = '' } = useParams()
  const [busy, setBusy] = useState<'open' | 'download' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['shared', code], queryFn: () => fetchSharedInfo(code), retry: (n, e) => !(e instanceof ShareGoneError) && n < 1, staleTime: 0 })

  const go = async (action: 'open' | 'download') => {
    setBusy(action); setProblem(null)
    const tab = action === 'open' ? window.open('', '_blank') : null // opened straight from the tap so popup blockers allow it
    try {
      const url = await fetchSharedUrl(code, action)
      if (action === 'open') { if (tab) tab.location.href = url; else window.location.href = url }
      else window.location.href = url
    } catch (e) {
      tab?.close()
      setProblem(toMessage(e, "Couldn't open the file. Try again."))
    } finally { setBusy(null) }
  }

  const gone = q.error instanceof ShareGoneError
  const info = q.data

  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <Logo className="mb-6" />
        {q.isPending && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Opening link…</p>}
        {gone && (
          <div className="text-center">
            <FileX2 className="mx-auto h-10 w-10 text-muted" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold">This link no longer works</h1>
            <p className="mt-1 text-sm text-muted">It has expired, was cancelled, or the file was removed. Ask the sender for a new one.</p>
          </div>
        )}
        {q.isError && !gone && (
          <div>
            <h1 className="text-lg font-semibold">Couldn't open this link</h1>
            <p className="mt-1 text-sm text-muted">{toMessage(q.error)}</p>
            <Button className="mt-4" variant="secondary" onClick={() => q.refetch()}>Try again</Button>
          </div>
        )}
        {info && (
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-subtle"><FileTypeIcon type={categoryFor(info.name) ?? 'document'} className="h-6 w-6 text-accent" /></span>
              <div className="min-w-0">
                <h1 className="break-words text-base font-semibold">{info.name}</h1>
                <p className="text-xs text-muted">{formatBytes(info.size)} · link works until {new Date(info.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => go('open')} loading={busy === 'open'}><ExternalLink className="h-4 w-4" aria-hidden /> Open</Button>
              <Button onClick={() => go('download')} loading={busy === 'download'}><Download className="h-4 w-4" aria-hidden /> Download</Button>
            </div>
            {problem && <p role="alert" className="mt-3 text-sm text-danger">{problem}</p>}
            <p className="mt-5 text-xs text-muted">Shared privately from someone's Personal Vault.</p>
          </div>
        )}
      </div>
    </main>
  )
}
