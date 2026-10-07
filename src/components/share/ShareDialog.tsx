import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Link2, Loader2, Mail, MessageCircle, Send, Share2, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePin } from '@/hooks/usePin'
import { toMessage } from '@/lib/errors'
import { formatBytes } from '@/utils/format'
import {
  MAX_FILE_SHARE_BYTES, SHARE_EXPIRIES, canShareFiles, createShareLink, listShareLinks, loadFileForShare,
  revokeShareLink, shareTargets, type ShareLink,
} from '@/services/share'
import type { VaultDocument } from '@/types/entities'

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export function ShareDialog({ doc, onClose }: { doc: VaultDocument | null; onClose: () => void }) {
  return (
    <Modal open={!!doc} title="Share document" onClose={onClose}>
      {doc && <ShareBody doc={doc} onClose={onClose} />}
    </Modal>
  )
}

function ShareBody({ doc, onClose }: { doc: VaultDocument; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const { guarded } = usePin()
  const [expiry, setExpiry] = useState<number>(SHARE_EXPIRIES[1].seconds)
  const [created, setCreated] = useState<ShareLink | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // The file is fetched as soon as the dialog opens. Browsers only allow the share sheet straight after a tap,
  // so waiting for a download inside the tap handler makes it fail.
  const nativeOk = canShareFiles() && doc.file_size <= MAX_FILE_SHARE_BYTES
  const fileQ = useQuery({ queryKey: ['shareFile', doc.id], queryFn: () => loadFileForShare(doc), enabled: nativeOk, retry: false, staleTime: Infinity, gcTime: 0 })
  const fileReady = fileQ.data && (() => { try { return navigator.canShare({ files: [fileQ.data] }) } catch { return false } })()

  const linksQ = useQuery({ queryKey: ['shareLinks', doc.id], queryFn: () => listShareLinks(doc.id), staleTime: 0, retry: false })
  const links = linksQ.data ?? []
  const current = created ?? links[0] ?? null
  const others = links.filter((l) => l.code !== current?.code)
  const targets = current ? shareTargets(doc.file_name, current.url, when(current.expiresAt)) : null

  const refresh = () => qc.invalidateQueries({ queryKey: ['shareLinks', doc.id] })

  const makeLink = async () => {
    if (busy) return
    setBusy(true)
    try {
      const l = await guarded('Enter your PIN to share this document.', () => createShareLink(doc.id, expiry))
      setCreated(l)
      await refresh()
    } catch (e) {
      toast.error(toMessage(e, "Couldn't create a link. Try again."))
    } finally { setBusy(false) }
  }

  const cancelLink = async (l: ShareLink) => {
    try {
      await revokeShareLink(l.code)
      if (created?.code === l.code) setCreated(null)
      await refresh()
      toast.success('Link cancelled. It no longer works.')
    } catch (e) { toast.error(toMessage(e, "Couldn't cancel that link.")) }
  }

  const copy = async (l: ShareLink) => {
    try {
      await navigator.clipboard.writeText(l.url)
    } catch {
      input.current?.select()
      if (!document.execCommand?.('copy')) return toast.error('Could not copy. Select the link and copy it by hand.')
    }
    setCopied(l.code)
    setTimeout(() => setCopied((c) => (c === l.code ? null : c)), 2000)
  }

  // Must run straight from the tap: no awaits before navigator.share.
  const sendFile = () => {
    const file = fileQ.data
    if (!file) return
    navigator.share({ files: [file], title: doc.file_name }).catch((e: unknown) => {
      const name = (e as { name?: string })?.name
      if (name === 'AbortError') return
      toast.error(name === 'NotAllowedError'
        ? "Your browser blocked the share sheet. Tap the button again, or share a link instead."
        : "Couldn't share this file. Share a link instead.")
    })
  }

  const open = (url: string) => { window.open(url, '_blank', 'noopener,noreferrer') }

  return (
    <div className="space-y-5">
      <div>
        <p className="truncate text-sm font-medium" title={doc.file_name}>{doc.file_name}</p>
        <p className="text-xs text-muted">{formatBytes(doc.file_size)}</p>
      </div>

      {canShareFiles() && (
        <div>
          {nativeOk ? (
            <Button variant="secondary" className="w-full" onClick={sendFile} disabled={!fileReady}>
              {fileQ.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
              {fileQ.isPending ? 'Getting the file ready…' : 'Send the file itself…'}
            </Button>
          ) : (
            <p className="rounded-lg bg-subtle p-3 text-xs text-muted">This file is over 50 MB, too big to send directly. Share a link instead.</p>
          )}
          {nativeOk && fileQ.isError && <p className="mt-1.5 text-xs text-danger">Couldn't load the file. Share a link instead.</p>}
          {nativeOk && fileQ.data && !fileReady && <p className="mt-1.5 text-xs text-muted">This browser can't send this type of file directly. Share a link instead.</p>}
          {nativeOk && !fileQ.isError && (fileQ.isPending || fileReady) && (
            <p className="mt-1.5 text-xs text-muted">Opens your device's share sheet (WhatsApp, Discord, Mail and so on) with the file attached.</p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <label className="flex-1 text-sm">
            <span className="mb-1.5 block font-medium">Link works for</span>
            <select value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm">
              {SHARE_EXPIRIES.map((e) => <option key={e.seconds} value={e.seconds}>{e.label}</option>)}
            </select>
          </label>
          <Button onClick={makeLink} loading={busy}><Link2 className="h-4 w-4" aria-hidden /> {current ? 'New link' : 'Create link'}</Button>
        </div>

        {current && targets && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input ref={input} readOnly value={current.url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-subtle px-3 text-sm" />
              <Button variant="secondary" onClick={() => copy(current)} aria-label="Copy link">
                {copied === current.code ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied === current.code ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" className="px-2" onClick={() => open(targets.whatsapp)}><MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp</Button>
              <Button variant="secondary" className="px-2" onClick={() => open(targets.telegram)}><Send className="h-4 w-4" aria-hidden /> Telegram</Button>
              <Button variant="secondary" className="px-2" onClick={() => { window.location.href = targets.email }}><Mail className="h-4 w-4" aria-hidden /> Email</Button>
            </div>
            <p className="text-xs text-muted">
              Works until {when(current.expiresAt)}. For Discord, Slack, Instagram and others, copy the link and paste it into the chat.{' '}
              <button type="button" onClick={() => cancelLink(current)} className="font-medium text-danger underline underline-offset-2">Cancel this link</button>
            </p>
          </div>
        )}

        {others.length > 0 && (
          <details className="rounded-lg border border-line text-sm">
            <summary className="cursor-pointer px-3 py-2 font-medium">Other active links ({others.length})</summary>
            <ul className="divide-y divide-line border-t border-line">
              {others.map((l) => (
                <li key={l.code} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">…/s/{l.code} · until {when(l.expiresAt)}</span>
                  <button type="button" onClick={() => copy(l)} aria-label={`Copy link ending ${l.code}`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-subtle">
                    {copied === l.code ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  </button>
                  <button type="button" onClick={() => cancelLink(l)} aria-label={`Cancel link ending ${l.code}`} className="grid h-8 w-8 place-items-center rounded-md text-danger hover:bg-subtle"><X className="h-4 w-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <p className="rounded-lg bg-subtle p-3 text-xs text-muted">
        Anyone with the link can open this one file, with no sign-in, until it expires or you cancel it. Your vault itself stays private.
      </p>

      <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Done</Button></div>
    </div>
  )
}
