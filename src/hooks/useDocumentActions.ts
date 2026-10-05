import { useCallback } from 'react'
import { useToast } from '@/components/ui/Toast'
import { createSignedUrl } from '@/services/storage'
import { toMessage } from '@/lib/errors'
import type { VaultDocument } from '@/types/entities'

export const BULK_DOWNLOAD_LIMIT = 10

/** Open / download through short-lived signed URLs only. */
export function useDocumentActions() {
  const toast = useToast()

  const open = useCallback(async (doc: VaultDocument) => {
    const tab = window.open('', '_blank') // opened synchronously so popup blockers allow it
    try {
      const url = await createSignedUrl(doc.storage_path)
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (e) {
      tab?.close()
      toast.error(toMessage(e, "Couldn't open this file. Try again."))
    }
  }, [toast])

  const download = useCallback(async (doc: VaultDocument) => {
    try {
      const url = await createSignedUrl(doc.storage_path, { download: doc.file_name })
      const a = document.createElement('a')
      a.href = url
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      toast.error(toMessage(e, "Couldn't download this file. Try again."))
    }
  }, [toast])

  const downloadMany = useCallback(async (docs: VaultDocument[]) => {
    if (docs.length > BULK_DOWNLOAD_LIMIT) return toast.error(`Select ${BULK_DOWNLOAD_LIMIT} or fewer files to download at once.`)
    for (const d of docs) {
      await download(d)
      await new Promise((r) => setTimeout(r, 400)) // browsers drop downloads fired in the same tick
    }
  }, [download, toast])

  return { open, download, downloadMany }
}
