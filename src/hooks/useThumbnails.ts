import { useEffect, useRef, useState } from 'react'
import { createSignedUrls } from '@/services/storage'
import type { VaultDocument } from '@/types/entities'

/**
 * Signed URLs for image documents (grid view only), fetched in batches as pages load.
 * Supabase image transformations need a paid plan, so the original image is used and
 * the browser lazy-loads it.
 */
export function useThumbnails(docs: VaultDocument[], enabled: boolean) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const requested = useRef(new Set<string>())

  useEffect(() => {
    if (!enabled) return
    const want = docs.filter((d) => d.file_type === 'image' && !requested.current.has(d.storage_path)).map((d) => d.storage_path)
    if (want.length === 0) return
    want.forEach((p) => requested.current.add(p))
    let cancelled = false
    ;(async () => {
      for (let i = 0; i < want.length; i += 50) {
        try {
          const batch = await createSignedUrls(want.slice(i, i + 50))
          if (!cancelled) setUrls((u) => ({ ...u, ...batch }))
        } catch {
          want.slice(i, i + 50).forEach((p) => requested.current.delete(p)) // allow a retry later
        }
      }
    })()
    return () => { cancelled = true }
  }, [docs, enabled])

  return urls
}
