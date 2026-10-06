import { useRef, useState } from 'react'
import { Check, Copy, Link2, Mail, MessageCircle, Send, Share2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePin } from '@/hooks/usePin'
import { toMessage } from '@/lib/errors'
import { formatBytes } from '@/utils/format'
import { SHARE_EXPIRIES, canShareFiles, createShareLink, loadFileForShare, shareTargets } from '@/services/share'
import type { VaultDocument } from '@/types/entities'

export function ShareDialog({ doc, onClose }: { doc: VaultDocument | null; onClose: () => void }) {
  return (
    <Modal open={!!doc} title="Share document" onClose={onClose}>
      {doc && <ShareBody doc={doc} onClose={onClose} />}
    </Modal>
  )
}

function ShareBody({ doc, onClose }: { doc: VaultDocument; onClose: () => void }) {
  const toast = useToast()
  const { requirePin } = usePin()
  const [expiry, setExpiry] = useState<number>(SHARE_EXPIRIES[1].seconds)
  const [link, setLink] = useState<string | null>(null)
  const [linkExpiry, setLinkExpiry] = useState<number>(SHARE_EXPIRIES[1].seconds)
  const [busy, setBusy] = useState<'link' | 'file' | null>(null)
  const [copied, setCopied] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const fileShare = canShareFiles()
  const expiresLabel = SHARE_EXPIRIES.find((e) => e.seconds === linkExpiry)?.label ?? ''

  const guard = async () => {
    try { await requirePin('Enter your PIN to share this document.'); return true }
    catch (error) { toast.error(toMessage(error)); return false }
  }

  const makeLink = async () => {
    if (busy || !(await guard())) return
    setBusy('link')
    try {
      setLink(await createShareLink(doc.storage_path, expiry))
      setLinkExpiry(expiry)
      setCopied(false)
    } catch (error) {
      toast.error(toMessage(error, "Couldn't create a link. Try again."))
    } finally { setBusy(null) }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      input.current?.select()
      if (!document.execCommand?.('copy')) return toast.error('Could not copy. Select the link and copy it by hand.')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sendFile = async () => {
    if (busy || !(await guard())) return
    setBusy('file')
    try {
      const file = await loadFileForShare(doc)
      await navigator.share({ files: [file], title: doc.file_name })
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') toast.error(toMessage(error, "Couldn't share this file. Try a link instead."))
    } finally { setBusy(null) }
  }

  const targets = link ? shareTargets(doc.file_name, link, expiresLabel) : null
  const open = (url: string) => { window.open(url, '_blank', 'noopener,noreferrer') }

  return (
    <div className="space-y-5">
      <div>
        <p className="truncate text-sm font-medium" title={doc.file_name}>{doc.file_name}</p>
        <p className="text-xs text-muted">{formatBytes(doc.file_size)}</p>
      </div>

      {fileShare && (
        <div>
          <Button variant="secondary" className="w-full" onClick={sendFile} loading={busy === 'file'}>
            <Share2 className="h-4 w-4" aria-hidden /> Send the file itself…
          </Button>
          <p className="mt-1.5 text-xs text-muted">Opens your phone or computer's share sheet with the file attached.</p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <label className="flex-1 text-sm">
            <span className="mb-1.5 block font-medium">Link works for</span>
            <select value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm">
              {SHARE_EXPIRIES.map((item) => <option key={item.seconds} value={item.seconds}>{item.label}</option>)}
            </select>
          </label>
          <Button onClick={makeLink} loading={busy === 'link'}><Link2 className="h-4 w-4" aria-hidden /> {link ? 'New link' : 'Create link'}</Button>
        </div>

        {link && targets && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input ref={input} readOnly value={link} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-subtle px-3 text-xs" />
              <Button variant="secondary" onClick={copy} aria-label="Copy link">{copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? 'Copied' : 'Copy'}</Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" className="px-2" onClick={() => open(targets.whatsapp)}><MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp</Button>
              <Button variant="secondary" className="px-2" onClick={() => open(targets.telegram)}><Send className="h-4 w-4" aria-hidden /> Telegram</Button>
              <Button variant="secondary" className="px-2" onClick={() => { window.location.href = targets.email }}><Mail className="h-4 w-4" aria-hidden /> Email</Button>
            </div>
            <p className="text-xs text-muted">For Discord, Slack, Instagram and others: copy the link and paste it into the chat.</p>
          </div>
        )}
      </div>

      <p className="rounded-lg bg-subtle p-3 text-xs text-muted">
        Anyone who has the link can open this file until it expires, with no sign-in. The link can't be cancelled early; deleting the file permanently makes it stop working. Your vault itself stays private.
      </p>

      <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Done</Button></div>
    </div>
  )
}
